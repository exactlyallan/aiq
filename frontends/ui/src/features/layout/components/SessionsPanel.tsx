// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * SessionsPanel Component
 *
 * Left panel displaying session history with new session and delete all buttons.
 * Slides in from the left and overlays content.
 */

'use client'

import { type FC, type KeyboardEvent, memo, useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { Flex, Text, Button, SidePanel } from '@/adapters/ui'
import { useShallow } from 'zustand/react/shallow'
import { Chat, Edit, Trash, Plus, Search, LoadingSpinner } from '@/adapters/ui/icons'
import { useLayoutStore } from '../store'
import { useChatStore } from '@/features/chat'
import { isPollableJobStatus, useResearchJobs } from '@/features/jobs'
import type { ResearchJobListItem, ResearchJobStatus, ResearchReportAvailability } from '@/adapters/api'
import { DeleteSessionConfirmationModal } from './DeleteSessionConfirmationModal'
import { DeleteAllSessionsConfirmationModal } from './DeleteAllSessionsConfirmationModal'

interface Session {
  id: string
  title: string
  date: Date
  hasActiveDeepResearch?: boolean
  source?: 'local' | 'backend_job'
  job?: ResearchJobListItem
  status?: ResearchJobStatus
  reportAvailability?: ResearchReportAvailability
  expiresAt?: Date | null
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

/**
 * Sessions panel with history grouped by date.
 * Opens from the left side of the screen.
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

  const isSessionBusy = useChatStore((s) => s.isSessionBusy)
  const anySessionBusy = useChatStore((s) => s.hasAnyBusySession())
  // Navigation-specific busy check: only shallow thinking (WebSocket) and HITL prompts
  // block session switching. Deep research runs server-side and can be reconnected,
  // so it should NOT prevent navigation.
  const { isStreaming, hasPendingInteraction } = useChatStore(useShallow((s) => ({
    isStreaming: s.isStreaming,
    hasPendingInteraction: s.pendingInteraction !== null,
  })))
  const isNavigationBlocked = isStreaming || hasPendingInteraction
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteAllModalOpen, setDeleteAllModalOpen] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null)
  const {
    jobs,
    isLoading: isLoadingJobs,
    error: jobsError,
    refresh: refreshJobs,
  } = useResearchJobs({ enabled: isSessionsPanelOpen })

  const backendSessions = useMemo(() => jobs.map(researchJobToSession), [jobs])
  const displaySessions = useMemo(() => {
    const backendSessionIds = new Set(backendSessions.map((session) => session.id))
    const localSessions = sessions
      .filter((session) => !backendSessionIds.has(session.id))
      .map((session): Session => ({ ...session, source: session.source ?? 'local' }))

    return backendSessions.length > 0 ? [...backendSessions, ...localSessions] : localSessions
  }, [backendSessions, sessions])
  const hasBackendSessions = backendSessions.length > 0
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

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setSessionsPanelOpen(open)
    },
    [setSessionsPanelOpen]
  )

  const handleClose = useCallback(() => {
    setSessionsPanelOpen(false)
  }, [setSessionsPanelOpen])

  const handleNewSession = useCallback(() => {
    onNewSession?.()
    handleClose()
  }, [onNewSession, handleClose])

  const handleSessionClick = useCallback(
    (session: Session) => {
      if (session.source === 'backend_job' && session.job) {
        onSelectJob?.(session.job)
      } else {
        onSelectSession?.(session.id)
      }
      handleClose()
    },
    [onSelectJob, onSelectSession, handleClose]
  )

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return displaySessions
    const query = searchQuery.toLowerCase()
    return displaySessions.filter((s) =>
      [s.title, s.status, s.collectionName].some((value) =>
        typeof value === 'string' && value.toLowerCase().includes(query)
      )
    )
  }, [displaySessions, searchQuery])

  const groupedSessions = useMemo(() => groupSessionsByDate(filteredSessions), [filteredSessions])

  return (
    <SidePanel
      className="bg-surface-base top-[var(--header-height)] h-[calc(100vh-var(--header-height))] w-[406px] rounded-r-2xl"
      open={isSessionsPanelOpen}
      onOpenChange={handleOpenChange}
      side="left"
      bordered
      closeOnClickOutside={false}
      forceMount
      slotHeading={
        <Flex align="center" gap="2">
          <Chat />
          Sessions
        </Flex>
      }
      slotFooter={
        <Flex direction="col" gap="1">
          <Text kind="body/regular/xs" className="text-subtle">
            Reports are temporary. Save completed reports before they expire.
          </Text>
          <Text kind="body/regular/xs" className="text-subtle">
            Browser data only stores lightweight viewing state for recent jobs.
          </Text>
        </Flex>
      }
    >
      {/* Delete All + New Session */}
      <Flex align="center" justify="between" gap="2" className="mb-4">
        <Button
          kind="tertiary"
          size="small"
          color="danger"
          onClick={handleDeleteAllClick}
          disabled={deleteAllDisabled}
          aria-label={deleteAllDisabled ? "Delete all sessions (disabled)" : "Delete all sessions"}
          title={deleteAllTitle}
        >
          <Flex align="center" gap="1">
            <Trash className="h-4 w-4" />
            <Text kind="label/regular/sm">Delete All</Text>
          </Flex>
        </Button>
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
        >
          <Flex align="center" gap="1">
            <Plus className="h-4 w-4" />
            <Text kind="label/regular/sm">New Session</Text>
          </Flex>
        </Button>
      </Flex>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="text-subtle pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search sessions..."
          className="bg-surface-base border-base text-primary placeholder:text-subtle h-9 w-full rounded-md border pl-8 pr-3 text-sm outline-none focus:border-accent-primary"
          aria-label="Search sessions"
        />
      </div>

      {/* Session List */}
      <Flex direction="col" className="flex-1 overflow-y-auto">
        {jobsError && (
          <Flex direction="col" gap="2" className="border-base bg-surface-raised-50 mb-4 rounded-md border p-3">
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

        {isLoadingJobs && filteredSessions.length === 0 && (
          <Flex direction="col" align="center" justify="center" className="flex-1 py-8">
            <LoadingSpinner className="text-accent-primary" aria-label="Loading jobs" />
            <Text kind="body/regular/sm" className="text-subtle mt-2">
              Loading jobs...
            </Text>
          </Flex>
        )}

        {Object.entries(groupedSessions).map(([dateLabel, dateSessions]) => (
          <Flex key={dateLabel} direction="col" gap="2" className="mb-4">
            <Text kind="label/semibold/xs" className="text-subtle uppercase">
              {dateLabel}
            </Text>
            {dateSessions.map((session) => (
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
        ))}

        {!isLoadingJobs && filteredSessions.length === 0 && (
          <Flex direction="col" align="center" justify="center" className="flex-1 py-8">
            <Text kind="body/regular/sm" className="text-subtle">
              {searchQuery.trim() ? 'No matching sessions' : 'No sessions yet'}
            </Text>
            {!searchQuery.trim() && (
              <Button kind="secondary" size="small" onClick={handleNewSession} className="mt-4">
                Start a new session
              </Button>
            )}
          </Flex>
        )}
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
    </SidePanel>
  )
})

/**
 * SessionItem Component
 *
 * Individual session item with hover-reveal edit/delete icons and inline rename.
 */
interface SessionItemProps {
  session: Session
  isSelected: boolean
  /** Navigation block: true when shallow thinking (WS) or HITL prompt is pending.
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
        group flex min-h-14 w-full items-center gap-2 rounded-md
        border p-2 text-left transition-colors
        outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand
        ${isBusy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
        ${
          isSelected
            ? 'bg-surface-raised border border-accent-primary'
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
        <>
          {/* Loading indicator for active deep research */}
          {session.hasActiveDeepResearch && (
            <LoadingSpinner
              className="shrink-0 text-accent-primary"
              aria-label="Deep research in progress"
            />
          )}

          <Flex direction="col" gap="0" className="min-w-0 flex-1">
            <Text kind="body/regular/sm" className="text-primary min-w-0 truncate">
              {session.title}
            </Text>
            {session.source === 'backend_job' && (
              <Text kind="body/regular/xs" className="text-subtle min-w-0 truncate">
                {getJobSessionMeta(session)}
              </Text>
            )}
          </Flex>

          {/* Action icons - shown on hover */}
          {isHovered && session.source !== 'backend_job' && (
            <Flex align="center" gap="1" className="shrink-0">
              <Button
                kind="tertiary"
                size="tiny"
                onClick={handleEditClick}
                disabled={isBusy || isSessionActive}
                aria-label={isBusy || isSessionActive ? "Rename session (disabled)" : "Rename session"}
                title={isBusy || isSessionActive ? "Cannot rename while operations are in progress" : "Rename session"}
              >
                <Edit height={16} width={16} />
              </Button>
              <Button
                kind="tertiary"
                size="tiny"
                color="danger"
                onClick={handleDeleteClick}
                disabled={isBusy || isSessionActive}
                aria-label={isBusy || isSessionActive ? "Delete session (disabled)" : "Delete session"}
                title={isBusy || isSessionActive ? "Cannot delete while operations are in progress" : "Delete session"}
              >
                <Trash height={16} width={16} />
              </Button>
            </Flex>
          )}
        </>
      )}
    </div>
  )
}

const parseSessionDate = (value: string | null | undefined): Date => {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
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

const statusLabels: Record<ResearchJobStatus, string> = {
  submitted: 'Submitted',
  running: 'Running',
  success: 'Complete',
  failure: 'Failed',
  interrupted: 'Interrupted',
  expired: 'Expired',
  unavailable: 'Unavailable',
  stale: 'Stale',
}

const getExpiryText = (expiresAt: Date | null | undefined): string | null => {
  if (!expiresAt) return null
  return `expires ${expiresAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`
}

const getJobSessionMeta = (session: Session): string => {
  const parts = [
    session.status ? statusLabels[session.status] : null,
    typeof session.dataSourceCount === 'number' ? `${session.dataSourceCount} sources` : null,
    getExpiryText(session.expiresAt),
  ].filter(Boolean)

  return parts.join(' / ')
}

const getSessionAriaLabel = (session: Session, isBusy: boolean): string => {
  const prefix = session.source === 'backend_job' ? 'Job' : 'Session'
  const status = session.status ? `, ${statusLabels[session.status]}` : ''
  const blocked = isBusy ? ' (processing in progress)' : ''
  return `${prefix}: ${session.title}${status}${blocked}`
}

/**
 * Groups sessions by relative date labels (Today, Yesterday, or date string)
 */
const groupSessionsByDate = (sessions: Session[]): Record<string, Session[]> => {
  const groups: Record<string, Session[]> = {}
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  for (const session of sessions) {
    const sessionDate = new Date(session.date)
    let label: string

    if (isSameDay(sessionDate, today)) {
      label = 'Today'
    } else if (isSameDay(sessionDate, yesterday)) {
      label = 'Yesterday'
    } else {
      label = sessionDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    }

    if (!groups[label]) {
      groups[label] = []
    }
    groups[label].push(session)
  }

  return groups
}

const isSameDay = (d1: Date, d2: Date): boolean => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}
