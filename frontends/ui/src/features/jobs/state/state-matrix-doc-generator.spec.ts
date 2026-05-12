// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'

interface StateMatrixDocGenerator {
  buildStateMatrixMarkdown: (matrix: unknown) => string
  loadStateMatrix: () => unknown
}

const requireGenerator = createRequire(import.meta.url)
const {
  buildStateMatrixMarkdown,
  loadStateMatrix,
} = requireGenerator('../../../../scripts/generate-state-matrix-doc.cjs') as StateMatrixDocGenerator

describe('generate-state-matrix-doc', () => {
  test('builds a reviewable markdown table from the runtime matrix', () => {
    const matrix = loadStateMatrix()
    const markdown = buildStateMatrixMarkdown(matrix)

    expect(markdown).toContain('# Research UI State Matrix')
    expect(markdown).toContain('## Canonical Matrix Conditions')
    expect(markdown).toContain('| Row | Selected Job | Job Status |')
    expect(markdown).toContain('## Capability Outputs')
    expect(markdown).toContain('| Row | Prompt | File Upload | Data Sources |')
    expect(markdown).toContain('## Prompt Bar Projection')
    expect(markdown).toContain('## Side Panel Projection')
    expect(markdown).toContain('## Scenario Review Checklist')
    expect(markdown).toContain('selected-running-job')
    expect(markdown).toContain('data-source-unavailable')
  })
})
