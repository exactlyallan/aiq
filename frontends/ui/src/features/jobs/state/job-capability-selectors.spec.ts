// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import type { ResearchJobListItem } from '@/adapters/api/research-job-contracts'
import type { ChatMessage } from '@/features/chat/types'
import {
  deriveCapabilityInput,
  deriveJobActionSelectors,
  deriveJobCapabilities,
  latestResearchJobFromMessages,
} from './job-capability-selectors'

const job = (overrides: Partial<ResearchJobListItem> & { job_id: string }): ResearchJobListItem => ({
  job_id: overrides.job_id,
  status: overrides.status ?? 'running',
  agent_type: 'deep_researcher',
  input_preview: overrides.input_preview ?? 'Research job',
  created_at: overrides.created_at ?? '2026-05-04T12:00:00.000Z',
  updated_at: overrides.updated_at ?? '2026-05-04T12:00:00.000Z',
  expires_at: overrides.expires_at ?? null,
  data_sources: overrides.data_sources ?? ['web_search'],
  collection_name: overrides.collection_name ?? null,
  has_report: overrides.has_report ?? false,
  report_availability: overrides.report_availability ?? 'unavailable',
  error: overrides.error ?? null,
})

describe('job capability selectors', () => {
  test('maps selected running jobs into matrix input', () => {
    expect(
      deriveCapabilityInput({
        selectedJobId: 'job-running',
        selectedJob: job({ job_id: 'job-running', status: 'running' }),
        authState: 'authenticated',
      })
    ).toMatchObject({
      selectedJob: 'active',
      jobStatus: 'running',
      reportAvailability: 'unavailable',
      authState: 'authenticated',
      globalConnection: 'online',
      activeRequestState: 'idle',
    })
  })

  test('derives action selectors from the capability matrix', () => {
    const capabilities = deriveJobCapabilities({
      selectedJobId: 'job-running',
      selectedJob: job({ job_id: 'job-running', status: 'running' }),
      authState: 'authenticated',
    })

    expect(deriveJobActionSelectors(capabilities)).toMatchObject({
      canSubmitPrompt: false,
      canUploadFiles: false,
      canCancelJob: true,
      promptDisabledReason: 'job_running',
      uploadDisabledReason: 'job_running',
    })
  })

  test('keeps future talk-to-report disabled through selector output', () => {
    const capabilities = deriveJobCapabilities({
      selectedJobId: 'job-success',
      selectedJob: job({
        job_id: 'job-success',
        status: 'success',
        has_report: true,
        report_availability: 'available',
      }),
      authState: 'authenticated',
    })

    expect(deriveJobActionSelectors(capabilities)).toMatchObject({
      canFetchReport: true,
      canTalkToReport: false,
      canContinueConversation: false,
      promptDisabledReason: 'job_terminal',
    })
  })

  test('auth errors override otherwise fetchable reports', () => {
    const capabilities = deriveJobCapabilities({
      selectedJobId: 'job-success',
      selectedJob: job({
        job_id: 'job-success',
        status: 'success',
        has_report: true,
        report_availability: 'available',
      }),
      authState: 'expired',
    })

    expect(deriveJobActionSelectors(capabilities)).toMatchObject({
      canFetchReport: false,
      canSubmitPrompt: false,
      canUploadFiles: false,
    })
  })

  test('extracts the latest persisted deep-research job from conversation messages', () => {
    const messages: ChatMessage[] = [
      {
        id: 'older',
        role: 'assistant',
        content: 'Older job',
        timestamp: new Date('2026-05-04T12:00:00.000Z'),
        messageType: 'agent_response',
        deepResearchJobId: 'job-old',
        deepResearchJobStatus: 'running',
      },
      {
        id: 'latest',
        role: 'assistant',
        content: 'Latest job',
        timestamp: new Date('2026-05-04T12:05:00.000Z'),
        messageType: 'agent_response',
        deepResearchJobId: 'job-latest',
        deepResearchJobStatus: 'success',
        enabledDataSources: ['web_search', 'knowledge_layer'],
        showViewReport: true,
      },
    ]

    expect(
      latestResearchJobFromMessages(messages, { ownerConversationId: 'conversation-1' })
    ).toMatchObject({
      job_id: 'job-latest',
      status: 'success',
      data_sources: ['web_search', 'knowledge_layer'],
      collection_name: 'conversation-1',
      has_report: true,
      report_availability: 'available',
    })
  })

  test('active stream status overrides stale persisted message status for the owning job', () => {
    const messages: ChatMessage[] = [
      {
        id: 'job-message',
        role: 'assistant',
        content: 'Research job',
        timestamp: new Date('2026-05-04T12:00:00.000Z'),
        messageType: 'agent_response',
        deepResearchJobId: 'job-running',
        deepResearchJobStatus: 'submitted',
      },
    ]

    expect(
      latestResearchJobFromMessages(messages, {
        ownerConversationId: 'conversation-1',
        activeJobId: 'job-running',
        activeJobStatus: 'running',
        activeJobStreaming: true,
      })
    ).toMatchObject({
      job_id: 'job-running',
      status: 'running',
    })
  })
})
