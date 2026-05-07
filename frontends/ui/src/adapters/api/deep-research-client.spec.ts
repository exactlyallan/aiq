// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, test, vi } from 'vitest'
import { cancelJob, getJobReport, getJobState, getJobStatus } from './deep-research-client'

describe('deep research REST client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('fetches job status through the local API route with bearer auth', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ job_id: 'job-1', status: 'running', error: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getJobStatus('job-1', 'token-123')).resolves.toEqual({
      job_id: 'job-1',
      status: 'running',
      error: null,
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/jobs/async/job/job-1', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
    })
  })

  test('fetches state and report without requiring EventSource', async () => {
    Object.defineProperty(globalThis, 'EventSource', {
      configurable: true,
      get() {
        throw new Error('EventSource should not be read')
      },
    })
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ job_id: 'job-1', has_state: false, state: null, artifacts: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ job_id: 'job-1', has_report: true, report: 'report' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getJobState('job-1')).resolves.toEqual({
      job_id: 'job-1',
      has_state: false,
      state: null,
      artifacts: null,
    })
    await expect(getJobReport('job-1')).resolves.toEqual({
      job_id: 'job-1',
      has_report: true,
      report: 'report',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/jobs/async/job/job-1/state', {
      headers: { 'Content-Type': 'application/json' },
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/jobs/async/job/job-1/report', {
      headers: { 'Content-Type': 'application/json' },
    })
  })

  test('posts cancellation through the local API route', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ job_id: 'job-1', status: 'interrupted', task_cancelled: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(cancelJob('job-1', 'token-123')).resolves.toEqual({
      job_id: 'job-1',
      status: 'interrupted',
      task_cancelled: true,
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/jobs/async/job/job-1/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
    })
  })

  test('preserves endpoint-specific status error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response('bad gateway', { status: 502 }))
    )

    await expect(getJobStatus('job-1')).rejects.toThrow('Failed to get job status: 502')
  })
})
