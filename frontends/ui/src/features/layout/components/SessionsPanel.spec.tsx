// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { render, screen, within } from '@/test-utils'
import { act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { SessionsPanel } from './SessionsPanel'

// Mock the layout store
const mockSetSessionsPanelOpen = vi.fn()

vi.mock('../store', () => ({
  useLayoutStore: vi.fn((selector?: (s: any) => any) => {
    const state = {
      isSessionsPanelOpen: true,
      setSessionsPanelOpen: mockSetSessionsPanelOpen,
    }
    return selector ? selector(state) : state
  }),
}))

// Mock the chat store (no longer uses useIsCurrentSessionBusy for navigation)
vi.mock('@/features/chat', () => ({
  useChatStore: vi.fn(),
}))

vi.mock('@/features/jobs', () => ({
  useResearchJobs: vi.fn(),
  isPollableJobStatus: (status: string) => ['submitted', 'running', 'stale'].includes(status),
  isReportLevelResearchJob: (job: {
    status: string
    input_preview?: string
    collection_name?: string | null
    data_sources: string[]
    has_report: boolean
    report_availability: string
  }) => {
    const hasUiContext = Boolean(
      job.input_preview?.trim() || job.collection_name?.trim() || job.data_sources.length > 0
    )
    if (['submitted', 'running', 'stale'].includes(job.status)) return hasUiContext
    if (job.status === 'success') return job.has_report && job.report_availability === 'available'
    if (job.status === 'interrupted' || job.status === 'failure')
      return hasUiContext || job.has_report
    return false
  },
}))

// Mock the delete confirmation modal
vi.mock('./DeleteSessionConfirmationModal', () => ({
  DeleteSessionConfirmationModal: ({
    open,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean
    onConfirm: () => void
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <div data-testid="delete-modal">
        <button onClick={onConfirm}>Confirm Delete</button>
        <button onClick={() => onOpenChange(false)}>Cancel</button>
      </div>
    ) : null,
}))

import { useLayoutStore } from '../store'
import { useChatStore } from '@/features/chat'
import { useResearchJobs } from '@/features/jobs'
import { researchJobListFixture } from '@/adapters/api/research-job-contract-fixtures'
import type { LayoutStore } from '../types'

/**
 * Helper to create a mock chat store state.
 * Components select individual fields via useChatStore((state) => state.X).
 */
const createMockChatState = (
  overrides: {
    isSessionBusy?: (sessionId: string) => boolean
    hasAnyBusySession?: () => boolean
    isStreaming?: boolean
    pendingInteraction?: { id: string; type: string; content: string } | null
  } = {}
) => ({
  isSessionBusy: overrides.isSessionBusy ?? (() => false),
  hasAnyBusySession: overrides.hasAnyBusySession ?? (() => false),
  isStreaming: overrides.isStreaming ?? false,
  pendingInteraction: overrides.pendingInteraction ?? null,
})

const setupChatStoreMock = (overrides: Parameters<typeof createMockChatState>[0] = {}) => {
  const state = createMockChatState(overrides)
  vi.mocked(useChatStore).mockImplementation((selector: (s: any) => any) => {
    if (typeof selector === 'function') {
      return selector(state)
    }
    return undefined
  })
}

const setupResearchJobsMock = (overrides: Partial<ReturnType<typeof useResearchJobs>> = {}) => {
  vi.mocked(useResearchJobs).mockReturnValue({
    jobs: [],
    isLoading: false,
    error: null,
    refresh: vi.fn(async () => {}),
    hasPollableJobs: false,
    ...overrides,
  })
}

describe('SessionsPanel', () => {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const mockSessions = [
    { id: 'session-1', title: 'First Session', date: today },
    { id: 'session-2', title: 'Second Session', date: yesterday },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    setupChatStoreMock()
    setupResearchJobsMock()

    // Reset mock to default open state
    vi.mocked(useLayoutStore).mockImplementation((selector?: (s: any) => any) => {
      const state = {
        isSessionsPanelOpen: true,
        setSessionsPanelOpen: mockSetSessionsPanelOpen,
      }
      return selector ? selector(state) : state
    })
  })

  test('renders panel with heading', () => {
    render(<SessionsPanel sessions={mockSessions} />)

    expect(screen.getByText('Research Sessions')).toBeInTheDocument()
  })

  test('renders new session button', () => {
    render(<SessionsPanel sessions={mockSessions} />)

    expect(screen.getByText('New Research Session')).toHaveClass('text-primary')
    expect(screen.getAllByRole('button', { name: /^start new session$/i })).toHaveLength(2)
  })

  test('renders session list', () => {
    render(<SessionsPanel sessions={mockSessions} />)

    expect(screen.getByText('First Session')).toBeInTheDocument()
    expect(screen.getByText('Second Session')).toBeInTheDocument()
  })

  test('shows empty state when no sessions', () => {
    render(<SessionsPanel sessions={[]} />)

    expect(screen.getByText('No sessions yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start a new session/i })).toBeInTheDocument()
  })

  test('calls onNewSession from both new session entry points', async () => {
    const user = userEvent.setup()
    const onNewSession = vi.fn()

    render(<SessionsPanel sessions={mockSessions} onNewSession={onNewSession} />)

    const newSessionButtons = screen.getAllByRole('button', { name: /^start new session$/i })
    await user.click(newSessionButtons[0])
    await user.click(newSessionButtons[1])

    expect(onNewSession).toHaveBeenCalledTimes(2)
    expect(mockSetSessionsPanelOpen).not.toHaveBeenCalledWith(false)
  })

  test('calls onSelectSession when session clicked', async () => {
    const user = userEvent.setup()
    const onSelectSession = vi.fn()

    render(<SessionsPanel sessions={mockSessions} onSelectSession={onSelectSession} />)

    await user.click(screen.getByRole('button', { name: /^session: first session$/i }))

    expect(onSelectSession).toHaveBeenCalledWith('session-1')
    expect(mockSetSessionsPanelOpen).not.toHaveBeenCalledWith(false)
  })

  test('renders backend jobs ahead of local sessions', () => {
    setupResearchJobsMock({ jobs: researchJobListFixture.jobs.slice(0, 2) })

    render(<SessionsPanel sessions={mockSessions} />)

    expect(screen.getByText('Running job')).toBeInTheDocument()
    expect(screen.getByText('Completed job')).toBeInTheDocument()
    expect(screen.getByText('Thinking...')).toBeInTheDocument()
    expect(screen.getByText('Research completed')).toBeInTheDocument()
    expect(screen.queryByText('1 sources')).not.toBeInTheDocument()
    expect(screen.queryByText('2 sources')).not.toBeInTheDocument()
  })

  test('groups sessions by new, recent, and expires soon age buckets', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T12:00:00Z'))
    try {
      render(
        <SessionsPanel
          sessions={[
            {
              id: 'session-new',
              title: 'Fresh Session',
              date: '2026-05-05T10:30:00Z',
            },
            {
              id: 'session-recent',
              title: 'Older Session',
              date: '2026-05-05T05:30:00Z',
            },
            {
              id: 'session-expiring',
              title: 'Expiring Report',
              date: '2026-05-05T06:00:00Z',
              expiresAt: '2026-05-05T15:00:00Z',
              source: 'backend_job',
            },
          ]}
        />
      )

      expect(
        within(screen.getByText('New').parentElement as HTMLElement).getByText('Fresh Session')
      ).toBeInTheDocument()
      expect(
        within(screen.getByText('Recent').parentElement as HTMLElement).getByText('Older Session')
      ).toBeInTheDocument()
      expect(
        within(screen.getByText('Expires Soon').parentElement as HTMLElement).getByText(
          'Expiring Report'
        )
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  test('shows only the backend job state text in session rows', () => {
    setupResearchJobsMock({ jobs: [researchJobListFixture.jobs[1]] })

    render(<SessionsPanel sessions={[]} />)

    expect(screen.getByText('Research completed')).toBeInTheDocument()
    expect(screen.queryByText('Complete')).not.toBeInTheDocument()
    expect(screen.queryByText('Report')).not.toBeInTheDocument()
    expect(screen.queryByText('2 sources')).not.toBeInTheDocument()
  })

  test('filters backend implementation jobs while keeping local interaction sessions', () => {
    setupResearchJobsMock({
      jobs: [
        {
          ...researchJobListFixture.jobs[0],
          job_id: 'internal-sub-agent',
          input_preview: undefined,
          collection_name: null,
          data_sources: [],
          has_report: false,
          report_availability: 'unavailable',
        },
        researchJobListFixture.jobs[1],
      ],
    })

    render(<SessionsPanel sessions={mockSessions} />)

    expect(screen.queryByText(/Research job internal-sub-agent/i)).not.toBeInTheDocument()
    expect(screen.getByText('Completed job')).toBeInTheDocument()
    expect(screen.getByText('First Session')).toBeInTheDocument()
    expect(screen.getByText('Second Session')).toBeInTheDocument()
  })

  test('merges backend report jobs into the owning local interaction session', () => {
    setupResearchJobsMock({ jobs: [researchJobListFixture.jobs[0]] })

    render(
      <SessionsPanel
        sessions={[
          {
            id: 'session-1',
            title: 'Local report session',
            date: today,
            linkedJobId: 'job_running_1',
            hasActiveDeepResearch: true,
          },
        ]}
      />
    )

    expect(screen.getByText('Local report session')).toBeInTheDocument()
    expect(screen.getByText('Thinking...')).toBeInTheDocument()
    expect(screen.queryByText('1 sources')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /job: running job/i })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^session: local report session, thinking\.\.\.$/i })
    ).toBeInTheDocument()
  })

  test('selects backend jobs through onSelectJob', async () => {
    setupResearchJobsMock({ jobs: [researchJobListFixture.jobs[0]] })
    const user = userEvent.setup()
    const onSelectJob = vi.fn()
    const onSelectSession = vi.fn()

    render(
      <SessionsPanel
        sessions={mockSessions}
        onSelectJob={onSelectJob}
        onSelectSession={onSelectSession}
      />
    )

    await user.click(screen.getByRole('button', { name: /job: running job, thinking/i }))

    expect(onSelectJob).toHaveBeenCalledWith(researchJobListFixture.jobs[0])
    expect(onSelectSession).not.toHaveBeenCalled()
  })

  test('does not show rename or delete actions for backend jobs', async () => {
    setupResearchJobsMock({ jobs: [researchJobListFixture.jobs[0]] })
    const user = userEvent.setup()

    render(<SessionsPanel sessions={[]} />)

    await user.hover(screen.getByRole('button', { name: /job: running job, thinking/i }))

    expect(screen.queryByRole('button', { name: /rename session/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete session/i })).not.toBeInTheDocument()
  })

  test('highlights selected session', () => {
    render(<SessionsPanel sessions={mockSessions} selectedSessionId="session-1" />)

    const firstSession = screen.getByRole('button', { name: /^session: first session$/i })
    expect(firstSession).toHaveClass('bg-surface-raised')
    expect(screen.getByText('First Session')).toHaveClass('text-primary')
    expect(screen.getByText('Second Session')).toHaveClass('text-subtle')
  })

  test('uses matched heights for session detail rows and compact rail icons', () => {
    render(<SessionsPanel sessions={mockSessions} selectedSessionId="session-1" />)

    expect(screen.getByRole('button', { name: /^session: first session$/i })).toHaveClass('h-16')
    expect(
      screen.getByRole('button', { name: /^select session from icon rail: first session$/i })
    ).toHaveClass('h-16')
  })

  test('shows edit and delete actions for local sessions', async () => {
    const user = userEvent.setup()
    render(<SessionsPanel sessions={mockSessions} />)

    const sessionItem = screen.getByRole('button', { name: /^session: first session$/i })
    await user.hover(sessionItem)

    expect(
      screen.getByRole('button', { name: /rename session: first session/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /delete session: first session/i })
    ).toBeInTheDocument()
  })

  test('uses neutral gray trash icons for session delete actions', async () => {
    const user = userEvent.setup()
    render(<SessionsPanel sessions={mockSessions} />)

    await user.hover(screen.getByRole('button', { name: /^session: first session$/i }))

    expect(screen.getByTestId('delete-all-sessions-icon')).toHaveClass('text-subtle')
    expect(screen.getByTestId('delete-session-icon-session-1')).toHaveClass('text-subtle')
  })

  test('renders footer text', () => {
    render(<SessionsPanel sessions={mockSessions} />)

    const footerText = screen.getByText(/Completed research is saved until expiration/i)
    expect(footerText).toBeInTheDocument()
    expect(footerText.parentElement).toHaveClass('pb-4')
  })

  test('uses semantic colors for session state text', () => {
    setupResearchJobsMock({
      jobs: [
        researchJobListFixture.jobs[0],
        researchJobListFixture.jobs[1],
        {
          ...researchJobListFixture.jobs[1],
          job_id: 'job_failed_1',
          status: 'failure',
          input_preview: 'Failed job',
          has_report: false,
          report_availability: 'error',
          error: 'Failed',
        },
      ],
    })

    render(<SessionsPanel sessions={mockSessions} />)

    expect(screen.getByText('Thinking...')).toHaveClass('text-success')
    expect(screen.getByText('Research completed')).toHaveClass('text-success')
    expect(screen.getByText('Error')).toHaveClass('text-error')
    expect(screen.getAllByText('Temporary chat session')[0]).toHaveClass('text-subtle')
  })

  test('renders compact rail when panel is closed', async () => {
    vi.mocked(useLayoutStore).mockImplementation((selector?: (s: any) => any) => {
      const state = {
        isSessionsPanelOpen: false,
        setSessionsPanelOpen: mockSetSessionsPanelOpen,
      }
      return selector ? selector(state) : state
    })

    render(<SessionsPanel sessions={mockSessions} />)

    expect(screen.getByTestId('sessions-panel')).toHaveAttribute('data-state', 'compact')
    expect(screen.queryByText('Research Sessions')).not.toBeInTheDocument()
    expect(screen.queryByText('First Session')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /expand research sessions panel/i })
    ).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /expand research sessions panel/i }))
    expect(mockSetSessionsPanelOpen).toHaveBeenCalledWith(true)
  })

  test('does not render the old compact-only divider', () => {
    vi.mocked(useLayoutStore).mockImplementation((selector?: (s: any) => any) => {
      const state = {
        isSessionsPanelOpen: false,
        setSessionsPanelOpen: mockSetSessionsPanelOpen,
      }
      return selector ? selector(state) : state
    })

    render(<SessionsPanel sessions={mockSessions} />)

    expect(screen.queryByTestId('sessions-panel-header-divider')).not.toBeInTheDocument()
  })

  test('keeps the expanded panel mounted while the close animation runs', () => {
    vi.useFakeTimers()
    let isPanelOpen = true

    try {
      vi.mocked(useLayoutStore).mockImplementation((selector: (s: LayoutStore) => unknown) => {
        const state: LayoutStore = {
          isSessionsPanelOpen: isPanelOpen,
          rightPanel: null,
          researchPanelTab: 'research',
          dataSourcesPanelTab: 'connections',
          enabledDataSourceIds: [],
          theme: 'system',
          availableDataSources: null,
          knowledgeLayerAvailable: false,
          dataSourcesLoading: false,
          dataSourcesError: null,
          detailsPanelTab: 'research',
          dataSourcePanelTab: 'connections',
          toggleSessionsPanel: vi.fn(),
          setSessionsPanelOpen: mockSetSessionsPanelOpen,
          openRightPanel: vi.fn(),
          closeRightPanel: vi.fn(),
          setResearchPanelTab: vi.fn(),
          setDataSourcesPanelTab: vi.fn(),
          toggleDataSource: vi.fn(),
          setEnabledDataSources: vi.fn(),
          setTheme: vi.fn(),
          fetchDataSources: vi.fn(async () => {}),
          disableAuthRequiredSources: vi.fn(),
          setAvailableDataSources: vi.fn(),
          setKnowledgeLayerAvailable: vi.fn(),
          setDetailsPanelTab: vi.fn(),
          setDataSourcePanelTab: vi.fn(),
        }
        return selector(state)
      })

      const { rerender } = render(<SessionsPanel sessions={mockSessions} />)

      expect(screen.getByText('Research Sessions')).toBeInTheDocument()

      isPanelOpen = false
      rerender(<SessionsPanel sessions={[...mockSessions]} />)

      expect(screen.getByText('Research Sessions')).toBeInTheDocument()
      const railWhileClosing = screen.getByRole('button', {
        name: /expand research sessions panel/i,
      }).parentElement?.parentElement
      expect(railWhileClosing).not.toHaveClass('border-r')

      act(() => {
        vi.advanceTimersByTime(300)
      })

      expect(screen.queryByText('Research Sessions')).not.toBeInTheDocument()
      const compactRail = screen.getByRole('button', {
        name: /expand research sessions panel/i,
      }).parentElement?.parentElement
      expect(compactRail).toHaveClass('border-r')
    } finally {
      vi.useRealTimers()
    }
  })

  test('uses a spinning active research icon for running sessions', () => {
    setupResearchJobsMock({ jobs: [researchJobListFixture.jobs[0]] })

    render(<SessionsPanel sessions={[]} />)

    const iconRail = screen.getByTestId('sessions-panel-session-icon-rail')
    const activeIcon = iconRail.querySelector('svg[data-src$="/fill/circle-3-q.svg"]')

    expect(activeIcon).toBeInTheDocument()
    expect(activeIcon).toHaveClass('animate-spin')
    expect(activeIcon?.parentElement).toHaveClass('text-success')
  })
})

describe('SessionsPanel - Session Switching', () => {
  const mockSessions = [
    { id: 'session-1', title: 'Deep Research Session', date: new Date() },
    { id: 'session-2', title: 'Idle Session', date: new Date() },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    setupChatStoreMock()
    setupResearchJobsMock()
    vi.mocked(useLayoutStore).mockImplementation((selector?: (s: any) => any) => {
      const state = {
        isSessionsPanelOpen: true,
        setSessionsPanelOpen: mockSetSessionsPanelOpen,
      }
      return selector ? selector(state) : state
    })
  })

  test('allows switching sessions during active deep research (server-side polling)', async () => {
    // Deep research is running but no shallow submit is active, so navigation is allowed.
    setupChatStoreMock({
      isSessionBusy: (sessionId: string) => sessionId === 'session-1',
      hasAnyBusySession: () => true,
      isStreaming: false,
      pendingInteraction: null,
    })

    const user = userEvent.setup()
    const onSelectSession = vi.fn()
    render(
      <SessionsPanel
        sessions={mockSessions}
        selectedSessionId="session-2"
        onSelectSession={onSelectSession}
      />
    )

    // Deep research session should be clickable (not visually disabled)
    const deepResearchSession = screen.getByRole('button', {
      name: /^session: deep research session, thinking\.\.\.$/i,
    })
    expect(deepResearchSession).not.toHaveClass('cursor-not-allowed')
    expect(deepResearchSession).toHaveAttribute('aria-disabled', 'false')

    await user.click(deepResearchSession)
    expect(onSelectSession).toHaveBeenCalledWith('session-1')
  })

  test('blocks switching when shallow submit/response work is active', async () => {
    setupChatStoreMock({
      isStreaming: true,
      pendingInteraction: null,
    })

    const user = userEvent.setup()
    const onSelectSession = vi.fn()
    render(
      <SessionsPanel
        sessions={mockSessions}
        selectedSessionId="session-1"
        onSelectSession={onSelectSession}
      />
    )

    // All sessions should be visually disabled
    const session2 = screen.getByRole('button', {
      name: /^session: idle session \(processing in progress\)$/i,
    })
    expect(session2).toHaveClass('cursor-not-allowed')
    expect(session2).toHaveAttribute('aria-disabled', 'true')

    await user.click(session2)
    expect(onSelectSession).not.toHaveBeenCalled()
  })

  test('allows switching between sessions when nothing is active', async () => {
    setupChatStoreMock({
      isStreaming: false,
      pendingInteraction: null,
    })

    const user = userEvent.setup()
    const onSelectSession = vi.fn()
    render(
      <SessionsPanel
        sessions={mockSessions}
        selectedSessionId="session-1"
        onSelectSession={onSelectSession}
      />
    )

    const session2 = screen.getByRole('button', { name: /^session: idle session$/i })
    expect(session2).not.toHaveClass('cursor-not-allowed')

    await user.click(session2)
    expect(onSelectSession).toHaveBeenCalledWith('session-2')
  })
})

describe('SessionsPanel - New Session Button', () => {
  const mockSessions = [{ id: 'session-1', title: 'First Session', date: new Date() }]

  beforeEach(() => {
    vi.clearAllMocks()
    setupChatStoreMock()
    setupResearchJobsMock()
    vi.mocked(useLayoutStore).mockImplementation((selector?: (s: any) => any) => {
      const state = {
        isSessionsPanelOpen: true,
        setSessionsPanelOpen: mockSetSessionsPanelOpen,
      }
      return selector ? selector(state) : state
    })
  })

  test('disables new session button when shallow streaming is active', () => {
    setupChatStoreMock({ isStreaming: true })

    render(<SessionsPanel sessions={mockSessions} />)

    const newSessionButtons = screen.getAllByRole('button', {
      name: /start new session \(disabled during active operations\)/i,
    })
    expect(newSessionButtons).toHaveLength(2)
    newSessionButtons.forEach((button) => expect(button).toBeDisabled())
  })

  test('enables new session button during active deep research (server-side)', () => {
    setupChatStoreMock({
      isSessionBusy: (sessionId: string) => sessionId === 'session-1',
      hasAnyBusySession: () => true,
      isStreaming: false,
      pendingInteraction: null,
    })

    render(<SessionsPanel sessions={mockSessions} />)

    // Deep research does NOT block navigation — new session should be enabled
    const newSessionButtons = screen.getAllByRole('button', { name: /^start new session$/i })
    expect(newSessionButtons).toHaveLength(2)
    newSessionButtons.forEach((button) => expect(button).not.toBeDisabled())
  })

  test('enables new session button when no active operations', () => {
    setupChatStoreMock({ isStreaming: false, pendingInteraction: null })

    render(<SessionsPanel sessions={mockSessions} />)

    const newSessionButtons = screen.getAllByRole('button', { name: /^start new session$/i })
    expect(newSessionButtons).toHaveLength(2)
    newSessionButtons.forEach((button) => expect(button).not.toBeDisabled())
  })
})

describe('SessionsPanel - Delete Button States', () => {
  const mockSessions = [
    { id: 'session-1', title: 'First Session', date: new Date() },
    { id: 'session-2', title: 'Second Session', date: new Date() },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    setupChatStoreMock()
    setupResearchJobsMock()
    vi.mocked(useLayoutStore).mockImplementation((selector?: (s: any) => any) => {
      const state = {
        isSessionsPanelOpen: true,
        setSessionsPanelOpen: mockSetSessionsPanelOpen,
      }
      return selector ? selector(state) : state
    })
  })

  test('disables individual delete button when session has active deep research', async () => {
    // Session-1 has active deep research (per-session busy)
    setupChatStoreMock({
      isSessionBusy: (sessionId: string) => sessionId === 'session-1',
      hasAnyBusySession: () => true,
      isStreaming: false,
      pendingInteraction: null,
    })

    const user = userEvent.setup()
    render(<SessionsPanel sessions={mockSessions} />)

    // Hover over first session to show action buttons
    const firstSession = screen.getByRole('button', {
      name: /^session: first session, thinking\.\.\.$/i,
    })
    await user.hover(firstSession)

    // Delete button for session with active deep research should be disabled
    const deleteButton = screen.getByRole('button', {
      name: /delete session: first session \(disabled\)/i,
    })
    expect(deleteButton).toBeDisabled()
  })

  test('disables individual delete button when shallow streaming is active (global block)', async () => {
    setupChatStoreMock({ isStreaming: true })

    const user = userEvent.setup()
    render(<SessionsPanel sessions={mockSessions} />)

    // With streaming active, session buttons have aria-disabled and show
    // "(processing in progress)" in their aria-label
    const firstSession = screen.getByRole('button', {
      name: /^session: first session \(processing in progress\)$/i,
    })
    await user.hover(firstSession)

    // Delete button should be disabled due to global streaming
    const deleteButton = screen.getByRole('button', {
      name: /delete session: first session \(disabled\)/i,
    })
    expect(deleteButton).toBeDisabled()
  })

  test('enables delete button when session is idle and no global block', async () => {
    setupChatStoreMock({
      isSessionBusy: () => false,
      hasAnyBusySession: () => false,
      isStreaming: false,
      pendingInteraction: null,
    })

    const user = userEvent.setup()
    render(<SessionsPanel sessions={mockSessions} />)

    // Hover over first session
    const firstSession = screen.getByRole('button', { name: /^session: first session$/i })
    await user.hover(firstSession)

    // Delete button should be enabled
    const deleteButton = screen.getByRole('button', { name: /^delete session: first session$/i })
    expect(deleteButton).not.toBeDisabled()
  })

  test('disables "Delete All" button when any session is busy', () => {
    setupChatStoreMock({
      isSessionBusy: () => false,
      hasAnyBusySession: () => true,
      isStreaming: false,
      pendingInteraction: null,
    })

    render(<SessionsPanel sessions={mockSessions} />)

    const deleteAllButton = screen.getByRole('button', {
      name: /delete all sessions \(disabled\)/i,
    })
    expect(deleteAllButton).toBeDisabled()
  })

  test('enables "Delete All" button when no sessions are busy', () => {
    setupChatStoreMock({
      isSessionBusy: () => false,
      hasAnyBusySession: () => false,
      isStreaming: false,
      pendingInteraction: null,
    })

    render(<SessionsPanel sessions={mockSessions} />)

    const deleteAllButton = screen.getByRole('button', { name: /^delete all sessions$/i })
    expect(deleteAllButton).not.toBeDisabled()
  })

  test('has appropriate title attribute on disabled delete button for active session', async () => {
    setupChatStoreMock({
      isSessionBusy: (sessionId: string) => sessionId === 'session-1',
      hasAnyBusySession: () => true,
      isStreaming: false,
      pendingInteraction: null,
    })

    const user = userEvent.setup()
    render(<SessionsPanel sessions={mockSessions} />)

    // Hover over session to show buttons
    const firstSession = screen.getByRole('button', {
      name: /^session: first session, thinking\.\.\.$/i,
    })
    await user.hover(firstSession)

    // Check that delete button has appropriate title attribute
    const deleteButton = screen.getByRole('button', {
      name: /delete session: first session \(disabled\)/i,
    })
    expect(deleteButton).toHaveAttribute('title', 'Cannot delete while operations are in progress')
  })
})
