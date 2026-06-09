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
  completedAt?: Date | string | null
  dataSourceCount?: number
  collectionName?: string | null
  error?: string | null
  backendVerification?: SessionBackendVerification
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
type SessionBackendVerification = 'none' | 'checking' | 'verified' | 'missing' | 'unknown'
type SessionStateTone =
  | 'temporary'
  | 'complete'
  | 'working'
  | 'error'
  | 'warning'
  | 'checking'
  | 'unknown'

const COMPACT_RAIL_WIDTH_PX = 72
const EXPANDED_PANEL_WIDTH_PX = 384
const SESSION_PANEL_HEADER_HEIGHT_PX = 58
const SESSION_PANEL_NEW_ROW_HEIGHT_PX = 48
const SESSION_PANEL_GROUP_LABEL_HEIGHT_PX = 20
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
    hasVerified: hasVerifiedJobs,
    isCheckingInitialState,
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
    () => jobs.filter(isReportLevelResearchJob).map((job) => researchJobToSession(job, 'verified')),
    [jobs]
  )
  const displaySessions = useMemo(() => {
    const backendJobById = new Map(jobs.map((job) => [job.job_id, job]))
    const localSessions = sessions.map((session): Session => {
      const linkedBackendJob = session.linkedJobId ? backendJobById.get(session.linkedJobId) : undefined
      const linkedBackendSession = linkedBackendJob
        ? researchJobToSession(linkedBackendJob, 'verified')
        : undefined
      const backendVerification = getLocalSessionBackendVerification({
        linkedJobId: session.linkedJobId,
        linkedBackendJob,
        hasVerifiedJobs,
        isCheckingInitialState,
        jobsError,
      })
      const missingLinkedReport = backendVerification === 'missing' && !session.hasActiveDeepResearch
      const unknownLinkedReport = backendVerification === 'unknown'
      const completedAt =
        parseOptionalSessionDate(session.completedAt) ??
        parseOptionalSessionDate(linkedBackendSession?.completedAt)
      const status = missingLinkedReport
        ? 'unavailable'
        : linkedBackendSession?.status ?? session.status
      const reportAvailability = missingLinkedReport
        ? 'unavailable'
        : unknownLinkedReport
          ? 'unknown'
          : linkedBackendSession?.reportAvailability ?? session.reportAvailability
      const displayDate =
        status === 'success' &&
        (reportAvailability === 'available' || linkedBackendSession?.job?.has_report)
          ? completedAt ?? parseSessionDate(session.date)
          : parseSessionDate(session.date)

      return {
        ...session,
        date: displayDate,
        source: session.source ?? 'local',
        hasActiveDeepResearch:
          session.hasActiveDeepResearch || linkedBackendSession?.hasActiveDeepResearch,
        job: linkedBackendSession?.job ?? session.job,
        status,
        reportAvailability,
        expiresAt: linkedBackendSession?.expiresAt ?? parseOptionalSessionDate(session.expiresAt),
        completedAt,
        dataSourceCount: linkedBackendSession?.dataSourceCount ?? session.dataSourceCount,
        collectionName: linkedBackendSession?.collectionName ?? session.collectionName,
        error: missingLinkedReport
          ? 'Report is no longer available from the backend.'
          : linkedBackendSession?.error ?? session.error,
        backendVerification,
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
  }, [backendSessions, hasVerifiedJobs, isCheckingInitialState, jobs, jobsError, sessions])
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
                <button
                  type="button"
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
                  className="
                    hover:bg-surface-raised focus-visible:ring-brand min-w-0 flex-1 cursor-pointer
                    rounded px-0.5 py-1 text-left outline-none transition-colors focus-visible:ring-2
                    disabled:cursor-not-allowed disabled:opacity-60
                  "
                >
                  <Text kind="body/regular/md" className="text-primary truncate">
                    New Research Session
                  </Text>
                </button>
                <Button
                  kind="tertiary"
                  size="small"
                  onClick={handleDeleteAllClick}
                  disabled={deleteAllDisabled}
                  aria-label={
                    deleteAllDisabled ? 'Delete all sessions (disabled)' : 'Delete all sessions'
                  }
                  title={deleteAllTitle}
                >
                  <span
                    className="text-subtle flex h-4 w-4 items-center justify-center"
                    data-testid="delete-all-sessions-icon"
                  >
                    <Trash className="h-4 w-4" />
                  </span>
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
                      <Text
                        kind="label/semibold/xs"
                        className="text-subtle mb-2 flex items-center uppercase"
                        style={{ height: `${SESSION_PANEL_GROUP_LABEL_HEIGHT_PX}px` }}
                      >
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

              <Flex
                direction="col"
                gap="1"
                className="border-base mt-4 border-t pb-4 pl-0 pr-4 pt-3"
              >
                <Text kind="body/regular/xs" className="text-subtle">
                  Note: Completed research is saved until expiration, but chat sessions are lost
                  after the browser is closed.
                </Text>
              </Flex>
            </Flex>
          </div>
        )}
      </div>

      <Flex
        align="center"
        direction="col"
        className={`border-base bg-surface-base relative z-30 h-full w-[72px] shrink-0 p-0 ${
          isSessionsPanelOpen || shouldRenderExpandedPanel ? '' : 'border-r'
        }`}
      >
        <Flex
          align="center"
          justify="center"
          className="border-base relative w-full shrink-0 border-b"
          style={{ height: `${SESSION_PANEL_HEADER_HEIGHT_PX}px` }}
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
            {isSessionsPanelOpen ? (
              <ChevronLeft className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </Flex>
        <Flex
          align="center"
          justify="center"
          className="w-full shrink-0"
          style={{ height: `${SESSION_PANEL_NEW_ROW_HEIGHT_PX}px` }}
        >
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
        </Flex>

        <SessionIconRail
          groupedSessions={groupedDisplaySessions}
          isExpanded={isSessionsPanelOpen}
          isLoadingJobs={isLoadingJobs}
          isNavigationBlocked={isNavigationBlocked}
          isSessionActive={isSessionBusy}
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
  isSessionActive: (sessionId: string) => boolean
  onSelect: (session: Session) => void
}

const SessionIconRail: FC<SessionIconRailProps> = ({
  groupedSessions,
  isExpanded,
  isLoadingJobs,
  isNavigationBlocked,
  isSessionActive,
  onSelect,
}) => (
  <Flex
    align="center"
    direction="col"
    className="min-h-0 flex-1 overflow-y-auto"
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
          <div
            className="mb-2 w-12 shrink-0"
            style={{ height: `${SESSION_PANEL_GROUP_LABEL_HEIGHT_PX}px` }}
            aria-hidden="true"
          />
          {sessionsInGroup.map((session) => (
            <SessionIconRailItem
              key={session.id}
              session={session}
              isExpanded={isExpanded}
              isNavigationBlocked={isNavigationBlocked}
              isSessionActive={isSessionActive(session.id)}
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
  isSessionActive: boolean
  onSelect: (session: Session) => void
}

const sessionIconRailItemClass = `
  mb-2 flex h-16 w-12 shrink-0 items-center justify-center rounded-md
  outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand
`

const SessionIconRailItem: FC<SessionIconRailItemProps> = ({
  session,
  isExpanded,
  isNavigationBlocked,
  isSessionActive,
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
          : getSessionAriaLabel(session, isNavigationBlocked, isSessionActive)
      }
      aria-disabled={isNavigationBlocked}
      title={session.title}
    >
      <SessionStatusGlyph session={session} isSessionActive={isSessionActive} />
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
        focus-visible:ring-brand group mb-2 flex h-16 w-full items-center gap-3
        rounded-md border p-2 text-left
        outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset
        ${isBusy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
        ${
          isSelected
            ? 'bg-surface-raised border-base'
            : 'border-base hover:bg-surface-raised-50 bg-transparent'
        }
      `}
      aria-label={getSessionAriaLabel(session, isBusy, isSessionActive)}
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
            <Text
              kind="body/regular/sm"
              className={`${isSelected ? 'text-primary' : 'text-subtle'} min-w-0 flex-1 truncate`}
            >
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
                  <span
                    className="text-subtle flex h-4 w-4 items-center justify-center"
                    data-testid={`delete-session-icon-${session.id}`}
                  >
                    <Trash height={16} width={16} />
                  </span>
                </Button>
              </Flex>
            )}
          </Flex>

          <SessionStateRow session={session} isSessionActive={isSessionActive} />
        </Flex>
      )}
    </div>
  )
}

const SessionStateRow: FC<{ session: Session; isSessionActive: boolean }> = ({
  session,
  isSessionActive,
}) => (
  <Text
    kind="body/regular/xs"
    className={`${getSessionStateClass(session, isSessionActive)} mt-1 min-w-0 truncate`}
  >
    {getSessionStateText(session, isSessionActive)}
  </Text>
)

const SessionStatusGlyph: FC<{ session: Session; isSessionActive?: boolean }> = ({
  session,
  isSessionActive = false,
}) => {
  const isChecking = session.backendVerification === 'checking'
  const isUnknown = session.backendVerification === 'unknown'
  const isError =
    session.status === 'failure' ||
    session.reportAvailability === 'error' ||
    (Boolean(session.error) && !isReportUnavailable(session))
  const isWarning =
    !isError &&
    (isUnknown ||
      isReportUnavailable(session) ||
      isReportExpired(session) ||
      session.status === 'interrupted')
  const isComplete = session.status === 'success' && isReportAvailable(session)
  const isActive =
    isSessionActive ||
    session.hasActiveDeepResearch ||
    isPollableJobStatus(session.status ?? 'success')

  if (isChecking) {
    return (
      <span
        className="text-subtle flex h-9 w-9 shrink-0 items-center justify-center"
      >
        <LoadingSpinner size="medium" aria-label="Checking backend state" className="text-subtle" />
      </span>
    )
  }

  if (isError) {
    return (
      <span
        className="text-error flex h-9 w-9 shrink-0 items-center justify-center"
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
      >
        <LoadingSpinner size="medium" aria-label="Running research" className="text-success" />
      </span>
    )
  }

  if (isWarning) {
    return (
      <span
        className="text-warning flex h-9 w-9 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        <Warning className="h-6 w-6" />
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

const researchJobToSession = (
  job: ResearchJobListItem,
  backendVerification: SessionBackendVerification = 'none'
): Session => ({
  id: job.job_id,
  title: job.input_preview?.trim() || job.agent_type || `Research job ${job.job_id}`,
  date: parseSessionDate(job.updated_at ?? job.created_at),
  hasActiveDeepResearch: isPollableJobStatus(job.status),
  source: 'backend_job',
  job,
  status: job.status,
  reportAvailability: job.report_availability,
  expiresAt: job.expires_at ? parseSessionDate(job.expires_at) : null,
  completedAt: job.status === 'success' ? parseSessionDate(job.updated_at ?? job.created_at) : null,
  dataSourceCount: job.data_sources.length,
  collectionName: job.collection_name ?? null,
  error: job.error ?? null,
  backendVerification,
})

const getLocalSessionBackendVerification = ({
  linkedJobId,
  linkedBackendJob,
  hasVerifiedJobs,
  isCheckingInitialState,
  jobsError,
}: {
  linkedJobId?: string | null
  linkedBackendJob?: ResearchJobListItem
  hasVerifiedJobs: boolean
  isCheckingInitialState: boolean
  jobsError: Error | { message: string } | null
}): SessionBackendVerification => {
  if (!linkedJobId) return 'none'
  if (linkedBackendJob) return 'verified'
  if (isCheckingInitialState) return 'checking'
  if (jobsError && !hasVerifiedJobs) return 'unknown'
  if (hasVerifiedJobs) return 'missing'
  return 'unknown'
}

const isReportAvailable = (session: Session): boolean =>
  session.reportAvailability === 'available' || Boolean(session.job?.has_report)

const isReportUnavailable = (session: Session): boolean =>
  session.backendVerification === 'missing' ||
  session.status === 'unavailable' ||
  (session.status === 'success' && !isReportAvailable(session))

const isReportExpired = (session: Session): boolean =>
  session.status === 'expired' || session.reportAvailability === 'expired'

const getSessionStateText = (session: Session, isSessionActive = false): string => {
  const tone = getSessionStateTone(session, isSessionActive)

  if (tone === 'checking') return 'Checking...'
  if (tone === 'unknown') return 'Status unknown'
  if (tone === 'warning') {
    if (isReportExpired(session)) return 'Expired'
    if (session.status === 'interrupted') return 'Interrupted'
    return 'Report unavailable'
  }
  if (tone === 'error') return 'Error'
  if (tone === 'complete') {
    const completedDate = formatSessionCompletedDate(session.completedAt ?? session.date)
    return completedDate ? `Research completed · ${completedDate}` : 'Research completed'
  }
  if (tone === 'working') return 'Thinking...'
  return 'Temporary chat session'
}

const getSessionStateClass = (session: Session, isSessionActive = false): string => {
  const tone = getSessionStateTone(session, isSessionActive)

  if (tone === 'error') return 'text-error'
  if (tone === 'complete' || tone === 'working') return 'text-success'
  if (tone === 'warning') return 'text-warning'
  return 'text-subtle'
}

const getSessionStateTone = (
  session: Session,
  isSessionActive = false
): SessionStateTone => {
  if (session.backendVerification === 'checking') return 'checking'
  if (session.backendVerification === 'unknown') return 'unknown'

  const isError =
    session.status === 'failure' ||
    session.reportAvailability === 'error' ||
    (Boolean(session.error) && !isReportUnavailable(session))
  const isWarning =
    isReportUnavailable(session) || isReportExpired(session) || session.status === 'interrupted'
  const isComplete = session.status === 'success' && isReportAvailable(session)
  const isWorking =
    isSessionActive ||
    session.hasActiveDeepResearch ||
    isPollableJobStatus(session.status ?? 'success')

  if (isError) return 'error'
  if (isWorking) return 'working'
  if (isWarning) return 'warning'
  if (isComplete) return 'complete'
  return 'temporary'
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

const formatSessionCompletedDate = (value: Date | string | null | undefined): string => {
  if (!value) return ''
  const date = parseSessionDate(value)
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

const getSessionAriaLabel = (
  session: Session,
  isBusy: boolean,
  isSessionActive = false
): string => {
  const prefix = session.source === 'backend_job' ? 'Job' : 'Session'
  const status =
    session.status || session.hasActiveDeepResearch || isSessionActive
      ? `, ${getSessionStateText(session, isSessionActive)}`
      : ''
  const blocked = isBusy ? ' (processing in progress)' : ''
  return `${prefix}: ${session.title}${status}${blocked}`
}

const getSessionIconRailAriaLabel = (session: Session, isBusy: boolean): string => {
  const prefix = session.source === 'backend_job' ? 'job' : 'session'
  const blocked = isBusy ? ' (processing in progress)' : ''
  return `Select ${prefix} from icon rail: ${session.title}${blocked}`
}
