// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDeepResearchClient } from './deep-research-client'

type MockEventListener = (event: Event) => void

class MockEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2

  readonly listeners = new Map<string, MockEventListener[]>()
  readonly url: string
  readyState = MockEventSource.OPEN
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  close = vi.fn(() => {
    this.readyState = MockEventSource.CLOSED
  })

  constructor(url: string) {
    this.url = url
    mockEventSources.push(this)
  }

  addEventListener(type: string, listener: MockEventListener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  dispatch(type: string, data: unknown) {
    const event = {
      data: JSON.stringify(data),
      lastEventId: `${type}-1`,
    } as MessageEvent

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

const mockEventSources: MockEventSource[] = []

describe('createDeepResearchClient', () => {
  const originalEventSource = globalThis.EventSource

  beforeEach(() => {
    mockEventSources.length = 0
    Object.defineProperty(globalThis, 'EventSource', {
      configurable: true,
      value: MockEventSource,
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'EventSource', {
      configurable: true,
      value: originalEventSource,
    })
  })

  test('does not route interrupted worker timeout statuses through onError', () => {
    const onJobStatus = vi.fn()
    const onError = vi.fn()
    const client = createDeepResearchClient({
      jobId: 'job-1',
      callbacks: {
        onJobStatus,
        onError,
      },
    })

    client.connect()
    mockEventSources[0]?.dispatch('job.status', {
      data: {
        status: 'interrupted',
        error: 'Job timed out (no heartbeat received from worker)',
      },
    })

    expect(onJobStatus).toHaveBeenCalledWith(
      'interrupted',
      'Job timed out (no heartbeat received from worker)'
    )
    expect(onError).not.toHaveBeenCalled()
    expect(mockEventSources[0]?.close).toHaveBeenCalled()
  })

  test('does not route terminal failure statuses through onError', () => {
    const onJobStatus = vi.fn()
    const onError = vi.fn()
    const client = createDeepResearchClient({
      jobId: 'job-1',
      callbacks: {
        onJobStatus,
        onError,
      },
    })

    client.connect()
    mockEventSources[0]?.dispatch('job.status', {
      data: {
        status: 'failure',
        error: 'LLM provider stopped responding',
      },
    })

    expect(onJobStatus).toHaveBeenCalledWith(
      'failure',
      'LLM provider stopped responding'
    )
    expect(onError).not.toHaveBeenCalled()
    expect(mockEventSources[0]?.close).toHaveBeenCalled()
  })
})
