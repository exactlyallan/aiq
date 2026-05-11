// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { buildDeepResearchJobStateSnapshot } from './deep-research-job-state'

describe('buildDeepResearchJobStateSnapshot', () => {
  test('hydrates LLM activity and honors backend tool status from the polling state payload', () => {
    const snapshot = buildDeepResearchJobStateSnapshot({
      job_id: 'job-123',
      has_state: true,
      state: null,
      artifacts: {
        tools: [
          {
            name: 'web_search',
            input: { query: 'gpu' },
            status: 'completed',
            timestamp: '2026-01-22T10:00:01Z',
            workflow: 'researcher-agent',
            agent_id: 'agent-1',
          },
        ],
        outputs: [],
        sources: {
          found_urls: [],
          cited_urls: [],
        },
        llm_steps: [
          {
            id: 'llm-run-1',
            name: 'nemotron',
            workflow: 'planner-agent',
            content: '',
            thinking: 'checked source quality',
            usage: { input_tokens: 12, output_tokens: 8 },
            timestamp: '2026-01-22T10:00:00Z',
            is_complete: true,
          },
        ],
        activity: {
          current: {
            id: 'artifact-1',
            type: 'artifact.update',
            label: 'Writing report',
            status: 'complete',
            timestamp: '2026-01-22T10:00:04Z',
          },
          items: [],
        },
      },
    })

    expect(snapshot?.toolCalls).toEqual([
      expect.objectContaining({
        name: 'web_search',
        status: 'complete',
        workflow: 'researcher-agent',
        agentId: 'agent-1',
      }),
    ])
    expect(snapshot?.llmSteps).toEqual([
      expect.objectContaining({
        id: 'llm-run-1',
        name: 'nemotron',
        workflow: 'planner-agent',
        thinking: 'checked source quality',
        usage: { input_tokens: 12, output_tokens: 8 },
        isComplete: true,
      }),
    ])
    expect(snapshot?.currentActivity).toEqual(
      expect.objectContaining({
        label: 'Writing report',
        status: 'complete',
      })
    )
  })
})
