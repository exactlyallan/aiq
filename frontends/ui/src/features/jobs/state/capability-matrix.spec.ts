// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import {
  capabilityMatrixRows,
  deriveCapabilities,
  type CapabilityMatrixInput,
} from './capability-matrix'

const readyInput: CapabilityMatrixInput = {
  selectedJob: 'none',
  jobStatus: 'none',
  reportAvailability: 'unknown',
  globalConnection: 'online',
  authState: 'authenticated',
  dataSourceState: 'available',
  uploadState: 'idle',
  activeRequestState: 'idle',
}

describe('Research job capability matrix', () => {
  test('has a default row as the final fallback', () => {
    expect(capabilityMatrixRows.at(-1)?.id).toBe('default-ready')
  })

  test('all matrix rows can be evaluated through deriveCapabilities', () => {
    capabilityMatrixRows.forEach((row) => {
      const input = { ...readyInput, ...row.match }
      const capabilities = deriveCapabilities(input)

      expect(capabilities).toEqual(row.capabilities)
    })
  })

  test('default ready state allows prompt, upload, and data-source controls', () => {
    const capabilities = deriveCapabilities(readyInput)

    expect(capabilities.prompt.enabled).toBe(true)
    expect(capabilities.fileUpload.enabled).toBe(true)
    expect(capabilities.dataSources.enabled).toBe(true)
    expect(capabilities.banner.severity).toBe('none')
  })

  test('running selected job disables prompt/upload and enables cancel', () => {
    const capabilities = deriveCapabilities({
      ...readyInput,
      selectedJob: 'active',
      jobStatus: 'running',
    })

    expect(capabilities.prompt).toEqual({ enabled: false, reason: 'job_running' })
    expect(capabilities.fileUpload).toEqual({ enabled: false, reason: 'job_running' })
    expect(capabilities.cancelJob.enabled).toBe(true)
  })

  test('completed report can be fetched but talk-to-report remains future-gated', () => {
    const capabilities = deriveCapabilities({
      ...readyInput,
      selectedJob: 'terminal',
      jobStatus: 'success',
      reportAvailability: 'available',
    })

    expect(capabilities.fetchReport.enabled).toBe(true)
    expect(capabilities.prompt).toEqual({ enabled: false, reason: 'job_terminal' })
    expect(capabilities.fileUpload).toEqual({ enabled: false, reason: 'job_terminal' })
    expect(capabilities.dataSources).toEqual({ enabled: false, reason: 'job_terminal' })
    expect(capabilities.talkToReport).toEqual({
      enabled: false,
      reason: 'future_capability',
    })
  })

  test('auth expiry overrides otherwise valid completed report state', () => {
    const capabilities = deriveCapabilities({
      ...readyInput,
      selectedJob: 'terminal',
      jobStatus: 'success',
      reportAvailability: 'available',
      authState: 'expired',
    })

    expect(capabilities.fetchReport).toEqual({ enabled: false, reason: 'auth_required' })
    expect(capabilities.banner).toEqual({
      severity: 'error',
      category: 'auth_expired',
      recoveryAction: 'sign_in',
    })
  })

  test('failed jobs expose retry and an error banner', () => {
    const capabilities = deriveCapabilities({
      ...readyInput,
      selectedJob: 'terminal',
      jobStatus: 'failure',
    })

    expect(capabilities.retryJob.enabled).toBe(true)
    expect(capabilities.dataSources).toEqual({ enabled: false, reason: 'job_terminal' })
    expect(capabilities.banner).toEqual({
      severity: 'error',
      category: 'job_failed',
      recoveryAction: 'retry',
    })
  })

  test('unavailable data sources disable data source editing from the matrix', () => {
    const capabilities = deriveCapabilities({
      ...readyInput,
      dataSourceState: 'unavailable',
    })

    expect(capabilities.dataSources).toEqual({
      enabled: false,
      reason: 'data_source_unavailable',
    })
    expect(capabilities.banner).toEqual({
      severity: 'warning',
      category: 'data_source_unavailable',
      recoveryAction: 'refresh',
    })
  })
})
