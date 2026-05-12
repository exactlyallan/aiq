// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * High-level UI state derived from the job capability matrix.
 *
 * Components should use this layer for interactive state that combines backend
 * job status, local request activity, and currently hydrated job artifacts.
 * Capability rules stay in `capability-matrix`; this selector translates those
 * rules into the labels, placeholders, and control states needed by UI widgets.
 */

import type { ResearchJobStatus } from '@/adapters/api/research-job-contracts'
import type { DeepResearchTodo, DeepResearchToolCall, StatusType } from '@/features/chat/types'
import type { BannerSeverity, CapabilityReason, UiCapabilities } from './capability-matrix'

export type PromptSendControlMode = 'normal' | 'research_in_progress' | 'research_complete'
export type PromptStatusIconKind = 'idle' | 'active' | 'complete' | 'error' | 'warning'

export interface ResearchUiStateInput {
  capabilities: UiCapabilities
  isAuthenticated: boolean
  isCurrentSessionBusy: boolean
  isSubmitLoading: boolean
  selectedJobStatus?: ResearchJobStatus
  currentStatus?: StatusType | null
  todos?: Array<Pick<DeepResearchTodo, 'content' | 'status'>>
  toolCalls?: Array<Pick<DeepResearchToolCall, 'name' | 'status'>>
  defaultPromptPlaceholder: string
  hasStopHandler: boolean
  knowledgeLayerAvailable: boolean
}

export interface ResearchUiState {
  prompt: {
    disabled: boolean
    disabledReason?: CapabilityReason | 'session_busy'
    placeholder: string
    sendControl: PromptSendControlMode
  }
  statusStrip: {
    label: string
    detail: string
    text: string
    icon: PromptStatusIconKind
  }
  stopResearch: {
    enabled: boolean
    title: string
  }
  sourceCounter: {
    enabled: boolean
  }
  fileCounter: {
    enabled: boolean
  }
  banner: {
    severity: BannerSeverity
    category: string | null
    recoveryAction: 'none' | 'retry' | 'sign_in' | 'refresh' | 'select_job'
  }
}

const activeJobStatuses = new Set<ResearchJobStatus>(['submitted', 'running', 'stale'])
const terminalStatusLabels = new Set(['Completed', 'Failed', 'Expired', 'Interrupted', 'Unavailable'])

const promptStatusText = (label: string, detail: string): string =>
  label === detail ? label : `${label}: ${detail}`

const promptStatusIcon = (label: string): PromptStatusIconKind => {
  if (label === 'Running' || label === 'Submitted' || label === 'Stale') return 'active'
  if (label === 'Completed') return 'complete'
  if (label === 'Failed' || label === 'Unavailable') return 'error'
  if (label === 'Expired' || label === 'Interrupted') return 'warning'
  return 'idle'
}

const currentResearchTask = (
  currentStatus: StatusType | null | undefined,
  todos: ResearchUiStateInput['todos'],
  toolCalls: ResearchUiStateInput['toolCalls']
): string | undefined => {
  const activeTodo = todos?.find((todo) => todo.status === 'in_progress')
  if (activeTodo?.content?.trim()) return activeTodo.content.trim()

  const activeTool = toolCalls?.find((tool) => tool.status === 'running')
  if (activeTool?.name?.trim()) return `Using ${activeTool.name.trim()}`

  switch (currentStatus) {
    case 'thinking':
      return 'Thinking'
    case 'searching':
      return 'Finding sources'
    case 'researching':
      return 'Researching sources'
    case 'writing':
      return 'Writing report'
    case 'complete':
      return 'Report done'
    case 'error':
      return 'Research failed'
    default:
      return undefined
  }
}

const statusDetail = (input: ResearchUiStateInput): string => {
  const { selectedJobStatus, isAuthenticated, isSubmitLoading } = input
  if (!isAuthenticated) return 'Sign in required'
  if (isSubmitLoading) return 'Submitting'

  const task = currentResearchTask(input.currentStatus, input.todos, input.toolCalls)

  if (selectedJobStatus && activeJobStatuses.has(selectedJobStatus)) {
    if (task) return task
    if (selectedJobStatus === 'submitted') return 'Starting research'
    if (selectedJobStatus === 'stale') return 'Research connection delayed'
    return 'Research in progress'
  }

  if (task) return task
  if (input.isCurrentSessionBusy) return 'Session busy'

  switch (input.capabilities.prompt.reason) {
    case 'job_terminal':
      return 'Research complete'
    case 'job_missing':
      return 'Job unavailable'
    case 'request_in_progress':
      return 'Request active'
    case 'data_source_unavailable':
      return 'Source unavailable'
    default:
      return 'Ready'
  }
}

const sendControlMode = (
  selectedJobStatus: ResearchJobStatus | undefined,
  statusLabel: string
): PromptSendControlMode => {
  if (selectedJobStatus && activeJobStatuses.has(selectedJobStatus)) return 'research_in_progress'
  if (terminalStatusLabels.has(statusLabel)) return 'research_complete'
  return 'normal'
}

const promptPlaceholder = (
  input: ResearchUiStateInput,
  sendControl: PromptSendControlMode
): string => {
  if (!input.isAuthenticated) return 'Sign in to start researching'
  if (sendControl === 'research_complete') {
    return 'Research completed. Create a new session for further questions.'
  }
  if (input.isCurrentSessionBusy) return 'Please wait...'
  return input.defaultPromptPlaceholder
}

export const deriveResearchUiState = (input: ResearchUiStateInput): ResearchUiState => {
  const statusLabel = input.capabilities.jobCard.statusLabel
  const detail = statusDetail(input)
  const sendControl = sendControlMode(input.selectedJobStatus, statusLabel)
  const promptDisabled = !input.capabilities.prompt.enabled || input.isCurrentSessionBusy

  return {
    prompt: {
      disabled: promptDisabled,
      disabledReason:
        input.capabilities.prompt.reason ?? (input.isCurrentSessionBusy ? 'session_busy' : undefined),
      placeholder: promptPlaceholder(input, sendControl),
      sendControl,
    },
    statusStrip: {
      label: statusLabel,
      detail,
      text: promptStatusText(statusLabel, detail),
      icon: promptStatusIcon(statusLabel),
    },
    stopResearch: {
      enabled: input.hasStopHandler && input.capabilities.cancelJob.enabled,
      title:
        input.hasStopHandler && input.capabilities.cancelJob.enabled
          ? 'Stop research'
          : 'No active research to stop',
    },
    sourceCounter: {
      enabled: input.capabilities.dataSources.enabled,
    },
    fileCounter: {
      enabled: input.capabilities.fileUpload.enabled && input.knowledgeLayerAvailable,
    },
    banner: input.capabilities.banner,
  }
}
