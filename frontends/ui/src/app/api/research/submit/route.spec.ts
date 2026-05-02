// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { POST } from './route'

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => undefined),
  })),
}))

vi.mock('@/adapters/auth/config', () => ({
  isAuthRequired: vi.fn(() => false),
}))

const createRequest = (body: unknown) =>
  ({
    headers: new Headers(),
    json: vi.fn(async () => body),
  }) as unknown as Parameters<typeof POST>[0]

const originalBackendUrl = process.env.BACKEND_URL

describe('research submit route', () => {
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

  test('preserves backend status and boundary for non-JSON responses', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('upstream gateway failed', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'Content-Type': 'text/html' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(createRequest({ prompt: 'summarize', data_sources: [] }))
    const payload = await response.json()

    expect(response.status).toBe(502)
    expect(payload).toEqual({
      error: {
        code: 'BACKEND_NON_JSON_RESPONSE',
        message: 'upstream gateway failed',
        user_message: 'The research backend returned an invalid response.',
        failure_boundary: 'aiq_backend',
        retryable: true,
      },
    })
    expect(fetchMock).toHaveBeenCalledWith('http://aiq-backend.test/v1/research/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AIQ-Mode': 'headless',
      },
      body: JSON.stringify({ prompt: 'summarize', data_sources: [] }),
    })
  })

  test('passes through structured backend problem JSON responses', async () => {
    const backendError = {
      error: {
        code: 'LLM_TIMEOUT',
        message: 'provider timeout',
        user_message: 'The model provider timed out.',
        failure_boundary: 'llm_provider',
        retryable: true,
      },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(backendError), {
          status: 504,
          statusText: 'Gateway Timeout',
          headers: { 'Content-Type': 'application/problem+json' },
        })
      )
    )

    const response = await POST(createRequest({ prompt: 'summarize', data_sources: [] }))

    expect(response.status).toBe(504)
    await expect(response.json()).resolves.toEqual(backendError)
  })
})
