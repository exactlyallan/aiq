// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import {
  deriveCapabilities,
  deriveResearchUiState,
  type CapabilityMatrixInput,
  type ResearchUiStateInput,
} from './index'

const readyMatrixInput: CapabilityMatrixInput = {
  selectedJob: 'none',
  jobStatus: 'none',
  reportAvailability: 'unknown',
  globalConnection: 'online',
  authState: 'authenticated',
  dataSourceState: 'available',
  uploadState: 'idle',
  activeRequestState: 'idle',
}

const uiInput = (
  overrides: Partial<ResearchUiStateInput> & {
    matrixInput?: Partial<CapabilityMatrixInput>
  } = {}
): ResearchUiStateInput => {
  const matrixInput = { ...readyMatrixInput, ...overrides.matrixInput }
  return {
    capabilities: deriveCapabilities(matrixInput),
    isAuthenticated: matrixInput.authState === 'authenticated',
    isCurrentSessionBusy: false,
    isSubmitLoading: matrixInput.activeRequestState === 'submitting',
    selectedJobStatus: matrixInput.jobStatus === 'none' ? undefined : matrixInput.jobStatus,
    currentStatus: null,
    todos: [],
    toolCalls: [],
    defaultPromptPlaceholder: 'Ask a research question...',
    hasStopHandler: true,
    knowledgeLayerAvailable: true,
    ...overrides,
  }
}

describe('deriveResearchUiState', () => {
  test('keeps ready controls enabled with idle status copy', () => {
    const state = deriveResearchUiState(uiInput())

    expect(state.prompt).toMatchObject({
      disabled: false,
      placeholder: 'Ask a research question...',
      sendControl: 'normal',
    })
    expect(state.statusStrip).toMatchObject({
      label: 'Ready',
      detail: 'Ready...',
      text: 'Ready...',
      icon: 'idle',
    })
    expect(state.stopResearch.enabled).toBe(false)
    expect(state.sourceCounter.enabled).toBe(true)
    expect(state.fileCounter.enabled).toBe(true)
  })

  test('represents unauthenticated state in one place', () => {
    const state = deriveResearchUiState(
      uiInput({
        matrixInput: { authState: 'anonymous' },
        isAuthenticated: false,
      })
    )

    expect(state.prompt).toMatchObject({
      disabled: true,
      disabledReason: 'auth_required',
      placeholder: 'Sign in to start researching',
    })
    expect(state.statusStrip).toMatchObject({
      label: 'Error',
      text: 'Error - Sign in required',
      icon: 'warning',
    })
    expect(state.sourceCounter.enabled).toBe(false)
    expect(state.fileCounter.enabled).toBe(false)
  })

  test('shows active backend step progress while a selected job is running', () => {
    const state = deriveResearchUiState(
      uiInput({
        matrixInput: { selectedJob: 'active', jobStatus: 'running' },
        selectedJobStatus: 'running',
        currentStatus: 'researching',
        todos: [
          { content: 'Plan', status: 'completed' },
          { content: 'Find sources', status: 'in_progress' },
          { content: 'Write report', status: 'pending' },
        ],
      })
    )

    expect(state.prompt).toMatchObject({
      disabled: true,
      disabledReason: 'job_running',
      sendControl: 'research_in_progress',
    })
    expect(state.statusStrip).toMatchObject({
      label: 'Thinking',
      detail: '2/3 Find sources ...',
      text: '2/3 Find sources ...',
      icon: 'active',
    })
    expect(state.stopResearch.enabled).toBe(true)
  })

  test('shows shallow submit activity as thinking without backend job progress', () => {
    const state = deriveResearchUiState(
      uiInput({
        matrixInput: { activeRequestState: 'submitting' },
        isSubmitLoading: true,
      })
    )

    expect(state.statusStrip).toMatchObject({
      label: 'Thinking',
      detail: 'Thinking...',
      text: 'Thinking...',
      icon: 'active',
    })
  })

  test('returns shallow completed research to ready when no report job is selected', () => {
    const state = deriveResearchUiState(
      uiInput({
        currentStatus: 'complete',
      })
    )

    expect(state.statusStrip).toMatchObject({
      label: 'Ready',
      detail: 'Ready...',
      text: 'Ready...',
      icon: 'idle',
    })
  })

  test('keeps terminal completed report locked until talk-to-report exists', () => {
    const state = deriveResearchUiState(
      uiInput({
        matrixInput: {
          selectedJob: 'terminal',
          jobStatus: 'success',
          reportAvailability: 'available',
        },
        selectedJobStatus: 'success',
        currentStatus: 'complete',
      })
    )

    expect(state.prompt).toMatchObject({
      disabled: true,
      disabledReason: 'job_terminal',
      placeholder: 'Research completed. Create a new session for further questions.',
      sendControl: 'research_complete',
    })
    expect(state.statusStrip).toMatchObject({
      label: 'Research Complete',
      text: 'Research Complete',
      icon: 'complete',
    })
    expect(state.stopResearch.enabled).toBe(false)
  })

  test('surfaces failed jobs as error status and retryable matrix state', () => {
    const state = deriveResearchUiState(
      uiInput({
        matrixInput: { selectedJob: 'terminal', jobStatus: 'failure' },
        selectedJobStatus: 'failure',
        currentStatus: 'error',
      })
    )

    expect(state.prompt).toMatchObject({
      disabled: true,
      disabledReason: 'job_terminal',
      sendControl: 'research_complete',
    })
    expect(state.statusStrip).toMatchObject({
      label: 'Error',
      detail: 'Research failed',
      text: 'Error - Research failed',
      icon: 'warning',
    })
    expect(state.banner).toMatchObject({
      severity: 'error',
      category: 'job_failed',
      recoveryAction: 'retry',
    })
  })
})
