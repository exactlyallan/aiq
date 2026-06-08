// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Persistence boundary for the project-weight-reduction session model.
 *
 * Interaction sessions are tab-local. Only conversations anchored to a
 * top-level deep research report job are worth restoring from localStorage
 * after a tab close or in a new browser tab.
 */

import type { ChatMessage, Conversation, DeepResearchJobStatus } from '../types'
import { pruneMessageForStorage, shouldPersistMessage } from './prune-message-for-storage'

export const REPORT_SESSION_MESSAGE_LIMIT = 8

const restorableTerminalStatuses = new Set<DeepResearchJobStatus>([
  'success',
  'failure',
  'interrupted',
])

const isActiveDeepResearchMessage = (message: ChatMessage): boolean =>
  Boolean(
    message.deepResearchJobId &&
      message.isDeepResearchActive &&
      (message.deepResearchJobStatus === 'submitted' || message.deepResearchJobStatus === 'running')
  )

const isTerminalDeepResearchMessage = (message: ChatMessage): boolean =>
  Boolean(
    message.deepResearchJobId &&
      message.deepResearchJobStatus &&
      restorableTerminalStatuses.has(message.deepResearchJobStatus)
  )

const isReportBearingDeepResearchMessage = (message: ChatMessage): boolean =>
  Boolean(
    message.deepResearchJobId &&
      (message.showViewReport || message.reportContent?.trim())
  )

export const isRestorableReportMessage = (message: ChatMessage): boolean =>
  message.messageType === 'agent_response' &&
  (isActiveDeepResearchMessage(message) ||
    isTerminalDeepResearchMessage(message) ||
    isReportBearingDeepResearchMessage(message))

export const isRestorableReportConversation = (conversation: Conversation): boolean =>
  conversation.messages.some(isRestorableReportMessage)

const getReportMarkerIndexes = (messages: ChatMessage[]): Set<number> => {
  const reportJobIds = new Set(
    messages
      .filter(isRestorableReportMessage)
      .map((message) => message.deepResearchJobId)
      .filter((jobId): jobId is string => Boolean(jobId))
  )

  const indexes = new Set<number>()
  messages.forEach((message, index) => {
    if (isRestorableReportMessage(message)) {
      indexes.add(index)
      return
    }

    const bannerJobId = message.deepResearchBannerData?.jobId
    if (bannerJobId && reportJobIds.has(bannerJobId)) {
      indexes.add(index)
    }
  })

  return indexes
}

export const pruneConversationForReportPersistence = (
  conversation: Conversation,
  messageLimit = REPORT_SESSION_MESSAGE_LIMIT
): Conversation => {
  const prunedMessages = conversation.messages
    .filter(shouldPersistMessage)
    .map(pruneMessageForStorage)
  const markerIndexes = getReportMarkerIndexes(prunedMessages)
  const tailStart = Math.max(0, prunedMessages.length - messageLimit)

  return {
    ...conversation,
    messages: prunedMessages.filter((_, index) => markerIndexes.has(index) || index >= tailStart),
  }
}

export const filterReportConversationsForPersistence = (
  conversations: Conversation[]
): Conversation[] =>
  conversations
    .filter(isRestorableReportConversation)
    .map((conversation) => pruneConversationForReportPersistence(conversation))
