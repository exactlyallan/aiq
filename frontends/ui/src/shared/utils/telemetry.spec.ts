// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { vi, describe, test, expect, beforeEach } from 'vitest'

// Re-import fresh module for each test to reset provider state.
// vitest module cache is reset by vi.resetModules() + dynamic import.
async function loadModule() {
  const mod = await import('./telemetry')
  return mod
}

describe('telemetry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  test('trackError and trackAction are no-ops without a provider', async () => {
    const { trackError, trackAction } = await loadModule()

    // Should not throw
    expect(() => trackError('test_error', { key: 'value' })).not.toThrow()
    expect(() => trackAction('test_action', { key: 'value' })).not.toThrow()
  })

  test('trackError calls provider.trackError after registration', async () => {
    const { registerTelemetryProvider, trackError } = await loadModule()
    const mockProvider = { trackError: vi.fn(), trackAction: vi.fn() }

    registerTelemetryProvider(mockProvider)
    trackError('something_failed', { detail: 'oops' })

    expect(mockProvider.trackError).toHaveBeenCalledTimes(1)
    expect(mockProvider.trackError).toHaveBeenCalledWith('something_failed', { detail: 'oops' })
    expect(mockProvider.trackAction).not.toHaveBeenCalled()
  })

  test('trackAction calls provider.trackAction after registration', async () => {
    const { registerTelemetryProvider, trackAction } = await loadModule()
    const mockProvider = { trackError: vi.fn(), trackAction: vi.fn() }

    registerTelemetryProvider(mockProvider)
    trackAction('research_started', { conversationId: 'abc' })

    expect(mockProvider.trackAction).toHaveBeenCalledTimes(1)
    expect(mockProvider.trackAction).toHaveBeenCalledWith('research_started', {
      conversationId: 'abc',
    })
    expect(mockProvider.trackError).not.toHaveBeenCalled()
  })

  test('trackAuthEvent routes expected codes to trackAction', async () => {
    const { registerTelemetryProvider, trackAuthEvent } = await loadModule()
    const mockProvider = { trackError: vi.fn(), trackAction: vi.fn() }

    registerTelemetryProvider(mockProvider)
    trackAuthEvent('token_expired', { path: '/api/test' })

    expect(mockProvider.trackAction).toHaveBeenCalledTimes(1)
    expect(mockProvider.trackAction).toHaveBeenCalledWith('auth_token_expired', {
      auth_error_code: 'token_expired',
      path: '/api/test',
    })
    expect(mockProvider.trackError).not.toHaveBeenCalled()
  })

  test('trackAuthEvent routes unexpected codes to trackError', async () => {
    const { registerTelemetryProvider, trackAuthEvent } = await loadModule()
    const mockProvider = { trackError: vi.fn(), trackAction: vi.fn() }

    registerTelemetryProvider(mockProvider)
    trackAuthEvent('token_invalid', { path: '/api/test' })

    expect(mockProvider.trackError).toHaveBeenCalledTimes(1)
    expect(mockProvider.trackError).toHaveBeenCalledWith('auth_token_invalid', {
      auth_error_code: 'token_invalid',
      path: '/api/test',
    })
    expect(mockProvider.trackAction).not.toHaveBeenCalled()
  })

  test('trackAuthEvent routes session_refresh_failed to trackAction', async () => {
    const { registerTelemetryProvider, trackAuthEvent } = await loadModule()
    const mockProvider = { trackError: vi.fn(), trackAction: vi.fn() }

    registerTelemetryProvider(mockProvider)
    trackAuthEvent('session_refresh_failed')

    expect(mockProvider.trackAction).toHaveBeenCalledWith(
      'auth_session_refresh_failed',
      expect.objectContaining({ auth_error_code: 'session_refresh_failed' })
    )
  })

  test('subsequent registerTelemetryProvider replaces previous provider', async () => {
    const { registerTelemetryProvider, trackError } = await loadModule()
    const first = { trackError: vi.fn(), trackAction: vi.fn() }
    const second = { trackError: vi.fn(), trackAction: vi.fn() }

    registerTelemetryProvider(first)
    registerTelemetryProvider(second)
    trackError('test')

    expect(first.trackError).not.toHaveBeenCalled()
    expect(second.trackError).toHaveBeenCalledTimes(1)
  })
})
