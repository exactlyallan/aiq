// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * useDeepResearch Hook
 *
 * Manages active deep-research jobs through explicit HTTP polling. The UI does
 * not open app-owned WebSocket, Server-Sent Events, or EventSource transports.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  cancelJob,
  getJobReport,
  getJobState,
  getJobStatus,
  type DeepResearchJobStatus,
} from '@/adapters/api'
import { useAuth } from '@/adapters/auth'
import { useLayoutStore } from '@/features/layout/store'
import { checkBackendHealthCached } from '@/shared/hooks/use-backend-health'
import { buildDeepResearchJobStateSnapshot } from '../lib/deep-research-job-state'
import { isLikelyAuthRelatedTransportError } from '../lib/transport-auth-signals'
import { useChatStore } from '../store'

/** Timeout in milliseconds before showing a warning (60 seconds). */
const TIMEOUT_WARNING_MS = 60000
/** How often to check for stale polling updates (10 seconds). */
const TIMEOUT_CHECK_INTERVAL_MS = 10000
/** Poll interval for the selected active deep-research job. */
const JOB_POLL_INTERVAL_MS = 3000
/** Consecutive status polling failures before the UI treats the job as broken. */
const POLL_FAILURE_THRESHOLD = 3
/** Fallback timeout after cancel POST succeeds if polling does not observe interruption. */
const CANCEL_FALLBACK_TIMEOUT_MS = 5000
const USER_CANCELLED_ERROR_MARKER = 'cancelled by user'

type TerminalDeepResearchStatus = Extract<
  DeepResearchJobStatus,
  'success' | 'failure' | 'interrupted'
>

const isTerminalStatus = (status: DeepResearchJobStatus): status is TerminalDeepResearchStatus =>
  status === 'success' || status === 'failure' || status === 'interrupted'

const isUserCancelledStatus = (status: DeepResearchJobStatus, error?: string | null): boolean =>
  status === 'interrupted' && error?.toLowerCase().includes(USER_CANCELLED_ERROR_MARKER) === true

const shouldReplaceTodoPlan = (
  existingTodos: Array<{ content: string }> | undefined,
  incomingTodos: Array<{ content: string }> | undefined
): boolean => {
  if (!incomingTodos?.length) return false
  if (!existingTodos?.length) return true
  if (existingTodos.length !== incomingTodos.length) return false

  return existingTodos.every((todo, index) => todo.content === incomingTodos[index]?.content)
}

interface UseDeepResearchReturn {
  /** Whether deep research is currently active. */
  isStreaming: boolean
  /** Current job ID. */
  jobId: string | null
  /** Current job status. */
  status: DeepResearchJobStatus | null
  /** Whether polling has stopped receiving healthy responses for too long. */
  isTimedOut: boolean
  /** Stop polling the selected active job. */
  disconnect: () => void
  /** Restart polling the selected active job. */
  reconnect: () => void
  /** Cancel the current job. */
  cancelCurrentJob: () => Promise<void>
}

/**
 * Hook for selected-job deep-research polling.
 *
 * The backend remains the source of truth. The UI keeps only the selected job's
 * live-ish state hydrated, which avoids multiple simultaneous data streams when
 * several jobs are running in the job/session list.
 */
export const useDeepResearch = (): UseDeepResearchReturn => {
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const cancelFallbackRef = useRef<NodeJS.Timeout | null>(null)
  const connectRef = useRef<((jobId: string) => void) | null>(null)
  const pollingJobIdRef = useRef<string | null>(null)
  const terminalHandledJobIdRef = useRef<string | null>(null)
  const pollingFailureCountRef = useRef(0)
  const lastSuccessfulPollAtRef = useRef(Date.now())
  const [isTimedOut, setIsTimedOut] = useState(false)

  const { idToken, authRequired, error: authError } = useAuth()

  const { deepResearchJobId, isDeepResearchStreaming, deepResearchStatus } = useChatStore(
    useShallow((s) => ({
      deepResearchJobId: s.deepResearchJobId,
      isDeepResearchStreaming: s.isDeepResearchStreaming,
      deepResearchStatus: s.deepResearchStatus,
    }))
  )

  const updateDeepResearchStatus = useChatStore((s) => s.updateDeepResearchStatus)
  const completeDeepResearch = useChatStore((s) => s.completeDeepResearch)
  const setReportContent = useChatStore((s) => s.setReportContent)
  const setCurrentStatus = useChatStore((s) => s.setCurrentStatus)
  const setStreaming = useChatStore((s) => s.setStreaming)
  const stopAllDeepResearchSpinners = useChatStore((s) => s.stopAllDeepResearchSpinners)
  const patchConversationMessage = useChatStore((s) => s.patchConversationMessage)
  const addDeepResearchBanner = useChatStore((s) => s.addDeepResearchBanner)
  const setStreamLoaded = useChatStore((s) => s.setStreamLoaded)

  const openRightPanel = useLayoutStore((s) => s.openRightPanel)
  const setResearchPanelTab = useLayoutStore((s) => s.setResearchPanelTab)

  const resetTimeout = useCallback(() => {
    lastSuccessfulPollAtRef.current = Date.now()
    setIsTimedOut(false)
  }, [])

  const isOwnerActive = useCallback((): boolean => {
    const state = useChatStore.getState()
    return Boolean(
      state.isDeepResearchStreaming &&
      state.deepResearchOwnerConversationId &&
      state.currentConversation?.id === state.deepResearchOwnerConversationId
    )
  }, [])

  const getDeepResearchPollingFailure = useCallback(
    (message: string, details?: string): { code: string; message: string; details?: string } => {
      if (!authRequired) {
        return { code: 'connection.failed', message, details }
      }
      if (authError === 'RefreshAccessTokenError' || isLikelyAuthRelatedTransportError(message)) {
        return {
          code: 'auth.session_expired',
          message: 'Your session has expired. Please sign in again to continue.',
          details,
        }
      }
      return { code: 'connection.failed', message, details }
    },
    [authRequired, authError]
  )

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    pollingJobIdRef.current = null
  }, [])

  const isSelectedPollingJob = useCallback((jobId: string): boolean => {
    const state = useChatStore.getState()
    return Boolean(
      pollingJobIdRef.current === jobId &&
      state.deepResearchJobId === jobId &&
      state.isDeepResearchStreaming &&
      state.deepResearchOwnerConversationId &&
      state.currentConversation?.id === state.deepResearchOwnerConversationId
    )
  }, [])

  const applyJobStateSnapshot = useCallback(
    (jobId: string, stateResponse: Awaited<ReturnType<typeof getJobState>>): void => {
      if (!isSelectedPollingJob(jobId)) return

      const snapshot = buildDeepResearchJobStateSnapshot(stateResponse)
      if (!snapshot) return

      useChatStore.setState((state) => ({
        deepResearchToolCalls: snapshot.toolCalls,
        deepResearchLLMSteps: snapshot.llmSteps,
        deepResearchCitations: snapshot.citations,
        deepResearchFiles: snapshot.files,
        ...(shouldReplaceTodoPlan(state.deepResearchTodos, snapshot.todos)
          ? { deepResearchTodos: snapshot.todos }
          : {}),
        ...(snapshot.reportContent
          ? {
              reportContent: snapshot.reportContent,
              reportContentCategory: snapshot.reportContentCategory ?? state.reportContentCategory,
            }
          : {}),
        currentStatus: snapshot.reportContent ? 'writing' : state.currentStatus,
      }))
    },
    [isSelectedPollingJob]
  )

  const hydrateFinalReport = useCallback(
    async (jobId: string): Promise<void> => {
      try {
        const reportResponse = await getJobReport(jobId, idToken || undefined)
        if (reportResponse.has_report && reportResponse.report) {
          setReportContent(reportResponse.report, 'final_report')
        }
      } catch (error) {
        console.warn('[DeepResearch] Failed to hydrate final report:', error)
      }
    },
    [idToken, setReportContent]
  )

  const finishJob = useCallback(
    async (
      jobId: string,
      status: TerminalDeepResearchStatus,
      error?: string | null
    ): Promise<void> => {
      if (terminalHandledJobIdRef.current === jobId) return
      terminalHandledJobIdRef.current = jobId

      stopPolling()

      if (cancelFallbackRef.current) {
        clearTimeout(cancelFallbackRef.current)
        cancelFallbackRef.current = null
      }

      await hydrateFinalReport(jobId)

      const state = useChatStore.getState()
      const ownerConvId = state.deepResearchOwnerConversationId
      const messageId = state.activeDeepResearchMessageId
      const hasReport = Boolean(state.reportContent?.trim())

      if (status === 'success') {
        setCurrentStatus('complete')
        const totalTokens = state.deepResearchLLMSteps.reduce(
          (sum, step) => sum + (step.usage?.input_tokens || 0) + (step.usage?.output_tokens || 0),
          0
        )
        const toolCallCount = state.deepResearchToolCalls.length

        if (ownerConvId && messageId) {
          patchConversationMessage(ownerConvId, messageId, {
            content: '',
            deepResearchJobStatus: 'success',
            isDeepResearchActive: false,
            showViewReport: hasReport,
          })
        }
        addDeepResearchBanner('success', jobId, ownerConvId || undefined, {
          totalTokens,
          toolCallCount,
        })
        stopAllDeepResearchSpinners(true)
      } else {
        setCurrentStatus('error')
        stopAllDeepResearchSpinners()
        const isUserCancelled = isUserCancelledStatus(status, error)

        if (ownerConvId && messageId) {
          patchConversationMessage(ownerConvId, messageId, {
            content: '',
            deepResearchJobStatus: status,
            isDeepResearchActive: false,
            showViewReport: hasReport,
          })
        }
        addDeepResearchBanner(
          isUserCancelled ? 'cancelled' : 'failure',
          jobId,
          ownerConvId || undefined
        )

        if (error && !isUserCancelled) {
          const { addErrorCard } = useChatStore.getState()
          addErrorCard('agent.deep_research_failed', error)
        } else if (status === 'interrupted' && !isUserCancelled) {
          const { addErrorCard } = useChatStore.getState()
          addErrorCard('agent.deep_research_failed', 'Research was interrupted before completion.')
        }
      }

      setStreamLoaded(true)
      completeDeepResearch()
      setStreaming(false)
    },
    [
      stopPolling,
      hydrateFinalReport,
      setCurrentStatus,
      patchConversationMessage,
      addDeepResearchBanner,
      stopAllDeepResearchSpinners,
      setStreamLoaded,
      completeDeepResearch,
      setStreaming,
    ]
  )

  const failPolling = useCallback(
    async (jobId: string, error: unknown): Promise<void> => {
      stopPolling()

      const errorObject = error instanceof Error ? error : new Error(String(error))
      const backendUp = await checkBackendHealthCached()
      const errorInfo = backendUp
        ? getDeepResearchPollingFailure(errorObject.message, errorObject.stack)
        : {
            code: 'agent.deep_research_failed' as const,
            message: errorObject.message,
            details: errorObject.stack,
          }

      console.error(
        backendUp
          ? 'Deep research polling failed while backend remained reachable:'
          : 'Deep research polling failed (backend unreachable):',
        errorObject
      )

      setCurrentStatus('error')
      const state = useChatStore.getState()
      const ownerConvId = state.deepResearchOwnerConversationId
      const messageId = state.activeDeepResearchMessageId
      const hasReport = Boolean(state.reportContent?.trim())

      if (ownerConvId && messageId) {
        patchConversationMessage(ownerConvId, messageId, {
          content: '',
          deepResearchJobStatus: 'failure',
          isDeepResearchActive: false,
          showViewReport: hasReport,
        })
      }

      state.addErrorCard(
        errorInfo.code as Parameters<typeof state.addErrorCard>[0],
        errorInfo.message,
        errorInfo.details
      )
      addDeepResearchBanner('failure', jobId, ownerConvId || undefined)
      stopAllDeepResearchSpinners()
      setStreamLoaded(true)
      completeDeepResearch()
      setStreaming(false)
    },
    [
      stopPolling,
      getDeepResearchPollingFailure,
      setCurrentStatus,
      patchConversationMessage,
      addDeepResearchBanner,
      stopAllDeepResearchSpinners,
      setStreamLoaded,
      completeDeepResearch,
      setStreaming,
    ]
  )

  const pollJobOnce = useCallback(
    async (jobId: string): Promise<void> => {
      if (pollingJobIdRef.current !== jobId) return

      const [statusResult, stateResult] = await Promise.allSettled([
        getJobStatus(jobId, idToken || undefined),
        getJobState(jobId, idToken || undefined),
      ])

      if (!isSelectedPollingJob(jobId)) return

      if (stateResult.status === 'fulfilled') {
        applyJobStateSnapshot(jobId, stateResult.value)
      } else {
        console.warn('[DeepResearch] Failed to hydrate job state:', stateResult.reason)
      }

      if (statusResult.status === 'rejected') {
        pollingFailureCountRef.current += 1
        if (pollingFailureCountRef.current >= POLL_FAILURE_THRESHOLD) {
          await failPolling(jobId, statusResult.reason)
        }
        return
      }

      pollingFailureCountRef.current = 0
      resetTimeout()

      const { status, error } = statusResult.value
      if (!isOwnerActive()) return

      updateDeepResearchStatus(status)
      if (status === 'submitted') {
        setCurrentStatus('researching')
      } else if (status === 'running') {
        setCurrentStatus('researching')
      }

      if (isTerminalStatus(status)) {
        await finishJob(jobId, status, error)
      }
    },
    [
      idToken,
      applyJobStateSnapshot,
      isSelectedPollingJob,
      failPolling,
      resetTimeout,
      isOwnerActive,
      updateDeepResearchStatus,
      setCurrentStatus,
      finishJob,
    ]
  )

  const connect = useCallback(
    (jobId: string) => {
      if (pollingJobIdRef.current === jobId && pollIntervalRef.current) return

      stopPolling()
      terminalHandledJobIdRef.current = null
      pollingFailureCountRef.current = 0
      pollingJobIdRef.current = jobId
      resetTimeout()
      setCurrentStatus('researching')

      void pollJobOnce(jobId)
      pollIntervalRef.current = setInterval(() => {
        void pollJobOnce(jobId)
      }, JOB_POLL_INTERVAL_MS)
    },
    [stopPolling, resetTimeout, setCurrentStatus, pollJobOnce]
  )

  connectRef.current = connect

  const disconnect = useCallback(() => {
    stopPolling()
  }, [stopPolling])

  const reconnect = useCallback(() => {
    if (deepResearchJobId && !pollIntervalRef.current) {
      connectRef.current?.(deepResearchJobId)
    }
  }, [deepResearchJobId])

  const cancelCurrentJob = useCallback(async () => {
    if (!deepResearchJobId) return
    const cancelledJobId = deepResearchJobId

    try {
      await cancelJob(cancelledJobId, idToken || undefined)
      setIsTimedOut(false)
      void pollJobOnce(cancelledJobId)

      if (cancelFallbackRef.current) clearTimeout(cancelFallbackRef.current)
      cancelFallbackRef.current = setTimeout(() => {
        cancelFallbackRef.current = null
        const state = useChatStore.getState()
        if (!state.isDeepResearchStreaming || state.deepResearchJobId !== cancelledJobId) {
          return
        }
        console.warn(
          '[DeepResearch] Cancel fallback: polling did not observe interrupted status within',
          CANCEL_FALLBACK_TIMEOUT_MS,
          'ms. Cleaning up locally.'
        )
        const ownerConvId = state.deepResearchOwnerConversationId
        const messageId = state.activeDeepResearchMessageId
        const hasReport = Boolean(state.reportContent?.trim())
        if (ownerConvId && messageId) {
          patchConversationMessage(ownerConvId, messageId, {
            content: '',
            deepResearchJobStatus: 'interrupted',
            isDeepResearchActive: false,
            showViewReport: hasReport,
          })
        }
        addDeepResearchBanner('cancelled', cancelledJobId, ownerConvId || undefined)
        stopAllDeepResearchSpinners()
        stopPolling()
        setStreamLoaded(true)
        completeDeepResearch()
        setStreaming(false)
      }, CANCEL_FALLBACK_TIMEOUT_MS)
    } catch (error) {
      console.error('Failed to cancel job:', error)
    }
  }, [
    deepResearchJobId,
    idToken,
    pollJobOnce,
    patchConversationMessage,
    addDeepResearchBanner,
    stopAllDeepResearchSpinners,
    stopPolling,
    completeDeepResearch,
    setStreaming,
    setStreamLoaded,
  ])

  useEffect(() => {
    const effectJobId = deepResearchJobId
    const effectStreaming = isDeepResearchStreaming
    let connectTimeout: NodeJS.Timeout | null = null
    let cancelled = false

    if (effectJobId && effectStreaming) {
      const currentState = useChatStore.getState()
      if (currentState.deepResearchJobId !== effectJobId || !currentState.isDeepResearchStreaming) {
        return
      }

      connectTimeout = setTimeout(() => {
        if (cancelled) return
        connectRef.current?.(effectJobId)

        setResearchPanelTab('artifacts')
        openRightPanel('research')

        timeoutIntervalRef.current = setInterval(() => {
          const timeSinceLastPoll = Date.now() - lastSuccessfulPollAtRef.current
          if (timeSinceLastPoll > TIMEOUT_WARNING_MS) {
            setIsTimedOut(true)
          }
        }, TIMEOUT_CHECK_INTERVAL_MS)
      }, 50)
    }

    return () => {
      cancelled = true
      if (connectTimeout) clearTimeout(connectTimeout)
      disconnect()
      if (timeoutIntervalRef.current) {
        clearInterval(timeoutIntervalRef.current)
        timeoutIntervalRef.current = null
      }
      if (cancelFallbackRef.current) {
        clearTimeout(cancelFallbackRef.current)
        cancelFallbackRef.current = null
      }
      setIsTimedOut(false)
    }
  }, [deepResearchJobId, isDeepResearchStreaming, disconnect, setResearchPanelTab, openRightPanel])

  return {
    isStreaming: isDeepResearchStreaming,
    jobId: deepResearchJobId,
    status: deepResearchStatus,
    isTimedOut,
    disconnect,
    reconnect,
    cancelCurrentJob,
  }
}
