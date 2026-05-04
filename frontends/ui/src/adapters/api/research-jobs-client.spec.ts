// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from 'vitest'
import { researchApiErrorFixtures, researchJobListFixture } from './research-job-contract-fixtures'
import { listResearchJobs } from './research-jobs-client'

const createResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: { 'Content-Type': 'application/json' },
  })

describe('listResearchJobs', () => {
  test('loads jobs through the UI proxy with optional auth', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(createResponse(researchJobListFixture))

    const result = await listResearchJobs({ fetchImpl, authToken: 'token-1' })

    expect(result).toEqual(researchJobListFixture)
    expect(fetchImpl).toHaveBeenCalledWith('/api/jobs/async/jobs', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer token-1',
      },
      signal: undefined,
    })
  })

  test('normalizes nullable backend display fields in job list responses', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createResponse({
        jobs: [
          {
            ...researchJobListFixture.jobs[0],
            agent_type: null,
            input_preview: null,
          },
        ],
      })
    )

    await expect(listResearchJobs({ fetchImpl })).resolves.toEqual({
      jobs: [
        {
          ...researchJobListFixture.jobs[0],
          agent_type: undefined,
          input_preview: undefined,
        },
      ],
    })
  })

  test('surfaces structured backend errors', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createResponse(researchApiErrorFixtures.backendUnavailable, { status: 503 }))

    await expect(listResearchJobs({ fetchImpl })).rejects.toMatchObject({
      name: 'ResearchJobsError',
      status: 503,
      code: 'BACKEND_UNAVAILABLE',
      failureBoundary: 'aiq_backend',
      retryable: true,
    })
  })

  test('marks malformed successful responses as UI proxy errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(createResponse({ jobs: [{ id: 'bad' }] }))

    await expect(listResearchJobs({ fetchImpl })).rejects.toMatchObject({
      name: 'ResearchJobsError',
      code: 'MALFORMED_RESPONSE',
      failureBoundary: 'ui_proxy',
      retryable: true,
    })
  })

  test('wraps network failures with a stable boundary', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('fetch failed'))

    await expect(listResearchJobs({ fetchImpl })).rejects.toMatchObject({
      name: 'ResearchJobsError',
      code: 'NETWORK_ERROR',
      failureBoundary: 'ui_proxy',
      retryable: true,
      userMessage: 'The UI could not reach the research jobs API.',
    })
  })
})
