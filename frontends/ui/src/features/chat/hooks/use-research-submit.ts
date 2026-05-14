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

const UI_SUBMIT_API_PATH = '/api/research/submit'
const BACKEND_SUBMIT_API_PATH = '/v1/research/submit'
const MAX_THINKING_PANEL_DETAIL_LENGTH = 10000

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

const formatDataSourceName = (sourceId: string): string => {
  if (sourceId === 'web_search') return 'Web Search'
  if (sourceId === KNOWLEDGE_LAYER_DATA_SOURCE_ID) return 'Files'

  return sourceId
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

const formatNullableValue = (value: string | undefined | null): string => value || 'None'

const formatSubmitMetadataLines = (metadata: ResearchSubmitMetadata): string[] => {
  const selectedDataSources =
    metadata.dataSourcesForMessage.length > 0
      ? metadata.dataSourcesForMessage.map(formatDataSourceName).join(', ')
      : 'None'
  const attachedFiles =
    metadata.messageFiles.length > 0
      ? metadata.messageFiles.map((file) => file.fileName).join(', ')
      : 'None'

  return [
    `- UI API: \`${UI_SUBMIT_API_PATH}\``,
    `- Backend API: \`${BACKEND_SUBMIT_API_PATH}\``,
    `- Selected data sources: ${selectedDataSources}`,
    `- Knowledge collection: ${formatNullableValue(metadata.collectionName)}`,
    `- Attached files: ${attachedFiles}`,
  ]
}

const capThinkingPanelContent = (content: string): string =>
  content.length > MAX_THINKING_PANEL_DETAIL_LENGTH
    ? content.slice(0, MAX_THINKING_PANEL_DETAIL_LENGTH)
    : content

const buildSubmitActivityContent = (
  metadata: ResearchSubmitMetadata,
  details: {
    route: 'Submitting' | 'Shallow answer' | 'Async deep research' | 'Submit failed'
    requestId?: string
    jobId?: string
    status?: string
    errorMessage?: string
    failureBoundary?: string
  }
): string => {
  const lines = [
    'Research request activity.',
    `- Route: ${details.route}`,
    ...formatSubmitMetadataLines(metadata),
  ]

  if (details.requestId) lines.push(`- Request ID: \`${details.requestId}\``)
  if (details.jobId) lines.push(`- Job ID: \`${details.jobId}\``)
  if (details.status) lines.push(`- Initial job status: \`${details.status}\``)

  if (details.route === 'Shallow answer') {
    lines.push('- Model/provider: Not returned by the current shallow submit response')
  }

  if (details.errorMessage) lines.push(`- Error: ${details.errorMessage}`)
  if (details.failureBoundary) lines.push(`- Failure boundary: \`${details.failureBoundary}\``)

  return capThinkingPanelContent(lines.join('\n'))
}

const getSubmitErrorActivityDetails = (
  error: unknown,
  userFacingErrorMessage: string
): {
  requestId?: string
  jobId?: string
  errorMessage: string
  failureBoundary?: string
} => {
  if (error instanceof ResearchSubmitError) {
    return {
      requestId: error.requestId,
      jobId: error.jobId,
      errorMessage: userFacingErrorMessage,
      failureBoundary: error.failureBoundary,
    }
  }

  return {
    errorMessage: userFacingErrorMessage,
  }
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
  thinkingStepContext: SubmitThinkingStepContext | null,
  metadata: ResearchSubmitMetadata
): void => {
  const state = useChatStore.getState()
  const isCurrentConversation = state.currentConversation?.id === conversationId

  if (response.type === 'shallow_answer') {
    state.addAgentResponse(response.answer, false, conversationId)
    patchSubmitThinkingStep(
      thinkingStepContext,
      buildSubmitActivityContent(metadata, {
        route: 'Shallow answer',
        requestId: response.request_id,
      })
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
    buildSubmitActivityContent(metadata, {
      route: 'Async deep research',
      requestId: response.request_id,
      jobId: response.job_id,
      status: response.status,
    })
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
        content: buildSubmitActivityContent(metadata, { route: 'Submitting' }),
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
      handleSubmitResponse(response, conversationId, thinkingStepContext, metadata)
    } catch (error) {
      const latestState = useChatStore.getState()
      const isCurrentConversation = latestState.currentConversation?.id === conversationId
      const userFacingErrorMessage = getUserFacingErrorMessage(error)
      const errorActivityDetails = getSubmitErrorActivityDetails(error, userFacingErrorMessage)
      latestState.addErrorCard(
        mapSubmitErrorToCardCode(error),
        userFacingErrorMessage,
        formatSubmitErrorDetails(error),
        conversationId
      )
      patchSubmitThinkingStep(
        thinkingStepContext,
        buildSubmitActivityContent(metadata, {
          route: 'Submit failed',
          ...errorActivityDetails,
        })
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
