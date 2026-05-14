// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@/test-utils'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { ThinkingTab } from './ThinkingTab'

interface MockLLMStep {
  id: string
  name: string
  content: string
  isComplete: boolean
}

interface MockThinkingStep {
  id: string
  userMessageId: string
  category: string
  functionName: string
  displayName: string
  content: string
  timestamp: Date
  isComplete: boolean
  displaySurface?: 'chat' | 'research_panel'
}

interface MockAgent {
  id: string
  name: string
  status: string
}

interface MockToolCall {
  id: string
  name: string
  status: string
}

interface MockFile {
  id: string
  name: string
}

interface MockState {
  thinkingSteps: MockThinkingStep[]
  activeThinkingStepId: string | null
  isStreaming: boolean
  isDeepResearchStreaming: boolean
  currentStatus: string | null
  deepResearchLLMSteps: MockLLMStep[]
  deepResearchAgents: MockAgent[]
  deepResearchToolCalls: MockToolCall[]
  deepResearchFiles: MockFile[]
}

const defaultState: MockState = {
  thinkingSteps: [],
  activeThinkingStepId: null,
  isStreaming: false,
  isDeepResearchStreaming: false,
  currentStatus: null,
  deepResearchLLMSteps: [],
  deepResearchAgents: [],
  deepResearchToolCalls: [],
  deepResearchFiles: [],
}

let mockState: MockState = { ...defaultState }

vi.mock('@/features/chat', () => ({
  useChatStore: vi.fn((selector?: (state: MockState) => unknown) => {
    return selector ? selector(mockState) : mockState
  }),
}))

vi.mock('./ThoughtTracesTab', () => ({
  ThoughtTracesTab: ({ thoughtTraces }: { thoughtTraces: unknown[] }) => (
    <div data-testid="thought-traces-tab">Thoughts: {thoughtTraces.length}</div>
  ),
}))

vi.mock('./AgentsTab', () => ({
  AgentsTab: () => <div data-testid="agents-tab">Agents Tab</div>,
}))

vi.mock('./ToolCallsTab', () => ({
  ToolCallsTab: ({ toolCalls }: { toolCalls: unknown[] }) => (
    <div data-testid="tool-calls-tab">Tool Calls: {toolCalls.length}</div>
  ),
}))

vi.mock('./FilesTab', () => ({
  FilesTab: () => <div data-testid="files-tab">Files</div>,
}))

describe('ThinkingTab', () => {
  beforeEach(() => {
    mockState = { ...defaultState }
  })

  test('does not render thinking sub-tab controls', () => {
    render(<ThinkingTab />)

    expect(screen.queryByRole('radio', { name: /Thoughts/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Agents/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Tools/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Files/i })).not.toBeInTheDocument()
  })

  test('shows thoughts content only', () => {
    render(<ThinkingTab />)

    expect(screen.getByTestId('thought-traces-tab')).toBeInTheDocument()
    expect(screen.queryByTestId('agents-tab')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tool-calls-tab')).not.toBeInTheDocument()
    expect(screen.queryByTestId('files-tab')).not.toBeInTheDocument()
  })

  test('passes data to sub-tabs from store state', () => {
    mockState = {
      ...defaultState,
      deepResearchLLMSteps: [{ id: '1', name: 'step1', content: 'content', isComplete: false }],
      deepResearchToolCalls: [{ id: '1', name: 'tool1', status: 'running' }],
    }

    render(<ThinkingTab />)

    expect(screen.getByTestId('thought-traces-tab')).toHaveTextContent('Thoughts: 1')
  })

  test('projects shallow research thinking steps into the same thoughts list', () => {
    mockState = {
      ...defaultState,
      thinkingSteps: [
        {
          id: 'inline-step',
          userMessageId: 'user-1',
          category: 'agents',
          functionName: 'inline_agent',
          displayName: 'Inline Agent',
          content: 'Inline chat activity',
          timestamp: new Date('2026-05-14T12:00:00.000Z'),
          isComplete: true,
          displaySurface: 'chat',
        },
        {
          id: 'shallow-step',
          userMessageId: 'user-1',
          category: 'agents',
          functionName: 'research_submit',
          displayName: 'Research Request',
          content: 'Backend returned a shallow answer.',
          timestamp: new Date('2026-05-14T12:01:00.000Z'),
          isComplete: true,
          displaySurface: 'research_panel',
        },
      ],
      deepResearchLLMSteps: [
        {
          id: 'deep-step',
          name: 'deep model',
          content: 'Deep research content',
          isComplete: true,
        },
      ],
    }

    render(<ThinkingTab />)

    expect(screen.getByTestId('thought-traces-tab')).toHaveTextContent('Thoughts: 2')
  })
})
