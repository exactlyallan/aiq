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
import { ResearchSubmitError, submitResearch, type ResearchSubmitResponse } from '@/adapters/api'
import { useAuth } from '@/adapters/auth'
import { useLayoutStore } from '@/features/layout/store'
import { useDocumentsStore } from '@/features/documents/store'
import {
  getFilesForResearchCollection,
  getResearchCollectionName,
  KNOWLEDGE_LAYER_DATA_SOURCE_ID,
} from '@/features/documents'
import { useChatStore } from '../store'
import type { ChatMessage, ErrorCode } from '../types'

interface ResearchSubmitMetadata {
  dataSourcesForMessage: string[]
  collectionName: string | null
  messageFiles: Array<{ id: string; fileName: string }>
}

interface SubmitThinkingStepContext {
  conversationId: string
  userMessageId: string
  stepId: string
}

export interface UseResearchSubmitReturn {
  /** Submit a user message through the backend-routed research API. */
  sendMessage: (content: string) => Promise<void>
  /** Whether the chat is waiting on the submit response or active job handoff. */
  isLoading: boolean
}

const buildSubmitMetadata = (conversationId: string | undefined): ResearchSubmitMetadata => {
  const layoutState = useLayoutStore.getState()
  const enabledDataSources = layoutState.enabledDataSourceIds
  const trackedFiles = useDocumentsStore.getState().trackedFiles
  const collectionName = getResearchCollectionName(conversationId)
  const collectionFiles = getFilesForResearchCollection(trackedFiles, collectionName)

  const canUseKnowledgeLayer = collectionFiles.length > 0 && layoutState.knowledgeLayerAvailable
  const dataSourcesForMessage = new Set(enabledDataSources)
  if (canUseKnowledgeLayer) {
    dataSourcesForMessage.add(KNOWLEDGE_LAYER_DATA_SOURCE_ID)
  }

  return {
    dataSourcesForMessage: [...dataSourcesForMessage],
    collectionName: canUseKnowledgeLayer ? collectionName : null,
    messageFiles: collectionFiles.map((file) => ({
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

const patchSubmitThinkingStep = (
  context: SubmitThinkingStepContext | null,
  content: string
): void => {
  if (!context?.stepId) return

  useChatStore
    .getState()
    .patchThinkingStep(context.conversationId, context.userMessageId, context.stepId, {
      content,
      isComplete: true,
    })
}

const handleSubmitResponse = (
  response: ResearchSubmitResponse,
  conversationId: string,
  thinkingStepContext: SubmitThinkingStepContext | null
): void => {
  const state = useChatStore.getState()
  const isCurrentConversation = state.currentConversation?.id === conversationId

  if (response.type === 'shallow_answer') {
    state.addAgentResponse(response.answer, false, conversationId)
    patchSubmitThinkingStep(
      thinkingStepContext,
      'The backend returned a shallow answer without starting a deep research job.'
    )
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
  patchSubmitThinkingStep(
    thinkingStepContext,
    `The backend escalated this prompt to deep research job ${response.job_id}.`
  )

  if (isCurrentConversation) {
    state.startDeepResearch(response.job_id, messageId, conversationId)
    state.setCurrentStatus('researching')
  } else {
    state.setCurrentStatus(null)
  }
  state.setStreaming(false)
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
    const conversationIdForCollection = initialState.ensureSession()
    const metadata = buildSubmitMetadata(conversationIdForCollection)

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
    const conversationId =
      stateAfterUserMessage.currentConversation?.id || conversationIdForCollection
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
    const thinkingStepId = stateAfterUserMessage.addThinkingStepForMessage(
      conversationId,
      userMessage.id,
      {
        category: 'agents',
        functionName: 'research_submit',
        displayName: 'Research Request',
        content: 'Submitting prompt to the AIQ research workflow.',
        isComplete: false,
        displaySurface: 'research_panel',
      }
    )
    const thinkingStepContext: SubmitThinkingStepContext | null = thinkingStepId
      ? {
          conversationId,
          userMessageId: userMessage.id,
          stepId: thinkingStepId,
        }
      : null
    stateAfterUserMessage.setStreaming(true)
    stateAfterUserMessage.setLoading(true)

    try {
      const response = await submitResearch({
        prompt: trimmedContent,
        data_sources: metadata.dataSourcesForMessage,
        collection_name: metadata.collectionName,
      })
      handleSubmitResponse(response, conversationId, thinkingStepContext)
    } catch (error) {
      const latestState = useChatStore.getState()
      const isCurrentConversation = latestState.currentConversation?.id === conversationId
      const userFacingErrorMessage = getUserFacingErrorMessage(error)
      latestState.addErrorCard(
        mapSubmitErrorToCardCode(error),
        userFacingErrorMessage,
        formatSubmitErrorDetails(error),
        conversationId
      )
      patchSubmitThinkingStep(thinkingStepContext, userFacingErrorMessage)
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
