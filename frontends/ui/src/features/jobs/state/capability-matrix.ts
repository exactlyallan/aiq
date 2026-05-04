// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Table-driven UI state/capability matrix for backend-owned research jobs.
 *
 * Component disabled states should be derived from this matrix through
 * selectors. When future capabilities change, update the matrix first, then
 * the tests, then the consuming components.
 */

import type { ResearchJobStatus, ResearchReportAvailability } from '@/adapters/api/research-job-contracts'

export type SelectedJobState = 'none' | 'active' | 'terminal' | 'missing'
export type GlobalConnectionState = 'online' | 'offline' | 'api_unreachable' | 'backend_degraded'
export type AuthState = 'anonymous' | 'authenticated' | 'expired' | 'insufficient_scope'
export type DataSourceState = 'available' | 'auth_required' | 'unavailable' | 'failed'
export type UploadState = 'idle' | 'uploading' | 'failed' | 'disabled_by_selected_job'
export type ActiveRequestState =
  | 'idle'
  | 'submitting'
  | 'polling'
  | 'cancelling'
  | 'fetching_report'
  | 'retrying'

export type CapabilityReason =
  | 'auth_required'
  | 'connection_unavailable'
  | 'backend_degraded'
  | 'job_running'
  | 'job_terminal'
  | 'job_missing'
  | 'request_in_progress'
  | 'upload_in_progress'
  | 'data_source_unavailable'
  | 'report_unavailable'
  | 'report_expired'
  | 'job_stale'
  | 'future_capability'
  | 'not_applicable'

export interface CapabilityMatrixInput {
  selectedJob: SelectedJobState
  jobStatus: ResearchJobStatus | 'none'
  reportAvailability: ResearchReportAvailability
  globalConnection: GlobalConnectionState
  authState: AuthState
  dataSourceState: DataSourceState
  uploadState: UploadState
  activeRequestState: ActiveRequestState
}

export interface Capability {
  enabled: boolean
  reason?: CapabilityReason
}

export type BannerSeverity = 'none' | 'info' | 'warning' | 'error'

export interface UiCapabilities {
  prompt: Capability
  fileUpload: Capability
  dataSources: Capability
  cancelJob: Capability
  retryJob: Capability
  fetchReport: Capability
  talkToReport: Capability
  banner: {
    severity: BannerSeverity
    category: string | null
    recoveryAction: 'none' | 'retry' | 'sign_in' | 'refresh' | 'select_job'
  }
  jobCard: {
    statusLabel: string
    selectable: boolean
  }
}

type MatrixMatch = Partial<CapabilityMatrixInput>

interface CapabilityMatrixRow {
  id: string
  match: MatrixMatch
  capabilities: UiCapabilities
}

const capability = (enabled: boolean, reason?: CapabilityReason): Capability => ({ enabled, reason })

const baseCapabilities = (): UiCapabilities => ({
  prompt: capability(true),
  fileUpload: capability(true),
  dataSources: capability(true),
  cancelJob: capability(false, 'not_applicable'),
  retryJob: capability(false, 'not_applicable'),
  fetchReport: capability(false, 'report_unavailable'),
  talkToReport: capability(false, 'future_capability'),
  banner: { severity: 'none', category: null, recoveryAction: 'none' },
  jobCard: { statusLabel: 'Ready', selectable: true },
})

export const capabilityMatrixRows: CapabilityMatrixRow[] = [
  {
    id: 'auth-anonymous',
    match: { authState: 'anonymous' },
    capabilities: {
      ...baseCapabilities(),
      prompt: capability(false, 'auth_required'),
      fileUpload: capability(false, 'auth_required'),
      dataSources: capability(false, 'auth_required'),
      cancelJob: capability(false, 'auth_required'),
      retryJob: capability(false, 'auth_required'),
      fetchReport: capability(false, 'auth_required'),
      banner: { severity: 'info', category: 'auth_required', recoveryAction: 'sign_in' },
    },
  },
  {
    id: 'auth-expired',
    match: { authState: 'expired' },
    capabilities: {
      ...baseCapabilities(),
      prompt: capability(false, 'auth_required'),
      fileUpload: capability(false, 'auth_required'),
      dataSources: capability(false, 'auth_required'),
      cancelJob: capability(false, 'auth_required'),
      retryJob: capability(false, 'auth_required'),
      fetchReport: capability(false, 'auth_required'),
      banner: { severity: 'error', category: 'auth_expired', recoveryAction: 'sign_in' },
    },
  },
  {
    id: 'api-unreachable',
    match: { globalConnection: 'api_unreachable' },
    capabilities: {
      ...baseCapabilities(),
      prompt: capability(false, 'connection_unavailable'),
      fileUpload: capability(false, 'connection_unavailable'),
      dataSources: capability(false, 'connection_unavailable'),
      cancelJob: capability(false, 'connection_unavailable'),
      retryJob: capability(true),
      fetchReport: capability(false, 'connection_unavailable'),
      banner: { severity: 'error', category: 'api_unreachable', recoveryAction: 'retry' },
    },
  },
  {
    id: 'backend-degraded',
    match: { globalConnection: 'backend_degraded' },
    capabilities: {
      ...baseCapabilities(),
      prompt: capability(false, 'backend_degraded'),
      fileUpload: capability(false, 'backend_degraded'),
      retryJob: capability(true),
      banner: { severity: 'warning', category: 'backend_degraded', recoveryAction: 'retry' },
    },
  },
  {
    id: 'request-in-progress',
    match: { activeRequestState: 'submitting' },
    capabilities: {
      ...baseCapabilities(),
      prompt: capability(false, 'request_in_progress'),
      fileUpload: capability(false, 'request_in_progress'),
      dataSources: capability(false, 'request_in_progress'),
      banner: { severity: 'info', category: 'submitting', recoveryAction: 'none' },
    },
  },
  {
    id: 'uploading',
    match: { uploadState: 'uploading' },
    capabilities: {
      ...baseCapabilities(),
      fileUpload: capability(false, 'upload_in_progress'),
      banner: { severity: 'info', category: 'uploading', recoveryAction: 'none' },
    },
  },
  {
    id: 'selected-submitted-job',
    match: { selectedJob: 'active', jobStatus: 'submitted' },
    capabilities: {
      ...baseCapabilities(),
      prompt: capability(false, 'job_running'),
      fileUpload: capability(false, 'job_running'),
      dataSources: capability(false, 'job_running'),
      cancelJob: capability(true),
      jobCard: { statusLabel: 'Submitted', selectable: true },
    },
  },
  {
    id: 'selected-running-job',
    match: { selectedJob: 'active', jobStatus: 'running' },
    capabilities: {
      ...baseCapabilities(),
      prompt: capability(false, 'job_running'),
      fileUpload: capability(false, 'job_running'),
      dataSources: capability(false, 'job_running'),
      cancelJob: capability(true),
      jobCard: { statusLabel: 'Running', selectable: true },
    },
  },
  {
    id: 'selected-stale-job',
    match: { selectedJob: 'active', jobStatus: 'stale' },
    capabilities: {
      ...baseCapabilities(),
      prompt: capability(false, 'job_stale'),
      fileUpload: capability(false, 'job_stale'),
      dataSources: capability(false, 'job_stale'),
      cancelJob: capability(true),
      retryJob: capability(true),
      banner: { severity: 'warning', category: 'job_stale', recoveryAction: 'retry' },
      jobCard: { statusLabel: 'Stale', selectable: true },
    },
  },
  {
    id: 'selected-completed-report',
    match: {
      selectedJob: 'terminal',
      jobStatus: 'success',
      reportAvailability: 'available',
    },
    capabilities: {
      ...baseCapabilities(),
      prompt: capability(false, 'job_terminal'),
      fileUpload: capability(false, 'job_terminal'),
      dataSources: capability(false, 'job_terminal'),
      fetchReport: capability(true),
      talkToReport: capability(false, 'future_capability'),
      jobCard: { statusLabel: 'Completed', selectable: true },
    },
  },
  {
    id: 'selected-expired-job',
    match: { selectedJob: 'terminal', jobStatus: 'expired' },
    capabilities: {
      ...baseCapabilities(),
      prompt: capability(false, 'job_terminal'),
      fileUpload: capability(false, 'job_terminal'),
      fetchReport: capability(false, 'report_expired'),
      banner: { severity: 'warning', category: 'job_expired', recoveryAction: 'select_job' },
      jobCard: { statusLabel: 'Expired', selectable: true },
    },
  },
  {
    id: 'selected-interrupted-job',
    match: { selectedJob: 'terminal', jobStatus: 'interrupted' },
    capabilities: {
      ...baseCapabilities(),
      prompt: capability(false, 'job_terminal'),
      fileUpload: capability(false, 'job_terminal'),
      retryJob: capability(true),
      fetchReport: capability(false, 'report_unavailable'),
      banner: { severity: 'warning', category: 'job_interrupted', recoveryAction: 'retry' },
      jobCard: { statusLabel: 'Interrupted', selectable: true },
    },
  },
  {
    id: 'selected-failed-job',
    match: { selectedJob: 'terminal', jobStatus: 'failure' },
    capabilities: {
      ...baseCapabilities(),
      prompt: capability(false, 'job_terminal'),
      fileUpload: capability(false, 'job_terminal'),
      retryJob: capability(true),
      fetchReport: capability(false, 'report_unavailable'),
      banner: { severity: 'error', category: 'job_failed', recoveryAction: 'retry' },
      jobCard: { statusLabel: 'Failed', selectable: true },
    },
  },
  {
    id: 'selected-unavailable-job',
    match: { selectedJob: 'terminal', jobStatus: 'unavailable' },
    capabilities: {
      ...baseCapabilities(),
      prompt: capability(false, 'job_missing'),
      fileUpload: capability(false, 'job_missing'),
      fetchReport: capability(false, 'job_missing'),
      banner: { severity: 'error', category: 'job_unavailable', recoveryAction: 'refresh' },
      jobCard: { statusLabel: 'Unavailable', selectable: true },
    },
  },
  {
    id: 'missing-selected-job',
    match: { selectedJob: 'missing' },
    capabilities: {
      ...baseCapabilities(),
      prompt: capability(false, 'job_missing'),
      fileUpload: capability(false, 'job_missing'),
      fetchReport: capability(false, 'job_missing'),
      banner: { severity: 'error', category: 'job_missing', recoveryAction: 'refresh' },
      jobCard: { statusLabel: 'Unavailable', selectable: false },
    },
  },
  {
    id: 'data-source-failed',
    match: { dataSourceState: 'failed' },
    capabilities: {
      ...baseCapabilities(),
      dataSources: capability(false, 'data_source_unavailable'),
      banner: { severity: 'warning', category: 'data_source_failed', recoveryAction: 'retry' },
    },
  },
  {
    id: 'default-ready',
    match: {},
    capabilities: baseCapabilities(),
  },
]

const matchesRow = (input: CapabilityMatrixInput, match: MatrixMatch): boolean =>
  Object.entries(match).every(([key, value]) => input[key as keyof CapabilityMatrixInput] === value)

export const deriveCapabilities = (input: CapabilityMatrixInput): UiCapabilities => {
  const row = capabilityMatrixRows.find((candidate) => matchesRow(input, candidate.match))
  return row?.capabilities ?? baseCapabilities()
}
