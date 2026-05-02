# SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

"""UI-facing context metadata for backend-owned research jobs."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection

from aiq_agent.auth import Principal

from .event_store import EventStore

_job_context_schema_initialized: set[str] = set()

_JOB_CONTEXT_SELECT_SQL = text(
    "SELECT job_id, input_preview, data_sources, collection_name, created_at FROM job_context WHERE job_id = :job_id"
)


def ensure_job_context_table(db_url: str) -> None:
    """Create the AIQ-owned job context table if it does not exist."""
    with _job_context_connection(db_url) as conn:
        _ensure_job_context_schema(conn, db_url)
        conn.commit()


def upsert_job_context(
    job_id: str,
    db_url: str,
    *,
    input_text: str,
    data_sources: list[str] | None = None,
    collection_name: str | None = None,
) -> None:
    """Persist UI-facing metadata for a backend-owned research job."""
    input_preview = _make_input_preview(input_text)
    with _job_context_connection(db_url) as conn:
        _ensure_job_context_schema(conn, db_url)
        conn.execute(
            _job_context_upsert_sql(db_url),
            {
                "job_id": job_id,
                "input_preview": input_preview,
                "data_sources": json.dumps(data_sources or []),
                "collection_name": collection_name,
            },
        )
        conn.commit()


def get_job_context(job_id: str, db_url: str) -> dict[str, Any] | None:
    """Return persisted UI-facing context for a job."""
    with _job_context_connection(db_url) as conn:
        _ensure_job_context_schema(conn, db_url)
        row = conn.execute(_JOB_CONTEXT_SELECT_SQL, {"job_id": job_id}).mappings().first()
        return _deserialize_context_row(row) if row is not None else None


def list_job_records_for_principal(
    principal: Principal,
    db_url: str,
    *,
    enforce_owner: bool,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """List job records visible to a principal, joined with UI context metadata."""
    with _job_context_connection(db_url) as conn:
        _ensure_job_context_schema(conn, db_url)
        rows = conn.execute(
            text(_job_list_sql(enforce_owner)),
            {
                "owner_auth_type": principal.type,
                "owner_subject": principal.sub,
                "limit": limit,
            },
        ).mappings()
        return [_deserialize_job_record(row) for row in rows]


def _is_postgres(db_url: str) -> bool:
    return db_url.startswith("postgres")


def _job_context_connection(db_url: str):
    engine = EventStore._get_or_create_sync_engine(db_url)
    return engine.connect()


def _ensure_job_context_schema(conn: Connection, db_url: str) -> None:
    if db_url in _job_context_schema_initialized:
        return
    conn.execute(text(_job_context_table_sql(db_url)))
    _job_context_schema_initialized.add(db_url)


def _job_context_table_sql(db_url: str) -> str:
    created_at_type = (
        "TIMESTAMP WITH TIME ZONE DEFAULT NOW()" if _is_postgres(db_url) else "DATETIME DEFAULT CURRENT_TIMESTAMP"
    )
    return (
        "CREATE TABLE IF NOT EXISTS job_context ("
        "  job_id VARCHAR PRIMARY KEY,"
        "  input_preview VARCHAR,"
        "  data_sources TEXT NOT NULL DEFAULT '[]',"
        "  collection_name VARCHAR,"
        f"  created_at {created_at_type}"
        ")"
    )


def _job_context_upsert_sql(db_url: str):
    postgres_upsert = (
        "INSERT INTO job_context (job_id, input_preview, data_sources, collection_name) "
        "VALUES (:job_id, :input_preview, :data_sources, :collection_name) "
        "ON CONFLICT(job_id) DO UPDATE SET "
        "input_preview = excluded.input_preview, "
        "data_sources = excluded.data_sources, "
        "collection_name = excluded.collection_name"
    )
    sqlite_upsert = (
        "INSERT OR REPLACE INTO job_context (job_id, input_preview, data_sources, collection_name) "
        "VALUES (:job_id, :input_preview, :data_sources, :collection_name)"
    )
    return text(postgres_upsert if _is_postgres(db_url) else sqlite_upsert)


def _job_list_sql(enforce_owner: bool) -> str:
    owner_join = (
        "JOIN job_access ja ON ja.job_id = ji.job_id "
        "AND ja.owner_auth_type = :owner_auth_type "
        "AND ja.owner_subject = :owner_subject "
        if enforce_owner
        else ""
    )
    return (
        "SELECT "
        "ji.job_id, ji.status, ji.error, ji.output, ji.created_at, ji.updated_at, "
        "ji.expiry_seconds, ji.is_expired, "
        "jc.input_preview, jc.data_sources, jc.collection_name "
        "FROM job_info ji "
        f"{owner_join}"
        "LEFT JOIN job_context jc ON jc.job_id = ji.job_id "
        "ORDER BY ji.created_at DESC "
        "LIMIT :limit"
    )


def _make_input_preview(input_text: str, max_length: int = 160) -> str:
    compact = " ".join(input_text.split())
    if len(compact) <= max_length:
        return compact
    return f"{compact[: max_length - 1]}..."


def _deserialize_context_row(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "job_id": row["job_id"],
        "input_preview": row.get("input_preview"),
        "data_sources": _parse_data_sources(row.get("data_sources")),
        "collection_name": row.get("collection_name"),
        "created_at": row.get("created_at"),
    }


def _deserialize_job_record(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "job_id": row["job_id"],
        "status": row.get("status"),
        "error": row.get("error"),
        "output": row.get("output"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "expiry_seconds": row.get("expiry_seconds"),
        "is_expired": bool(row.get("is_expired")),
        "input_preview": row.get("input_preview"),
        "data_sources": _parse_data_sources(row.get("data_sources")),
        "collection_name": row.get("collection_name"),
    }


def _parse_data_sources(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(item) for item in raw]
    try:
        parsed = json.loads(str(raw))
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed]
