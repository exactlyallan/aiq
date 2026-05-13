// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from '@/test-utils'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { ResearchPanel } from './ResearchPanel'

const mockCloseRightPanel = vi.fn()
const mockOpenRightPanel = vi.fn()
const mockSetResearchPanelTab = vi.fn()
let mockRightPanel: string | null = 'research'
let mockResearchPanelTab = 'research'

vi.mock('../store', () => ({
  useLayoutStore: vi.fn((selector?: (s: any) => any) => {
    const state = {
      rightPanel: mockRightPanel,
      researchPanelTab: mockResearchPanelTab,
      setResearchPanelTab: mockSetResearchPanelTab,
      closeRightPanel: mockCloseRightPanel,
      openRightPanel: mockOpenRightPanel,
    }
    return selector ? selector(state) : state
  }),
}))

vi.mock('@/adapters/auth', () => ({
  useAuth: vi.fn(() => ({ idToken: 'mock-token' })),
}))

let mockIsDeepResearchStreaming = false
let mockDeepResearchJobId: string | null = null
let mockDeepResearchStreamLoaded = false
let mockReportContent = ''
let mockCurrentConversation: {
  messages: Array<{
    messageType?: string
    deepResearchJobId?: string
    deepResearchJobStatus?: string
    showViewReport?: boolean
    reportContent?: string
  }>
} | null = null
const mockImportJobStream = vi.fn()
const mockLoadReport = vi.fn()

vi.mock('@/features/chat', () => ({
  useChatStore: (
    selector: (state: {
      isDeepResearchStreaming: boolean
      deepResearchJobId: string | null
      deepResearchStreamLoaded: boolean
      reportContent: string
      currentConversation: typeof mockCurrentConversation
    }) => unknown
  ) =>
    selector({
      isDeepResearchStreaming: mockIsDeepResearchStreaming,
      deepResearchJobId: mockDeepResearchJobId,
      deepResearchStreamLoaded: mockDeepResearchStreamLoaded,
      reportContent: mockReportContent,
      currentConversation: mockCurrentConversation,
    }),
  useLoadJobData: () => ({
    loadReport: mockLoadReport,
    importStreamOnly: mockImportJobStream,
    isLoading: false,
  }),
}))

vi.mock('./CitationsTab', () => ({
  CitationsTab: () => <div data-testid="citations-tab">Citations Tab Content</div>,
}))

vi.mock('./ReportTab', () => ({
  ReportTab: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="research-tab">Research Tab Content {children}</div>
  ),
}))

vi.mock('./ArtifactsTab', () => ({
  ArtifactsTab: () => <div data-testid="artifacts-tab">Artifacts Tab Content</div>,
}))

vi.mock('./ThinkingTab', () => ({
  ThinkingTab: () => <div data-testid="thinking-tab">Thinking Tab Content</div>,
}))

vi.mock('./DataSourcesPanel', () => ({
  DataSourcesPanelBody: () => <div data-testid="data-sources-body">Data Sources Body</div>,
}))

describe('ResearchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRightPanel = 'research'
    mockResearchPanelTab = 'research'
    mockIsDeepResearchStreaming = false
    mockDeepResearchJobId = null
    mockDeepResearchStreamLoaded = false
    mockReportContent = ''
    mockCurrentConversation = null
  })

  test('renders persistent right rail navigation', () => {
    render(<ResearchPanel isAuthenticated={true} />)

    expect(screen.getByRole('button', { name: 'Data Sources' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Citations' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Research' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Artifacts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thinking' })).toBeInTheDocument()
  })

  test('anchors the right rail outside the open drawer', () => {
    mockRightPanel = 'research'

    render(<ResearchPanel isAuthenticated={true} />)

    expect(screen.getByTestId('research-panel-rail')).toHaveStyle({ right: '0px' })
  })

  test('resizes the open drawer by dragging the left edge', () => {
    mockRightPanel = 'research'

    render(<ResearchPanel isAuthenticated={true} />)

    const root = screen.getByTestId('research-panel-root')
    const resizeHandle = screen.getByRole('separator', { name: /resize research panel/i })

    expect(root).toHaveStyle({ width: '908px' })

    fireEvent.pointerDown(resizeHandle, { clientX: 500, pointerId: 1 })
    fireEvent.pointerMove(resizeHandle, { clientX: 420, pointerId: 1 })
    fireEvent.pointerUp(resizeHandle, { pointerId: 1 })

    expect(root).toHaveStyle({ width: '988px' })
  })

  test('shows a centered grip marker on the resize border', () => {
    mockRightPanel = 'research'

    render(<ResearchPanel isAuthenticated={true} />)

    expect(screen.getByTestId('research-panel-resize-grip')).toBeInTheDocument()
  })

  test('does not render legacy show research or stop researching controls', () => {
    render(<ResearchPanel isAuthenticated={true} />)

    expect(screen.queryByText('Show Research')).not.toBeInTheDocument()
    expect(screen.queryByTestId('research-panel-stop')).not.toBeInTheDocument()
  })

  test('keeps the right rail visible when no drawer is open', () => {
    mockRightPanel = null

    render(<ResearchPanel isAuthenticated={true} />)

    expect(screen.getByRole('button', { name: 'Data Sources' })).toBeInTheDocument()
    expect(screen.queryByTestId('research-panel-close')).not.toBeInTheDocument()
  })

  test('opens the data sources drawer from the right rail', async () => {
    mockRightPanel = null
    const user = userEvent.setup()

    render(<ResearchPanel isAuthenticated={true} />)

    await user.click(screen.getByRole('button', { name: /data sources/i }))

    expect(mockOpenRightPanel).toHaveBeenCalledWith('data-sources')
  })

  test('opens the research drawer and switches tabs from the right rail', async () => {
    mockRightPanel = null
    const user = userEvent.setup()

    render(<ResearchPanel isAuthenticated={true} />)

    await user.click(screen.getByRole('button', { name: /citations/i }))
    expect(mockSetResearchPanelTab).toHaveBeenCalledWith('citations')
    expect(mockOpenRightPanel).toHaveBeenCalledWith('research')

    await user.click(screen.getByRole('button', { name: /thinking/i }))
    expect(mockSetResearchPanelTab).toHaveBeenCalledWith('thinking')
  })

  test('loads the selected backend report when opening the research tab with no report content', async () => {
    mockRightPanel = null
    mockDeepResearchJobId = 'job-complete'
    mockCurrentConversation = {
      messages: [
        {
          messageType: 'agent_response',
          deepResearchJobId: 'job-complete',
          deepResearchJobStatus: 'success',
          showViewReport: true,
        },
      ],
    }
    const user = userEvent.setup()

    render(<ResearchPanel isAuthenticated={true} />)

    await user.click(screen.getByRole('button', { name: /^research$/i }))

    expect(mockSetResearchPanelTab).toHaveBeenCalledWith('research')
    expect(mockOpenRightPanel).toHaveBeenCalledWith('research')
    expect(mockLoadReport).toHaveBeenCalledWith('job-complete')
  })

  test('does not request a report for an active selected backend job', async () => {
    mockRightPanel = null
    mockDeepResearchJobId = 'job-running'
    mockCurrentConversation = {
      messages: [
        {
          messageType: 'agent_response',
          deepResearchJobId: 'job-running',
          deepResearchJobStatus: 'running',
          showViewReport: false,
        },
      ],
    }
    const user = userEvent.setup()

    render(<ResearchPanel isAuthenticated={true} />)

    await user.click(screen.getByRole('button', { name: /^research$/i }))

    expect(mockLoadReport).not.toHaveBeenCalled()
  })

  test('loads selected backend job state when opening the thinking tab', async () => {
    mockRightPanel = null
    mockDeepResearchJobId = 'job-complete'
    mockDeepResearchStreamLoaded = false
    const user = userEvent.setup()

    render(<ResearchPanel isAuthenticated={true} />)

    await user.click(screen.getByRole('button', { name: /^thinking$/i }))

    expect(mockSetResearchPanelTab).toHaveBeenCalledWith('thinking')
    expect(mockOpenRightPanel).toHaveBeenCalledWith('research')
    expect(mockImportJobStream).toHaveBeenCalledWith('job-complete')
  })

  test('renders the close button only when the drawer is open', async () => {
    const user = userEvent.setup()

    render(<ResearchPanel isAuthenticated={true} />)

    await user.click(screen.getByTestId('research-panel-close'))

    expect(mockCloseRightPanel).toHaveBeenCalled()
  })

  test('renders research content when the research drawer is open', () => {
    mockRightPanel = 'research'
    mockResearchPanelTab = 'research'

    render(<ResearchPanel isAuthenticated={true} />)

    expect(screen.getByTestId('research-tab')).toBeInTheDocument()
  })

  test('renders citations content when the citations section is active', () => {
    mockRightPanel = 'research'
    mockResearchPanelTab = 'citations'

    render(<ResearchPanel isAuthenticated={true} />)

    expect(screen.getByTestId('citations-tab')).toBeInTheDocument()
  })

  test('renders artifacts content when the artifacts section is active', () => {
    mockRightPanel = 'research'
    mockResearchPanelTab = 'artifacts'

    render(<ResearchPanel isAuthenticated={true} />)

    expect(screen.getByTestId('artifacts-tab')).toBeInTheDocument()
  })

  test('renders thinking content when the thinking section is active', () => {
    mockRightPanel = 'research'
    mockResearchPanelTab = 'thinking'

    render(<ResearchPanel isAuthenticated={true} />)

    expect(screen.getByTestId('thinking-tab')).toBeInTheDocument()
  })

  test('renders the data sources body when the data sources drawer is active', () => {
    mockRightPanel = 'data-sources'

    render(<ResearchPanel isAuthenticated={true} />)

    expect(screen.getByTestId('data-sources-body')).toBeInTheDocument()
  })
})
