// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@/test-utils'
import { beforeEach, describe, expect, test } from 'vitest'
import { useChatStore } from '@/features/chat'
import { ArtifactsTab } from './ArtifactsTab'

describe('ArtifactsTab', () => {
  beforeEach(() => {
    useChatStore.setState({
      deepResearchFiles: [],
      deepResearchTodos: [],
      deepResearchToolCalls: [],
      reportContent: '',
      currentStatus: null,
      isDeepResearchStreaming: false,
    })
  })

  test('renders empty state when no artifacts or activity exist', () => {
    render(<ArtifactsTab />)

    expect(screen.queryByText('Artifacts')).not.toBeInTheDocument()
    expect(screen.getByText('No artifacts for this research session.')).toBeInTheDocument()
  })

  test('summarizes report, tasks, tools, and generated files', () => {
    useChatStore.setState({
      reportContent: '# Report',
      currentStatus: 'researching',
      deepResearchTodos: [
        { id: 'todo-1', content: 'Find source evidence', status: 'completed' },
        { id: 'todo-2', content: 'Draft report', status: 'in_progress' },
      ],
      deepResearchToolCalls: [
        {
          id: 'tool-1',
          name: 'web_search',
          status: 'running',
          timestamp: new Date('2026-05-04T12:00:00.000Z'),
        },
      ],
      deepResearchFiles: [
        {
          id: 'file-1',
          filename: 'report.md',
          content: '# Draft',
          timestamp: new Date('2026-05-04T12:01:00.000Z'),
        },
      ],
    })

    render(<ArtifactsTab />)

    expect(screen.getByText('Available')).toBeInTheDocument()
    expect(screen.queryByText('1 running')).not.toBeInTheDocument()
    expect(screen.queryByText('1/2')).not.toBeInTheDocument()
    expect(screen.queryByText('Research Activity')).not.toBeInTheDocument()
    expect(screen.queryByText('Find source evidence')).not.toBeInTheDocument()
    expect(screen.getByText('report.md')).toBeInTheDocument()
  })
})
