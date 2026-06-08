// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import type { ChatMessage, Conversation } from '../types'
import {
  filterReportConversationsForPersistence,
  isRestorableReportConversation,
  pruneConversationForReportPersistence,
} from './report-session-persistence'

const message = (overrides: Partial<ChatMessage> & { id: string }): ChatMessage => ({
  role: overrides.role ?? 'assistant',
  content: overrides.content ?? overrides.id,
  timestamp: overrides.timestamp ?? new Date('2026-05-04T12:00:00.000Z'),
  messageType: overrides.messageType ?? 'assistant',
  ...overrides,
})

const conversation = (overrides: Partial<Conversation> & { id: string; messages: ChatMessage[] }): Conversation => ({
  id: overrides.id,
  userId: overrides.userId ?? 'user-1',
  title: overrides.title ?? overrides.id,
  messages: overrides.messages,
  createdAt: overrides.createdAt ?? new Date('2026-05-04T12:00:00.000Z'),
  updatedAt: overrides.updatedAt ?? new Date('2026-05-04T12:00:00.000Z'),
  enabledDataSourceIds: overrides.enabledDataSourceIds,
})

describe('report session persistence', () => {
  test('does not restore pure chat conversations', () => {
    const pureChat = conversation({
      id: 'chat-only',
      messages: [
        message({ id: 'user-1', role: 'user', messageType: 'user', content: 'Hello' }),
        message({ id: 'assistant-1', role: 'assistant', messageType: 'agent_response', content: 'Hi' }),
      ],
    })

    expect(isRestorableReportConversation(pureChat)).toBe(false)
    expect(filterReportConversationsForPersistence([pureChat])).toEqual([])
  })

  test('restores active deep research conversations', () => {
    const activeReport = conversation({
      id: 'active-report',
      messages: [
        message({
          id: 'tracking',
          messageType: 'agent_response',
          deepResearchJobId: 'job-1',
          deepResearchJobStatus: 'running',
          isDeepResearchActive: true,
        }),
      ],
    })

    expect(isRestorableReportConversation(activeReport)).toBe(true)
  })

  test('restores completed and interrupted report conversations', () => {
    const completed = conversation({
      id: 'completed-report',
      messages: [
        message({
          id: 'completed',
          messageType: 'agent_response',
          deepResearchJobId: 'job-2',
          deepResearchJobStatus: 'success',
          showViewReport: true,
        }),
      ],
    })
    const interrupted = conversation({
      id: 'interrupted-report',
      messages: [
        message({
          id: 'interrupted',
          messageType: 'agent_response',
          deepResearchJobId: 'job-3',
          deepResearchJobStatus: 'interrupted',
        }),
      ],
    })

    expect(filterReportConversationsForPersistence([completed, interrupted]).map((c) => c.id)).toEqual([
      'completed-report',
      'interrupted-report',
    ])
  })

  test('keeps report marker messages plus a small recent-message tail', () => {
    const longReportConversation = conversation({
      id: 'long-report',
      messages: [
        message({
          id: 'tracking',
          messageType: 'agent_response',
          deepResearchJobId: 'job-4',
          deepResearchJobStatus: 'success',
          showViewReport: true,
          reportContent: 'Large report body that should be pruned',
        }),
        message({
          id: 'success-banner',
          messageType: 'deep_research_banner',
          deepResearchBannerData: { bannerType: 'success', jobId: 'job-4' },
        }),
        ...Array.from({ length: 10 }, (_, index) =>
          message({
            id: `tail-${index}`,
            role: 'user',
            messageType: 'user',
            content: `Tail ${index}`,
          })
        ),
      ],
    })

    const pruned = pruneConversationForReportPersistence(longReportConversation, 3)
    const messageIds = pruned.messages.map((m) => m.id)

    expect(messageIds).toEqual(['tracking', 'success-banner', 'tail-7', 'tail-8', 'tail-9'])
    expect(pruned.messages[0].reportContent).toBeUndefined()
  })

  test('drops transient error banners from persisted report conversations', () => {
    const completedWithTransientError = conversation({
      id: 'completed-report',
      messages: [
        message({
          id: 'completed',
          messageType: 'agent_response',
          deepResearchJobId: 'job-5',
          deepResearchJobStatus: 'success',
          showViewReport: true,
        }),
        message({
          id: 'transient-error',
          messageType: 'error',
          errorData: {
            errorCode: 'connection.failed',
            errorMessage: 'Backend state check failed',
          },
        }),
      ],
    })

    const pruned = pruneConversationForReportPersistence(completedWithTransientError, 8)

    expect(pruned.messages.map((m) => m.id)).toEqual(['completed'])
  })
})
