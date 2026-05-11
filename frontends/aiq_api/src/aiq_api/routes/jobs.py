# SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
Agent-agnostic async job API routes.

Routes:
    POST /v1/research/submit                             - Submit research through backend routing
    GET  /v1/jobs/async/agents                            - List available agent types
    GET  /v1/jobs/async/jobs                              - List jobs visible to the current user
    POST /v1/jobs/async/submit                            - Submit a new job for any agent
    GET  /v1/jobs/async/job/{job_id}                      - Get job status
    POST /v1/jobs/async/job/{job_id}/cancel               - Cancel running job
    GET  /v1/jobs/async/job/{job_id}/state                - Get artifacts from event store
    GET  /v1/jobs/async/job/{job_id}/report               - Get final report
"""

from __future__ import annotations

import asyncio
import datetime
import json
import logging
import os
import re
from functools import partial
from typing import TYPE_CHECKING
from typing import Literal

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi import Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pydantic import ConfigDict
from pydantic import Field

from ..registry import AGENT_REGISTRY
from ..registry import get_agent_config

if TYPE_CHECKING:
    from nat.builder.workflow_builder import WorkflowBuilder
    from nat.front_ends.fastapi.fastapi_front_end_plugin_worker import FastApiFrontEndPluginWorker

logger = logging.getLogger(__name__)


class JobSubmitRequest(BaseModel):
    """Request to submit an async job."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "agent_type": "deep_researcher",
                    "input": "What are the latest advances in quantum computing?",
                    "job_id": None,
                    "expiry_seconds": 86400,
                }
            ]
        }
    )

    agent_type: str = Field(..., description="Agent type (e.g., 'deep_researcher')")
    input: str = Field(..., min_length=1, description="Input query for the agent")
    job_id: str | None = Field(
        None,
        pattern=r"^[a-zA-Z0-9_-]+$",
        max_length=64,
        description="Optional custom job ID (auto-generated if omitted)",
    )
    expiry_seconds: int | None = Field(
        None,
        ge=600,
        le=604800,
        description="Job expiry in seconds (default from config, max 7 days)",
    )


class JobStatusResponse(BaseModel):
    """Job status response."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "job_id": "abc123",
                    "status": "submitted",
                    "agent_type": "deep_researcher",
                    "error": None,
                    "created_at": "2026-02-12T10:30:00Z",
                }
            ]
        }
    )

    job_id: str = Field(..., description="Unique job identifier")
    status: str = Field(
        ...,
        description="Current status: submitted, running, success, failure, interrupted, not_found",
    )
    agent_type: str | None = Field(None, description="Agent type used for this job")
    error: str | None = Field(None, description="Error message if job failed")
    created_at: str | None = Field(None, description="Creation timestamp (ISO format)")


class JobStateResponse(BaseModel):
    """Job state response with artifacts."""

    job_id: str = Field(..., description="Unique job identifier")
    has_state: bool = Field(..., description="Whether state/artifacts are available")
    state: dict | None = Field(None, description="Internal job state")
    artifacts: dict | None = Field(None, description="Tool calls, outputs, and sources collected during execution")


class JobReportResponse(BaseModel):
    """Final report response."""

    job_id: str = Field(..., description="Unique job identifier")
    has_report: bool = Field(..., description="Whether the final report is available")
    report: str | None = Field(None, description="Final research report from the agent")


class ResearchSubmitRequest(BaseModel):
    """HTTP research submission request owned by the AIQ backend."""

    prompt: str = Field(..., min_length=1, description="Research prompt from the caller")
    data_sources: list[str] = Field(default_factory=list, description="Selected data source identifiers")
    collection_name: str | None = Field(None, description="Knowledge-layer collection name to use for RAG")


class ResearchShallowAnswerResponse(BaseModel):
    """Synchronous shallow-answer response."""

    type: Literal["shallow_answer"] = "shallow_answer"
    answer: str = Field(..., description="Answer returned by the backend research workflow")
    citations: list[str] = Field(default_factory=list, description="Citation URLs, when available")
    request_id: str = Field(..., description="Server-generated request identifier")


class ResearchAsyncJobStartedResponse(BaseModel):
    """Async deep-research job response."""

    type: Literal["async_job_started"] = "async_job_started"
    job_id: str = Field(..., description="Backend job identifier")
    status: Literal["submitted", "running"] = Field(default="submitted", description="Initial async job status")
    request_id: str = Field(..., description="Server-generated request identifier")


class ResearchApiError(BaseModel):
    """Structured API error payload for research HTTP endpoints."""

    code: str
    message: str
    user_message: str
    failure_boundary: str
    retryable: bool
    request_id: str | None = None
    job_id: str | None = None


class ResearchApiErrorResponse(BaseModel):
    """Structured API error response wrapper."""

    error: ResearchApiError


class JobListItem(BaseModel):
    """UI-facing job list item."""

    job_id: str
    status: str
    agent_type: str | None = None
    input_preview: str | None = None
    created_at: str
    updated_at: str | None = None
    expires_at: str | None = None
    data_sources: list[str] = Field(default_factory=list)
    collection_name: str | None = None
    has_report: bool
    report_availability: str = "unknown"
    error: str | None = None


class JobListResponse(BaseModel):
    """Jobs visible to the current caller."""

    jobs: list[JobListItem]


class AgentInfo(BaseModel):
    """Information about a registered agent."""

    agent_type: str = Field(..., description="Agent identifier used in submit requests")
    description: str = Field(..., description="Human-readable description of the agent")


class AgentListResponse(BaseModel):
    """List of available agents."""

    agents: list[AgentInfo] = Field(..., description="Registered agent types")


class DataSource(BaseModel):
    """Information about an available data source."""

    id: str = Field(..., description="Unique identifier for the data source")
    name: str = Field(..., description="Display name")
    description: str | None = Field(default=None, description="Human-readable description")
    requires_auth: bool = Field(default=False, description="Whether user authentication is required")


def _new_request_id() -> str:
    import uuid

    return f"req_{uuid.uuid4().hex}"


def _structured_error_response(
    *,
    status_code: int,
    code: str,
    message: str,
    user_message: str,
    failure_boundary: str,
    retryable: bool,
    request_id: str,
    job_id: str | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=ResearchApiErrorResponse(
            error=ResearchApiError(
                code=code,
                message=message,
                user_message=user_message,
                failure_boundary=failure_boundary,
                retryable=retryable,
                request_id=request_id,
                job_id=job_id,
            )
        ).model_dump(),
    )


def _extract_response_content(response: object) -> str:
    choices = getattr(response, "choices", None)
    if choices:
        first_choice = choices[0]
        message = getattr(first_choice, "message", None)
        content = getattr(message, "content", None)
        if content is not None:
            return str(content)

    if isinstance(response, dict):
        choices = response.get("choices")
        if isinstance(choices, list) and choices:
            message = choices[0].get("message") if isinstance(choices[0], dict) else None
            if isinstance(message, dict) and message.get("content") is not None:
                return str(message["content"])
        if response.get("content") is not None:
            return str(response["content"])

    return str(response)


def _extract_submitted_job_id(content: str) -> str | None:
    match = re.search(r"\bJob ID:\s*([a-zA-Z0-9_-]+)\b", content)
    return match.group(1) if match else None


def _isoformat(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    return str(value)


def _expires_at(created_at: object, expiry_seconds: object) -> str | None:
    if not isinstance(created_at, datetime.datetime):
        return None
    if not isinstance(expiry_seconds, int):
        return None
    return (created_at + datetime.timedelta(seconds=expiry_seconds)).isoformat()


def _output_has_report(raw_output: object) -> bool:
    if raw_output is None:
        return False
    try:
        output = json.loads(raw_output) if isinstance(raw_output, str) else raw_output
    except json.JSONDecodeError:
        return False
    return isinstance(output, dict) and bool(output.get("report"))


def _report_availability(status: str, has_report: bool, is_expired: bool) -> str:
    if is_expired:
        return "expired"
    if has_report:
        return "available"
    if status in {"submitted", "running"}:
        return "unavailable"
    if status == "failure":
        return "error"
    return "unknown"


def _job_list_item_from_record(record: dict) -> JobListItem:
    is_expired = bool(record.get("is_expired"))
    status = "expired" if is_expired else str(record.get("status") or "unavailable")
    has_report = _output_has_report(record.get("output"))
    created_at = _isoformat(record.get("created_at")) or ""

    return JobListItem(
        job_id=str(record["job_id"]),
        status=status,
        input_preview=record.get("input_preview"),
        created_at=created_at,
        updated_at=_isoformat(record.get("updated_at")),
        expires_at=_expires_at(record.get("created_at"), record.get("expiry_seconds")),
        data_sources=record.get("data_sources") or [],
        collection_name=record.get("collection_name"),
        has_report=has_report,
        report_availability=_report_availability(status, has_report, is_expired),
        error=record.get("error"),
    )


async def register_job_routes(app: FastAPI, builder: WorkflowBuilder, worker: FastApiFrontEndPluginWorker) -> None:
    """
    Register agent-agnostic async job routes.

    Uses NAT's JobStore for job metadata and Dask for distributed execution.
    The /v1/data_sources endpoint is always registered regardless of Dask availability.
    """
    import logging as std_logging

    from aiq_agent.common.data_source_registry import get_all_sources
    from nat.builder.context import Context
    from nat.front_ends.fastapi.async_jobs.job_store import JobStatus

    from ..auth.middleware import get_current_user
    from ..auth.middleware import user_context
    from ..jobs.access import authorize_job_access
    from ..jobs.access import ensure_job_access_table
    from ..jobs.access import require_verified_principal
    from ..jobs.context import ensure_job_context_table
    from ..jobs.context import list_job_records_for_principal
    from ..jobs.context import upsert_job_context
    from ..jobs.event_store import EventStore
    from ..jobs.submit import submit_agent_job as submit_authorized_job

    if not get_all_sources():
        logger.warning(
            "No data sources registered. Add a 'data_sources' function with "
            "_type: data_source_registry to your YAML config to enable "
            "data source toggles in the UI."
        )

    @app.get(
        "/v1/jobs/async/agents",
        response_model=AgentListResponse,
        tags=["async jobs"],
        summary="List available agents",
        description="Returns all registered agent types that can be used with the submit endpoint.",
    )
    async def list_agents() -> AgentListResponse:
        """List available agent types for async job submission."""
        agents = [
            AgentInfo(agent_type=agent_type, description=config.description)
            for agent_type, config in AGENT_REGISTRY.items()
        ]
        return AgentListResponse(agents=agents)

    @app.get(
        "/v1/data_sources",
        response_model=list[DataSource],
        tags=["data sources"],
        summary="List data sources",
    )
    async def list_data_sources() -> list[DataSource]:
        """List available data sources dynamically from the registry."""
        return [
            DataSource(
                id=source.id,
                name=source.name,
                description=source.description,
                requires_auth=source.requires_auth,
            )
            for source in get_all_sources()
        ]

    logger.info("Registered /v1/data_sources and /v1/jobs/async/agents routes")

    db_url = getattr(worker, "_db_url", None) or os.environ.get("NAT_JOB_STORE_DB_URL", "sqlite:///./data/jobs.db")

    await asyncio.get_running_loop().run_in_executor(None, ensure_job_context_table, db_url)

    @app.post(
        "/v1/research/submit",
        tags=["research"],
        summary="Submit research through backend routing",
        description=(
            "Submit a research prompt to the backend workflow. The backend decides whether the request can be "
            "answered synchronously or must escalate to an async deep-research job."
        ),
        responses={
            200: {"model": ResearchShallowAnswerResponse},
            202: {"model": ResearchAsyncJobStartedResponse},
            500: {"model": ResearchApiErrorResponse},
        },
    )
    async def submit_research(req: ResearchSubmitRequest, response: Response):
        """Submit research without exposing the raw async-job submit endpoint to the browser."""
        request_id = _new_request_id()
        conversation_id = req.collection_name or request_id

        try:
            workflow = builder.get_workflow()
        except Exception as e:
            logger.warning("Research submit failed to load workflow: %s", e)
            return _structured_error_response(
                status_code=503,
                code="WORKFLOW_UNAVAILABLE",
                message=str(e),
                user_message="The research backend is not ready. Please try again shortly.",
                failure_boundary="aiq_backend",
                retryable=True,
                request_id=request_id,
            )

        current_user = dict(get_current_user())
        current_user["skip_clarifier"] = True
        payload = {
            "text": req.prompt,
            "data_sources": req.data_sources,
        }

        try:
            with user_context(current_user), Context.scope(conversation_id=conversation_id):
                workflow_response = await workflow.ainvoke(payload)
        except Exception as e:
            logger.exception("Research submit workflow failed")
            return _structured_error_response(
                status_code=502,
                code="RESEARCH_WORKFLOW_FAILED",
                message=str(e),
                user_message="The research workflow failed before returning a response.",
                failure_boundary="aiq_backend",
                retryable=True,
                request_id=request_id,
            )

        content = _extract_response_content(workflow_response)
        job_id = _extract_submitted_job_id(content)
        if job_id:
            try:
                await asyncio.get_running_loop().run_in_executor(
                    None,
                    partial(
                        upsert_job_context,
                        job_id,
                        db_url,
                        input_text=req.prompt,
                        data_sources=req.data_sources,
                        collection_name=req.collection_name,
                    ),
                )
            except Exception as e:
                logger.warning("Failed to persist job context for %s: %s", job_id, e)
                return _structured_error_response(
                    status_code=500,
                    code="JOB_CONTEXT_PERSISTENCE_FAILED",
                    message=str(e),
                    user_message="The job started, but its UI context could not be saved.",
                    failure_boundary="aiq_backend",
                    retryable=True,
                    request_id=request_id,
                    job_id=job_id,
                )

            response.status_code = 202
            return ResearchAsyncJobStartedResponse(job_id=job_id, status="submitted", request_id=request_id)

        return ResearchShallowAnswerResponse(answer=content, citations=[], request_id=request_id)

    logger.info("Registered /v1/research/submit route")

    dask_available = getattr(worker, "_dask_available", False)
    job_store = getattr(worker, "_job_store", None)

    if not dask_available or not job_store:
        logger.warning(
            "Dask not available - async job submission routes require NAT_DASK_SCHEDULER_ADDRESS"
            " and NAT_JOB_STORE_DB_URL"
        )
        return

    scheduler_address = getattr(worker, "_scheduler_address", None) or os.environ.get("NAT_DASK_SCHEDULER_ADDRESS")
    config_path = getattr(worker, "_config_file_path", None) or os.environ.get("NAT_CONFIG_FILE", "")
    log_level = getattr(worker, "_log_level", std_logging.INFO)
    use_threads = getattr(worker, "_use_dask_threads", False)

    if not config_path:
        logger.error("Config file path not available - NAT_CONFIG_FILE not set")
        return

    front_end_config = getattr(worker, "_front_end_config", None)
    default_expiry_seconds = getattr(front_end_config, "expiry_seconds", 86400) if front_end_config else 86400

    logger.info(
        "Registering async job routes: scheduler=%s, db=%s, expiry=%ds",
        scheduler_address,
        db_url[:50],
        default_expiry_seconds,
    )
    await asyncio.get_running_loop().run_in_executor(None, ensure_job_access_table, db_url)

    @app.get("/health", tags=["health"], summary="Health check")
    async def health_check():
        """Health check endpoint that validates DB connectivity."""
        from sqlalchemy import text

        from ..jobs.event_store import EventStore

        result = {"status": "ok", "dask_available": dask_available, "db": "ok"}

        # Check DB connectivity using any cached async engine
        try:
            cache = EventStore._async_engine_cache
            if cache:
                engine = next(iter(cache.values()))[0]
                async with engine.connect() as conn:
                    await asyncio.wait_for(conn.execute(text("SELECT 1")), timeout=3.0)
            else:
                result["db"] = "no_engine"
        except Exception:
            logger.warning("Health check DB ping failed", exc_info=True)
            result["status"] = "degraded"
            result["db"] = "unreachable"
            from fastapi.responses import JSONResponse

            return JSONResponse(status_code=503, content=result)

        return result

    @app.get(
        "/v1/jobs/async/jobs",
        response_model=JobListResponse,
        tags=["async jobs"],
        summary="List visible async jobs",
        description="List backend-owned jobs visible to the current caller.",
    )
    async def list_visible_jobs() -> JobListResponse:
        """List jobs for the current user without relying on browser session state."""
        principal = require_verified_principal()
        enforce_owner = os.environ.get("REQUIRE_AUTH", "false").lower() == "true"
        records = await asyncio.get_running_loop().run_in_executor(
            None,
            partial(list_job_records_for_principal, principal, db_url, enforce_owner=enforce_owner),
        )
        return JobListResponse(jobs=[_job_list_item_from_record(record) for record in records])

    @app.post(
        "/v1/jobs/async/submit",
        response_model=JobStatusResponse,
        tags=["async jobs"],
        summary="Submit a new async job",
        description=(
            "Submit a research query to a registered agent. Returns a job ID for tracking via "
            "status/state/report polling."
        ),
        responses={
            400: {"description": "Unknown agent type or invalid request"},
            503: {"description": "Dask scheduler not available"},
        },
    )
    async def submit_job(req: JobSubmitRequest) -> JobStatusResponse:
        """Submit a new async job for deep research or other registered agents."""
        try:
            get_agent_config(req.agent_type)
        except KeyError as e:
            raise HTTPException(400, str(e))

        expiry = req.expiry_seconds if req.expiry_seconds is not None else default_expiry_seconds
        principal = require_verified_principal()

        # Propagate auth token to Dask worker for requires_auth data sources
        from aiq_agent.auth import get_auth_token

        auth_token = get_auth_token()
        try:
            job_id = await submit_authorized_job(
                agent_type=req.agent_type,
                input_text=req.input,
                owner=principal.email or principal.sub,
                principal=principal,
                job_id=req.job_id,
                expiry_seconds=expiry,
                auth_token=auth_token,
            )
        except RuntimeError as e:
            raise HTTPException(403, str(e))
        except Exception as e:
            logger.warning("Failed to submit authorized job: %s", e)
            raise HTTPException(500, "Failed to persist async job authorization metadata")

        logger.info(
            "Submitted %s job %s (expiry=%ds) for principal %s:%s",
            req.agent_type,
            job_id,
            expiry,
            principal.type,
            principal.sub,
        )
        return JobStatusResponse(
            job_id=job_id,
            status=JobStatus.SUBMITTED.value,
            agent_type=req.agent_type,
        )

    @app.get(
        "/v1/jobs/async/job/{job_id}",
        response_model=JobStatusResponse,
        tags=["async jobs"],
        summary="Get job status",
        description="Get the current status of an async job by its ID.",
        responses={404: {"description": "Job not found"}},
    )
    async def get_job_status(job_id: str) -> JobStatusResponse:
        """Get the current status of a job."""
        principal = require_verified_principal()
        job = await authorize_job_access(job_store, db_url, job_id, principal)

        return JobStatusResponse(
            job_id=job_id,
            status=job.status,
            error=job.error,
            created_at=job.created_at.isoformat() if job.created_at else None,
        )

    @app.post(
        "/v1/jobs/async/job/{job_id}/cancel",
        tags=["async jobs"],
        summary="Cancel a running job",
        description="Request cancellation of a running job. The job status will be set to INTERRUPTED.",
        responses={
            400: {"description": "Job is not in RUNNING state"},
            404: {"description": "Job not found"},
        },
    )
    async def cancel_job(job_id: str) -> dict:
        """Cancel a running job."""
        principal = require_verified_principal()
        job = await authorize_job_access(job_store, db_url, job_id, principal)

        if job.status != JobStatus.RUNNING.value:
            raise HTTPException(400, f"Job not running: {job_id} (status: {job.status})")

        await job_store.update_status(job_id, JobStatus.INTERRUPTED, error="cancelled by user")

        event_store = EventStore(db_url, job_id)
        event_store.store(
            {
                "type": "job.cancellation_requested",
                "data": {"reason": "cancelled by user"},
            }
        )

        task_cancelled = await _cancel_dask_task(scheduler_address, job_id)

        logger.info("Cancel requested for job %s: status updated, task_cancelled=%s", job_id, task_cancelled)

        return {"job_id": job_id, "status": JobStatus.INTERRUPTED.value, "task_cancelled": task_cancelled}

    @app.get(
        "/v1/jobs/async/job/{job_id}/state",
        response_model=JobStateResponse,
        tags=["async jobs"],
        summary="Get job artifacts",
        description="Get tool calls, outputs, and sources collected during job execution.",
        responses={404: {"description": "Job not found"}},
    )
    async def get_job_state(job_id: str) -> JobStateResponse:
        """Get artifacts from event store."""
        principal = require_verified_principal()
        await authorize_job_access(job_store, db_url, job_id, principal)

        artifacts = await _get_job_artifacts(db_url, job_id)
        return JobStateResponse(
            job_id=job_id,
            has_state=artifacts is not None,
            state=None,
            artifacts=artifacts,
        )

    @app.get(
        "/v1/jobs/async/job/{job_id}/report",
        response_model=JobReportResponse,
        tags=["async jobs"],
        summary="Get final report",
        description="Get the final research report from a completed job.",
        responses={404: {"description": "Job not found"}},
    )
    async def get_job_report(job_id: str) -> JobReportResponse:
        """Get the final report from a completed job."""
        principal = require_verified_principal()
        job = await authorize_job_access(job_store, db_url, job_id, principal)

        report = None
        if job.output:
            try:
                output = json.loads(job.output) if isinstance(job.output, str) else job.output
                report = output.get("report")
            except (json.JSONDecodeError, AttributeError):
                pass

        return JobReportResponse(job_id=job_id, has_report=bool(report), report=report)

    logger.info("Registered async job routes at /v1/jobs/async")

    # Ensure job_events table exists before reaper runs (reaper queries it via raw SQL;
    # table is otherwise created lazily on first EventStore write).
    EventStore._ensure_table_exists(db_url)

    # Start the ghost job reaper background task
    asyncio.create_task(_reap_ghost_jobs(job_store, db_url))

    # Start periodic cleanup of expired jobs (NAT's job_info table) and old events (job_events table).
    # NAT provides periodic_cleanup as a Dask task for job_info, but it must be explicitly submitted.
    # We also run a local asyncio task for job_events cleanup since NAT doesn't manage that table.
    _start_periodic_cleanup(job_store, scheduler_address, db_url, default_expiry_seconds, log_level, use_threads)


GHOST_JOB_TIMEOUT_SECONDS = 300  # 5 minutes without events = ghost job
GHOST_REAPER_INTERVAL_SECONDS = 60  # check every 60 seconds


def _find_stale_jobs(db_url: str, running_status: str) -> list[str]:
    """
    Sync helper to query for ghost jobs. Runs in a thread via run_in_executor
    to avoid blocking the async event loop with DB I/O.
    """
    from sqlalchemy import inspect
    from sqlalchemy import text

    from ..jobs.event_store import EventStore

    EventStore._ensure_table_exists(db_url)
    engine = EventStore._get_or_create_sync_engine(db_url)
    inspector = inspect(engine)
    if not inspector.has_table("job_events"):
        return []

    with engine.connect() as conn:
        if db_url.startswith("postgresql"):
            stale_query = text(
                "SELECT DISTINCT je.job_id FROM job_events je "
                "INNER JOIN job_info ji ON je.job_id = ji.job_id "
                "WHERE ji.status = :running_status "
                "GROUP BY je.job_id "
                "HAVING MAX(je.created_at) < NOW() - :timeout * INTERVAL '1 second'"
            )
            params = {"running_status": running_status, "timeout": GHOST_JOB_TIMEOUT_SECONDS}
        else:
            stale_query = text(
                "SELECT DISTINCT je.job_id FROM job_events je "
                "INNER JOIN job_info ji ON je.job_id = ji.job_id "
                "WHERE ji.status = :running_status "
                "GROUP BY je.job_id "
                "HAVING MAX(je.created_at) < datetime('now', :timeout_interval)"
            )
            params = {
                "running_status": running_status,
                "timeout_interval": f"-{GHOST_JOB_TIMEOUT_SECONDS} seconds",
            }

        result = conn.execute(stale_query, params)
        return [row[0] for row in result]


async def _reap_ghost_jobs(job_store, db_url: str) -> None:
    """
    Background task that periodically marks stale RUNNING jobs as FAILURE.

    A job is considered "ghost" if it has been RUNNING for over
    GHOST_JOB_TIMEOUT_SECONDS with no new events in the job_events table.
    This catches Dask worker crashes and OOM kills that bypass Python exception handling.
    """
    from nat.front_ends.fastapi.async_jobs.job_store import JobStatus

    from ..jobs.event_store import EventStore

    logger.info(
        "Ghost job reaper started (timeout=%ds, interval=%ds)",
        GHOST_JOB_TIMEOUT_SECONDS,
        GHOST_REAPER_INTERVAL_SECONDS,
    )

    loop = asyncio.get_running_loop()

    while True:
        try:
            await asyncio.sleep(GHOST_REAPER_INTERVAL_SECONDS)

            stale_job_ids = await loop.run_in_executor(None, _find_stale_jobs, db_url, JobStatus.RUNNING.value)

            for stale_job_id in stale_job_ids:
                logger.warning("Reaping ghost job %s (no events for %ds)", stale_job_id, GHOST_JOB_TIMEOUT_SECONDS)
                try:
                    await job_store.update_status(
                        stale_job_id,
                        JobStatus.FAILURE,
                        error="Job timed out (no heartbeat received from worker)",
                    )
                    event_store = EventStore(db_url, stale_job_id)
                    event_store.store(
                        {
                            "type": "job.error",
                            "data": {
                                "error": "Job timed out (no heartbeat received from worker)",
                                "error_type": "GhostJobTimeout",
                            },
                        }
                    )
                except Exception as e:
                    logger.warning("Failed to reap ghost job %s: %s", stale_job_id, e)

        except asyncio.CancelledError:
            logger.info("Ghost job reaper stopped")
            break
        except Exception as e:
            logger.warning("Ghost job reaper error: %s", e)


_cleanup_task: asyncio.Task | None = None
"""Module-level reference for graceful shutdown cancellation."""

# Advisory lock ID for PostgreSQL — ensures only one pod runs cleanup at a time.
# Arbitrary constant; change if it collides with another lock in your deployment.
_PG_ADVISORY_LOCK_ID = 0x41495143_4C45414E  # "AIQCLEAN" in hex


def _start_periodic_cleanup(
    job_store,
    scheduler_address: str,
    db_url: str,
    expiry_seconds: int,
    log_level: int,
    use_threads: bool,
) -> None:
    """
    Start periodic cleanup of expired jobs and old events.

    Submits NAT's periodic_cleanup as a Dask task (handles job_info expiry)
    and starts a local asyncio task for coordinated event cleanup.
    """
    global _cleanup_task

    # Cleanup interval: half the expiry time, clamped to [60s, 3600s]
    cleanup_interval = max(60, min(expiry_seconds // 2, 3600))

    # Submit NAT's periodic_cleanup as a long-running Dask task for job_info table
    try:
        from dask.distributed import fire_and_forget

        from nat.front_ends.fastapi.async_jobs import periodic_cleanup

        cleanup_future = job_store.dask_client.submit(
            periodic_cleanup,
            scheduler_address=scheduler_address,
            db_url=db_url,
            sleep_time_sec=cleanup_interval,
            configure_logging=not use_threads,
            log_level=log_level,
        )
        fire_and_forget(cleanup_future)
        logger.info(
            "Submitted periodic job cleanup task to Dask (interval=%ds, expiry=%ds)",
            cleanup_interval,
            expiry_seconds,
        )
    except Exception as e:
        logger.warning("Failed to submit periodic cleanup to Dask: %s", e)

    # Start local asyncio task for job_events table cleanup (NAT doesn't manage this table).
    # Uses pg_try_advisory_xact_lock on PostgreSQL so only one pod runs cleanup per cycle.
    # Cancel any previously-started task before overwriting the reference.
    if _cleanup_task and not _cleanup_task.done():
        _cleanup_task.cancel()
    _cleanup_task = asyncio.create_task(_cleanup_old_events_loop(db_url, expiry_seconds, cleanup_interval))


async def stop_periodic_cleanup() -> None:
    """Cancel the event cleanup background task. Call from shutdown handler."""
    global _cleanup_task
    if _cleanup_task and not _cleanup_task.done():
        _cleanup_task.cancel()
        try:
            await _cleanup_task
        except asyncio.CancelledError:
            pass
        _cleanup_task = None
        logger.info("Event cleanup task cancelled")


async def _cleanup_old_events_loop(db_url: str, retention_seconds: int, interval_seconds: int) -> None:
    """
    Background task that periodically deletes old events from the job_events table
    and removes events for jobs already marked as expired in job_info.

    On PostgreSQL, uses pg_try_advisory_xact_lock so only one pod runs cleanup per cycle
    when multiple pods share the same database.
    """

    is_postgres = db_url.startswith("postgres")

    logger.info(
        "Event cleanup task started (retention=%ds, interval=%ds, advisory_lock=%s)",
        retention_seconds,
        interval_seconds,
        is_postgres,
    )

    # Run once immediately on startup to catch anything that aged out during downtime.
    try:
        await _run_event_cleanup(db_url, retention_seconds, is_postgres)
    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.warning("Event cleanup startup run failed: %s", e)

    while True:
        try:
            await asyncio.sleep(interval_seconds)
            await _run_event_cleanup(db_url, retention_seconds, is_postgres)
        except asyncio.CancelledError:
            logger.info("Event cleanup task stopped")
            break
        except Exception as e:
            logger.warning("Event cleanup error: %s", e)


async def _run_event_cleanup(db_url: str, retention_seconds: int, is_postgres: bool) -> None:
    """
    Execute one cleanup cycle: time-based event pruning + removal of events for expired jobs.

    On PostgreSQL, acquires a transaction-level advisory lock (pg_try_advisory_xact_lock)
    so concurrent pods skip the cycle rather than doing redundant work. The lock is
    automatically released on commit/rollback, avoiding leak risks.
    """
    from ..jobs.access import cleanup_job_access
    from ..jobs.event_store import EventStore

    loop = asyncio.get_running_loop()

    def _do_cleanup() -> tuple[int, int, int]:
        from sqlalchemy import text

        engine = EventStore._get_or_create_sync_engine(db_url)

        with engine.connect() as conn:
            # On PostgreSQL, acquire a transaction-level advisory lock. If another pod
            # already holds it, skip this cycle. The lock is automatically released
            # on commit/rollback — no manual unlock needed.
            if is_postgres:
                locked = conn.execute(
                    text("SELECT pg_try_advisory_xact_lock(:lock_id)"),
                    {"lock_id": _PG_ADVISORY_LOCK_ID},
                ).scalar()
                if not locked:
                    return (0, 0, 0)

            # 1. Time-based: delete events older than retention period
            if is_postgres:
                result = conn.execute(
                    text("DELETE FROM job_events WHERE created_at < NOW() - :seconds * INTERVAL '1 second'"),
                    {"seconds": retention_seconds},
                )
            else:
                result = conn.execute(
                    text("DELETE FROM job_events WHERE created_at < datetime('now', :interval)"),
                    {"interval": f"-{retention_seconds} seconds"},
                )
            time_deleted = result.rowcount

            # 2. Coordinated: delete events for jobs already marked expired in job_info.
            # This catches events that haven't aged out yet but whose parent job is
            # already expired (e.g. short-lived jobs with long event retention).
            expired_result = conn.execute(
                text("DELETE FROM job_events WHERE job_id IN (SELECT job_id FROM job_info WHERE is_expired = true)")
            )
            expired_deleted = expired_result.rowcount
            access_deleted = cleanup_job_access(db_url, conn=conn)

            conn.commit()
            return (time_deleted, expired_deleted, access_deleted)

    time_deleted, expired_deleted, access_deleted = await loop.run_in_executor(None, _do_cleanup)

    if time_deleted > 0 or expired_deleted > 0 or access_deleted > 0:
        logger.info(
            "Event cleanup: %d old events removed, %d events for expired jobs removed, %d access rows removed",
            time_deleted,
            expired_deleted,
            access_deleted,
        )


async def _cancel_dask_task(scheduler_address: str, job_id: str) -> bool:
    """
    Cancel a Dask task by job ID.

    Args:
        scheduler_address: Dask scheduler address.
        job_id: Job ID to cancel.

    Returns:
        True if task was cancelled, False otherwise.
    """
    try:
        from distributed import Client
        from distributed import Future
        from distributed import Variable

        async with Client(scheduler_address, asynchronous=True) as client:
            var = Variable(name=job_id, client=client)
            try:
                # Short timeout: variable may be unset if worker hasn't started or job already finished.
                future = await var.get(timeout=2)
                if isinstance(future, Future):
                    await client.cancel([future], asynchronous=True, force=True)
                    logger.info("Cancelled Dask task for job %s", job_id)
                    return True
            except (TimeoutError, asyncio.CancelledError) as e:
                logger.warning(
                    "Could not get Dask future for job %s (variable not set or wait cancelled): %s",
                    job_id,
                    type(e).__name__,
                )
            except Exception as e:
                logger.warning("Error getting Dask future for job %s: %s", job_id, e)
            finally:
                try:
                    var.delete()
                except (KeyError, RuntimeError):
                    pass
    except (ConnectionError, TimeoutError, OSError) as e:
        logger.warning("Failed to cancel Dask task for job %s: %s", job_id, e)
    except Exception as e:
        logger.warning("Unexpected error cancelling Dask task for job %s: %s", job_id, e)
    return False


def _extract_event_metadata(event: dict) -> tuple[dict, dict]:
    """Extract data and metadata from an event dict."""
    data = event.get("data", {}) if isinstance(event.get("data"), dict) else {}
    metadata = event.get("metadata", {}) if isinstance(event.get("metadata"), dict) else {}
    if not metadata and isinstance(data, dict):
        metadata = data.get("metadata", {}) or {}
    return data, metadata


def _event_correlation_id(event: dict, data: dict, metadata: dict) -> str:
    """Return the stable run-level ID for correlating start/end events."""
    return str(metadata.get("run_id") or data.get("id") or event.get("id") or event.get("_id") or "")


def _event_name(event: dict, data: dict, fallback: str = "") -> str:
    """Return the event display name across old and current event shapes."""
    return str(event.get("name") or data.get("name") or fallback)


def _event_nested_data(data: dict) -> dict:
    """Return nested event data from the older projection shape."""
    nested_data = data.get("data", {})
    return nested_data if isinstance(nested_data, dict) else {}


def _event_input(data: dict) -> object | None:
    """Return event input across old and current event shapes."""
    if "input" in data:
        return data.get("input")
    return _event_nested_data(data).get("input")


def _event_output(data: dict) -> object | None:
    """Return event output across old and current event shapes."""
    if "output" in data:
        return data.get("output")
    return _event_nested_data(data).get("output")


def _find_running_event_id(event_map: dict[str, dict], name: str, workflow: str | None) -> str | None:
    """Find the most recent running event when older events lack a shared run ID."""
    for event_id, item in reversed(event_map.items()):
        if item.get("status") != "running" and item.get("is_complete") is not False:
            continue
        if name and item.get("name") != name:
            continue
        if workflow and item.get("workflow") != workflow:
            continue
        return event_id
    return None


def _process_tool_start(event: dict, data: dict, metadata: dict, tool_call_map: dict[str, dict]) -> None:
    """Process a tool.start event and add to tool_call_map."""
    tool_id = _event_correlation_id(event, data, metadata)
    tool_call_map[tool_id] = {
        "id": tool_id,
        "name": _event_name(event, data, "tool"),
        "input": _event_input(data),
        "output": None,
        "status": "running",
        "workflow": metadata.get("workflow"),
        "agent_id": metadata.get("agent_id"),
        "timestamp": event.get("timestamp"),
    }


def _process_tool_end(event: dict, data: dict, metadata: dict, tool_call_map: dict[str, dict]) -> str:
    """Process a tool.end event and update tool_call_map."""
    tool_id = _event_correlation_id(event, data, metadata)
    tool_name = _event_name(event, data, "tool")
    workflow = metadata.get("workflow")
    tool_output = _event_output(data)

    if tool_id not in tool_call_map:
        matched_tool_id = _find_running_event_id(tool_call_map, tool_name, workflow)
        if matched_tool_id:
            tool_id = matched_tool_id

    if tool_id in tool_call_map:
        tool_call_map[tool_id]["output"] = tool_output
        tool_call_map[tool_id]["status"] = "completed"
    else:
        tool_call_map[tool_id] = {
            "id": tool_id,
            "name": tool_name,
            "input": None,
            "output": tool_output,
            "status": "completed",
            "workflow": workflow,
            "agent_id": metadata.get("agent_id"),
            "timestamp": event.get("timestamp"),
        }
    return tool_id


def _normalize_url(url: str) -> str:
    """Normalize URL for consistent deduplication."""
    from urllib.parse import urlparse
    from urllib.parse import urlunparse

    try:
        parsed = urlparse(url)
        normalized_path = parsed.path.rstrip("/") if parsed.path != "/" else "/"
        return urlunparse(
            (
                parsed.scheme.lower(),
                parsed.netloc.lower(),
                normalized_path,
                parsed.params,
                parsed.query,
                "",
            )
        )
    except Exception:
        return url


def _is_valid_url(url: str) -> bool:
    """Check if string is a valid HTTP/HTTPS URL."""
    return bool(url and url.lower().startswith(("http://", "https://")))


def _process_artifact_update(
    event: dict,
    data: dict,
    metadata: dict,
    outputs: list[dict],
    sources_found: set[str],
    sources_cited: set[str],
) -> None:
    """Process an artifact.update event and add to outputs."""
    artifact_type = data.get("type")
    content = data.get("content")

    # Track citation sources and uses for accurate counts (with validation)
    if artifact_type == "citation_source":
        url = data.get("url") or content
        if _is_valid_url(url):
            sources_found.add(_normalize_url(url))
    elif artifact_type == "citation_use":
        url = data.get("url") or content
        if _is_valid_url(url):
            sources_cited.add(_normalize_url(url))

    if content:
        outputs.append(
            {
                "type": artifact_type,
                "content": content,
                "name": event.get("name"),
                "workflow": metadata.get("workflow"),
                "timestamp": event.get("timestamp"),
                **{k: v for k, v in data.items() if k not in ("type", "content")},
            }
        )


async def _get_job_artifacts(db_url: str, job_id: str) -> dict | None:
    """
    Extract artifacts from stored events.

    Returns a simplified structure with all tool calls, outputs, and source counts.
    Frontend categorizes tools by name (task=subagent, write_todos=middleware, etc.).

    Args:
        db_url: Database URL for event store.
        job_id: Job ID to fetch artifacts for.

    Returns:
        Dict with 'tools', 'outputs', and 'sources' (counts), or None if no artifacts found.
    """
    from ..jobs.event_store import EventStore

    try:
        events = await EventStore.get_events_async(db_url, job_id, 0, 10000)
        return _build_job_artifacts_from_events(events)

    except (KeyError, TypeError) as e:
        logger.warning("Failed to parse artifacts for job %s: %s", job_id, e)
        return None
    except Exception as e:
        logger.warning("Failed to get artifacts for job %s: %s", job_id, e)
        return None


def _build_job_artifacts_from_events(events: list[dict]) -> dict | None:
    """
    Build a polling-friendly job-state projection from persisted events.

    This keeps browser polling compact and predictable: token chunks are not
    replayed, but durable LLM/tool/artifact milestones are projected into the
    same state payload used by the current UI.
    """
    if not events:
        return None

    tool_call_map: dict[str, dict] = {}
    llm_step_map: dict[str, dict] = {}
    outputs: list[dict] = []
    sources_found: set[str] = set()
    sources_cited: set[str] = set()
    activity_items: list[dict] = []

    for sequence, event in enumerate(events):
        event_type = event.get("type", "")
        data, metadata = _extract_event_metadata(event)

        if event_type == "tool.start":
            _process_tool_start(event, data, metadata, tool_call_map)
            tool_id = _event_correlation_id(event, data, metadata)
            tool_call_map[tool_id]["_sequence"] = sequence
            activity_items.append(
                {
                    "id": tool_id,
                    "type": event_type,
                    "label": f"Using {_event_name(event, data, 'tool')}",
                    "status": "running",
                    "timestamp": event.get("timestamp"),
                }
            )
        elif event_type == "tool.end":
            tool_id = _process_tool_end(event, data, metadata, tool_call_map)
            if tool_id in tool_call_map:
                tool_call_map[tool_id]["_sequence"] = sequence
            activity_items.append(
                {
                    "id": tool_id,
                    "type": event_type,
                    "label": f"Used {_event_name(event, data, 'tool')}",
                    "status": "complete",
                    "timestamp": event.get("timestamp"),
                }
            )
        elif event_type == "llm.start":
            step_id = _event_correlation_id(event, data, metadata)
            llm_step_map[step_id] = {
                "id": step_id,
                "name": _event_name(event, data, "LLM"),
                "workflow": metadata.get("workflow"),
                "content": "",
                "timestamp": event.get("timestamp"),
                "is_complete": False,
                "_sequence": sequence,
            }
            activity_items.append(
                {
                    "id": step_id,
                    "type": event_type,
                    "label": f"Thinking with {_event_name(event, data, 'LLM')}",
                    "status": "running",
                    "timestamp": event.get("timestamp"),
                }
            )
        elif event_type == "llm.end":
            step_id = _event_correlation_id(event, data, metadata)
            step_name = _event_name(event, data, "LLM")
            if step_id not in llm_step_map:
                matched_step_id = _find_running_event_id(llm_step_map, step_name, metadata.get("workflow"))
                if matched_step_id:
                    step_id = matched_step_id
            llm_step = llm_step_map.setdefault(
                step_id,
                {
                    "id": step_id,
                    "name": step_name,
                    "workflow": metadata.get("workflow"),
                    "content": "",
                    "timestamp": event.get("timestamp"),
                },
            )
            llm_step["is_complete"] = True
            llm_step["_sequence"] = sequence
            if metadata.get("thinking"):
                llm_step["thinking"] = metadata["thinking"]
            if isinstance(metadata.get("usage"), dict):
                llm_step["usage"] = metadata["usage"]
            activity_items.append(
                {
                    "id": step_id,
                    "type": event_type,
                    "label": f"Completed thinking with {step_name}",
                    "status": "complete",
                    "timestamp": event.get("timestamp"),
                }
            )
        elif event_type == "artifact.update":
            _process_artifact_update(event, data, metadata, outputs, sources_found, sources_cited)
            activity_item = _activity_item_from_artifact_event(event, data)
            if activity_item:
                activity_items.append(activity_item)
        elif event_type in {"job.error", "job.cancellation_requested"}:
            activity_items.append(
                {
                    "id": str(event.get("id") or event.get("_id") or event_type),
                    "type": event_type,
                    "label": "Job error" if event_type == "job.error" else "Cancellation requested",
                    "status": "error" if event_type == "job.error" else "running",
                    "timestamp": event.get("timestamp"),
                }
            )

    tools = [_strip_internal_projection_fields(tool) for tool in tool_call_map.values()]
    llm_steps = [_strip_internal_projection_fields(step) for step in llm_step_map.values()]
    activity = {
        "current": _current_activity(tool_call_map, llm_step_map, activity_items),
        "items": activity_items[-50:],
    }
    result = {
        "tools": tools,
        "outputs": outputs,
        "sources": {
            "found": len(sources_found),
            "cited": len(sources_cited),
            "found_urls": list(sources_found),
            "cited_urls": list(sources_cited),
        },
        "llm_steps": llm_steps,
        "activity": activity,
    }
    return result if tools or outputs or sources_found or llm_steps or activity_items else None


def _activity_item_from_artifact_event(event: dict, data: dict) -> dict | None:
    """Return a compact activity item for artifact updates."""
    artifact_type = data.get("type")
    if artifact_type == "output":
        output_category = data.get("output_category")
        label = "Writing report" if output_category == "final_report" else "Capturing research notes"
    elif artifact_type == "file":
        label = f"Updated file {event.get('name') or data.get('file_path') or data.get('path') or ''}".strip()
    elif artifact_type == "todo":
        label = "Updated research plan"
    elif artifact_type == "citation_source":
        label = "Found source"
    elif artifact_type == "citation_use":
        label = "Referenced source"
    else:
        return None

    return {
        "id": str(event.get("id") or event.get("_id") or f"{artifact_type}-{len(str(data.get('content', '')))}"),
        "type": "artifact.update",
        "label": label,
        "status": "complete",
        "timestamp": event.get("timestamp"),
    }


def _strip_internal_projection_fields(item: dict) -> dict:
    """Remove backend-only projection fields before returning API data."""
    return {key: value for key, value in item.items() if not key.startswith("_") and value is not None}


def _current_activity(
    tool_call_map: dict[str, dict],
    llm_step_map: dict[str, dict],
    activity_items: list[dict],
) -> dict | None:
    """Return the best current activity from active tools/LLMs, falling back to latest event."""
    active_candidates: list[dict] = []
    for tool in tool_call_map.values():
        if tool.get("status") == "running":
            active_candidates.append(
                {
                    "_sequence": tool.get("_sequence", -1),
                    "id": tool.get("id"),
                    "type": "tool.start",
                    "label": f"Using {tool.get('name') or 'tool'}",
                    "status": "running",
                    "timestamp": tool.get("timestamp"),
                }
            )
    for step in llm_step_map.values():
        if step.get("is_complete") is False:
            active_candidates.append(
                {
                    "_sequence": step.get("_sequence", -1),
                    "id": step.get("id"),
                    "type": "llm.start",
                    "label": f"Thinking with {step.get('name') or 'LLM'}",
                    "status": "running",
                    "timestamp": step.get("timestamp"),
                }
            )

    if active_candidates:
        latest_active = max(active_candidates, key=lambda item: item.get("_sequence", -1))
        return _strip_internal_projection_fields(latest_active)
    if activity_items:
        return activity_items[-1]
    return None
