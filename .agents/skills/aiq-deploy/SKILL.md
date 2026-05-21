---
name: aiq-deploy
description: Use when asked to install AIQ, deploy AIQ, install deep research, clone AIQ, start or stop AI-Q infrastructure, run the UI/backend, deploy with Docker Compose or Helm, choose an AI-Q workflow config, check health, inspect logs, rebuild, or prepare a local or self-hosted AI-Q server for aiq-research.
license: Apache-2.0
compatibility: Claude Code, OpenCode, Codex, and Agent Skills-compatible tools. Requires access to the AI-Q repository and the runtime selected by the user.
metadata:
  version: "2.1.0"
  github-url: "https://github.com/NVIDIA-AI-Blueprints/aiq"
  tags: "nvidia aiq blueprint deploy operations agent-skills"
allowed-tools: Read Bash
---

# AIQ Deploy Skill

Use this skill to get a local or self-hosted NVIDIA AI-Q Blueprint server running and verified for use by `aiq-research`.

This skill owns setup, deployment, operational checks, troubleshooting, and shutdown. It does not run deep research itself. After deployment is healthy, hand off the verified server URL to `aiq-research`.

## Operating Boundary

- Target external/open-source users of `NVIDIA-AI-Blueprints/aiq`.
- Do not assume access to hosted AIQ endpoints.
- Use `http://localhost:8000` unless the user chooses another local or self-hosted URL.

## Safety Rules

- Never print secret values. Check only whether required environment variables are set.
- Do not overwrite `deploy/.env` when it already exists.
- Ask before destructive cleanup such as deleting Docker volumes with `down -v`.
- Do not claim FRAG is ready unless both `RAG_SERVER_URL` and `RAG_INGEST_URL` are configured and reachable.
- Run verification commands yourself when possible.

## Intent Routing

Match the user request, then read the referenced file before acting:

| User Intent | Reference |
|---|---|
| No AI-Q checkout exists, install AIQ, clone AIQ, locate repo | `references/locate-or-clone.md` |
| Configure environment, check API keys, inspect `.env` | `references/env-and-secrets.md` |
| Choose an AI-Q workflow config, understand config files, set `BACKEND_CONFIG` or `CONFIG_FILE` | `references/configs.md` |
| Backend-only local server for `aiq-research`, AIQ as an Agent Skill | `references/skill-backend.md` |
| Terminal assistant, CLI-only run, no web UI | `references/cli.md` |
| Quick local development run, start UI/backend without containers | `references/local-web.md` |
| Default durable local deployment, Docker Compose, containers, PostgreSQL | `references/docker-compose.md` |
| Kubernetes, Helm, cluster deployment | `references/kubernetes-helm.md` |
| Foundational RAG / FRAG integration | `references/frag.md` |
| Basic health checks, shallow smoke checks, handoff to `aiq-research` | `references/validation.md` |
| Optional deep research completion validation | `references/end-to-end-validation.md` |
| Logs, unhealthy services, port conflicts, config failures | `references/troubleshooting.md` |
| Stop services, restart, rebuild, safe cleanup | `references/shutdown.md` |

## Deployment Mode Selection

If the user asks to install, deploy, set up, or run AI-Q without naming a mode, ask:

```text
How do you want to run AI-Q?

1. Skill backend - backend-only service for aiq-research w/o browser UI.
2. CLI - interactive terminal AI-Q.
3. UI - browser AI-Q app with backend and frontend.
4. Custom - choose an existing AI-Q config or review advanced customization docs before deployment.
```

Wait for the user's answer before starting services.

Do not ask this question when the user already specified a mode, such as Docker Compose, Helm, UI, CLI, or Agent Skill backend.

Do not ask the full mode question when `aiq-research` routed here because a deep research request needs a backend. In that case, prefer Agent Skill backend and ask only for permission to start it if needed.

Map the user's choice as follows:

| Choice | Route | Default Config |
|---|---|---|
| Skill backend | `references/docker-compose.md` backend-only by default; `references/skill-backend.md` only for local process or no-container runs | `configs/config_web_default_llamaindex.yml` |
| CLI | `references/cli.md` | `configs/config_cli_default.yml` |
| UI | Full Docker Compose by default for durable local deployment; `references/local-web.md` only for quick development runs | `configs/config_web_default_llamaindex.yml` |
| Custom | `references/configs.md`, then return to the selected deployment route | Existing config path |

For external users, Docker Compose is the default durable local deployment after the user chooses Skill backend or UI. Use local process paths only when the user asks for a quick development run, asks to avoid containers, or Docker Compose is unavailable and the user accepts that fallback. If the user asks which config to use, read `configs.md` and select an existing config before deployment. If they explicitly ask for a terminal-only assistant, use `cli.md`. If they explicitly ask for Kubernetes or Helm, use `kubernetes-helm.md`.

## Required Workflow

1. Locate or clone the AI-Q repository.
2. Confirm the expected repository files exist.
3. Create `deploy/.env` from `deploy/.env.example` only when missing.
4. If the deployment mode is ambiguous, ask the Deployment Mode Selection question.
5. If using a non-default config, confirm the config path with `references/configs.md`.
6. Check runtime prerequisites and required environment variables for the selected deployment path. Never print secret values.
7. Start the selected deployment path.
8. Run basic validation from `references/validation.md`.
9. Tell the user the verified `AIQ_SERVER_URL` for `aiq-research`.
10. Ask whether they want to run optional deep research completion validation now, or skip and try the deployment themselves.

## Handoff Contract

`aiq-research` needs a reachable AI-Q server URL. If the backend is on the default port, no extra configuration is needed:

```bash
AIQ_SERVER_URL=http://localhost:8000
```

If the backend runs elsewhere, tell the user to set:

```bash
export AIQ_SERVER_URL="http://localhost:<PORT>"
```

Do not continue into deep research or deep research completion validation unless the user asks for it or confirms the post-deploy validation prompt. This skill's success criterion is a deployed and basically validated server, not report generation quality.
