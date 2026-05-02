# SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from datetime import UTC
from datetime import datetime

import pytest
from sqlalchemy import text

from aiq_agent.auth import Principal
from aiq_api.jobs import access as job_access
from aiq_api.jobs import context as job_context
from aiq_api.jobs.access import create_job_access
from aiq_api.jobs.context import get_job_context
from aiq_api.jobs.context import list_job_records_for_principal
from aiq_api.jobs.context import upsert_job_context
from aiq_api.jobs.event_store import EventStore


@pytest.fixture
def db_url(tmp_path):
    return f"sqlite+aiosqlite:///{tmp_path / 'test_job_context.db'}"


@pytest.fixture(autouse=True)
def clear_schema_caches():
    EventStore._tables_initialized.clear()
    job_access._job_access_schema_initialized.clear()
    job_context._job_context_schema_initialized.clear()
    yield
    EventStore._tables_initialized.clear()
    job_access._job_access_schema_initialized.clear()
    job_context._job_context_schema_initialized.clear()


def _insert_job_info(db_url: str, job_id: str, *, status: str = "running", output: str | None = None) -> None:
    engine = EventStore._get_or_create_sync_engine(db_url)
    with engine.connect() as conn:
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS job_info ("
                "  job_id TEXT PRIMARY KEY,"
                "  status TEXT,"
                "  config_file TEXT,"
                "  error TEXT,"
                "  output_path TEXT,"
                "  created_at DATETIME,"
                "  updated_at DATETIME,"
                "  expiry_seconds INTEGER,"
                "  output TEXT,"
                "  is_expired BOOLEAN DEFAULT 0"
                ")"
            )
        )
        now = datetime.now(UTC).replace(tzinfo=None)
        conn.execute(
            text(
                "INSERT OR REPLACE INTO job_info "
                "(job_id, status, created_at, updated_at, expiry_seconds, output, is_expired) "
                "VALUES (:job_id, :status, :ts, :ts, 3600, :output, 0)"
            ),
            {"job_id": job_id, "status": status, "ts": now, "output": output},
        )
        conn.commit()


def test_upsert_and_get_job_context(db_url):
    upsert_job_context(
        "job-1",
        db_url,
        input_text="  Research   this   topic  ",
        data_sources=["web_search", "knowledge_layer"],
        collection_name="collection-1",
    )

    context = get_job_context("job-1", db_url)

    assert context is not None
    assert context["input_preview"] == "Research this topic"
    assert context["data_sources"] == ["web_search", "knowledge_layer"]
    assert context["collection_name"] == "collection-1"


def test_list_job_records_enforces_principal(db_url):
    owner = Principal(type="jwt", sub="user-1", email="owner@example.com")
    other = Principal(type="jwt", sub="user-2", email="other@example.com")
    _insert_job_info(db_url, "owned-job", status="success", output='{"report": "done"}')
    _insert_job_info(db_url, "other-job", status="running")
    create_job_access("owned-job", owner, db_url)
    create_job_access("other-job", other, db_url)
    upsert_job_context(
        "owned-job",
        db_url,
        input_text="Owned research",
        data_sources=["web_search"],
        collection_name="collection-owned",
    )

    records = list_job_records_for_principal(owner, db_url, enforce_owner=True)

    assert [record["job_id"] for record in records] == ["owned-job"]
    assert records[0]["data_sources"] == ["web_search"]
    assert records[0]["collection_name"] == "collection-owned"


def test_list_job_records_can_skip_owner_filter_for_no_auth(db_url):
    principal = Principal(type="anonymous", sub="anonymous")
    _insert_job_info(db_url, "job-1")
    _insert_job_info(db_url, "job-2")

    records = list_job_records_for_principal(principal, db_url, enforce_owner=False)

    assert {record["job_id"] for record in records} == {"job-1", "job-2"}
