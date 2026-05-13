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

  test('prefers high-level orchestration todos over later sub-agent todo lists', () => {
    const snapshot = buildDeepResearchJobStateSnapshot({
      job_id: 'job-123',
      has_state: true,
      state: null,
      artifacts: {
        tools: [],
        outputs: [
          {
            type: 'todo',
            workflow: 'deep-research-orchestrator',
            timestamp: '2026-01-22T10:00:00Z',
            content: [
              { content: 'Plan', status: 'completed' },
              { content: 'Find sources', status: 'in_progress' },
              { content: 'Summarize', status: 'pending' },
              { content: 'Write report', status: 'pending' },
            ],
          },
          {
            type: 'todo',
            workflow: 'researcher-agent',
            timestamp: '2026-01-22T10:00:04Z',
            content: [
              { content: 'Search forum results', status: 'completed' },
              { content: 'Extract relevant quotes', status: 'in_progress' },
            ],
          },
        ],
        sources: {
          found_urls: [],
          cited_urls: [],
        },
        llm_steps: [],
      },
    })

    expect(snapshot?.todos?.map((todo) => todo.content)).toEqual([
      'Plan',
      'Find sources',
      'Summarize',
      'Write report',
    ])
  })

  test('normalizes draft output JSON into markdown draft content', () => {
    const snapshot = buildDeepResearchJobStateSnapshot({
      job_id: 'job-123',
      has_state: true,
      state: null,
      artifacts: {
        tools: [],
        outputs: [
          {
            type: 'output',
            output_category: 'draft',
            content: JSON.stringify({
              report: '# Draft report\n\nEarly findings from the orchestrator.',
            }),
          },
        ],
        sources: {
          found_urls: [],
          cited_urls: [],
        },
        llm_steps: [],
      },
    })

    expect(snapshot?.reportContent).toBe('# Draft report\n\nEarly findings from the orchestrator.')
    expect(snapshot?.reportContentCategory).toBe('draft')
  })

  test('keeps final report content ahead of draft content', () => {
    const snapshot = buildDeepResearchJobStateSnapshot({
      job_id: 'job-123',
      has_state: true,
      state: null,
      artifacts: {
        tools: [],
        outputs: [
          {
            type: 'output',
            output_category: 'draft',
            content: '# Draft report',
          },
          {
            type: 'output',
            output_category: 'final_report',
            content: '# Final report',
          },
        ],
        sources: {
          found_urls: [],
          cited_urls: [],
        },
        llm_steps: [],
      },
    })

    expect(snapshot?.reportContent).toBe('# Final report')
    expect(snapshot?.reportContentCategory).toBe('final_report')
  })

  test('uses research markdown file artifacts as draft report content before final report exists', () => {
    const snapshot = buildDeepResearchJobStateSnapshot({
      job_id: 'job-123',
      has_state: true,
      state: null,
      artifacts: {
        tools: [],
        outputs: [
          {
            type: 'file',
            name: '/tmp/research_1.md',
            file_path: '/tmp/research_1.md',
            content: '# Research notes\n\nEvidence from agent one.',
          },
          {
            type: 'file',
            name: '/tmp/scratch.json',
            file_path: '/tmp/scratch.json',
            content: '{"debug": true}',
          },
        ],
        sources: {
          found_urls: [],
          cited_urls: [],
        },
        llm_steps: [],
      },
    })

    expect(snapshot?.files.map((file) => file.filename)).toEqual(['research_1.md', 'scratch.json'])
    expect(snapshot?.reportContent).toBe('# Research notes\n\nEvidence from agent one.')
    expect(snapshot?.reportContentCategory).toBe('research_notes')
  })

  test('keeps final report ahead of research markdown file artifacts', () => {
    const snapshot = buildDeepResearchJobStateSnapshot({
      job_id: 'job-123',
      has_state: true,
      state: null,
      artifacts: {
        tools: [],
        outputs: [
          {
            type: 'file',
            name: '/tmp/research_1.md',
            file_path: '/tmp/research_1.md',
            content: '# Research notes',
          },
          {
            type: 'output',
            output_category: 'final_report',
            content: '# Final report',
          },
        ],
        sources: {
          found_urls: [],
          cited_urls: [],
        },
        llm_steps: [],
      },
    })

    expect(snapshot?.reportContent).toBe('# Final report')
    expect(snapshot?.reportContentCategory).toBe('final_report')
  })
})
