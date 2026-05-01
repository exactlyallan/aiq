// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import {
  PwrApiErrorSchema,
  PwrJobListResponseSchema,
  PwrResearchSubmitResponseSchema,
} from './pwr-contracts'

describe('Project Weight Reduction MSW handlers', () => {
  test('returns shallow answer fixture', async () => {
    const response = await fetch('/api/research/submit', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'quick answer' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(PwrResearchSubmitResponseSchema.parse(body).type).toBe('shallow_answer')
  })

  test('returns async job fixture for deep research prompts', async () => {
    const response = await fetch('/api/research/submit', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'deep research request' }),
    })
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(PwrResearchSubmitResponseSchema.parse(body).type).toBe('async_job_started')
  })

  test('returns diagnostic error fixture for LLM timeout', async () => {
    const response = await fetch('/api/research/submit', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'fail:llm_timeout' }),
    })
    const body = await response.json()
    const parsed = PwrApiErrorSchema.parse(body)

    expect(response.status).toBe(504)
    expect(parsed.error.failure_boundary).toBe('llm_provider')
    expect(parsed.error.retryable).toBe(true)
  })

  test('returns job list fixture', async () => {
    const response = await fetch('/api/jobs/async/jobs')
    const body = await response.json()
    const parsed = PwrJobListResponseSchema.parse(body)

    expect(response.status).toBe(200)
    expect(parsed.jobs.map((job) => job.status)).toEqual([
      'running',
      'success',
      'failure',
      'expired',
    ])
  })
})
