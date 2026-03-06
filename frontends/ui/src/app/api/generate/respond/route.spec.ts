// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { server } from '@/mocks/server'
import { http, HttpResponse } from 'msw'

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => ({ value: 'mock-id-token' }) }),
}))

vi.mock('@/adapters/auth/config', () => ({
  isAuthRequired: () => true,
}))

describe('Generate Respond API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('BACKEND_URL', 'http://test-backend:8000')
  })

  test('proxies HITL response to backend /generate/respond', async () => {
    server.use(
      http.post('http://test-backend:8000/generate/respond', () => {
        return HttpResponse.json({ ok: true })
      })
    )

    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/generate/respond', {
      method: 'POST',
      body: JSON.stringify({
        session_id: 'sess-1',
        prompt_id: 'prompt-1',
        response: 'approved',
      }),
    })

    const response = await POST(req)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.ok).toBe(true)
  })

  test('returns error on backend failure', async () => {
    server.use(
      http.post('http://test-backend:8000/generate/respond', () => {
        return new HttpResponse('Not Found', { status: 404 })
      })
    )

    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/generate/respond', {
      method: 'POST',
      body: JSON.stringify({ session_id: 'sess-1', prompt_id: 'prompt-1', response: 'yes' }),
    })

    const response = await POST(req)
    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error.code).toBe('BACKEND_ERROR')
  })
})
