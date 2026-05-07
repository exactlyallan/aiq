// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GET } from './route'

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
  })),
}))

vi.mock('@/adapters/auth/config', () => ({
  isAuthRequired: vi.fn(() => false),
}))

const originalBackendUrl = process.env.BACKEND_URL

const createRequest = (url = 'http://localhost/api/jobs/async/job/job-1') =>
  ({
    url,
    headers: new Headers(),
  }) as unknown as Request

const createParams = (path: string[]) => ({
  params: Promise.resolve({ path }),
})

describe('async jobs route proxy', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.BACKEND_URL = 'http://aiq-backend.test'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalBackendUrl === undefined) {
      delete process.env.BACKEND_URL
    } else {
      process.env.BACKEND_URL = originalBackendUrl
    }
  })

  test('rejects removed stream routes without contacting the backend', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(
      createRequest('http://localhost/api/jobs/async/job/job-1/stream?token=abc'),
      createParams(['job', 'job-1', 'stream'])
    )
    const payload = await response.json()

    expect(response.status).toBe(410)
    expect(payload).toEqual({
      error: {
        code: 'STREAM_TRANSPORT_REMOVED',
        message: 'Stream transport routes are disabled. Use job status, state, and report polling endpoints.',
      },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('proxies JSON status requests to the backend', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ job_id: 'job-1', status: 'running', error: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(createRequest(), createParams(['job', 'job-1']))

    await expect(response.json()).resolves.toEqual({
      job_id: 'job-1',
      status: 'running',
      error: null,
    })
    expect(fetchMock).toHaveBeenCalledWith('http://aiq-backend.test/v1/jobs/async/job/job-1', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
  })
})
