// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useDeepResearch } from './use-deep-research'

const mockUpdateDeepResearchStatus = vi.fn((status: string) => {
  mockStoreState.deepResearchStatus = status
})
const mockCompleteDeepResearch = vi.fn(() => {
  mockStoreState.isDeepResearchStreaming = false
})
const mockSetReportContent = vi.fn((content: string) => {
  mockStoreState.reportContent = content
})
const mockSetCurrentStatus = vi.fn()
const mockSetStreaming = vi.fn((streaming: boolean) => {
  mockStoreState.isDeepResearchStreaming = streaming
})
const mockStopAllDeepResearchSpinners = vi.fn()
const mockPatchConversationMessage = vi.fn()
const mockAddErrorCard = vi.fn()
const mockAddDeepResearchBanner = vi.fn()
const mockSetStreamLoaded = vi.fn()
const mockOpenRightPanel = vi.fn()
const mockSetResearchPanelTab = vi.fn()

let mockStoreState = {
  deepResearchJobId: null as string | null,
  isDeepResearchStreaming: false,
  deepResearchStatus: null as string | null,
  deepResearchOwnerConversationId: 'test-conv-123',
  activeDeepResearchMessageId: 'msg-123',
  currentConversation: { id: 'test-conv-123' } as { id: string } | null,
  reportContent: '',
  deepResearchLLMSteps: [] as Array<{ usage?: { input_tokens?: number; output_tokens?: number } }>,
  deepResearchToolCalls: [] as unknown[],
  deepResearchCitations: [] as unknown[],
  deepResearchFiles: [] as unknown[],
  deepResearchTodos: [] as unknown[],
}

type MockStoreState = typeof mockStoreState
type MockChatSelectorState = MockStoreState & {
  updateDeepResearchStatus: typeof mockUpdateDeepResearchStatus
  completeDeepResearch: typeof mockCompleteDeepResearch
  setReportContent: typeof mockSetReportContent
  setCurrentStatus: typeof mockSetCurrentStatus
  setStreaming: typeof mockSetStreaming
  stopAllDeepResearchSpinners: typeof mockStopAllDeepResearchSpinners
  patchConversationMessage: typeof mockPatchConversationMessage
  addDeepResearchBanner: typeof mockAddDeepResearchBanner
  setStreamLoaded: typeof mockSetStreamLoaded
}
type MockStoreUpdater = Partial<MockStoreState> | ((state: MockStoreState) => Partial<MockStoreState>)
type MockLayoutSelectorState = {
  openRightPanel: typeof mockOpenRightPanel
  setResearchPanelTab: typeof mockSetResearchPanelTab
}

vi.mock('../store', () => ({
  useChatStore: Object.assign(
    vi.fn((selector?: (s: MockChatSelectorState) => unknown) => {
      const state = {
        ...mockStoreState,
        updateDeepResearchStatus: mockUpdateDeepResearchStatus,
        completeDeepResearch: mockCompleteDeepResearch,
        setReportContent: mockSetReportContent,
        setCurrentStatus: mockSetCurrentStatus,
        setStreaming: mockSetStreaming,
        stopAllDeepResearchSpinners: mockStopAllDeepResearchSpinners,
        patchConversationMessage: mockPatchConversationMessage,
        addDeepResearchBanner: mockAddDeepResearchBanner,
        setStreamLoaded: mockSetStreamLoaded,
      }
      return selector ? selector(state) : state
    }),
    {
      getState: vi.fn(() => ({
        ...mockStoreState,
        addErrorCard: mockAddErrorCard,
      })),
      setState: vi.fn((updater: MockStoreUpdater) => {
        const updates = typeof updater === 'function' ? updater(mockStoreState) : updater
        Object.assign(mockStoreState, updates)
      }),
    }
  ),
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

vi.mock('@/adapters/auth', () => ({
  useAuth: vi.fn(() => ({
    idToken: 'mock-id-token',
    authRequired: false,
    error: null,
  })),
}))

const mockCheckBackendHealthCached = vi.fn<() => Promise<boolean>>().mockResolvedValue(false)
vi.mock('@/shared/hooks/use-backend-health', () => ({
  checkBackendHealthCached: () => mockCheckBackendHealthCached(),
}))

const mockCancelJob = vi.fn()
const mockGetJobStatus = vi.fn()
const mockGetJobState = vi.fn()
const mockGetJobReport = vi.fn()

vi.mock('@/adapters/api', () => ({
  cancelJob: (...args: unknown[]) => mockCancelJob(...args),
  getJobStatus: (...args: unknown[]) => mockGetJobStatus(...args),
  getJobState: (...args: unknown[]) => mockGetJobState(...args),
  getJobReport: (...args: unknown[]) => mockGetJobReport(...args),
}))

const advanceAndFlush = (ms: number) => vi.advanceTimersByTimeAsync(ms)

const defaultStateResponse = {
  job_id: 'job-456',
  has_state: false,
  state: null,
  artifacts: null,
}

const renderActiveHook = async () => {
  mockStoreState.deepResearchJobId = 'job-456'
  mockStoreState.isDeepResearchStreaming = true
  mockStoreState.deepResearchStatus = 'submitted'
  const hook = renderHook(() => useDeepResearch())
  await act(async () => {
    await advanceAndFlush(60)
  })
  return hook
}

describe('useDeepResearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockStoreState = {
      deepResearchJobId: null,
      isDeepResearchStreaming: false,
      deepResearchStatus: null,
      deepResearchOwnerConversationId: 'test-conv-123',
      activeDeepResearchMessageId: 'msg-123',
      currentConversation: { id: 'test-conv-123' },
      reportContent: '',
      deepResearchLLMSteps: [],
      deepResearchToolCalls: [],
      deepResearchCitations: [],
      deepResearchFiles: [],
      deepResearchTodos: [],
    }
    mockGetJobStatus.mockResolvedValue({
      job_id: 'job-456',
      status: 'running',
      error: null,
    })
    mockGetJobState.mockResolvedValue(defaultStateResponse)
    mockGetJobReport.mockResolvedValue({
      job_id: 'job-456',
      has_report: false,
      report: null,
    })
    mockCancelJob.mockResolvedValue({ cancelled: true })
    mockCheckBackendHealthCached.mockResolvedValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('returns current inactive state', () => {
    const { result } = renderHook(() => useDeepResearch())

    expect(result.current.isStreaming).toBe(false)
    expect(result.current.jobId).toBeNull()
    expect(result.current.status).toBeNull()
    expect(result.current.isTimedOut).toBe(false)
  })

  test('polls job status and state without opening a stream', async () => {
    await renderActiveHook()

    expect(mockGetJobStatus).toHaveBeenCalledWith('job-456', 'mock-id-token')
    expect(mockGetJobState).toHaveBeenCalledWith('job-456', 'mock-id-token')
    expect(mockSetResearchPanelTab).toHaveBeenCalledWith('artifacts')
    expect(mockOpenRightPanel).toHaveBeenCalledWith('research')
  })

  test('hydrates state artifacts from the polling state endpoint', async () => {
    mockGetJobState.mockResolvedValue({
      job_id: 'job-456',
      has_state: true,
      state: null,
      artifacts: {
        tools: [
          {
            name: 'web_search',
            input: { query: 'gpu' },
            output: 'result',
            timestamp: '2026-01-01T00:00:00Z',
          },
        ],
        outputs: [
          {
            type: 'citation_source',
            content: 'Source summary',
            url: 'https://example.com/source',
          },
          {
            type: 'output',
            output_category: 'final_report',
            content: '# Report',
          },
        ],
        sources: {
          found_urls: ['https://example.com/source'],
          cited_urls: ['https://example.com/source'],
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

    await renderActiveHook()

    expect(mockStoreState.deepResearchToolCalls).toHaveLength(1)
    expect(mockStoreState.deepResearchCitations).toEqual([
      expect.objectContaining({
        url: 'https://example.com/source',
        isCited: true,
      }),
    ])
    expect(mockStoreState.deepResearchLLMSteps).toEqual([
      expect.objectContaining({
        id: 'llm-run-1',
        name: 'nemotron',
        thinking: 'checked source quality',
        usage: { input_tokens: 10, output_tokens: 5 },
        isComplete: true,
      }),
    ])
    expect(mockStoreState.reportContent).toBe('# Report')
  })

  test('completes a successful job from polling status', async () => {
    mockStoreState.deepResearchLLMSteps = [{ usage: { input_tokens: 10, output_tokens: 5 } }]
    mockStoreState.deepResearchToolCalls = [{ id: 'tool-1' }]
    mockGetJobStatus.mockResolvedValue({
      job_id: 'job-456',
      status: 'success',
      error: null,
    })
    mockGetJobReport.mockResolvedValue({
      job_id: 'job-456',
      has_report: true,
      report: 'Final report',
    })

    await renderActiveHook()

    expect(mockUpdateDeepResearchStatus).toHaveBeenCalledWith('success')
    expect(mockSetReportContent).toHaveBeenCalledWith('Final report')
    expect(mockSetCurrentStatus).toHaveBeenCalledWith('complete')
    expect(mockPatchConversationMessage).toHaveBeenCalledWith(
      'test-conv-123',
      'msg-123',
      expect.objectContaining({
        deepResearchJobStatus: 'success',
        isDeepResearchActive: false,
        showViewReport: true,
      })
    )
    expect(mockAddDeepResearchBanner).toHaveBeenCalledWith(
      'success',
      'job-456',
      'test-conv-123',
      expect.objectContaining({ totalTokens: 15 })
    )
    expect(mockStopAllDeepResearchSpinners).toHaveBeenCalledWith(true)
    expect(mockCompleteDeepResearch).toHaveBeenCalled()
    expect(mockSetStreaming).toHaveBeenCalledWith(false)
  })

  test('surfaces failed job status without creating a transport error', async () => {
    mockGetJobStatus.mockResolvedValue({
      job_id: 'job-456',
      status: 'failure',
      error: 'LLM provider stopped responding',
    })

    await renderActiveHook()

    expect(mockSetCurrentStatus).toHaveBeenCalledWith('error')
    expect(mockAddDeepResearchBanner).toHaveBeenCalledWith('failure', 'job-456', 'test-conv-123')
    expect(mockAddErrorCard).toHaveBeenCalledWith(
      'agent.deep_research_failed',
      'LLM provider stopped responding'
    )
  })

  test('treats user cancellation as a cancelled terminal banner', async () => {
    mockGetJobStatus.mockResolvedValue({
      job_id: 'job-456',
      status: 'interrupted',
      error: 'cancelled by user',
    })

    await renderActiveHook()

    expect(mockAddDeepResearchBanner).toHaveBeenCalledWith('cancelled', 'job-456', 'test-conv-123')
    expect(mockAddErrorCard).not.toHaveBeenCalled()
  })

  test('keeps polling until the interval is disconnected', async () => {
    const { result } = await renderActiveHook()
    mockGetJobStatus.mockClear()

    await act(async () => {
      await advanceAndFlush(3000)
    })

    expect(mockGetJobStatus).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.disconnect()
    })
    mockGetJobStatus.mockClear()

    await act(async () => {
      await advanceAndFlush(3000)
    })

    expect(mockGetJobStatus).not.toHaveBeenCalled()
  })

  test('cancel fallback clears local state if polling does not observe interruption', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = await renderActiveHook()

    await act(async () => {
      await result.current.cancelCurrentJob()
    })

    expect(mockCancelJob).toHaveBeenCalledWith('job-456', 'mock-id-token')
    expect(mockCompleteDeepResearch).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    expect(mockAddDeepResearchBanner).toHaveBeenCalledWith('cancelled', 'job-456', 'test-conv-123')
    expect(mockStopAllDeepResearchSpinners).toHaveBeenCalled()
    expect(mockCompleteDeepResearch).toHaveBeenCalled()
    expect(mockSetStreaming).toHaveBeenCalledWith(false)

    consoleWarnSpy.mockRestore()
  })

  test('marks polling breakdowns as visible errors after repeated status failures', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetJobStatus.mockRejectedValue(new Error('Failed to get job status: 502'))

    await renderActiveHook()
    await act(async () => {
      await advanceAndFlush(3000)
      await advanceAndFlush(3000)
    })

    expect(mockCheckBackendHealthCached).toHaveBeenCalled()
    expect(mockAddErrorCard).toHaveBeenCalledWith(
      'agent.deep_research_failed',
      'Failed to get job status: 502',
      expect.any(String)
    )
    expect(mockAddDeepResearchBanner).toHaveBeenCalledWith('failure', 'job-456', 'test-conv-123')
    expect(mockCompleteDeepResearch).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
