# SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from aiq_api.auth.middleware import get_current_user
from aiq_api.jobs import context as job_context
from aiq_api.jobs.context import get_job_context
from aiq_api.jobs.event_store import EventStore
from aiq_api.routes.jobs import register_job_routes
from nat.builder.context import Context


@pytest.fixture
def db_url(tmp_path):
    return f"sqlite+aiosqlite:///{tmp_path / 'test_research_routes.db'}"


@pytest.fixture(autouse=True)
def clear_context_cache(monkeypatch):
    monkeypatch.setenv("REQUIRE_AUTH", "false")
    EventStore._tables_initialized.clear()
    job_context._job_context_schema_initialized.clear()
    yield
    EventStore._tables_initialized.clear()
    job_context._job_context_schema_initialized.clear()


class FakeWorkflow:
    def __init__(self, content: str):
        self.content = content
        self.payloads: list[dict] = []
        self.seen_conversation_ids: list[str | None] = []
        self.seen_skip_clarifier: list[bool] = []

    async def ainvoke(self, payload: dict):
        self.payloads.append(payload)
        self.seen_conversation_ids.append(Context.get().conversation_id)
        self.seen_skip_clarifier.append(bool(get_current_user().get("skip_clarifier")))
        message = SimpleNamespace(content=self.content)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


class FakeBuilder:
    def __init__(self, workflow: FakeWorkflow):
        self.workflow = workflow

    def get_workflow(self):
        return self.workflow


def _build_app(workflow: FakeWorkflow, db_url: str) -> FastAPI:
    app = FastAPI()
    worker = SimpleNamespace(_dask_available=False, _job_store=None, _db_url=db_url)
    asyncio.run(register_job_routes(app, FakeBuilder(workflow), worker))
    return app


def test_research_submit_returns_shallow_answer(db_url):
    workflow = FakeWorkflow("A shallow answer.")
    app = _build_app(workflow, db_url)

    response = TestClient(app).post(
        "/v1/research/submit",
        json={
            "prompt": "Summarize CUDA.",
            "data_sources": ["web_search"],
            "collection_name": "collection-1",
        },
    )

    assert response.status_code == 200
    assert response.json()["type"] == "shallow_answer"
    assert response.json()["answer"] == "A shallow answer."
    assert workflow.payloads == [{"text": "Summarize CUDA.", "data_sources": ["web_search"]}]
    assert workflow.seen_conversation_ids == ["collection-1"]
    assert workflow.seen_skip_clarifier == [True]


def test_research_submit_returns_async_job_and_records_context(db_url):
    workflow = FakeWorkflow("Deep research job submitted. Job ID: job_123")
    app = _build_app(workflow, db_url)

    response = TestClient(app).post(
        "/v1/research/submit",
        json={
            "prompt": "Deeply research CUDA memory trends.",
            "data_sources": ["web_search", "knowledge_layer"],
            "collection_name": "collection-deep",
        },
    )

    assert response.status_code == 202
    assert response.json()["type"] == "async_job_started"
    assert response.json()["job_id"] == "job_123"
    context = get_job_context("job_123", db_url)
    assert context is not None
    assert context["input_preview"] == "Deeply research CUDA memory trends."
    assert context["data_sources"] == ["web_search", "knowledge_layer"]
    assert context["collection_name"] == "collection-deep"


def test_research_submit_returns_structured_error_when_workflow_fails(db_url):
    class FailingWorkflow(FakeWorkflow):
        async def ainvoke(self, payload: dict):
            raise RuntimeError("LLM provider unavailable")

    app = _build_app(FailingWorkflow(""), db_url)

    response = TestClient(app).post("/v1/research/submit", json={"prompt": "Research failures."})

    assert response.status_code == 502
    payload = response.json()
    assert payload["error"]["code"] == "RESEARCH_WORKFLOW_FAILED"
    assert payload["error"]["failure_boundary"] == "aiq_backend"
    assert payload["error"]["retryable"] is True
