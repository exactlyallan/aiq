// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { render, screen, within } from '@/test-utils'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { ChatArea } from './ChatArea'
import type { ChatStore } from '@/features/chat'

// Mock the chat store
const mockDismissErrorCard = vi.fn()

type MockChatSelector = (s: ChatStore) => unknown

const selectChatState = (selector: MockChatSelector | undefined, state: Record<string, unknown>) =>
  selector ? selector(state as unknown as ChatStore) : state

vi.mock('@/features/chat', () => ({
  useChatStore: vi.fn((selector?: MockChatSelector) => {
    const state = {
      currentConversation: { messages: [] },
      isLoading: false,
      isStreaming: false,
      thinkingSteps: [],
      dismissErrorCard: mockDismissErrorCard,
    }
    return selectChatState(selector, state)
  }),
  AgentResponse: ({ content }: { content: string }) => (
    <div data-testid="agent-response">{content}</div>
  ),
  ErrorBanner: ({ message, onDismiss }: { message: string; onDismiss?: () => void }) => (
    <div data-testid="error-card">
      {message}
      {onDismiss && <button onClick={onDismiss}>Dismiss</button>}
    </div>
  ),
  FileUploadBanner: ({ type }: { type: string }) => <div data-testid="file-banner">{type}</div>,
  UserMessage: ({ content }: { content: string }) => (
    <div data-testid="user-message">{content}</div>
  ),
}))

import { useChatStore } from '@/features/chat'

describe('ChatArea', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('renders welcome state when not authenticated', () => {
    render(<ChatArea isAuthenticated={false} />)

    expect(screen.getByText('Welcome to AI-Q')).toBeInTheDocument()
    expect(screen.getByText(/sign in with your account/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in with.*sso/i })).toBeInTheDocument()
  })

  test('renders welcome state when authenticated with no messages', () => {
    render(<ChatArea isAuthenticated={true} />)

    expect(screen.getByText('Welcome to AI-Q')).toBeInTheDocument()
    expect(screen.getByText(/AI-powered research companion/i)).toBeInTheDocument()
  })

  test('calls onSignIn when sign in button clicked', async () => {
    const user = userEvent.setup()
    const onSignIn = vi.fn()

    render(<ChatArea isAuthenticated={false} onSignIn={onSignIn} />)

    await user.click(screen.getByRole('button', { name: /sign in with.*sso/i }))

    expect(onSignIn).toHaveBeenCalled()
  })

  test('renders user messages', () => {
    vi.mocked(useChatStore).mockImplementation((selector?: MockChatSelector) => {
      const state = {
        currentConversation: {
          messages: [{ id: 'msg-1', role: 'user', content: 'Hello world', messageType: 'user' }],
        },
        isLoading: false,
        isStreaming: false,
        thinkingSteps: [],
        dismissErrorCard: mockDismissErrorCard,
      }
      return selectChatState(selector, state)
    })

    render(<ChatArea isAuthenticated={true} />)

    expect(screen.getByTestId('user-message')).toHaveTextContent('Hello world')
  })

  test('renders status messages', () => {
    vi.mocked(useChatStore).mockImplementation((selector?: MockChatSelector) => {
      const state = {
        currentConversation: {
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'Processing...',
              messageType: 'status',
              statusType: 'thinking',
            },
          ],
        },
        isLoading: false,
        isStreaming: false,
        thinkingSteps: [],
        dismissErrorCard: mockDismissErrorCard,
      }
      return selectChatState(selector, state)
    })

    render(<ChatArea isAuthenticated={true} />)

    // Status messages render inline with the status type
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  test('renders agent responses', () => {
    vi.mocked(useChatStore).mockImplementation((selector?: MockChatSelector) => {
      const state = {
        currentConversation: {
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'Here is your answer',
              messageType: 'agent_response',
            },
          ],
        },
        isLoading: false,
        isStreaming: false,
        dismissErrorCard: mockDismissErrorCard,
      }
      return selectChatState(selector, state)
    })

    render(<ChatArea isAuthenticated={true} />)

    expect(screen.getByTestId('agent-response')).toHaveTextContent('Here is your answer')
  })

  test('renders file messages', () => {
    vi.mocked(useChatStore).mockImplementation((selector?: MockChatSelector) => {
      const state = {
        currentConversation: {
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              content: '',
              messageType: 'file',
              fileData: {
                fileName: 'document.pdf',
                fileSize: 1024,
                fileStatus: 'success',
              },
            },
          ],
        },
        isLoading: false,
        isStreaming: false,
        thinkingSteps: [],
        dismissErrorCard: mockDismissErrorCard,
      }
      return selectChatState(selector, state)
    })

    render(<ChatArea isAuthenticated={true} />)

    // File messages render inline with the file name
    expect(screen.getByText(/document\.pdf/)).toBeInTheDocument()
  })

  test('renders error banners in the chat header instead of the transcript', () => {
    vi.mocked(useChatStore).mockImplementation((selector?: MockChatSelector) => {
      const state = {
        currentConversation: {
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              content: '',
              messageType: 'error',
              errorData: {
                errorCode: 'E001',
                errorMessage: 'Something went wrong',
              },
            },
          ],
        },
        isLoading: false,
        isStreaming: false,
        thinkingSteps: [],
        dismissErrorCard: mockDismissErrorCard,
      }
      return selectChatState(selector, state)
    })

    render(<ChatArea isAuthenticated={true} />)

    const header = screen.getByTestId('chat-error-banner-header')
    expect(within(header).getByTestId('error-card')).toBeInTheDocument()
    expect(screen.getByText('Welcome to AI-Q')).toBeInTheDocument()
  })

  test('dismisses header error banners through the chat store', async () => {
    const user = userEvent.setup()
    vi.mocked(useChatStore).mockImplementation((selector?: MockChatSelector) => {
      const state = {
        currentConversation: {
          messages: [
            {
              id: 'error-1',
              role: 'assistant',
              content: '',
              messageType: 'error',
              errorData: {
                errorCode: 'E001',
                errorMessage: 'Something went wrong',
              },
            },
          ],
        },
        isLoading: false,
        isStreaming: false,
        thinkingSteps: [],
        dismissErrorCard: mockDismissErrorCard,
      }
      return selectChatState(selector, state)
    })

    render(<ChatArea isAuthenticated={true} />)

    await user.click(screen.getByRole('button', { name: /dismiss/i }))

    expect(mockDismissErrorCard).toHaveBeenCalledWith('error-1')
  })

  test('does not render assistant messages (full reports)', () => {
    vi.mocked(useChatStore).mockImplementation((selector?: MockChatSelector) => {
      const state = {
        currentConversation: {
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'Full report content',
              messageType: 'assistant',
            },
          ],
        },
        isLoading: false,
        isStreaming: false,
        dismissErrorCard: mockDismissErrorCard,
      }
      return selectChatState(selector, state)
    })

    render(<ChatArea isAuthenticated={true} />)

    // Should show welcome state since assistant messages are filtered out
    expect(screen.getByText('Welcome to AI-Q')).toBeInTheDocument()
  })

  test('renders chat messages area with aria-label', () => {
    render(<ChatArea isAuthenticated={true} />)

    // The Flex component renders with aria-label
    expect(screen.getByLabelText(/chat messages/i)).toBeInTheDocument()
  })

  test('handles null currentConversation', () => {
    vi.mocked(useChatStore).mockImplementation((selector?: MockChatSelector) => {
      const state = {
        currentConversation: null,
        isLoading: false,
        isStreaming: false,
        dismissErrorCard: mockDismissErrorCard,
      }
      return selectChatState(selector, state)
    })

    render(<ChatArea isAuthenticated={true} />)

    // Should render welcome state
    expect(screen.getByText('Welcome to AI-Q')).toBeInTheDocument()
  })

  test('renders file upload banners', () => {
    vi.mocked(useChatStore).mockImplementation((selector?: MockChatSelector) => {
      const state = {
        currentConversation: {
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              content: '',
              messageType: 'file_upload_status',
              fileUploadStatusData: {
                type: 'uploaded',
                fileCount: 2,
              },
            },
          ],
        },
        isLoading: false,
        isStreaming: false,
        dismissErrorCard: mockDismissErrorCard,
      }
      return selectChatState(selector, state)
    })

    render(<ChatArea isAuthenticated={true} />)

    expect(screen.getByTestId('file-banner')).toBeInTheDocument()
  })

  test('does not render inline thinking or selected sources after user messages', () => {
    vi.mocked(useChatStore).mockImplementation((selector?: MockChatSelector) => {
      const state = {
        currentConversation: {
          messages: [
            {
              id: 'user-1',
              role: 'user',
              content: 'First question',
              messageType: 'user',
              enabledDataSources: ['web_search', 'knowledge_layer'],
              messageFiles: [{ id: 'file-1', fileName: 'source.pdf' }],
              thinkingSteps: [
                {
                  id: 'step-1',
                  userMessageId: 'user-1',
                  functionName: 'research_submit',
                  displayName: 'Research Request',
                  content: 'Submit details live in the Thinking panel',
                  timestamp: new Date(),
                  isComplete: true,
                  displaySurface: 'research_panel',
                },
              ],
            },
          ],
        },
        isLoading: false,
        isStreaming: false,
        thinkingSteps: [],
        dismissErrorCard: mockDismissErrorCard,
      }
      return selectChatState(selector, state)
    })

    render(<ChatArea isAuthenticated={true} />)

    expect(screen.getByTestId('user-message')).toHaveTextContent('First question')
    expect(screen.queryByText(/selected data sources/i)).not.toBeInTheDocument()
  })
})
