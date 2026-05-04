// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Selector helpers for deriving component capabilities from backend-owned job
 * state. Components should consume these helpers instead of composing local
 * disabled/loading rules from scattered booleans.
 */

import type {
  ResearchJobListItem,
  ResearchReportAvailability,
} from '@/adapters/api/research-job-contracts'
import type { ChatMessage } from '@/features/chat/types'
import {
  deriveCapabilities,
  type ActiveRequestState,
  type AuthState,
  type CapabilityMatrixInput,
  type DataSourceState,
  type GlobalConnectionState,
  type UiCapabilities,
  type UploadState,
} from './capability-matrix'
import { deriveSelectedJobState } from './multi-job-flow'

export interface JobCapabilityInputArgs {
  selectedJobId: string | null
  selectedJob: ResearchJobListItem | null
  authState: AuthState
  globalConnection?: GlobalConnectionState
  dataSourceState?: DataSourceState
  uploadState?: UploadState
  activeRequestState?: ActiveRequestState
}

export interface JobActionSelectors {
  canSubmitPrompt: boolean
  canUploadFiles: boolean
  canEditDataSources: boolean
  canCancelJob: boolean
  canRetryJob: boolean
  canFetchReport: boolean
  canContinueConversation: boolean
  canTalkToReport: boolean
  isJobTerminal: boolean
  promptDisabledReason: string | undefined
  uploadDisabledReason: string | undefined
  dataSourcesDisabledReason: string | undefined
}

export const deriveCapabilityInput = ({
  selectedJobId,
  selectedJob,
  authState,
  globalConnection = 'online',
  dataSourceState = 'available',
  uploadState = 'idle',
  activeRequestState = 'idle',
}: JobCapabilityInputArgs): CapabilityMatrixInput => {
  const selected = deriveSelectedJobState(selectedJob ? [selectedJob] : [], selectedJobId)

  return {
    selectedJob: selected.state,
    jobStatus: selectedJob?.status ?? 'none',
    reportAvailability: selectedJob?.report_availability ?? 'unknown',
    globalConnection,
    authState,
    dataSourceState,
    uploadState,
    activeRequestState,
  }
}

export const deriveJobCapabilities = (args: JobCapabilityInputArgs): UiCapabilities =>
  deriveCapabilities(deriveCapabilityInput(args))

export const deriveJobActionSelectors = (capabilities: UiCapabilities): JobActionSelectors => ({
  canSubmitPrompt: capabilities.prompt.enabled,
  canUploadFiles: capabilities.fileUpload.enabled,
  canEditDataSources: capabilities.dataSources.enabled,
  canCancelJob: capabilities.cancelJob.enabled,
  canRetryJob: capabilities.retryJob.enabled,
  canFetchReport: capabilities.fetchReport.enabled,
  // Future "continue after report" should change in the matrix/selectors, not
  // in individual components.
  canContinueConversation: capabilities.prompt.enabled,
  canTalkToReport: capabilities.talkToReport.enabled,
  isJobTerminal: capabilities.jobCard.statusLabel === 'Completed' ||
    capabilities.jobCard.statusLabel === 'Failed' ||
    capabilities.jobCard.statusLabel === 'Expired' ||
    capabilities.jobCard.statusLabel === 'Interrupted' ||
    capabilities.jobCard.statusLabel === 'Unavailable',
  promptDisabledReason: capabilities.prompt.reason,
  uploadDisabledReason: capabilities.fileUpload.reason,
  dataSourcesDisabledReason: capabilities.dataSources.reason,
})

const terminalStatusToReportAvailability = (
  status: NonNullable<ChatMessage['deepResearchJobStatus']>,
  showViewReport: boolean | undefined
): ResearchReportAvailability => {
  if (status === 'success') return showViewReport ? 'available' : 'unavailable'
  if (status === 'failure' || status === 'interrupted') return 'error'
  return 'unknown'
}

const toIsoTimestamp = (value: ChatMessage['timestamp'] | string | null | undefined): string => {
  const date = value instanceof Date ? value : new Date(value ?? Date.now())
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

export const latestResearchJobFromMessages = (
  messages: ChatMessage[],
  options: {
    ownerConversationId: string
    activeJobId?: string | null
    activeJobStatus?: ChatMessage['deepResearchJobStatus'] | null
    activeJobStreaming?: boolean
  }
): ResearchJobListItem | null => {
  const latestJobMessage = [...messages]
    .reverse()
    .find((message) => message.messageType === 'agent_response' && message.deepResearchJobId)

  if (!latestJobMessage?.deepResearchJobId) return null

  const activeStatus =
    options.activeJobId === latestJobMessage.deepResearchJobId &&
    options.activeJobStreaming &&
    options.activeJobStatus
      ? options.activeJobStatus
      : undefined
  const status = activeStatus ?? latestJobMessage.deepResearchJobStatus ?? 'submitted'
  const timestamp = toIsoTimestamp(latestJobMessage.timestamp)

  return {
    job_id: latestJobMessage.deepResearchJobId,
    status,
    agent_type: 'deep_researcher',
    input_preview: latestJobMessage.content || 'Research job',
    created_at: timestamp,
    updated_at: timestamp,
    expires_at: null,
    data_sources: latestJobMessage.enabledDataSources ?? [],
    collection_name: options.ownerConversationId,
    has_report: Boolean(latestJobMessage.showViewReport || latestJobMessage.reportContent),
    report_availability: terminalStatusToReportAvailability(status, latestJobMessage.showViewReport),
    error: null,
  }
}
