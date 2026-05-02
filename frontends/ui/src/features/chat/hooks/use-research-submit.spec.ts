// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useResearchSubmit } from './use-research-submit'
import { ResearchSubmitError } from '@/adapters/api'

const mocks = vi.hoisted(() => ({
  ResearchSubmitError: class MockResearchSubmitError extends Error {
    readonly status: number
    readonly code: string
    readonly userMessage: string
    readonly failureBoundary: string
    readonly retryable: boolean
    readonly requestId?: string
    readonly jobId?: string
    readonly details?: Record<string, unknown>

    constructor(args: {
      status: number
      code: string
      message: string
      userMessage: string
      failureBoundary: string
      retryable: boolean
      requestId?: string
      jobId?: string
      details?: Record<string, unknown>
    }) {
      super(args.message)
      this.name = 'ResearchSubmitError'
      this.status = args.status
      this.code = args.code
      this.userMessage = args.userMessage
      this.failureBoundary = args.failureBoundary
      this.retryable = args.retryable
      this.requestId = args.requestId
      this.jobId = args.jobId
      this.details = args.details
    }
  },
  submitResearch: vi.fn(),
  setCurrentUser: vi.fn(),
  ensureSession: vi.fn(() => 'session-1'),
  addUserMessage: vi.fn(() => ({ id: 'user-message-1' })),
  clearReportContent: vi.fn(),
  clearPendingInteraction: vi.fn(),
  setCurrentStatus: vi.fn(),
  setStreaming: vi.fn(),
  setLoading: vi.fn(),
  addAgentResponse: vi.fn(),
  addDeepResearchBanner: vi.fn(),
  addAgentResponseWithMeta: vi.fn(() => 'agent-message-1'),
  startDeepResearch: vi.fn(),
  addErrorCard: vi.fn(),
}))

let storeState: Record<string, unknown>
let layoutState: Record<string, unknown>
let documentsState: Record<string, unknown>
let consoleErrorSpy: ReturnType<typeof vi.spyOn>

const getStoreState = () => ({
  isLoading: false,
  planMessages: [],
  setCurrentUser: mocks.setCurrentUser,
  ensureSession: mocks.ensureSession,
  addUserMessage: mocks.addUserMessage,
  clearReportContent: mocks.clearReportContent,
  clearPendingInteraction: mocks.clearPendingInteraction,
  setCurrentStatus: mocks.setCurrentStatus,
  setStreaming: mocks.setStreaming,
  setLoading: mocks.setLoading,
  addAgentResponse: mocks.addAgentResponse,
  addDeepResearchBanner: mocks.addDeepResearchBanner,
  addAgentResponseWithMeta: mocks.addAgentResponseWithMeta,
  startDeepResearch: mocks.startDeepResearch,
  addErrorCard: mocks.addErrorCard,
  ...storeState,
})

vi.mock('@/adapters/api', () => ({
  ResearchSubmitError: mocks.ResearchSubmitError,
  submitResearch: mocks.submitResearch,
}))

vi.mock('@/adapters/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('../store', () => ({
  useChatStore: Object.assign(
    vi.fn((selector?: (state: ReturnType<typeof getStoreState>) => unknown) => {
      const state = getStoreState()
      return selector ? selector(state) : state
    }),
    {
      getState: vi.fn(() => getStoreState()),
    }
  ),
}))

vi.mock('@/features/layout/store', () => ({
  useLayoutStore: Object.assign(vi.fn(), {
    getState: vi.fn(() => layoutState),
  }),
}))

vi.mock('@/features/documents/store', () => ({
  useDocumentsStore: Object.assign(vi.fn(), {
    getState: vi.fn(() => documentsState),
  }),
}))

describe('useResearchSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    storeState = {}
    layoutState = {
      enabledDataSourceIds: ['web_search'],
      knowledgeLayerAvailable: false,
    }
    documentsState = {
      trackedFiles: [],
    }
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  test('syncs the authenticated user into chat state', () => {
    renderHook(() => useResearchSubmit())

    expect(mocks.setCurrentUser).toHaveBeenCalledWith('user-1')
  })

  test('submits a shallow request and renders the answer', async () => {
    mocks.submitResearch.mockResolvedValue({
      type: 'shallow_answer',
      answer: 'Short answer',
      citations: [],
      request_id: 'req-1',
    })

    const { result } = renderHook(() => useResearchSubmit())

    await act(async () => {
      await result.current.sendMessage('  summarize this  ')
    })

    expect(mocks.ensureSession).toHaveBeenCalled()
    expect(mocks.addUserMessage).toHaveBeenCalledWith('summarize this', {
      enabledDataSources: ['web_search'],
      messageFiles: [],
    })
    expect(mocks.submitResearch).toHaveBeenCalledWith({
      prompt: 'summarize this',
      data_sources: ['web_search'],
      collection_name: null,
    })
    expect(mocks.clearReportContent).toHaveBeenCalled()
    expect(mocks.clearPendingInteraction).toHaveBeenCalled()
    expect(mocks.setCurrentStatus).toHaveBeenCalledWith('thinking')
    expect(mocks.setStreaming).toHaveBeenCalledWith(true)
    expect(mocks.addAgentResponse).toHaveBeenCalledWith('Short answer')
    expect(mocks.setCurrentStatus).toHaveBeenCalledWith('complete')
    expect(mocks.setStreaming).toHaveBeenLastCalledWith(false)
    expect(mocks.setLoading).toHaveBeenLastCalledWith(false)
  })

  test('adds knowledge layer metadata when session files are usable', async () => {
    layoutState = {
      enabledDataSourceIds: ['web_search'],
      knowledgeLayerAvailable: true,
    }
    documentsState = {
      trackedFiles: [
        {
          id: 'file-1',
          fileName: 'source.pdf',
          collectionName: 'session-1',
          status: 'success',
        },
      ],
    }
    mocks.submitResearch.mockResolvedValue({
      type: 'async_job_started',
      job_id: 'job-1',
      status: 'submitted',
      request_id: 'req-1',
    })

    const { result } = renderHook(() => useResearchSubmit())

    await act(async () => {
      await result.current.sendMessage('deep research')
    })

    expect(mocks.addUserMessage).toHaveBeenCalledWith('deep research', {
      enabledDataSources: ['web_search', 'knowledge_layer'],
      messageFiles: [{ id: 'file-1', fileName: 'source.pdf' }],
    })
    expect(mocks.submitResearch).toHaveBeenCalledWith({
      prompt: 'deep research',
      data_sources: ['web_search', 'knowledge_layer'],
      collection_name: 'session-1',
    })
  })

  test('hands accepted async jobs to deep research tracking', async () => {
    mocks.submitResearch.mockResolvedValue({
      type: 'async_job_started',
      job_id: 'job-1',
      status: 'submitted',
      request_id: 'req-1',
    })

    const { result } = renderHook(() => useResearchSubmit())

    await act(async () => {
      await result.current.sendMessage('deep research')
    })

    expect(mocks.addDeepResearchBanner).toHaveBeenCalledWith('starting', 'job-1')
    expect(mocks.addAgentResponseWithMeta).toHaveBeenCalledWith('', false, {
      deepResearchJobId: 'job-1',
      deepResearchJobStatus: 'submitted',
      isDeepResearchActive: true,
      planMessages: undefined,
    })
    expect(mocks.startDeepResearch).toHaveBeenCalledWith('job-1', 'agent-message-1')
    expect(mocks.setLoading).toHaveBeenLastCalledWith(false)
  })

  test('surfaces structured submit failures as error cards', async () => {
    mocks.submitResearch.mockRejectedValue(
      new ResearchSubmitError({
        status: 504,
        code: 'LLM_TIMEOUT',
        message: 'The model provider timed out.',
        userMessage: 'The model provider timed out.',
        failureBoundary: 'llm_provider',
        retryable: true,
        requestId: 'req-1',
      } as ConstructorParameters<typeof ResearchSubmitError>[0])
    )

    const { result } = renderHook(() => useResearchSubmit())

    await act(async () => {
      await result.current.sendMessage('fail')
    })

    expect(mocks.addErrorCard).toHaveBeenCalledWith(
      'agent.response_failed',
      'The model provider timed out.',
      expect.stringContaining('boundary: llm_provider')
    )
    expect(mocks.addErrorCard).toHaveBeenCalledWith(
      'agent.response_failed',
      'The model provider timed out.',
      expect.stringContaining('request_id: req-1')
    )
    expect(mocks.setCurrentStatus).toHaveBeenLastCalledWith('error')
    expect(mocks.setStreaming).toHaveBeenLastCalledWith(false)
    expect(mocks.setLoading).toHaveBeenLastCalledWith(false)
  })
})
