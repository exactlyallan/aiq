// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { renderHook, act } from '@testing-library/react'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { useLoadJobData } from './use-load-job-data'

const mockSetReportContent = vi.fn()
const mockAddDeepResearchToolCall = vi.fn(() => 'tool-1')
const mockCompleteDeepResearchToolCall = vi.fn()
const mockClearDeepResearch = vi.fn()
const mockSetCurrentStatus = vi.fn()
const mockSetLoadedJobId = vi.fn()
const mockSetStreamLoaded = vi.fn()
const mockStopAllDeepResearchSpinners = vi.fn()
const mockAddErrorCard = vi.fn()
const mockCompleteDeepResearch = vi.fn()
const mockSetStreaming = vi.fn()

vi.mock('../store', () => ({
  useChatStore: Object.assign(
    vi.fn(() => ({
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
    })),
    {
      getState: vi.fn(() => ({
        deepResearchJobId: null,
        reportContent: '',
        deepResearchStreamLoaded: false,
      })),
      setState: vi.fn(),
    }
  ),
}))

const mockOpenRightPanel = vi.fn()
const mockSetResearchPanelTab = vi.fn()
vi.mock('@/features/layout/store', () => ({
  useLayoutStore: vi.fn(() => ({
    openRightPanel: mockOpenRightPanel,
    setResearchPanelTab: mockSetResearchPanelTab,
  })),
}))

vi.mock('@/adapters/auth', () => ({
  useAuth: vi.fn(() => ({ idToken: 'mock-id-token' })),
}))

const mockGetJobReport = vi.fn()
const mockGetJobStatus = vi.fn()
const mockGetJobState = vi.fn()
const mockCreateDeepResearchClient = vi.fn()

vi.mock('@/adapters/api', () => ({
  getJobReport: (...args: unknown[]) => mockGetJobReport(...args),
  getJobStatus: (...args: unknown[]) => mockGetJobStatus(...args),
  getJobState: (...args: unknown[]) => mockGetJobState(...args),
  createDeepResearchClient: (...args: unknown[]) => mockCreateDeepResearchClient(...args),
}))

describe('useLoadJobData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns initial state', () => {
    const { result } = renderHook(() => useLoadJobData())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(typeof result.current.loadReport).toBe('function')
    expect(typeof result.current.importJobStream).toBe('function')
    expect(typeof result.current.importStreamOnly).toBe('function')
  })

  test('loadReport fetches report via REST and opens panel', async () => {
    mockGetJobStatus.mockResolvedValue({ status: 'success' })
    mockGetJobReport.mockResolvedValue({ has_report: true, report: 'Test report' })
    mockGetJobState.mockResolvedValue({ has_state: false })

    const { result } = renderHook(() => useLoadJobData())

    await act(async () => {
      await result.current.loadReport('job-123')
    })

    expect(mockGetJobStatus).toHaveBeenCalledWith('job-123', 'mock-id-token')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(mockSetResearchPanelTab).toHaveBeenCalledWith('report')
    expect(mockOpenRightPanel).toHaveBeenCalledWith('research')
  })

  test('loadReport shows error for in-progress job', async () => {
    mockGetJobStatus.mockResolvedValue({ status: 'running' })

    const { result } = renderHook(() => useLoadJobData())

    await act(async () => {
      await result.current.loadReport('job-123')
    })

    expect(result.current.error).toContain('still running')
    expect(mockAddErrorCard).toHaveBeenCalled()
  })

  test('clearError resets error state', async () => {
    mockGetJobStatus.mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useLoadJobData())

    await act(async () => {
      await result.current.loadReport('job-123')
    })

    expect(result.current.error).toBeTruthy()

    act(() => {
      result.current.clearError()
    })

    expect(result.current.error).toBeNull()
  })
})
