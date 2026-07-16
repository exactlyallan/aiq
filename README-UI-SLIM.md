# AIQ UI Slim POC

## Purpose

This branch preserves the Project Weight Reduction proof of concept: a
job-oriented AIQ UI that favors backend-owned state, ordinary HTTP requests,
and polling over browser-owned sessions and persistent streaming connections.

It is a focused architectural prototype rather than a drop-in UI replacement.
The retained implementation branch is `dev-ui-slim`.

## Baseline

| Concern | Pinned baseline |
| --- | --- |
| AIQ backend source | Upstream `develop` commit `aa62d95f6dff60ff1b7ade7a0c67a92aed8b0c3a` (merged into this branch by `e0c0fab`) |
| NeMo Agent Toolkit | `nvidia-nat`, `nvidia-nat-core`, `nvidia-nat-eval`, and `nvidia-nat-profiler` `==1.6.0` |
| Dependency resolution | `uv.lock` records the exact NAT 1.6.0 wheels and hashes |
| Version guard | `tests/test_nat_foundation.py` verifies the root package pins, benchmark evaluator pin, and lockfile resolution |

The backend source lives in this repository, so the source baseline is pinned
by the `dev-ui-slim` commit history, not by a separate container image tag.
Do not merge future upstream backend changes into this branch without
revalidating the HTTP submit, async-job polling, report hydration, and NAT
foundation tests.

## Architectural Changes From The Original UI

### 1. Research submission is backend-routed HTTP

The browser submits a structured request through `POST /api/research/submit`.
The request contains the prompt, selected data sources, and optional knowledge
layer collection name. AIQ, rather than the UI, decides whether the request
returns a shallow answer or starts a deep-research job.

This replaces the normal UI submit dependency on WebSocket chat and avoids
posting a normal research request directly to the raw async-job submit API.
The UI proxy preserves structured failure information so client, proxy,
backend, worker, LLM, data-source, and auth failures can be presented
differently.

### 2. Jobs are the durable research boundary

The backend persists UI-relevant job context and exposes a user-scoped job
index through `GET /v1/jobs/async/jobs`. A job includes the identifiers,
owner-visible metadata, status, timestamps, expiry, data-source selection,
collection name, report availability, and error details needed for recovery.

The completed report contract remains
`GET /v1/jobs/async/job/{job_id}/report`. The UI can therefore recover deep
research after a refresh without treating browser history as the source of
truth.

### 3. Polling replaces frontend WebSocket and SSE transport

The POC removes the legacy WebSocket chat submit path and the frontend SSE
research-stream dependency. It uses compact polling for visible job status and
lazy-loads richer job detail only for the selected job. This reduces cross-job
event contamination and keeps simultaneous long-running jobs independent.

Backend event storage and async-worker mechanics remain backend concerns. This
branch changes the frontend transport surface; it does not claim to remove all
streaming internals from AIQ.

### 4. Multiple jobs are first-class

Job and request state are keyed by job ID or temporary request ID instead of a
singleton loading flag. The UI is designed to support multiple active,
completed, failed, interrupted, expired, or unavailable reports at once.

Background work stays inexpensive: the UI polls compact state for relevant
jobs and hydrates report content, citations, artifacts, tasks, and diagnostics
for the currently viewed report. Results are scoped to their originating
request/job so a user switching sessions cannot receive another job's answer
or error.

### 5. Sessions are an interaction layer, not durable report storage

While a tab is open, lightweight interaction sessions make it easy to switch
between unfinished chats. Deep reports remain backend-owned and can be
restored from the job list after refresh or sign-in. Browser persistence keeps
only a small report-viewing cache; completed reports are verified against the
backend before the UI claims they remain available.

Session rows show backend-derived states such as `Thinking...`, `Research
completed`, `Error`, `Expired`, and `Report unavailable`. A completed report's
completion time is kept separate from later browser selection time so opening
an old report does not move it into the newest age bucket.

### 6. UI capability rules are centralized

`frontends/ui/src/features/jobs/state/capability-matrix.ts` is the runtime
source of truth for prompt, upload, data-source, cancel, retry, report-fetch,
and future talk-to-report capabilities. It derives controls from selected job
state plus global connection, auth, upload, request, and data-source state.

The reviewer-facing matrix is generated at
`frontends/ui/docs/research-ui-state-matrix.md`. When changing behavior,
update the matrix and selector tests first, regenerate the documentation, and
run the freshness check.

### 7. UI structure was refocused around research work

The rough-in UI includes:

- A compact/expandable session rail with job state icons and report expiry
  messaging.
- A persistent research navigation rail for data sources, citations, research
  drafts, artifacts, and thinking/activity.
- A resizable research drawer that hydrates selected-job detail.
- A prompt surface with derived status, stop state, and scoped error feedback.
- In-chat, dismissible report and error banners instead of persistent global
  banners.
- Data-source and knowledge-layer collection selection that flows into the
  structured research request.

The visual work is intentionally a rough-in. It establishes component
ownership and interaction structure; final density, typography, and polish
remain separate design work.

## Deliberate Boundaries

- This branch does not introduce Research Bundles.
- It does not make browser session state durable report storage.
- It does not promise that every historical AIQ streaming endpoint has been
  removed from backend internals.
- "Talk to your report" remains a future capability; its eventual enablement
  should be changed through the capability matrix rather than component-local
  conditions.
- Full end-to-end browser smoke coverage and final visual design validation
  remain follow-up work.

## Validation

From the repository root:

```bash
uv run pytest tests/test_nat_foundation.py -q
```

From `frontends/ui`:

```bash
npm run test
npm run lint
npm run docs:state-matrix:check
```

For backend changes, also validate a shallow request, deep-research escalation,
job-list recovery, job cancellation, report fetch, expiry/unavailable behavior,
and two concurrent jobs with selection switching.

## Historical Context

The implementation was built as feature branches under `pwr/*`, then
integrated and polished on `pwr/2.2-dev`. Those branches are retired after
this consolidation. The original design and working plans remain in the
workspace under `project-docs/project-plans/`; this README is the concise
repository-local architectural handoff.
