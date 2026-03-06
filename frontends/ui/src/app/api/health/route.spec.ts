// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { server } from '@/mocks/server'
import { http, HttpResponse } from 'msw'

describe('Health API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('BACKEND_URL', 'http://test-backend:8000')
  })

  test('returns backend health data on success', async () => {
    server.use(
      http.get('http://test-backend:8000/health', () => {
        return HttpResponse.json({ status: 'healthy' })
      })
    )

    const { GET } = await import('./route')
    const response = await GET()

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.status).toBe('healthy')
  })

  test('returns backend status code on non-ok response', async () => {
    server.use(
      http.get('http://test-backend:8000/health', () => {
        return new HttpResponse(null, { status: 503 })
      })
    )

    const { GET } = await import('./route')
    const response = await GET()

    expect(response.status).toBe(503)
  })

  test('returns 502 when backend is unreachable', async () => {
    server.use(
      http.get('http://test-backend:8000/health', () => {
        return HttpResponse.error()
      })
    )

    const { GET } = await import('./route')
    const response = await GET()

    expect(response.status).toBe(502)
  })
})
