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
NAT plugin registration for unified AI-Q API.

Combines Knowledge API (collections/documents) and Async Job API (agent jobs via HTTP polling).

Knowledge Layer Configuration:
    The Knowledge API uses the same ingestor instance as the knowledge_retrieval tool.
    Configure the backend via the knowledge_retrieval function in your workflow YAML:

    functions:
      knowledge_search:
        _type: knowledge_retrieval
        backend: foundational_rag
        rag_url: http://localhost:8081/v1
        ingest_url: http://localhost:8082/v1

    The API plugin will automatically use the configured backend. If no tool is
    configured, it falls back to environment variables (KNOWLEDGE_INGESTOR_BACKEND)
    or the default backend (llamaindex).
"""

import logging
import os
from typing import override

from fastapi import APIRouter
from fastapi import FastAPI
from pydantic import Field

from aiq_api.auth.middleware import AuthMiddleware
from nat.builder.workflow_builder import WorkflowBuilder
from nat.cli.register_workflow import register_front_end
from nat.data_models.config import Config
from nat.front_ends.fastapi.fastapi_front_end_config import FastApiFrontEndConfig
from nat.front_ends.fastapi.fastapi_front_end_plugin import FastApiFrontEndPlugin
from nat.front_ends.fastapi.fastapi_front_end_plugin_worker import FastApiFrontEndPluginWorker
from nat.front_ends.fastapi.fastapi_front_end_plugin_worker import FastApiFrontEndPluginWorkerBase

from .jobs.event_store import EventStore
from .routes.collections import add_collection_routes
from .routes.documents import add_document_routes
from .routes.jobs import register_job_routes

logger = logging.getLogger(__name__)


_validators: list = []


def register_validator(validator) -> None:
    """Register a token validator with the API server.

    Call this before the server starts.  Validators are tried in order;
    the first successful result wins.  At least one validator must be
    registered when ``REQUIRE_AUTH=true``.

    Example::

        from aiq_api.plugin import register_validator
        from mypackage.auth import MyCustomValidator
        register_validator(MyCustomValidator(...))
    """
    _validators.append(validator)


def _load_validators_from_entry_points() -> list:
    """Discover validators registered via the ``aiq_api.validators`` entry-point group.

    Any installed package can contribute validators by declaring an entry point
    that returns a list of validator instances::

        # pyproject.toml (in the internal / deployment package)
        [project.entry-points."aiq_api.validators"]
        my_provider = "mypackage.auth:get_validators"

        # mypackage/auth.py
        def get_validators() -> list:
            return [MyValidator(...)]

    This is the recommended way to add validators from a private package that
    has the public aiq-api repo as a git submodule.
    """
    from importlib.metadata import entry_points

    validators = []
    for ep in entry_points(group="aiq_api.validators"):
        try:
            factory = ep.load()
            result = factory()
            validators.extend(result if isinstance(result, list) else [result])
            logger.info(
                "Loaded validators from entry point '%s': %s",
                ep.name,
                [type(v).__name__ for v in (result if isinstance(result, list) else [result])],
            )
        except Exception as e:
            logger.warning("Failed to load validators from entry point '%s': %s", ep.name, e)
    return validators


class AIQAPIConfig(FastApiFrontEndConfig, name="aiq_api"):
    """
    Configuration for unified AI-Q API endpoints.

    Knowledge API:
        Automatically enabled when a knowledge_retrieval function is configured.
        Backend settings are inherited from that function's config.

    Async Job API:
        Configure db_url and expiry_seconds for job persistence.
    """

    db_url: str = Field(
        default="sqlite+aiosqlite:///./jobs.db",
        description="Database URL for job store and event store",
    )
    expiry_seconds: int = Field(
        default=86400,
        ge=600,
        le=604800,
        description="Job expiry time in seconds (default: 24 hours)",
    )


class AIQAPIWorker(FastApiFrontEndPluginWorker):
    """
    Worker that adds unified AI-Q API routes to the FastAPI app.

    Combines:
    - Knowledge API routes (collections, documents) - uses factory singleton
    - Async Job API routes (agent jobs, status/state/report polling)
    """

    @override
    def build_app(self) -> FastAPI:
        app = super().build_app()

        app.title = "AI-Q API"
        app.description = "Async research jobs, knowledge management, and agent orchestration."
        app.version = "1.0.0"

        knowledge_router = APIRouter()
        add_collection_routes(knowledge_router)
        add_document_routes(knowledge_router)
        app.include_router(knowledge_router)
        logger.info("Knowledge API routes registered")

        require_auth = os.getenv("REQUIRE_AUTH", "false").lower() == "true"
        validators = _validators + _load_validators_from_entry_points()
        if require_auth and not validators:
            raise RuntimeError(
                "REQUIRE_AUTH=true but no validators have been registered. "
                "Either call aiq_api.plugin.register_validator() before starting the server, "
                "or declare an 'aiq_api.validators' entry point in your package."
            )
        app.add_middleware(AuthMiddleware, validators=validators, require_auth=require_auth)
        logger.info(
            "AuthMiddleware registered (require_auth=%s, validators=%s)",
            require_auth,
            [type(v).__name__ for v in validators],
        )

        return app

    @override
    async def add_routes(self, app: FastAPI, builder: WorkflowBuilder):
        await super().add_routes(app, builder)
        self._remove_legacy_websocket_routes(app)

        # =====================================================================
        # Async Job API routes
        # =====================================================================
        await register_job_routes(app, builder, self)
        logger.info("Async Job API routes registered")

        @app.on_event("shutdown")
        async def shutdown_job_resources():
            """Gracefully close async job background resources on shutdown."""
            from .routes.jobs import stop_periodic_cleanup

            await stop_periodic_cleanup()

            await EventStore.dispose_all_engines_async()
            logger.info("Async job resource shutdown complete")

        enable_debug = os.environ.get("AIQ_ENABLE_DEBUG", "true").lower() not in {"0", "false", "no", "off"}
        if enable_debug:
            try:
                from aiq_debug import register_debug_routes

                await register_debug_routes(app)
                logger.info("Debug console registered at /debug")
            except ImportError:
                pass
        else:
            logger.info("Debug console disabled by AIQ_ENABLE_DEBUG")

    def _remove_legacy_websocket_routes(self, app: FastAPI) -> None:
        """Remove NAT's default browser WebSocket route for this UI proof of concept."""
        routes = list(app.router.routes)
        filtered_routes = [route for route in routes if getattr(route, "path", None) != "/chat/stream"]
        removed_count = len(routes) - len(filtered_routes)
        if removed_count:
            app.router.routes = filtered_routes
            logger.info("Removed %d legacy WebSocket route(s)", removed_count)


class AIQAPIPlugin(FastApiFrontEndPlugin):
    """Plugin that adds unified AI-Q API endpoints to the FastAPI server."""

    def __init__(self, full_config: Config, config: AIQAPIConfig):
        super().__init__(full_config=full_config)
        self.config = config

    @override
    def get_worker_class(self) -> type[FastApiFrontEndPluginWorkerBase]:
        return AIQAPIWorker


@register_front_end(config_type=AIQAPIConfig)
async def register_aiq_api(config: AIQAPIConfig, full_config: Config):
    """Register unified AI-Q API with NAT framework."""
    yield AIQAPIPlugin(full_config=full_config, config=config)
