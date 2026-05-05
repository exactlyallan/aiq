// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { MainLayout } from './MainLayout'

const mockUpdateSessionUrl = vi.fn()
const mockClearSessionUrl = vi.fn()
const mockSelectConversation = vi.fn()
const mockStartNewSessionDraft = vi.fn()
const mockDeleteConversation = vi.fn()
const mockDeleteAllConversations = vi.fn()
const mockUpdateConversationTitle = vi.fn()
const mockCloseRightPanel = vi.fn()

// Mock the useSessionUrl hook (uses Next.js App Router hooks)
vi.mock('@/hooks/use-session-url', () => ({
  useSessionUrl: vi.fn(() => ({
    updateSessionUrl: mockUpdateSessionUrl,
    clearSessionUrl: mockClearSessionUrl,
  })),
}))

// Mock the chat store
vi.mock('@/features/chat', () => ({
  useChatStore: vi.fn((selector?: (s: any) => any) => {
    const state = {
      currentConversation: { id: 'session-1', title: 'Test Session' },
      getUserConversations: vi.fn(() => []),
      selectConversation: mockSelectConversation,
      startNewSessionDraft: mockStartNewSessionDraft,
      deleteConversation: mockDeleteConversation,
      deleteAllConversations: mockDeleteAllConversations,
      updateConversationTitle: mockUpdateConversationTitle,
      isStreaming: false,
      pendingInteraction: null,
      isDeepResearchStreaming: false,
      deepResearchOwnerConversationId: null,
    }
    return selector ? selector(state) : state
  }),
  useDeepResearch: vi.fn(() => ({
    isResearching: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    cancel: vi.fn(),
  })),
  NoSourcesBanner: () => <div data-testid="no-sources-banner">No Sources Banner</div>,
}))

// Mock the layout store
vi.mock('../store', () => ({
  useLayoutStore: vi.fn((selector?: (s: any) => any) => {
    const state = {
      rightPanel: null,
      isSessionsPanelOpen: false,
      setSessionsPanelOpen: vi.fn(),
      enabledDataSourceIds: ['source-1', 'source-2'],
      closeRightPanel: mockCloseRightPanel,
    }
    return selector ? selector(state) : state
  }),
}))

// Mock child components
vi.mock('./AppBar', () => ({
  AppBar: ({ sessionTitle }: { sessionTitle: string }) => (
    <div data-testid="app-bar">{sessionTitle}</div>
  ),
}))

vi.mock('./SessionsPanel', () => ({
  SessionsPanel: ({ onNewSession }: { onNewSession?: () => void }) => (
    <div data-testid="sessions-panel">
      Sessions Panel
      <button type="button" onClick={onNewSession}>
        Rail New Session
      </button>
    </div>
  ),
}))

vi.mock('./ChatArea', () => ({
  ChatArea: () => <div data-testid="chat-area">Chat Area</div>,
}))

vi.mock('./InputArea', () => ({
  InputArea: () => <div data-testid="input-area">Input Area</div>,
}))

vi.mock('./ResearchPanel', () => ({
  ResearchPanel: () => <div data-testid="research-panel">Research Panel</div>,
}))

import { useChatStore } from '@/features/chat'
import { useLayoutStore } from '../store'

describe('MainLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('renders all main sections', () => {
    render(<MainLayout />)

    expect(screen.getByTestId('app-bar')).toBeInTheDocument()
    expect(screen.getByTestId('sessions-panel')).toBeInTheDocument()
    expect(screen.getByTestId('chat-area')).toBeInTheDocument()
    expect(screen.getByTestId('input-area')).toBeInTheDocument()
    expect(screen.getByTestId('research-panel')).toBeInTheDocument()
  })

  test('passes session title to AppBar', () => {
    render(<MainLayout />)

    expect(screen.getByTestId('app-bar')).toHaveTextContent('Test Session')
  })

  test('shows "New Session" when no current conversation', () => {
    vi.mocked(useChatStore).mockImplementationOnce((selector?: (s: any) => any) => {
      const state = {
        currentConversation: null,
        getUserConversations: vi.fn(() => []),
        selectConversation: vi.fn(),
        startNewSessionDraft: vi.fn(),
        deleteConversation: vi.fn(),
        deleteAllConversations: vi.fn(),
        updateConversationTitle: vi.fn(),
        isStreaming: false,
        pendingInteraction: null,
        isDeepResearchStreaming: false,
        deepResearchOwnerConversationId: null,
      }
      return selector ? selector(state) : state
    })

    render(<MainLayout />)

    expect(screen.getByTestId('app-bar')).toHaveTextContent('New Session')
  })

  test('passes auth state to components', () => {
    const onSignIn = vi.fn()
    const onSignOut = vi.fn()
    const user = { name: 'Test User', email: 'test@example.com' }

    render(
      <MainLayout isAuthenticated={true} user={user} onSignIn={onSignIn} onSignOut={onSignOut} />
    )

    // Components render - props are passed to mocked child components
    expect(screen.getByTestId('app-bar')).toBeInTheDocument()
    expect(screen.getByTestId('chat-area')).toBeInTheDocument()
    expect(screen.getByTestId('input-area')).toBeInTheDocument()
  })

  test('wires the sessions rail new session action to draft session flow', async () => {
    const user = userEvent.setup()

    render(<MainLayout />)

    await user.click(screen.getByRole('button', { name: /rail new session/i }))

    expect(mockStartNewSessionDraft).toHaveBeenCalledOnce()
    expect(mockClearSessionUrl).toHaveBeenCalledOnce()
    expect(mockCloseRightPanel).toHaveBeenCalledOnce()
  })

  test('does not render a header-owned new session action', () => {
    render(<MainLayout />)

    expect(screen.queryByRole('button', { name: /header new session/i })).not.toBeInTheDocument()
  })

  test('keeps the chat column flex-based when the research drawer is open', () => {
    vi.mocked(useLayoutStore).mockImplementation((selector?: (s: any) => any) => {
      const state = {
        rightPanel: 'research',
        isSessionsPanelOpen: false,
        setSessionsPanelOpen: vi.fn(),
        enabledDataSourceIds: ['source-1', 'source-2'],
      }
      return selector ? selector(state) : state
    })

    const { container } = render(<MainLayout />)

    const chatContainer = screen.getByTestId('chat-area').parentElement
    expect(chatContainer).toHaveClass('flex-1')
    expect(container.querySelector('[style*="width: 40%"]')).not.toBeInTheDocument()
  })

  test('does not use inline width squeezing when the research drawer is closed', () => {
    vi.mocked(useLayoutStore).mockImplementation((selector?: (s: any) => any) => {
      const state = {
        rightPanel: null,
        isSessionsPanelOpen: false,
        setSessionsPanelOpen: vi.fn(),
        enabledDataSourceIds: ['source-1', 'source-2'],
      }
      return selector ? selector(state) : state
    })

    const { container } = render(<MainLayout />)

    const chatContainer = screen.getByTestId('chat-area').parentElement
    expect(chatContainer).toHaveClass('flex-1')
    expect(container.querySelector('[style*="width: 100%"]')).not.toBeInTheDocument()
  })
})
