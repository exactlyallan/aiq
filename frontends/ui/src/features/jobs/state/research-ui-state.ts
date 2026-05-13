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
const terminalStatusLabels = new Set([
  'Completed',
  'Failed',
  'Expired',
  'Interrupted',
  'Unavailable',
])
const errorStatusLabels = new Set(['Failed', 'Expired', 'Interrupted', 'Unavailable'])

const readyStatus = (): ResearchUiState['statusStrip'] => ({
  label: 'Ready',
  detail: 'Ready...',
  text: 'Ready...',
  icon: 'idle',
})

const thinkingStatus = (detail = 'Thinking...'): ResearchUiState['statusStrip'] => ({
  label: 'Thinking',
  detail,
  text: detail,
  icon: 'active',
})

const completeStatus = (): ResearchUiState['statusStrip'] => ({
  label: 'Research Complete',
  detail: 'Research Complete',
  text: 'Research Complete',
  icon: 'complete',
})

const errorStatus = (detail: string): ResearchUiState['statusStrip'] => ({
  label: 'Error',
  detail,
  text: `Error - ${detail}`,
  icon: 'warning',
})

const appendEllipsis = (value: string): string => {
  const trimmedValue = value.trim()
  if (!trimmedValue) return 'Thinking...'
  return trimmedValue.endsWith('...') ? trimmedValue : `${trimmedValue} ...`
}

const activeTodoProgress = (todos: ResearchUiStateInput['todos']): string | undefined => {
  if (!todos?.length) return undefined

  const activeTodoIndex = todos.findIndex((todo) => todo.status === 'in_progress')
  if (activeTodoIndex < 0) return undefined

  const activeTodo = todos[activeTodoIndex]
  const stepName = activeTodo?.content?.trim()
  if (!stepName) return undefined

  return `${activeTodoIndex + 1}/${todos.length} ${stepName} ...`
}

const currentResearchTask = (
  currentStatus: StatusType | null | undefined,
  todos: ResearchUiStateInput['todos'],
  toolCalls: ResearchUiStateInput['toolCalls']
): string | undefined => {
  const todoProgress = activeTodoProgress(todos)
  if (todoProgress) return todoProgress

  const activeTool = toolCalls?.find((tool) => tool.status === 'running')
  if (activeTool?.name?.trim()) return appendEllipsis(`Using ${activeTool.name.trim()}`)

  switch (currentStatus) {
    case 'planning':
      return 'Planning ...'
    case 'thinking':
      return 'Thinking...'
    case 'searching':
      return 'Finding sources ...'
    case 'researching':
      return 'Researching sources ...'
    case 'writing':
      return 'Writing report ...'
    case 'complete':
      return undefined
    case 'error':
      return 'Research failed'
    default:
      return undefined
  }
}

const errorDetailForPromptReason = (
  reason: ResearchUiStateInput['capabilities']['prompt']['reason']
): string | undefined => {
  switch (reason) {
    case 'auth_required':
      return 'Sign in required'
    case 'connection_unavailable':
      return 'Backend unavailable'
    case 'backend_degraded':
      return 'Backend health unstable'
    case 'job_terminal':
      return undefined
    case 'job_missing':
      return 'Job unavailable'
    case 'data_source_unavailable':
      return 'Source unavailable'
    case 'job_stale':
      return 'Research connection delayed'
    default:
      return undefined
  }
}

const errorDetailForStatusLabel = (statusLabel: string): string => {
  switch (statusLabel) {
    case 'Failed':
      return 'Research failed'
    case 'Expired':
      return 'Research expired'
    case 'Interrupted':
      return 'Research interrupted'
    case 'Unavailable':
      return 'Job unavailable'
    default:
      return 'Research failed'
  }
}

const deriveStatusStrip = (
  input: ResearchUiStateInput,
  statusLabel: string
): ResearchUiState['statusStrip'] => {
  if (!input.isAuthenticated) return errorStatus('Sign in required')

  const promptErrorDetail = errorDetailForPromptReason(input.capabilities.prompt.reason)
  if (promptErrorDetail && !activeJobStatuses.has(input.selectedJobStatus ?? 'success')) {
    return errorStatus(promptErrorDetail)
  }

  if (input.selectedJobStatus && activeJobStatuses.has(input.selectedJobStatus)) {
    const task = currentResearchTask(input.currentStatus, input.todos, input.toolCalls)
    if (task) return thinkingStatus(task)
    if (input.selectedJobStatus === 'submitted') return thinkingStatus('Starting research ...')
    if (input.selectedJobStatus === 'stale') return errorStatus('Research connection delayed')
    return thinkingStatus('Researching ...')
  }

  if (input.isSubmitLoading || input.isCurrentSessionBusy) return thinkingStatus()

  if (statusLabel === 'Completed') return completeStatus()
  if (errorStatusLabels.has(statusLabel)) return errorStatus(errorDetailForStatusLabel(statusLabel))

  const task = currentResearchTask(input.currentStatus, input.todos, input.toolCalls)
  if (task === 'Research failed') return errorStatus(task)
  if (task) return thinkingStatus(task)

  const dataSourceIssue =
    input.capabilities.dataSources.reason === 'data_source_unavailable' ||
    input.capabilities.banner.category === 'data_source_failed' ||
    input.capabilities.banner.category === 'data_source_unavailable'
  if (dataSourceIssue) return errorStatus('Source unavailable')

  return readyStatus()
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
  const statusStrip = deriveStatusStrip(input, statusLabel)
  const sendControl = sendControlMode(input.selectedJobStatus, statusLabel)
  const promptDisabled = !input.capabilities.prompt.enabled || input.isCurrentSessionBusy

  return {
    prompt: {
      disabled: promptDisabled,
      disabledReason:
        input.capabilities.prompt.reason ??
        (input.isCurrentSessionBusy ? 'session_busy' : undefined),
      placeholder: promptPlaceholder(input, sendControl),
      sendControl,
    },
    statusStrip,
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
