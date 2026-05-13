// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * SessionsPanel Component
 *
 * Left rail displaying research session history.
 * Collapses to a one-icon-wide rail and expands in place for full session management.
 */

'use client'

import {
  type FC,
  type KeyboardEvent,
  memo,
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
} from 'react'
import { Flex, Text, Button } from '@/adapters/ui'
import { useShallow } from 'zustand/react/shallow'
import {
  Chat,
  ChevronLeft,
  Circle3Q,
  DocumentCheckmark,
  Edit,
  Menu,
  Plus,
  Trash,
  Warning,
  LoadingSpinner,
} from '@/adapters/ui/icons'
import { useLayoutStore } from '../store'
import { useChatStore } from '@/features/chat'
import { isPollableJobStatus, isReportLevelResearchJob, useResearchJobs } from '@/features/jobs'
import type {
  ResearchJobListItem,
  ResearchJobStatus,
  ResearchReportAvailability,
} from '@/adapters/api'
import { DeleteSessionConfirmationModal } from './DeleteSessionConfirmationModal'
import { DeleteAllSessionsConfirmationModal } from './DeleteAllSessionsConfirmationModal'

interface Session {
  id: string
  title: string
  date: Date | string
  hasActiveDeepResearch?: boolean
  linkedJobId?: string | null
  source?: 'local' | 'backend_job'
  job?: ResearchJobListItem
  status?: ResearchJobStatus
  reportAvailability?: ResearchReportAvailability
  expiresAt?: Date | string | null
  dataSourceCount?: number
  collectionName?: string | null
  error?: string | null
}

interface SessionsPanelProps {
  /** List of sessions to display */
  sessions?: Session[]
  /** Currently selected session ID */
  selectedSessionId?: string
  /** Callback when a session is selected */
  onSelectSession?: (sessionId: string) => void
  /** Callback when a backend job is selected */
  onSelectJob?: (job: ResearchJobListItem) => void
  /** Callback when new session is clicked */
  onNewSession?: () => void
  /** Callback when a session is deleted */
  onDeleteSession?: (sessionId: string) => void
  /** Callback when all sessions are deleted */
  onDeleteAllSessions?: () => void
  /** Callback when a session is renamed */
  onRenameSession?: (sessionId: string, newTitle: string) => void
}

type SessionAgeGroup = 'new' | 'recent' | 'expires_soon'

const COMPACT_RAIL_WIDTH_PX = 72
const EXPANDED_PANEL_WIDTH_PX = 384
const SESSION_PANEL_HEADER_HEIGHT_PX = 58
const SESSION_PANEL_NEW_ROW_HEIGHT_PX = 48
const SESSION_PANEL_TRANSITION_MS = 300

const SESSION_AGE_GROUP_ORDER: SessionAgeGroup[] = ['new', 'recent', 'expires_soon']

const SESSION_AGE_GROUP_LABELS: Record<SessionAgeGroup, string> = {
  new: 'New',
  recent: 'Recent',
  expires_soon: 'Expires Soon',
}

/**
 * Sessions panel with compact and expanded rail modes.
 */
export const SessionsPanel: FC<SessionsPanelProps> = memo(function SessionsPanel({
  sessions = [],
  selectedSessionId,
  onSelectSession,
  onSelectJob,
  onNewSession,
  onDeleteSession,
  onDeleteAllSessions,
  onRenameSession,
}) {
  const isSessionsPanelOpen = useLayoutStore((s) => s.isSessionsPanelOpen)
  const setSessionsPanelOpen = useLayoutStore((s) => s.setSessionsPanelOpen)
  const [shouldRenderExpandedPanel, setShouldRenderExpandedPanel] = useState(isSessionsPanelOpen)

  const isSessionBusy = useChatStore((s) => s.isSessionBusy)
  const anySessionBusy = useChatStore((s) => s.hasAnyBusySession())
  // Navigation-specific busy check: active shallow submit/response work blocks switching.
  // Deep research runs server-side and can be reconnected, so it should not prevent navigation.
  const { isStreaming } = useChatStore(
    useShallow((s) => ({
      isStreaming: s.isStreaming,
    }))
  )
  const isNavigationBlocked = isStreaming
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteAllModalOpen, setDeleteAllModalOpen] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null)
  const {
    jobs,
    isLoading: isLoadingJobs,
    error: jobsError,
    refresh: refreshJobs,
  } = useResearchJobs({ enabled: true })

  useEffect(() => {
    if (isSessionsPanelOpen) {
      setShouldRenderExpandedPanel(true)
      return
    }

    const timer = window.setTimeout(() => {
      setShouldRenderExpandedPanel(false)
    }, SESSION_PANEL_TRANSITION_MS)

    return () => window.clearTimeout(timer)
  }, [isSessionsPanelOpen])

  const backendSessions = useMemo(
    () => jobs.filter(isReportLevelResearchJob).map(researchJobToSession),
    [jobs]
  )
  const displaySessions = useMemo(() => {
    const backendByJobId = new Map(backendSessions.map((session) => [session.id, session]))
    const localSessions = sessions.map((session): Session => {
      const linkedBackendSession = session.linkedJobId
        ? backendByJobId.get(session.linkedJobId)
        : undefined

      return {
        ...session,
        date: parseSessionDate(session.date),
        source: session.source ?? 'local',
        hasActiveDeepResearch:
          session.hasActiveDeepResearch || linkedBackendSession?.hasActiveDeepResearch,
        job: linkedBackendSession?.job ?? session.job,
        status: linkedBackendSession?.status ?? session.status,
        reportAvailability: linkedBackendSession?.reportAvailability ?? session.reportAvailability,
        expiresAt: linkedBackendSession?.expiresAt ?? parseOptionalSessionDate(session.expiresAt),
        dataSourceCount: linkedBackendSession?.dataSourceCount ?? session.dataSourceCount,
        collectionName: linkedBackendSession?.collectionName ?? session.collectionName,
        error: linkedBackendSession?.error ?? session.error,
      }
    })

    const localSessionIds = new Set(localSessions.map((session) => session.id))
    const linkedLocalJobIds = new Set(
      localSessions
        .map((session) => session.linkedJobId)
        .filter((jobId): jobId is string => Boolean(jobId))
    )
    const remainingBackendSessions = backendSessions.filter(
      (session) => !localSessionIds.has(session.id) && !linkedLocalJobIds.has(session.id)
    )

    return remainingBackendSessions.length > 0
      ? [...remainingBackendSessions, ...localSessions]
      : localSessions
  }, [backendSessions, sessions])
  const groupedDisplaySessions = useMemo(
    () => groupSessionsByAge(displaySessions),
    [displaySessions]
  )
  const hasBackendSessions = displaySessions.some((session) => session.source === 'backend_job')
  const deleteAllDisabled = anySessionBusy || hasBackendSessions
  const deleteAllTitle = hasBackendSessions
    ? 'Backend jobs cannot be deleted from this panel yet'
    : anySessionBusy
      ? 'Cannot delete while operations are in progress'
      : 'Delete all sessions'

  const handleDeleteClick = useCallback((sessionId: string) => {
    setSessionToDelete(sessionId)
    setDeleteModalOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (sessionToDelete) {
      onDeleteSession?.(sessionToDelete)
      setSessionToDelete(null)
    }
  }, [sessionToDelete, onDeleteSession])

  const handleDeleteAllClick = useCallback(() => {
    setDeleteAllModalOpen(true)
  }, [])

  const handleConfirmDeleteAll = useCallback(() => {
    onDeleteAllSessions?.()
  }, [onDeleteAllSessions])

  const handleClose = useCallback(() => {
    setSessionsPanelOpen(false)
  }, [setSessionsPanelOpen])

  const handleExpand = useCallback(() => {
    setSessionsPanelOpen(true)
  }, [setSessionsPanelOpen])

  const handleNewSession = useCallback(() => {
    onNewSession?.()
  }, [onNewSession])

  const handleSessionClick = useCallback(
    (session: Session) => {
      if (session.source === 'backend_job' && session.job) {
        onSelectJob?.(session.job)
      } else {
        onSelectSession?.(session.id)
      }
    },
    [onSelectJob, onSelectSession]
  )

  return (
    <aside
      className="relative z-30 h-full shrink-0"
      style={{ width: `${COMPACT_RAIL_WIDTH_PX}px` }}
      aria-label="Research sessions"
      data-testid="sessions-panel"
      data-state={isSessionsPanelOpen ? 'expanded' : 'compact'}
    >
      <div
        className="absolute bottom-0 left-[72px] top-0 z-20 overflow-hidden transition-[width] duration-300 ease-in-out"
        style={{
          width: isSessionsPanelOpen
            ? `${EXPANDED_PANEL_WIDTH_PX - COMPACT_RAIL_WIDTH_PX}px`
            : '0px',
        }}
        aria-hidden={!isSessionsPanelOpen}
      >
        {shouldRenderExpandedPanel && (
          <div className="border-base bg-surface-base h-full w-[312px] border-r">
            <Flex direction="col" className="h-full min-w-0">
              <Flex
                align="center"
                className="border-base shrink-0 border-b pl-0 pr-4"
                style={{ height: `${SESSION_PANEL_HEADER_HEIGHT_PX}px` }}
                data-testid="sessions-panel-header"
              >
                <Text kind="label/semibold/lg" className="text-primary truncate">
                  Research Sessions
                </Text>
              </Flex>

              <Flex
                align="center"
                gap="2"
                className="shrink-0 pl-0 pr-4"
                style={{ height: `${SESSION_PANEL_NEW_ROW_HEIGHT_PX}px` }}
                data-testid="sessions-panel-new-session-row"
              >
                <Flex align="center" className="min-w-0 flex-1 px-0.5">
                  <Text kind="body/regular/md" className="text-primary truncate">
                    New Research Session
                  </Text>
                </Flex>
                <Button
                  kind="tertiary"
                  size="small"
                  color="danger"
                  onClick={handleDeleteAllClick}
                  disabled={deleteAllDisabled}
                  aria-label={
                    deleteAllDisabled ? 'Delete all sessions (disabled)' : 'Delete all sessions'
                  }
                  title={deleteAllTitle}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </Flex>

              <Flex direction="col" className="min-h-0 flex-1 overflow-y-auto pl-0 pr-3 pt-1">
                {jobsError && (
                  <Flex
                    direction="col"
                    gap="2"
                    className="border-base bg-surface-raised-50 mb-4 rounded-md border p-3"
                  >
                    <Text kind="body/regular/sm" className="text-primary">
                      Job list unavailable
                    </Text>
                    <Text kind="body/regular/xs" className="text-subtle">
                      {jobsError.message}
                    </Text>
                    <Button kind="secondary" size="small" onClick={() => void refreshJobs()}>
                      Retry
                    </Button>
                  </Flex>
                )}

                {isLoadingJobs && displaySessions.length === 0 && (
                  <Flex direction="col" align="center" justify="center" className="flex-1 py-8">
                    <LoadingSpinner className="text-accent-primary" aria-label="Loading jobs" />
                    <Text kind="body/regular/sm" className="text-subtle mt-2">
                      Loading jobs...
                    </Text>
                  </Flex>
                )}

                {SESSION_AGE_GROUP_ORDER.map((group) => {
                  const sessionsInGroup = groupedDisplaySessions[group]
                  if (sessionsInGroup.length === 0) {
                    return null
                  }

                  return (
                    <Flex key={group} direction="col" className="mb-4">
                      <Text kind="label/semibold/xs" className="text-subtle mb-2 uppercase">
                        {SESSION_AGE_GROUP_LABELS[group]}
                      </Text>
                      {sessionsInGroup.map((session) => (
                        <SessionItem
                          key={session.id}
                          session={session}
                          isSelected={selectedSessionId === session.id}
                          isBusy={isNavigationBlocked}
                          isSessionActive={isSessionBusy(session.id)}
                          onSelect={handleSessionClick}
                          onDelete={handleDeleteClick}
                          onRename={onRenameSession}
                        />
                      ))}
                    </Flex>
                  )
                })}

                {!isLoadingJobs && displaySessions.length === 0 && (
                  <Flex direction="col" align="center" justify="center" className="flex-1 py-8">
                    <Text kind="body/regular/sm" className="text-subtle">
                      No sessions yet
                    </Text>
                    <Button
                      kind="secondary"
                      size="small"
                      onClick={handleNewSession}
                      className="mt-4"
                    >
                      Start a new session
                    </Button>
                  </Flex>
                )}
              </Flex>

              <Flex direction="col" gap="1" className="border-base mt-4 border-t pl-0 pr-4 pt-3">
                <Text kind="body/regular/xs" className="text-subtle">
                  Note: Completed research is saved until expiration, but chat sessions are lost after the browser is closed.
                </Text>
              </Flex>
            </Flex>
          </div>
        )}
      </div>

      <Flex
        align="center"
        direction="col"
        className={`border-base bg-surface-base relative z-30 h-full w-[72px] shrink-0 px-3 py-4 ${
          isSessionsPanelOpen ? '' : 'border-r'
        }`}
      >
        <Button
          kind="tertiary"
          size="small"
          onClick={isSessionsPanelOpen ? handleClose : handleExpand}
          aria-label={
            isSessionsPanelOpen
              ? 'Collapse research sessions panel'
              : 'Expand research sessions panel'
          }
          title={
            isSessionsPanelOpen
              ? 'Collapse research sessions panel'
              : 'Expand research sessions panel'
          }
          className="h-9 w-9 shrink-0"
        >
          {isSessionsPanelOpen ? <ChevronLeft className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <div
          className="border-base mb-[5px] mt-[6px] h-px w-9 shrink-0 border-t"
          data-testid="sessions-panel-header-divider"
        />
        <Button
          kind="tertiary"
          size="small"
          onClick={handleNewSession}
          disabled={isNavigationBlocked}
          aria-label={
            isNavigationBlocked
              ? 'Start new session (disabled during active operations)'
              : 'Start new session'
          }
          title={
            isNavigationBlocked
              ? 'Cannot create new session while current session is active'
              : 'Start new session'
          }
          className="h-9 w-9 shrink-0"
        >
          <Plus className="h-5 w-5" />
        </Button>

        <SessionIconRail
          groupedSessions={groupedDisplaySessions}
          isExpanded={isSessionsPanelOpen}
          isLoadingJobs={isLoadingJobs}
          isNavigationBlocked={isNavigationBlocked}
          onSelect={handleSessionClick}
        />
      </Flex>

      <DeleteSessionConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        onConfirm={handleConfirmDelete}
      />

      <DeleteAllSessionsConfirmationModal
        open={deleteAllModalOpen}
        onOpenChange={setDeleteAllModalOpen}
        onConfirm={handleConfirmDeleteAll}
      />
    </aside>
  )
})

interface SessionIconRailProps {
  groupedSessions: Record<SessionAgeGroup, Session[]>
  isExpanded: boolean
  isLoadingJobs: boolean
  isNavigationBlocked: boolean
  onSelect: (session: Session) => void
}

const SessionIconRail: FC<SessionIconRailProps> = ({
  groupedSessions,
  isExpanded,
  isLoadingJobs,
  isNavigationBlocked,
  onSelect,
}) => (
  <Flex
    align="center"
    direction="col"
    className="mt-6 min-h-0 flex-1 overflow-y-auto"
    data-testid="sessions-panel-session-icon-rail"
  >
    {isLoadingJobs &&
      SESSION_AGE_GROUP_ORDER.every((group) => groupedSessions[group].length === 0) && (
        <LoadingSpinner className="text-accent-primary" aria-label="Loading jobs" />
      )}
    {SESSION_AGE_GROUP_ORDER.map((group) => {
      const sessionsInGroup = groupedSessions[group]
      if (sessionsInGroup.length === 0) {
        return null
      }

      return (
        <div key={group} className="mb-4 flex flex-col items-center">
          <div className="mb-2 h-4 w-12 shrink-0" aria-hidden="true" />
          {sessionsInGroup.map((session) => (
            <SessionIconRailItem
              key={session.id}
              session={session}
              isExpanded={isExpanded}
              isNavigationBlocked={isNavigationBlocked}
              onSelect={onSelect}
            />
          ))}
        </div>
      )
    })}
  </Flex>
)

interface SessionIconRailItemProps {
  session: Session
  isExpanded: boolean
  isNavigationBlocked: boolean
  onSelect: (session: Session) => void
}

const sessionIconRailItemClass = `
  mb-2 flex h-14 w-12 shrink-0 items-center justify-center rounded-md
  outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand
`

const SessionIconRailItem: FC<SessionIconRailItemProps> = ({
  session,
  isExpanded,
  isNavigationBlocked,
  onSelect,
}) => {
  return (
    <button
      type="button"
      onClick={() => onSelect(session)}
      disabled={isNavigationBlocked}
      className={`
        ${sessionIconRailItemClass}
        ${isNavigationBlocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
      `}
      aria-label={
        isExpanded
          ? getSessionIconRailAriaLabel(session, isNavigationBlocked)
          : getSessionAriaLabel(session, isNavigationBlocked)
      }
      aria-disabled={isNavigationBlocked}
      title={session.title}
    >
      <SessionStatusGlyph session={session} />
    </button>
  )
}

/**
 * SessionItem Component
 *
 * Individual session item with hover-reveal edit/delete icons and inline rename.
 */
interface SessionItemProps {
  session: Session
  isSelected: boolean
  /** Navigation block: true when shallow submit/response work is pending.
   *  Deep research does NOT block navigation since it runs server-side. */
  isBusy?: boolean
  /** Per-session block: true when this specific session has active deep research */
  isSessionActive?: boolean
  onSelect?: (session: Session) => void
  onDelete?: (sessionId: string) => void
  onRename?: (sessionId: string, newTitle: string) => void
}

const SessionItem: FC<SessionItemProps> = ({
  session,
  isSelected,
  isBusy = false,
  isSessionActive = false,
  onSelect,
  onDelete,
  onRename,
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(session.title)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleClick = useCallback(() => {
    if (!isEditing && !isBusy) {
      onSelect?.(session)
    }
  }, [isEditing, isBusy, onSelect, session])

  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setEditValue(session.title)
      setIsEditing(true)
    },
    [session.title]
  )

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDelete?.(session.id)
    },
    [onDelete, session.id]
  )

  const handleSaveRename = useCallback(() => {
    const trimmedValue = editValue.trim()
    if (trimmedValue && trimmedValue !== session.title) {
      onRename?.(session.id, trimmedValue)
    }
    setIsEditing(false)
  }, [editValue, session.id, session.title, onRename])

  const handleCancelRename = useCallback(() => {
    setEditValue(session.title)
    setIsEditing(false)
  }, [session.title])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSaveRename()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleCancelRename()
      }
    },
    [handleSaveRename, handleCancelRename]
  )

  const handleInputBlur = useCallback(() => {
    handleSaveRename()
  }, [handleSaveRename])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value)
  }, [])

  return (
    <div
      role="button"
      tabIndex={isBusy ? -1 : 0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && !isEditing && !isBusy && handleClick()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        focus-visible:ring-brand group mb-2 flex min-h-14 w-full items-center gap-3
        rounded-md border p-2 text-left
        outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset
        ${isBusy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
        ${
          isSelected
            ? 'bg-surface-raised border-base'
            : 'border-base hover:bg-surface-raised-50 bg-transparent'
        }
      `}
      aria-label={getSessionAriaLabel(session, isBusy)}
      aria-disabled={isBusy}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleInputBlur}
          onClick={(e) => e.stopPropagation()}
          className="
            bg-surface-base border-accent-primary text-primary h-8 min-w-0 flex-1 rounded border
            px-2 py-1 text-sm outline-none
          "
          aria-label="Edit session title"
        />
      ) : (
        <Flex direction="col" gap="0" className="min-w-0 flex-1">
          <Flex align="center" gap="2" className="min-w-0">
            <Text kind="body/regular/sm" className="text-primary min-w-0 flex-1 truncate">
              {session.title}
            </Text>

            {/* Local interaction sessions can still be edited while idle. */}
            {session.source !== 'backend_job' && (
              <Flex
                align="center"
                gap="1"
                className={`shrink-0 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-70'}`}
              >
                <Button
                  kind="tertiary"
                  size="tiny"
                  onClick={handleEditClick}
                  disabled={isBusy || isSessionActive}
                  aria-label={
                    isBusy || isSessionActive
                      ? `Rename session: ${session.title} (disabled)`
                      : `Rename session: ${session.title}`
                  }
                  title={
                    isBusy || isSessionActive
                      ? 'Cannot rename while operations are in progress'
                      : `Rename ${session.title}`
                  }
                >
                  <Edit height={16} width={16} />
                </Button>
                <Button
                  kind="tertiary"
                  size="tiny"
                  color="danger"
                  onClick={handleDeleteClick}
                  disabled={isBusy || isSessionActive}
                  aria-label={
                    isBusy || isSessionActive
                      ? `Delete session: ${session.title} (disabled)`
                      : `Delete session: ${session.title}`
                  }
                  title={
                    isBusy || isSessionActive
                      ? 'Cannot delete while operations are in progress'
                      : `Delete ${session.title}`
                  }
                >
                  <Trash height={16} width={16} />
                </Button>
              </Flex>
            )}
          </Flex>

          <SessionStateRow session={session} />
        </Flex>
      )}
    </div>
  )
}

const SessionStateRow: FC<{ session: Session }> = ({ session }) => (
  <Text kind="body/regular/xs" className="text-subtle mt-1 min-w-0 truncate">
    {getSessionStateText(session)}
  </Text>
)

const SessionStatusGlyph: FC<{ session: Session }> = ({ session }) => {
  const isError =
    session.status === 'failure' ||
    session.status === 'unavailable' ||
    session.reportAvailability === 'error' ||
    Boolean(session.error)
  const isWarning =
    !isError &&
    (session.status === 'interrupted' || session.status === 'expired' || session.status === 'stale')
  const isComplete =
    session.status === 'success' ||
    session.reportAvailability === 'available' ||
    session.job?.has_report
  const isActive = session.hasActiveDeepResearch || isPollableJobStatus(session.status ?? 'success')

  if (isError || isWarning) {
    return (
      <span
        className="text-warning flex h-9 w-9 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        <Warning className="h-6 w-6" />
      </span>
    )
  }

  if (isComplete) {
    return (
      <span
        className="text-success flex h-9 w-9 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        <DocumentCheckmark className="h-6 w-6" />
      </span>
    )
  }

  if (isActive) {
    return (
      <span
        className="text-success flex h-9 w-9 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        <Circle3Q className="h-6 w-6 animate-spin" />
      </span>
    )
  }

  return (
    <span
      className="text-subtle flex h-9 w-9 shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      <Chat className="h-6 w-6" />
    </span>
  )
}

const parseSessionDate = (value: Date | string | null | undefined): Date => {
  if (!value) return new Date()
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

const parseOptionalSessionDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null
  return parseSessionDate(value)
}

const researchJobToSession = (job: ResearchJobListItem): Session => ({
  id: job.job_id,
  title: job.input_preview?.trim() || job.agent_type || `Research job ${job.job_id}`,
  date: parseSessionDate(job.updated_at ?? job.created_at),
  hasActiveDeepResearch: isPollableJobStatus(job.status),
  source: 'backend_job',
  job,
  status: job.status,
  reportAvailability: job.report_availability,
  expiresAt: job.expires_at ? parseSessionDate(job.expires_at) : null,
  dataSourceCount: job.data_sources.length,
  collectionName: job.collection_name ?? null,
  error: job.error ?? null,
})

const getSessionStateText = (session: Session): string => {
  const isError =
    session.status === 'failure' ||
    session.status === 'unavailable' ||
    session.status === 'expired' ||
    session.status === 'interrupted' ||
    session.reportAvailability === 'error' ||
    Boolean(session.error)
  const isComplete =
    session.status === 'success' ||
    session.reportAvailability === 'available' ||
    session.job?.has_report
  const isWorking = session.hasActiveDeepResearch || isPollableJobStatus(session.status ?? 'success')

  if (isError) return 'Error'
  if (isComplete) return 'Research completed'
  if (isWorking) return 'Working...'
  return 'Temporary chat session'
}

const groupSessionsByAge = (sessions: Session[]): Record<SessionAgeGroup, Session[]> => {
  const groups: Record<SessionAgeGroup, Session[]> = {
    new: [],
    recent: [],
    expires_soon: [],
  }

  for (const session of sessions) {
    groups[getSessionAgeGroup(session)].push(session)
  }

  return groups
}

const getSessionAgeGroup = (session: Session): SessionAgeGroup => {
  const now = Date.now()
  const expiresAtMs = parseOptionalSessionDate(session.expiresAt)?.getTime()

  if (typeof expiresAtMs === 'number') {
    const msUntilExpiry = expiresAtMs - now
    if (msUntilExpiry > 0 && msUntilExpiry <= 6 * 60 * 60 * 1000) {
      return 'expires_soon'
    }
  }

  const sessionAgeMs = now - parseSessionDate(session.date).getTime()
  if (sessionAgeMs < 4 * 60 * 60 * 1000) {
    return 'new'
  }

  return 'recent'
}

const getSessionAriaLabel = (session: Session, isBusy: boolean): string => {
  const prefix = session.source === 'backend_job' ? 'Job' : 'Session'
  const status =
    session.status || session.hasActiveDeepResearch ? `, ${getSessionStateText(session)}` : ''
  const blocked = isBusy ? ' (processing in progress)' : ''
  return `${prefix}: ${session.title}${status}${blocked}`
}

const getSessionIconRailAriaLabel = (session: Session, isBusy: boolean): string => {
  const prefix = session.source === 'backend_job' ? 'job' : 'session'
  const blocked = isBusy ? ' (processing in progress)' : ''
  return `Select ${prefix} from icon rail: ${session.title}${blocked}`
}
