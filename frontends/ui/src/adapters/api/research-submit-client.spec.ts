// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from 'vitest'
import { researchApiErrorFixtures, researchSubmitResponses } from './research-job-contract-fixtures'
import { ResearchSubmitError, submitResearch } from './research-submit-client'

const createResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: { 'Content-Type': 'application/json' },
  })

describe('submitResearch', () => {
  test('posts the normalized research submit request', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createResponse(researchSubmitResponses.shallowAnswer))

    const result = await submitResearch(
      {
        prompt: 'Summarize this',
        data_sources: ['web_search'],
        collection_name: 'session-1',
      },
      { fetchImpl }
    )

    expect(result).toEqual(researchSubmitResponses.shallowAnswer)
    expect(fetchImpl).toHaveBeenCalledWith('/api/research/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Summarize this',
        data_sources: ['web_search'],
        collection_name: 'session-1',
      }),
      signal: undefined,
    })
  })

  test('returns async job submit responses', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createResponse(researchSubmitResponses.asyncJobStarted, { status: 202 }))

    await expect(
      submitResearch({ prompt: 'deep research request', data_sources: [] }, { fetchImpl })
    ).resolves.toEqual(researchSubmitResponses.asyncJobStarted)
  })

  test('surfaces structured API errors with diagnostics', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createResponse(researchApiErrorFixtures.llmTimeout, { status: 504 }))

    await expect(submitResearch({ prompt: 'fail', data_sources: [] }, { fetchImpl })).rejects.toMatchObject({
      name: 'ResearchSubmitError',
      status: 504,
      code: 'LLM_TIMEOUT',
      failureBoundary: 'llm_provider',
      retryable: true,
      requestId: 'req_llm_timeout',
      userMessage: 'The model provider timed out.',
    })
  })

  test('marks malformed successful responses as UI proxy errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(createResponse({ ok: true }))

    await expect(submitResearch({ prompt: 'bad response', data_sources: [] }, { fetchImpl })).rejects.toMatchObject({
      name: 'ResearchSubmitError',
      code: 'MALFORMED_RESPONSE',
      failureBoundary: 'ui_proxy',
      retryable: true,
    })
  })

  test('wraps network failures with a stable boundary', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('fetch failed'))

    await expect(submitResearch({ prompt: 'hello', data_sources: [] }, { fetchImpl })).rejects.toMatchObject({
      name: 'ResearchSubmitError',
      code: 'NETWORK_ERROR',
      failureBoundary: 'ui_proxy',
      retryable: true,
      userMessage: 'The UI could not reach the research backend.',
    })
  })

  test('rejects invalid client requests before fetch', async () => {
    const fetchImpl = vi.fn<typeof fetch>()

    await expect(submitResearch({ prompt: '', data_sources: [] }, { fetchImpl })).rejects.toBeInstanceOf(
      ResearchSubmitError
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
