// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useLoadJobData } from './use-load-job-data'

const mockGetJobStatus = vi.fn()
const mockGetJobReport = vi.fn()
const mockGetJobState = vi.fn()
const mockSetReportContent = vi.fn()
const mockAddDeepResearchToolCall = vi.fn()
const mockCompleteDeepResearchToolCall = vi.fn()
const mockClearDeepResearch = vi.fn()
const mockSetCurrentStatus = vi.fn()
const mockSetLoadedJobId = vi.fn()
const mockSetStreamLoaded = vi.fn()
const mockStopAllDeepResearchSpinners = vi.fn()
const mockAddErrorCard = vi.fn()
const mockCompleteDeepResearch = vi.fn()
const mockSetStreaming = vi.fn()
const mockPatchConversationMessage = vi.fn()
const mockAddDeepResearchBanner = vi.fn()
const mockOpenRightPanel = vi.fn()
const mockSetResearchPanelTab = vi.fn()

let mockStoreState = {
  currentConversation: {
    id: 'conv-1',
    messages: [
      {
        id: 'tracking-msg',
        role: 'assistant' as const,
        content: '',
        timestamp: new Date(),
        messageType: 'agent_response' as const,
        deepResearchJobId: 'job-404',
        deepResearchJobStatus: 'running' as const,
        isDeepResearchActive: true,
      },
      {
        id: 'starting-banner',
        role: 'assistant' as const,
        content: '',
        timestamp: new Date(),
        messageType: 'deep_research_banner' as const,
        deepResearchBannerData: { bannerType: 'starting' as const, jobId: 'job-404' },
      },
    ],
  },
  deepResearchJobId: null as string | null,
  deepResearchStreamLoaded: false,
  deepResearchLLMSteps: [] as unknown[],
}

type MockChatSelectorState = {
  setReportContent: typeof mockSetReportContent
  addDeepResearchToolCall: typeof mockAddDeepResearchToolCall
  completeDeepResearchToolCall: typeof mockCompleteDeepResearchToolCall
  clearDeepResearch: typeof mockClearDeepResearch
  setCurrentStatus: typeof mockSetCurrentStatus
  setLoadedJobId: typeof mockSetLoadedJobId
  setStreamLoaded: typeof mockSetStreamLoaded
  stopAllDeepResearchSpinners: typeof mockStopAllDeepResearchSpinners
  addErrorCard: typeof mockAddErrorCard
  completeDeepResearch: typeof mockCompleteDeepResearch
  setStreaming: typeof mockSetStreaming
  patchConversationMessage: typeof mockPatchConversationMessage
  addDeepResearchBanner: typeof mockAddDeepResearchBanner
}

type MockStoreState = typeof mockStoreState
type MockStoreUpdater = Partial<MockStoreState> | ((state: MockStoreState) => Partial<MockStoreState>)
type MockLayoutSelectorState = {
  openRightPanel: typeof mockOpenRightPanel
  setResearchPanelTab: typeof mockSetResearchPanelTab
}

vi.mock('@/adapters/api', () => ({
  getJobStatus: (...args: unknown[]) => mockGetJobStatus(...args),
  getJobReport: (...args: unknown[]) => mockGetJobReport(...args),
  getJobState: (...args: unknown[]) => mockGetJobState(...args),
}))

vi.mock('../store', () => ({
  useChatStore: Object.assign(
    vi.fn((selector?: (s: MockChatSelectorState) => unknown) => {
      const state = {
        setReportContent: mockSetReportContent,
        addDeepResearchToolCall: mockAddDeepResearchToolCall,
        completeDeepResearchToolCall: mockCompleteDeepResearchToolCall,
        clearDeepResearch: mockClearDeepResearch,
        setCurrentStatus: mockSetCurrentStatus,
        setLoadedJobId: mockSetLoadedJobId,
        setStreamLoaded: mockSetStreamLoaded,
        stopAllDeepResearchSpinners: mockStopAllDeepResearchSpinners,
        addErrorCard: mockAddErrorCard,
        completeDeepResearch: mockCompleteDeepResearch,
        setStreaming: mockSetStreaming,
        patchConversationMessage: mockPatchConversationMessage,
        addDeepResearchBanner: mockAddDeepResearchBanner,
      }
      return selector ? selector(state) : state
    }),
    {
      getState: vi.fn(() => mockStoreState),
      setState: vi.fn((updater: MockStoreUpdater) => {
        const updates = typeof updater === 'function' ? updater(mockStoreState) : updater
        Object.assign(mockStoreState, updates)
      }),
    }
  ),
}))

vi.mock('@/adapters/auth', () => ({
  useAuth: vi.fn(() => ({
    idToken: 'token-123',
  })),
}))

vi.mock('@/features/layout/store', () => ({
  useLayoutStore: vi.fn((selector?: (s: MockLayoutSelectorState) => unknown) => {
    const state = {
      openRightPanel: mockOpenRightPanel,
      setResearchPanelTab: mockSetResearchPanelTab,
    }
    return selector ? selector(state) : state
  }),
}))

describe('useLoadJobData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      currentConversation: {
        id: 'conv-1',
        messages: [
          {
            id: 'tracking-msg',
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            messageType: 'agent_response',
            deepResearchJobId: 'job-404',
            deepResearchJobStatus: 'running',
            isDeepResearchActive: true,
          },
          {
            id: 'starting-banner',
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            messageType: 'deep_research_banner',
            deepResearchBannerData: { bannerType: 'starting', jobId: 'job-404' },
          },
        ],
      },
      deepResearchJobId: null,
      deepResearchStreamLoaded: false,
      deepResearchLLMSteps: [],
    }
  })

  test('marks unavailable job as failed when report load hits 404', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetJobStatus.mockRejectedValue(new Error('Failed to get job status: 404'))

    const { result } = renderHook(() => useLoadJobData())

    await act(async () => {
      await result.current.loadReport('job-404')
    })

    expect(mockPatchConversationMessage).toHaveBeenCalledWith(
      'conv-1',
      'tracking-msg',
      expect.objectContaining({
        deepResearchJobStatus: 'failure',
        isDeepResearchActive: false,
      })
    )
    expect(mockAddDeepResearchBanner).toHaveBeenCalledWith('failure', 'job-404', 'conv-1')
    expect(mockAddErrorCard).toHaveBeenCalledWith(
      'agent.deep_research_load_failed',
      'Failed to get job status: 404'
    )
    consoleErrorSpy.mockRestore()
  })

  test('imports LLM steps from the polling state snapshot', async () => {
    mockGetJobStatus.mockResolvedValue({
      job_id: 'job-123',
      status: 'success',
      error: null,
    })
    mockGetJobState.mockResolvedValue({
      job_id: 'job-123',
      has_state: true,
      state: null,
      artifacts: {
        tools: [],
        outputs: [],
        sources: {
          found_urls: [],
          cited_urls: [],
        },
        llm_steps: [
          {
            id: 'llm-run-1',
            name: 'nemotron',
            content: '',
            thinking: 'checked source quality',
            usage: { input_tokens: 10, output_tokens: 5 },
            timestamp: '2026-01-01T00:00:01Z',
            is_complete: true,
          },
        ],
      },
    })

    const { result } = renderHook(() => useLoadJobData())

    await act(async () => {
      await result.current.importJobStream('job-123')
    })

    expect(mockStoreState.deepResearchLLMSteps).toEqual([
      expect.objectContaining({
        id: 'llm-run-1',
        name: 'nemotron',
        thinking: 'checked source quality',
        usage: { input_tokens: 10, output_tokens: 5 },
        isComplete: true,
      }),
    ])
  })
})
