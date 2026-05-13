<!--
SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
SPDX-License-Identifier: Apache-2.0
-->

# AIQ UI Docs

## Research UI State Matrix

The research UI state matrix documents how backend-owned job state maps to UI capabilities and component behavior.

Runtime code uses:

- `src/features/jobs/state/capability-matrix.ts` for canonical capability rules.
- `src/features/jobs/state/research-ui-state.ts` for prompt/status/counter/banner projections.

Generated review documentation lives in:

- [research-ui-state-matrix.md](research-ui-state-matrix.md)

Update flow:

1. Change the matrix or projection selector.
2. Add or update focused tests in `src/features/jobs/state`.
3. Regenerate the Markdown with `npm run docs:state-matrix`.
4. Verify doc freshness with `npm run docs:state-matrix:check`.
5. Run the normal UI checks before committing.

The local CI script also runs the freshness check so matrix changes cannot silently drift from the generated documentation.
