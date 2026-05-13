// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@/test-utils'
import { beforeEach, describe, test, expect } from 'vitest'
import { useChatStore } from '@/features/chat'
import { CitationsTab } from './CitationsTab'
import type { CitationSource } from '@/features/chat/types'

const createCitation = (overrides: Partial<CitationSource> = {}): CitationSource => ({
  id: 'citation-1',
  url: 'https://example.com/article',
  content: 'Citation content',
  timestamp: new Date('2026-05-05T12:00:00.000Z'),
  isCited: false,
  ...overrides,
})

describe('CitationsTab', () => {
  beforeEach(() => {
    useChatStore.setState({ deepResearchCitations: [] })
  })

  test('renders section title', () => {
    render(<CitationsTab />)

    expect(screen.getByText('Referenced')).toBeInTheDocument()
  })

  test('does not render citation filter buttons', () => {
    render(<CitationsTab />)

    expect(screen.queryByRole('radio', { name: /referenced/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^read$/i })).not.toBeInTheDocument()
  })

  test('does not display empty placeholder text when there are no citations', () => {
    render(<CitationsTab />)

    expect(screen.queryByText(/No referenced sources yet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/No sources read yet/i)).not.toBeInTheDocument()
  })

  test('keeps citation sections visible when there are no citations', () => {
    render(<CitationsTab />)

    expect(screen.getByText('Referenced')).toBeInTheDocument()
    expect(screen.getByText('Read')).toBeInTheDocument()
  })

  test('displays description subheading', () => {
    render(<CitationsTab />)

    expect(screen.getByText(/Sources referenced in the final report/i)).toBeInTheDocument()
  })

  test('renders referenced sources before read sources', () => {
    useChatStore.setState({
      deepResearchCitations: [
        createCitation({
          id: 'read-source',
          url: 'https://read.example.com/source',
          isCited: false,
        }),
        createCitation({
          id: 'referenced-source',
          url: 'https://referenced.example.com/source',
          isCited: true,
        }),
      ],
    })

    render(<CitationsTab />)

    expect(screen.getByText('Referenced').compareDocumentPosition(screen.getByText('Read'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(screen.getByText('referenced.example.com')).toBeInTheDocument()
    expect(screen.getByText('read.example.com')).toBeInTheDocument()
  })
})
