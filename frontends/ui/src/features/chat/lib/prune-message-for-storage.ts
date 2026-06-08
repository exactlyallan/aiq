// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Message Pruning for Storage
 *
 * Utilities for removing heavy, refetchable data from messages before
 * saving to localStorage. Research data can be fetched from backend on demand.
 */

import type { ChatMessage } from '../types'

/**
 * Cap string content to prevent excessively large values.
 */
export const capString = (value: string, max: number): string => {
  return value.length > max ? value.slice(0, max) : value
}

/**
 * Strip thinking steps for storage. Inline chat thinking no longer renders,
 * so regular shallow step content can be dropped. Research-panel activity
 * keeps capped content because the Thinking panel should survive refresh.
 *
 * - Deep research steps (isDeepResearch=true) are removed entirely since
 *   they are refetched from the async backend API.
 * - Inline shallow steps keep only display metadata.
 * - Research-panel steps keep capped content for restored Thinking details.
 */
export const stripThinkingStepsForStorage = (
  steps: NonNullable<ChatMessage['thinkingSteps']>,
  maxResearchPanelContentLength = 10000
): NonNullable<ChatMessage['thinkingSteps']> => {
  return steps
    .filter((step) => !step.isDeepResearch)
    .map((step) => ({
      id: step.id,
      userMessageId: step.userMessageId,
      functionName: step.functionName,
      displayName: step.displayName,
      content:
        step.displaySurface === 'research_panel'
          ? capString(step.content, maxResearchPanelContentLength)
          : '',
      timestamp: step.timestamp,
      isComplete: step.isComplete,
      isDeepResearch: step.isDeepResearch,
      displaySurface: step.displaySurface,
      isTopLevel: step.isTopLevel,
      category: step.category,
    }))
}

/**
 * Prune plan messages to reduce storage size.
 * Keeps plan structure but caps text content.
 * planMessages cannot be refetched from the backend on demand.
 */
export const prunePlanMessages = (
  planMessages: NonNullable<ChatMessage['planMessages']>,
  maxTextLength = 10000
): NonNullable<ChatMessage['planMessages']> => {
  return planMessages.map((pm) => ({
    ...pm,
    text: capString(pm.text, maxTextLength),
    userResponse: pm.userResponse ? capString(pm.userResponse, 2000) : pm.userResponse,
  }))
}

/**
 * Prune a message for localStorage storage by removing heavy fields that
 * can be fetched from the backend on demand, stripping thinking step
 * content, and capping plan message text.
 *
 * KEEPS (Essential for UI):
 * - Core message fields (id, role, content, timestamp, messageType)
 * - thinkingSteps (inline content removed, research-panel details capped,
 *   deep research steps dropped)
 * - planMessages (capped: text 10k, userResponse 2k — cannot be refetched)
 * - enabledDataSources, messageFiles (for restored request context)
 * - Deep research job metadata (for restoration)
 * - HITL/prompt fields (for interaction state)
 * - Other message type data (status, file, banner data)
 *
 * REMOVES (Can fetch from backend via importStreamOnly):
 * - reportContent, citations, deepResearchTodos, deepResearchLLMSteps,
 *   deepResearchAgents, deepResearchToolCalls, deepResearchFiles
 * - intermediateSteps (legacy, unused)
 * - non-research-panel thinkingStep content/rawPayload
 * - Deep research thinking steps (refetched from async API)
 * - error messages, which are transient dismissible notices
 */
export const shouldPersistMessage = (message: ChatMessage): boolean => message.messageType !== 'error'

export const pruneMessageForStorage = (message: ChatMessage): ChatMessage => {
  const {
    reportContent: _reportContent,
    citations: _citations,
    deepResearchTodos: _deepResearchTodos,
    deepResearchLLMSteps: _deepResearchLLMSteps,
    deepResearchAgents: _deepResearchAgents,
    deepResearchToolCalls: _deepResearchToolCalls,
    deepResearchFiles: _deepResearchFiles,
    intermediateSteps: _intermediateSteps,
    ...prunedMessage
  } = message

  if (prunedMessage.thinkingSteps?.length) {
    prunedMessage.thinkingSteps = stripThinkingStepsForStorage(prunedMessage.thinkingSteps)
  }

  if (prunedMessage.planMessages?.length) {
    prunedMessage.planMessages = prunePlanMessages(prunedMessage.planMessages)
  }

  return prunedMessage
}
