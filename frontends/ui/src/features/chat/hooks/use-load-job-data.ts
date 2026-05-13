// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * useLoadJobData Hook
 *
 * Loads deep research job data (report, citations, todos, tool calls, etc.)
 * from REST API endpoints.
 *
 * Use cases:
 * - "View Report" button clicks to load data on-demand
 * - Session restoration when reconnecting to completed jobs
 * - Importing historical job data
 *
 * Two primary methods:
 * 1. `loadReport(jobId)` - Quick fetch of just the report text via REST API
 * 2. `importJobStream(jobId)` - Legacy public name that now imports the
 *    backend job-state snapshot without opening a stream.
 */

'use client'

import { useState, useCallback } from 'react'
import { getJobReport, getJobStatus, getJobState } from '@/adapters/api'
import { useChatStore } from '../store'
import { isUnavailableDeepResearchJobError } from '../lib/deep-research-errors'
import { useAuth } from '@/adapters/auth'
import { useLayoutStore } from '@/features/layout/store'
import { buildDeepResearchJobStateSnapshot } from '../lib/deep-research-job-state'

export interface LoadJobDataOptions {
  /**
   * Whether to load the full job-state snapshot for artifacts (citations, todos, tool calls, etc.)
   * If false, only fetches the final report via REST API.
   * @default false
   */
  streamFullJob?: boolean
}

export interface UseLoadJobDataReturn {
  /**
   * Load just the report text via REST API (fast, minimal data)
   * Use when you only need the final report content
   */
  loadReport: (jobId: string) => Promise<void>

  /**
   * Import the full job-state snapshot to get available artifacts:
   * - Report content
   * - Citations (referenced and cited sources)
   * - Todos/tasks
   * - Tool calls with inputs/outputs
   * - File artifacts
   *
   * Use when you need the complete research context, not just the report
   * Opens report tab after completion
   */
  importJobStream: (jobId: string) => Promise<void>

  /**
   * Import job-state data only - does NOT change panel tab
   * Use when loading stream data for an already-open tab (e.g., Tasks/Thinking/Citations)
   */
  importStreamOnly: (jobId: string) => Promise<void>

  /**
   * Legacy method - calls either loadReport or importJobStream based on options
   * @deprecated Use loadReport or importJobStream directly for clarity
   */
  loadJobData: (jobId: string, options?: LoadJobDataOptions) => Promise<void>

  /** Whether data is currently being loaded */
  isLoading: boolean

  /** Error message if loading failed */
  error: string | null

  /** Clear any error state */
  clearError: () => void
}

/**
 * Hook for loading deep research job data on-demand
 *
 * Can either:
 * 1. Fetch just the report via REST API (fast, minimal data)
 * 2. Fetch the backend job-state snapshot to get artifacts.
 */
export const useLoadJobData = (): UseLoadJobDataReturn => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { idToken } = useAuth()
  const setReportContent = useChatStore((s) => s.setReportContent)
  const clearDeepResearch = useChatStore((s) => s.clearDeepResearch)
  const setLoadedJobId = useChatStore((s) => s.setLoadedJobId)
  const setStreamLoaded = useChatStore((s) => s.setStreamLoaded)
  const stopAllDeepResearchSpinners = useChatStore((s) => s.stopAllDeepResearchSpinners)
  const addErrorCard = useChatStore((s) => s.addErrorCard)
  const completeDeepResearch = useChatStore((s) => s.completeDeepResearch)
  const setStreaming = useChatStore((s) => s.setStreaming)
  const patchConversationMessage = useChatStore((s) => s.patchConversationMessage)
  const addDeepResearchBanner = useChatStore((s) => s.addDeepResearchBanner)

  const openRightPanel = useLayoutStore((s) => s.openRightPanel)
  const setResearchPanelTab = useLayoutStore((s) => s.setResearchPanelTab)

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const syncMissingJobToFailureState = useCallback(
    (jobId: string): void => {
      const state = useChatStore.getState()
      const conversation = state.currentConversation
      if (!conversation) return

      const trackingMessage = [...conversation.messages]
        .reverse()
        .find((m) => m.messageType === 'agent_response' && m.deepResearchJobId === jobId)

      if (trackingMessage?.id) {
        const hasPartialReport = Boolean(
          trackingMessage.reportContent?.trim() || trackingMessage.showViewReport
        )
        patchConversationMessage(conversation.id, trackingMessage.id, {
          deepResearchJobStatus: 'failure',
          isDeepResearchActive: false,
          showViewReport: hasPartialReport,
        })
      }

      const hasTerminalBanner = conversation.messages.some(
        (m) =>
          m.messageType === 'deep_research_banner' &&
          m.deepResearchBannerData?.jobId === jobId &&
          ['success', 'failure', 'cancelled'].includes(m.deepResearchBannerData?.bannerType || '')
      )

      if (!hasTerminalBanner) {
        addDeepResearchBanner('failure', jobId, conversation.id)
      }
    },
    [patchConversationMessage, addDeepResearchBanner]
  )

  /**
   * Load job data using REST API (report only)
   */
  const _loadReportOnly = useCallback(
    async (jobId: string): Promise<boolean> => {
      const response = await getJobReport(jobId, idToken || undefined)

      if (response.has_report && response.report) {
        setReportContent(response.report, 'final_report')
        return true
      }

      return false
    },
    [idToken, setReportContent]
  )

  /**
   * Load projected job state for additional artifacts and activity.
   */
  const loadJobState = useCallback(
    async (jobId: string): Promise<void> => {
      try {
        const stateResponse = await getJobState(jobId, idToken || undefined)
        const snapshot = buildDeepResearchJobStateSnapshot(stateResponse)

        if (snapshot) {
          useChatStore.setState((state) => ({
            deepResearchToolCalls: snapshot.toolCalls,
            deepResearchLLMSteps: snapshot.llmSteps,
            deepResearchCitations: snapshot.citations,
            deepResearchFiles: snapshot.files,
            ...(snapshot.todos ? { deepResearchTodos: snapshot.todos } : {}),
            ...(snapshot.reportContent
              ? {
                  reportContent: snapshot.reportContent,
                  reportContentCategory:
                    snapshot.reportContentCategory ?? state.reportContentCategory,
                }
              : {}),
            currentStatus: snapshot.reportContent ? 'complete' : state.currentStatus,
          }))
        }
      } catch (stateError) {
        console.warn('Failed to load job state:', stateError)
      }
    },
    [idToken]
  )

  /**
   * Load job data using REST APIs (report + state) - fast approach
   * Fetches both report and state in parallel for speed
   */
  const loadJobDataFast = useCallback(
    async (jobId: string): Promise<void> => {
      const [reportResult] = await Promise.allSettled([
        getJobReport(jobId, idToken || undefined),
        loadJobState(jobId),
      ])

      if (
        reportResult.status === 'fulfilled' &&
        reportResult.value.has_report &&
        reportResult.value.report
      ) {
        setReportContent(reportResult.value.report, 'final_report')
      }
    },
    [idToken, loadJobState, setReportContent]
  )

  /**
   * Main function to load job data
   * Checks ephemeral cache first - if data exists, just opens the panel
   * Otherwise fetches from backend
   */
  const loadJobData = useCallback(
    async (jobId: string, options: LoadJobDataOptions = {}): Promise<void> => {
      const { streamFullJob: shouldStreamFull = false } = options

      // Check ephemeral cache first - if we have data for this job, just show it
      const currentState = useChatStore.getState()
      const hasReportData =
        currentState.deepResearchJobId === jobId &&
        currentState.reportContent &&
        currentState.reportContent.trim().length > 0

      // For full-state requests, also check if state is already loaded.
      const hasStreamData =
        currentState.deepResearchJobId === jobId && currentState.deepResearchStreamLoaded

      // If we have what we need, just open the panel
      if (hasReportData && (!shouldStreamFull || hasStreamData)) {
        setResearchPanelTab('research')
        openRightPanel('research')
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const statusResponse = await getJobStatus(jobId, idToken || undefined)
        const jobStatus = statusResponse.status

        if (jobStatus !== 'success' && jobStatus !== 'failure' && jobStatus !== 'interrupted') {
          throw new Error(`Job is still ${jobStatus}. Cannot load data from incomplete job.`)
        }

        clearDeepResearch()

        if (shouldStreamFull) {
          await loadJobState(jobId)
          setStreamLoaded(true)
        } else {
          await loadJobDataFast(jobId)
        }

        // Defensive cleanup: loaded data may have stale 'running' items
        // if the backend never sent completion events. Only treat as
        // successful for success jobs; interrupted/failed jobs should
        // leave un-attempted tasks as 'stopped'.
        stopAllDeepResearchSpinners(jobStatus === 'success')

        // Set job ID for cache tracking (so subsequent clicks show cached data)
        setLoadedJobId(jobId)

        setResearchPanelTab('research')
        openRightPanel('research')
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load job data'
        setError(errorMessage)
        console.error('Failed to load job data:', err)
        if (isUnavailableDeepResearchJobError(err)) {
          syncMissingJobToFailureState(jobId)
        }
        addErrorCard('agent.deep_research_load_failed', errorMessage)
        stopAllDeepResearchSpinners()
        completeDeepResearch()
        setStreaming(false)
      } finally {
        setIsLoading(false)
      }
    },
    [
      idToken,
      clearDeepResearch,
      loadJobDataFast,
      loadJobState,
      setLoadedJobId,
      setStreamLoaded,
      stopAllDeepResearchSpinners,
      setResearchPanelTab,
      openRightPanel,
      addErrorCard,
      completeDeepResearch,
      setStreaming,
      syncMissingJobToFailureState,
    ]
  )

  /**
   * Public method: Load report + state via REST APIs (fast)
   */
  const loadReport = useCallback(
    async (jobId: string): Promise<void> => {
      await loadJobData(jobId, { streamFullJob: false })
    },
    [loadJobData]
  )

  /**
   * Public method: Import full job-state snapshot.
   *
   * The name is retained for callers while the transport migrates away from
   * streaming; it no longer opens a stream.
   * Opens report tab after completion
   */
  const importJobStream = useCallback(
    async (jobId: string): Promise<void> => {
      await loadJobData(jobId, { streamFullJob: true })
    },
    [loadJobData]
  )

  /**
   * Import job-state data only - does NOT change panel tab
   * Use when loading state data for an already-open tab (e.g., Tasks/Thinking/Citations)
   * Checks ephemeral cache first to avoid duplicate API calls
   * Silently returns if job is still in progress (active selected-job polling will populate data)
   */
  const importStreamOnly = useCallback(
    async (jobId: string): Promise<void> => {
      // Check if state is already loaded for this job
      const currentState = useChatStore.getState()
      if (currentState.deepResearchJobId === jobId && currentState.deepResearchStreamLoaded) {
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const statusResponse = await getJobStatus(jobId, idToken || undefined)
        const jobStatus = statusResponse.status

        if (jobStatus !== 'success' && jobStatus !== 'failure' && jobStatus !== 'interrupted') {
          // Job is still in progress - selected-job polling will populate data.
          // This is expected when opening tabs for active jobs
          setIsLoading(false)
          return
        }

        clearDeepResearch()
        await loadJobState(jobId)
        // Defensive cleanup: loaded data may have stale 'running' items.
        // Only mark as successful completion for success jobs; interrupted/failed
        // jobs should leave un-attempted tasks as 'stopped'.
        stopAllDeepResearchSpinners(jobStatus === 'success')
        setStreamLoaded(true)
        setLoadedJobId(jobId)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load job state data'
        setError(errorMessage)
        console.error('Failed to load job state data:', err)
        if (isUnavailableDeepResearchJobError(err)) {
          syncMissingJobToFailureState(jobId)
        }
        addErrorCard('agent.deep_research_load_failed', errorMessage)
        stopAllDeepResearchSpinners()
        completeDeepResearch()
        setStreaming(false)
      } finally {
        setIsLoading(false)
      }
    },
    [
      idToken,
      clearDeepResearch,
      loadJobState,
      stopAllDeepResearchSpinners,
      setStreamLoaded,
      setLoadedJobId,
      syncMissingJobToFailureState,
      addErrorCard,
      completeDeepResearch,
      setStreaming,
    ]
  )

  return {
    loadReport,
    importJobStream,
    importStreamOnly,
    loadJobData,
    isLoading,
    error,
    clearError,
  }
}
