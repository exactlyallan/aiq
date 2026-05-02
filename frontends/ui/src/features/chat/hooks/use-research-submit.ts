// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Backend-routed research submit hook.
 *
 * This owns the UI submission sequence for the new HTTP research API:
 * add the user message, send selected sources and the knowledge-layer
 * collection to the backend, then render either a shallow answer or attach the
 * accepted async job to the existing deep-research tracking state.
 */

'use client'

import { useCallback, useEffect } from 'react'
import {
  ResearchSubmitError,
  submitResearch,
  type ResearchSubmitResponse,
} from '@/adapters/api'
import { useAuth } from '@/adapters/auth'
import { useLayoutStore } from '@/features/layout/store'
import { useDocumentsStore } from '@/features/documents/store'
import { useChatStore } from '../store'
import type { ChatMessage, ErrorCode } from '../types'

interface ResearchSubmitMetadata {
  dataSourcesForMessage: string[]
  collectionName: string | null
  messageFiles: Array<{ id: string; fileName: string }>
}

export interface UseResearchSubmitReturn {
  /** Submit a user message through the backend-routed research API. */
  sendMessage: (content: string) => Promise<void>
  /** Whether the chat is waiting on the submit response or active job handoff. */
  isLoading: boolean
}

const buildSubmitMetadata = (sessionId: string | undefined): ResearchSubmitMetadata => {
  const layoutState = useLayoutStore.getState()
  const enabledDataSources = layoutState.enabledDataSourceIds
  const trackedFiles = useDocumentsStore.getState().trackedFiles
  const sessionFiles = sessionId
    ? trackedFiles.filter(
        (file) =>
          file.collectionName === sessionId &&
          (file.status === 'ingesting' || file.status === 'success')
      )
    : []

  const canUseKnowledgeLayer = sessionFiles.length > 0 && layoutState.knowledgeLayerAvailable
  const dataSourcesForMessage = new Set(enabledDataSources)
  if (canUseKnowledgeLayer) {
    dataSourcesForMessage.add('knowledge_layer')
  }

  return {
    dataSourcesForMessage: [...dataSourcesForMessage],
    collectionName: canUseKnowledgeLayer && sessionId ? sessionId : null,
    messageFiles: sessionFiles.map((file) => ({
      id: file.id,
      fileName: file.fileName,
    })),
  }
}

const mapSubmitErrorToCardCode = (error: unknown): ErrorCode => {
  if (!(error instanceof ResearchSubmitError)) {
    return 'system.unknown'
  }

  switch (error.failureBoundary) {
    case 'auth':
      return error.status === 401 ? 'auth.unauthorized' : 'auth.session_expired'
    case 'aiq_backend':
    case 'ui_proxy':
      return 'connection.failed'
    case 'async_job_worker':
      return 'agent.deep_research_failed'
    case 'client':
    case 'data_source':
    case 'llm_provider':
      return 'agent.response_failed'
    case 'job_lookup':
    case 'report_lookup':
    case 'unknown':
    default:
      return 'system.unknown'
  }
}

const formatSubmitErrorDetails = (error: unknown): string | undefined => {
  if (!(error instanceof ResearchSubmitError)) {
    return error instanceof Error ? error.message : undefined
  }

  const details = [
    `boundary: ${error.failureBoundary}`,
    `retryable: ${error.retryable ? 'true' : 'false'}`,
    `status: ${error.status || 'network'}`,
  ]

  if (error.requestId) details.push(`request_id: ${error.requestId}`)
  if (error.jobId) details.push(`job_id: ${error.jobId}`)
  if (error.details) details.push(`details: ${JSON.stringify(error.details)}`)

  return details.join('\n')
}

const getUserFacingErrorMessage = (error: unknown): string => {
  if (error instanceof ResearchSubmitError) {
    return error.userMessage
  }

  return 'The research request failed before the backend accepted it.'
}

const handleSubmitResponse = (response: ResearchSubmitResponse, conversationId: string): void => {
  const state = useChatStore.getState()
  const isCurrentConversation = state.currentConversation?.id === conversationId

  if (response.type === 'shallow_answer') {
    state.addAgentResponse(response.answer, false, conversationId)
    state.setCurrentStatus(isCurrentConversation ? 'complete' : null)
    state.setStreaming(false)
    state.setLoading(false)
    return
  }

  state.addDeepResearchBanner('starting', response.job_id, conversationId)

  // The tracking message may not render, but it persists job metadata with the
  // conversation so refresh/session-switch recovery can find the backend job.
  const messageId = state.addAgentResponseWithMeta(
    '',
    false,
    {
      deepResearchJobId: response.job_id,
      deepResearchJobStatus: response.status,
      isDeepResearchActive: true,
      planMessages: state.planMessages.length > 0 ? [...state.planMessages] : undefined,
    },
    conversationId
  )

  if (isCurrentConversation) {
    state.startDeepResearch(response.job_id, messageId, conversationId)
  } else {
    state.setStreaming(false)
    state.setCurrentStatus(null)
  }
  state.setLoading(false)
}

export const useResearchSubmit = (): UseResearchSubmitReturn => {
  const { user } = useAuth()
  const isLoading = useChatStore((state) => state.isLoading)
  const setCurrentUser = useChatStore((state) => state.setCurrentUser)

  useEffect(() => {
    setCurrentUser(user?.id ?? null)
  }, [user?.id, setCurrentUser])

  const sendMessage = useCallback(async (content: string) => {
    const trimmedContent = content.trim()
    if (!trimmedContent) return

    const initialState = useChatStore.getState()
    const sessionId = initialState.ensureSession()
    const metadata = buildSubmitMetadata(sessionId)

    let userMessage: ChatMessage
    try {
      userMessage = useChatStore.getState().addUserMessage(trimmedContent, {
        enabledDataSources: metadata.dataSourcesForMessage,
        messageFiles: metadata.messageFiles,
      })
    } catch (error) {
      console.error('Failed to add user message before research submit:', error)
      return
    }

    const stateAfterUserMessage = useChatStore.getState()
    const conversationId = stateAfterUserMessage.currentConversation?.id || sessionId
    if (!conversationId) {
      stateAfterUserMessage.addErrorCard(
        'system.unknown',
        'No active conversation was available for this research request.'
      )
      stateAfterUserMessage.setLoading(false)
      return
    }

    // A new submit should replace any previous report/prompt context, but
    // historical thinking steps stay attached to their user messages.
    stateAfterUserMessage.clearReportContent()
    stateAfterUserMessage.clearPendingInteraction()
    stateAfterUserMessage.setCurrentStatus('thinking')
    stateAfterUserMessage.setStreaming(true)
    stateAfterUserMessage.setLoading(true)

    try {
      const response = await submitResearch({
        prompt: trimmedContent,
        data_sources: metadata.dataSourcesForMessage,
        collection_name: metadata.collectionName,
      })
      handleSubmitResponse(response, conversationId)
    } catch (error) {
      const latestState = useChatStore.getState()
      const isCurrentConversation = latestState.currentConversation?.id === conversationId
      latestState.addErrorCard(
        mapSubmitErrorToCardCode(error),
        getUserFacingErrorMessage(error),
        formatSubmitErrorDetails(error),
        conversationId
      )
      latestState.setCurrentStatus(isCurrentConversation ? 'error' : null)
      latestState.setStreaming(false)
      latestState.setLoading(false)

      console.error('Research submit failed:', {
        userMessageId: userMessage.id,
        error,
      })
    }
  }, [])

  return {
    sendMessage,
    isLoading,
  }
}
