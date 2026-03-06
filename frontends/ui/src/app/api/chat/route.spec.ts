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

describe('Chat API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('BACKEND_URL', 'http://test-backend:8000')
  })

  test('proxies POST to backend /chat/stream with auth', async () => {
    server.use(
      http.post('http://test-backend:8000/chat/stream', () => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: hello\n\n'))
            controller.close()
          },
        })
        return new HttpResponse(stream, {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      })
    )

    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      },
      body: JSON.stringify({ message: 'hello' }),
    })

    const response = await POST(req)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  })

  test('returns error on backend failure', async () => {
    server.use(
      http.post('http://test-backend:8000/chat/stream', () => {
        return new HttpResponse('Internal Server Error', { status: 500 })
      })
    )

    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'hello' }),
    })

    const response = await POST(req)
    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error.code).toBe('BACKEND_ERROR')
  })
})
