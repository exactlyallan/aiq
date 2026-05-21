---
name: aiq-research
description: Use when the user asks for deep research, AIQ research, research with AI-Q, or to use AI-Q on a question, unless they are asking to install, deploy, start, stop, or troubleshoot AI-Q infrastructure.
license: Apache-2.0
compatibility: Claude Code, OpenCode, Codex, and Agent Skills-compatible tools. Requires Python 3.10+ and access to a running local AI-Q Blueprint server.
metadata:
  version: "2.1.0"
  github-url: "https://github.com/NVIDIA-AI-Blueprints/aiq"
  tags: "nvidia aiq blueprint deep-research agent-skills"
  languages: "python bash"
  domain: "research-agents"
allowed-tools: Read Bash
---

# AIQ Research Skill

Use this skill to call a locally running AIQ Blueprint server through the helper script at `scripts/aiq.py`.

## Intent Boundary

Use this skill for research-shaped requests, including:

- "deep research on ..."
- "AIQ research ..."
- "research ..."
- "use AI-Q to answer ..."
- "ask AI-Q about ..."

Do not use this skill for install, deploy, start, stop, UI, CLI, Docker, Helm, or troubleshooting requests. Those belong to `aiq-deploy`.

## Assumptions

- The AIQ server is running locally at `http://localhost:8000`.
- Override the base URL only for another local deployment by setting `AIQ_SERVER_URL`.
- For research-shaped requests, first check whether a research-compatible AI-Q Skill backend is reachable with `health`.
- If the server is not reachable and `aiq-deploy` is installed, hand off to `aiq-deploy` to start and validate the Skill backend, then resume the original research request.

## Backend Resolution

Resolve the backend before running research:

1. If `AIQ_SERVER_URL` is set, use it.
2. Otherwise try the default local backend: `http://localhost:8000`.
3. Run `health`.
4. If `health` succeeds, continue with `/chat` and async research checks.
5. If `health` fails and no explicit `AIQ_SERVER_URL` was set, ask:

```text
I do not see a reachable local AI-Q backend. Do you already have an AI-Q backend URL you want to use, or should I deploy a local Skill backend?
```

- If the user provides a URL, set `AIQ_SERVER_URL` for subsequent helper calls and rerun `health`.
- If the user wants local deployment, hand off to `aiq-deploy` and preserve the original research request.
- If a reachable backend returns `401` or `403`, stop and explain that this public skill does not manage authentication. Ask the user to use an authenticated AI-Q skill or configure authentication for their environment.
- If `health` succeeds but `/chat` or `/v1/jobs/async/agents` fails, report that the backend is reachable but not compatible with this public research flow, then offer to run `aiq-deploy` validation.

## Use Cases

- Submit a routed `/chat` request to the local AIQ server.
- Poll an async deep research job to completion.
- Fetch job status, final reports, or event-store artifacts.
- Cancel a local async job.

## Available Script Commands

| Command | Purpose |
|---|---|
| `python3 scripts/aiq.py health` | Check whether the local server responds |
| `python3 scripts/aiq.py chat "<query>"` | POST `/chat`; may return inline output or a deep-research job ID |
| `python3 scripts/aiq.py agents` | List available async agent types |
| `python3 scripts/aiq.py submit "<query>" [agent_type]` | Submit an explicit async job |
| `python3 scripts/aiq.py research "<query>" [agent_type]` | Submit an async job, poll, and print the final report JSON |
| `python3 scripts/aiq.py research_poll <job_id>` | Resume polling an existing async job |
| `python3 scripts/aiq.py status <job_id>` | Fetch job status plus `/state` artifacts |
| `python3 scripts/aiq.py state <job_id>` | Fetch event-store artifacts only |
| `python3 scripts/aiq.py report <job_id>` | Fetch the final report for a completed job |
| `python3 scripts/aiq.py stream <job_id>` | Stream SSE events from a job |
| `python3 scripts/aiq.py cancel <job_id>` | Cancel a running job |

## Usage

### Research flow

Run:

```bash
python3 $SKILL_DIR/scripts/aiq.py chat "USER QUESTION"
```

- The `/chat` endpoint routes the request to the right AIQ path.
- For shallow queries it returns a normal JSON response inline.
- For deep research it returns structured JSON containing `{"status": "deep_research_running", "job_id": "..."}`.

If the response is normal JSON:
- Present the result immediately.
- Do not force polling when there is no `job_id`.

If the response includes `deep_research_running`:
- Extract the `job_id`.
- Launch polling with the same absolute script path:

```bash
python3 $SKILL_DIR/scripts/aiq.py research_poll <job_id>
```

- Use the runtime's non-blocking/background execution mechanism when available.
- If the chosen execution method requires escalated permissions, request explicit user approval first and explain why.
- Tell the user that deep research is running in the background.

## Workflow

1. Resolve the backend using the Backend Resolution flow.
2. Run `health` first to check whether the local AIQ Skill backend is running.
3. If `health` fails after backend resolution, preserve the user's original query and use `aiq-deploy` to start a Skill backend. After `aiq-deploy` returns a verified `AIQ_SERVER_URL`, rerun `health`.
4. Run `chat "<query>"` by passing the user's exact query for routed chat/research.
5. If the response contains `{"status": "deep_research_running", "job_id": "..."}`, run `research_poll <job_id>`.
6. If polling is interrupted, resume with `status <job_id>`, `report <job_id>`, or `research_poll <job_id>`.
7. Present returned reports with citations intact. Do not truncate source URLs.

### Presenting the report

- When `research_poll` completes successfully, fetch and present the full report.
- Do not truncate citations or source URLs from the returned report.

### Handling interruptions and timeouts

If polling is interrupted, the job continues server-side. Resume with:

```bash
python3 $SKILL_DIR/scripts/aiq.py status <job_id>
python3 $SKILL_DIR/scripts/aiq.py report <job_id>
python3 $SKILL_DIR/scripts/aiq.py research_poll <job_id>
```

- Use `status` to inspect job status and saved artifacts.
- Use `report` when the job has already finished and you only need the final output.
- Use `research_poll` to keep waiting for completion.

### Checking job progress and state

Async jobs expose two useful progress views:

- `status <job_id>` returns top-level job status and also fetches `/state` artifacts.
- `state <job_id>` returns the event-store artifacts only, without refetching the outer status wrapper.

Run:

```bash
python3 $SKILL_DIR/scripts/aiq.py status <job_id>
python3 $SKILL_DIR/scripts/aiq.py state <job_id>
```

Treat the responses as follows:
- If `job_status.status` is `completed` or `success`, fetch or present the report.
- If status is `failed`, `failure`, or `cancelled`, show the error and do not silently retry.
- If status is still running, queued, or another non-terminal state, continue polling.

### Failure handling

If the job status is `failed` or `failure`:
- Show the user the error from the status response.
- Ask whether they want to retry with a narrower query or different approach.
- Do not retry automatically.

### Cancelling a job

```bash
python3 $SKILL_DIR/scripts/aiq.py cancel <job_id>
```

## Examples

```bash
python3 $SKILL_DIR/scripts/aiq.py health
python3 $SKILL_DIR/scripts/aiq.py chat "Compare local AIQ deep research with a standard web search workflow"
python3 $SKILL_DIR/scripts/aiq.py research_poll 12345678-1234-1234-1234-123456789abc
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---:|---|---|
| `AIQ_SERVER_URL` | No | `http://localhost:8000` | Local AIQ server base URL |

## Troubleshooting

| Error | Likely Cause | Action |
|---|---|---|
| Connection refused | No backend is reachable at `AIQ_SERVER_URL` or `http://localhost:8000` | Ask whether the user already has an AI-Q backend URL; otherwise use `aiq-deploy` to start and validate a Skill backend, then retry with the same query |
| HTTP 401 or 403 | Backend requires authentication | This public helper does not manage auth. Ask the user to use an authenticated AI-Q skill or configure authentication for their environment before retrying |
| Health succeeds but `/chat` or async agents fail | Backend is reachable but not compatible with this public research flow | Report the compatibility failure and offer to run `aiq-deploy` validation |
| Job remains running | Deep research is asynchronous | Continue with `research_poll <job_id>` |
| Poll output shows `running`, but a report is returned or `cancel` says the job is already `success` | The job reached a terminal state while the local polling output was still showing prior status lines | Treat `has_report: true` or `job_status.status: success` as complete. Fetch the report with `report <job_id>` instead of cancelling or continuing to poll |
| Job failed | Server-side workflow failed | Show the returned status/error; do not retry automatically |
