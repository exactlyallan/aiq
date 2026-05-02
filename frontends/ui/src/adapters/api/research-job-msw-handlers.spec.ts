// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import {
  ResearchApiErrorSchema,
  ResearchJobListResponseSchema,
  ResearchSubmitResponseSchema,
} from './research-job-contracts'

describe('Research job MSW handlers', () => {
  test('returns shallow answer fixture', async () => {
    const response = await fetch('/api/research/submit', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'quick answer' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(ResearchSubmitResponseSchema.parse(body).type).toBe('shallow_answer')
  })

  test('returns async job fixture for deep research prompts', async () => {
    const response = await fetch('/api/research/submit', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'deep research request' }),
    })
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(ResearchSubmitResponseSchema.parse(body).type).toBe('async_job_started')
  })

  test('returns diagnostic error fixture for LLM timeout', async () => {
    const response = await fetch('/api/research/submit', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'fail:llm_timeout' }),
    })
    const body = await response.json()
    const parsed = ResearchApiErrorSchema.parse(body)

    expect(response.status).toBe(504)
    expect(parsed.error.failure_boundary).toBe('llm_provider')
    expect(parsed.error.retryable).toBe(true)
  })

  test('returns job list fixture', async () => {
    const response = await fetch('/api/jobs/async/jobs')
    const body = await response.json()
    const parsed = ResearchJobListResponseSchema.parse(body)

    expect(response.status).toBe(200)
    expect(parsed.jobs.map((job) => job.status)).toEqual([
      'running',
      'success',
      'failure',
      'expired',
    ])
  })
})
