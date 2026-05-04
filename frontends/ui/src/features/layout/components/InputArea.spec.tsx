// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { InputArea } from './InputArea'

// Mock the chat hooks
const mockSendMessage = vi.fn()

let mockIsDeepResearchStreaming = false
let mockDeepResearchStatus: string | null = null
let mockDeepResearchJobId: string | null = null
let mockDeepResearchOwnerConversationId: string | null = null
let mockConversationMessages: unknown[] | undefined = []

vi.mock('@/features/chat', () => ({
  useResearchSubmit: vi.fn(() => ({
    sendMessage: mockSendMessage,
    isLoading: false,
  })),
  useChatStore: vi.fn((selector) => {
    const state = {
      currentConversation: { id: 'session-1', messages: mockConversationMessages },
      ensureSession: vi.fn(() => 'session-1'),
      deepResearchStatus: mockDeepResearchStatus,
      deepResearchJobId: mockDeepResearchJobId,
      isDeepResearchStreaming: mockIsDeepResearchStreaming,
      deepResearchOwnerConversationId: mockDeepResearchOwnerConversationId,
    }
    return selector(state)
  }),
  useIsCurrentSessionBusy: vi.fn(() => false),
}))

// Mock the layout store
const mockOpenRightPanel = vi.fn()
const mockSetDataSourcePanelTab = vi.fn()

const mockCloseRightPanel = vi.fn()
const mockSetDataSourcesPanelTab = vi.fn()

const mockLayoutState = () => ({
  openRightPanel: mockOpenRightPanel,
  closeRightPanel: mockCloseRightPanel,
  setDataSourcesPanelTab: mockSetDataSourcesPanelTab,
  setDataSourcePanelTab: mockSetDataSourcePanelTab,
  enabledDataSourceIds: ['source-1', 'source-2'],
  knowledgeLayerAvailable: true,
  availableDataSources: [{ id: 'source-1' }, { id: 'source-2' }],
  rightPanel: null as string | null,
})

type MockLayoutState = ReturnType<typeof mockLayoutState>

vi.mock('../store', () => ({
  useLayoutStore: Object.assign(
    vi.fn((selector?: (s: MockLayoutState) => unknown) => {
      const state = mockLayoutState()
      return selector ? selector(state) : state
    }),
    { getState: () => mockLayoutState() }
  ),
}))

// Mock useAppConfig
vi.mock('@/shared/context', () => ({
  useAppConfig: () => ({
    authRequired: true,
    fileUpload: {
      acceptedTypes: '.pdf,.docx,.txt,.md',
      acceptedMimeTypes: ['application/pdf', 'text/plain', 'text/markdown'],
      maxTotalSizeMB: 100,
      maxFileSize: 100 * 1024 * 1024,
      maxTotalSize: 100 * 1024 * 1024,
      maxFileCount: 10,
    },
  }),
}))

// Mock the file upload hooks
const mockUploadFiles = vi.fn()

vi.mock('@/features/documents', () => ({
  useFileUpload: vi.fn(() => ({
    uploadFiles: mockUploadFiles,
    sessionFiles: [],
    isUploading: false,
    error: null,
    clearError: vi.fn(),
  })),
  useFileDragDrop: vi.fn(() => ({
    isDragging: false,
    isUnsupportedDrag: false,
    dragHandlers: {
      onDragEnter: vi.fn(),
      onDragLeave: vi.fn(),
      onDragOver: vi.fn(),
      onDrop: vi.fn(),
    },
  })),
  useFileUploadBanners: vi.fn(),
}))

import { useResearchSubmit, useIsCurrentSessionBusy } from '@/features/chat'
import { useFileUpload, useFileDragDrop } from '@/features/documents'

const setResearchJobMessage = (status: string): void => {
  mockDeepResearchJobId = 'job-1'
  mockConversationMessages = [
    {
      id: 'agent-message-1',
      role: 'assistant',
      content: 'Research job',
      timestamp: new Date('2026-05-04T12:00:00.000Z'),
      messageType: 'agent_response',
      deepResearchJobId: 'job-1',
      deepResearchJobStatus: status,
      showViewReport: status === 'success',
    },
  ]
}

describe('InputArea', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDeepResearchStreaming = false
    mockDeepResearchStatus = null
    mockDeepResearchJobId = null
    mockDeepResearchOwnerConversationId = null
    mockConversationMessages = []
    // Reset mocks to defaults - clearAllMocks doesn't reset mockReturnValue
    vi.mocked(useIsCurrentSessionBusy).mockReturnValue(false)
    vi.mocked(useResearchSubmit).mockReturnValue({
      sendMessage: mockSendMessage,
      isLoading: false,
    } as unknown as ReturnType<typeof useResearchSubmit>)
    vi.mocked(useFileUpload).mockReturnValue({
      uploadFiles: mockUploadFiles,
      sessionFiles: [],
      isUploading: false,
      error: null,
      clearError: vi.fn(),
    } as unknown as ReturnType<typeof useFileUpload>)
    vi.mocked(useFileDragDrop).mockReturnValue({
      isDragging: false,
      isUnsupportedDrag: false,
      dragHandlers: {
        onDragEnter: vi.fn(),
        onDragLeave: vi.fn(),
        onDragOver: vi.fn(),
        onDrop: vi.fn(),
      },
    })
  })

  test('does not render the Auto mode selector button', () => {
    render(<InputArea isAuthenticated={true} />)

    expect(screen.queryByText('Auto')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /query type/i })).not.toBeInTheDocument()
  })

  test('renders text area with default placeholder', () => {
    render(<InputArea isAuthenticated={true} />)

    expect(screen.getByPlaceholderText('Check data sources and ask a research question...')).toBeInTheDocument()
  })

  test('renders prompt status strip from selected job and source state', () => {
    render(<InputArea isAuthenticated={true} />)

    const statusStrip = screen.getByTestId('prompt-status-strip')
    expect(statusStrip).toHaveTextContent('Ready')
    expect(statusStrip).toHaveTextContent('2/2 sources')
    expect(statusStrip).toHaveTextContent('0 files')
  })

  test('renders with custom placeholder', () => {
    render(<InputArea isAuthenticated={true} placeholder="Type your question" />)

    expect(screen.getByPlaceholderText('Type your question')).toBeInTheDocument()
  })

  test('shows sign in placeholder when not authenticated', () => {
    render(<InputArea isAuthenticated={false} />)

    expect(screen.getByPlaceholderText('Sign in to start researching')).toBeInTheDocument()
  })

  test('disables input when not authenticated', () => {
    render(<InputArea isAuthenticated={false} />)

    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  test('disables send button when message is empty', () => {
    render(<InputArea isAuthenticated={true} />)

    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled()
  })

  test('enables send button when message is typed', async () => {
    const user = userEvent.setup()
    render(<InputArea isAuthenticated={true} />)

    const input = screen.getByRole('textbox')
    await user.type(input, 'Hello')

    expect(screen.getByRole('button', { name: /send message/i })).not.toBeDisabled()
  })

  test('calls sendMessage when send button is clicked', async () => {
    const user = userEvent.setup()
    render(<InputArea isAuthenticated={true} />)

    const input = screen.getByRole('textbox')
    await user.type(input, 'Hello world')
    await user.click(screen.getByRole('button', { name: /send message/i }))

    expect(mockSendMessage).toHaveBeenCalledWith('Hello world')
  })

  test('clears input after sending message', async () => {
    const user = userEvent.setup()
    render(<InputArea isAuthenticated={true} />)

    const input = screen.getByRole('textbox')
    await user.type(input, 'Hello world')
    await user.click(screen.getByRole('button', { name: /send message/i }))

    expect(input).toHaveValue('')
  })

  test('sends message on Enter key', async () => {
    const user = userEvent.setup()
    render(<InputArea isAuthenticated={true} />)

    const input = screen.getByRole('textbox')
    await user.type(input, 'Hello world{enter}')

    expect(mockSendMessage).toHaveBeenCalledWith('Hello world')
  })

  test('disables input when session is busy (streaming)', () => {
    // InputArea uses useIsCurrentSessionBusy() for disable logic.
    // When isBusy is true (e.g. streaming), input is disabled with "Please wait..." placeholder.
    vi.mocked(useIsCurrentSessionBusy).mockReturnValue(true)

    render(<InputArea isAuthenticated={true} />)

    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByPlaceholderText('Please wait...')).toBeInTheDocument()
  })

  test('disables input when session is busy (loading)', () => {
    vi.mocked(useIsCurrentSessionBusy).mockReturnValue(true)

    render(<InputArea isAuthenticated={true} />)

    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByPlaceholderText('Please wait...')).toBeInTheDocument()
  })

  test('disables input when deep research is in progress', () => {
    vi.mocked(useIsCurrentSessionBusy).mockReturnValue(true)
    mockIsDeepResearchStreaming = true
    mockDeepResearchStatus = 'submitted'
    mockDeepResearchOwnerConversationId = 'session-1'
    setResearchJobMessage('submitted')
    render(<InputArea isAuthenticated={true} />)

    // Input disabled with "Please wait..." placeholder (isBusy is true)
    expect(screen.getByPlaceholderText('Please wait...')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeDisabled()
    // Send button shows "Research in progress" tooltip via isResearchSessionInProgress
    expect(
      screen.getByRole('button', { name: /research in progress - please wait/i })
    ).toBeInTheDocument()
  })

  test('renders attach files button', () => {
    render(<InputArea isAuthenticated={true} />)

    expect(screen.getByRole('button', { name: /attach files/i })).toBeInTheDocument()
  })

  // Note: Research panel button was moved to ResearchPanel component as a toggle tag

  test('shows file count badge when files are attached', () => {
    vi.mocked(useFileUpload).mockReturnValue({
      uploadFiles: mockUploadFiles,
      sessionFiles: [
        { id: 'file-1', fileName: 'doc.pdf', status: 'success', collectionName: 'session-1' },
        { id: 'file-2', fileName: 'doc2.pdf', status: 'uploading', collectionName: 'session-1' },
      ],
      isUploading: false,
      error: null,
      clearError: vi.fn(),
    } as unknown as ReturnType<typeof useFileUpload>)

    render(<InputArea isAuthenticated={true} />)

    expect(screen.getByText('2')).toBeInTheDocument()
  })

  test('shows upload error when present', () => {
    vi.mocked(useFileUpload).mockReturnValue({
      uploadFiles: mockUploadFiles,
      sessionFiles: [],
      isUploading: false,
      error: 'File too large',
      clearError: vi.fn(),
    } as unknown as ReturnType<typeof useFileUpload>)

    render(<InputArea isAuthenticated={true} />)

    expect(screen.getByText('File too large')).toBeInTheDocument()
  })

  test('shows drag overlay when dragging files', () => {
    vi.mocked(useFileDragDrop).mockReturnValue({
      isDragging: true,
      isUnsupportedDrag: false,
      dragHandlers: {
        onDragEnter: vi.fn(),
        onDragLeave: vi.fn(),
        onDragOver: vi.fn(),
        onDrop: vi.fn(),
      },
    })

    render(<InputArea isAuthenticated={true} />)

    expect(screen.getByText('Drop files to upload')).toBeInTheDocument()
  })

  test('shows error drag overlay for unsupported files', () => {
    vi.mocked(useFileDragDrop).mockReturnValue({
      isDragging: true,
      isUnsupportedDrag: true,
      dragHandlers: {
        onDragEnter: vi.fn(),
        onDragLeave: vi.fn(),
        onDragOver: vi.fn(),
        onDrop: vi.fn(),
      },
    })

    render(<InputArea isAuthenticated={true} />)

    expect(screen.getByText('Unsupported file type')).toBeInTheDocument()
  })

  test('disables input when isBusy is true (session has active operations)', () => {
    vi.mocked(useIsCurrentSessionBusy).mockReturnValue(true)

    render(<InputArea isAuthenticated={true} />)

    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByPlaceholderText('Please wait...')).toBeInTheDocument()
  })

  test('enables input when isBusy returns to false', () => {
    vi.mocked(useIsCurrentSessionBusy).mockReturnValue(false)

    render(<InputArea isAuthenticated={true} />)

    expect(screen.getByRole('textbox')).not.toBeDisabled()
  })

  test('shows research completed placeholder when deep research is done', () => {
    mockDeepResearchStatus = 'success'
    mockIsDeepResearchStreaming = false
    mockDeepResearchOwnerConversationId = 'session-1'
    setResearchJobMessage('success')

    render(<InputArea isAuthenticated={true} />)

    expect(
      screen.getByPlaceholderText('Research completed. Create a new session for further questions.')
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  test('shows research completed tooltip on send button when research is done', () => {
    mockDeepResearchStatus = 'success'
    mockIsDeepResearchStreaming = false
    mockDeepResearchOwnerConversationId = 'session-1'
    setResearchJobMessage('success')

    render(<InputArea isAuthenticated={true} />)

    expect(
      screen.getByRole('button', { name: /research completed - create new session/i })
    ).toBeInTheDocument()
  })

  test('shows research in progress send button when deep research is active and streaming', () => {
    vi.mocked(useIsCurrentSessionBusy).mockReturnValue(true)
    mockIsDeepResearchStreaming = true
    mockDeepResearchStatus = 'running'
    mockDeepResearchOwnerConversationId = 'session-1'
    setResearchJobMessage('running')

    render(<InputArea isAuthenticated={true} />)

    // Input disabled with "Please wait..." placeholder (isBusy is true)
    expect(screen.getByPlaceholderText('Please wait...')).toBeInTheDocument()
    // Send button shows research in progress tooltip
    expect(
      screen.getByRole('button', { name: /research in progress - please wait/i })
    ).toBeInTheDocument()
  })

  test('renders selected running job state in prompt status strip', () => {
    mockIsDeepResearchStreaming = true
    mockDeepResearchStatus = 'running'
    mockDeepResearchOwnerConversationId = 'session-1'
    setResearchJobMessage('running')

    render(<InputArea isAuthenticated={true} />)

    const statusStrip = screen.getByTestId('prompt-status-strip')
    expect(statusStrip).toHaveTextContent('Running')
    expect(statusStrip).toHaveTextContent('Prompt paused')
  })

  test('does not allow sending when session is busy', () => {
    vi.mocked(useIsCurrentSessionBusy).mockReturnValue(true)

    render(<InputArea isAuthenticated={true} />)

    // Input is disabled so typing won't work
    const input = screen.getByRole('textbox')
    expect(input).toBeDisabled()
  })

})
