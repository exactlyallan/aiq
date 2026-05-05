// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * InputArea Component
 *
 * Chat input area at the bottom of the chat view.
 * Includes text input, tool buttons, and send action.
 * Uses the backend-routed HTTP research submit API for new messages.
 *
 * Disabled state when user is not authenticated.
 */

'use client'

import {
  type FC,
  memo,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import { Flex, Text, Button, TextArea, Banner, Popover } from '@/adapters/ui'
import { useResearchSubmit, useChatStore, useIsCurrentSessionBusy } from '@/features/chat'
import {
  deriveJobActionSelectors,
  deriveJobCapabilities,
  latestResearchJobFromMessages,
} from '@/features/jobs'
import { useLayoutStore } from '../store'
import { useFileUpload, useFileUploadBanners } from '@/features/documents'
import {
  Circle3Q,
  DocumentCheckmark,
  Error,
  Globe,
  Paperclip,
  Paperplane,
  ShapeCircle,
  Stop,
  Warning,
} from '@/adapters/ui/icons'

interface InputAreaProps {
  /** Placeholder text */
  placeholder?: string
  /** Whether the user is authenticated */
  isAuthenticated?: boolean
  /** Optional stop handler for the currently selected backend research job. */
  onStopResearch?: () => void | Promise<void>
}

/**
 * Chat input component with text area and action buttons.
 * Positioned at the bottom of the chat area.
 *
 * New user messages submit through the HTTP research API.
 */
export const InputArea: FC<InputAreaProps> = memo(function InputArea({
  placeholder = 'Check data sources and ask a research question...',
  isAuthenticated = false,
  onStopResearch,
}) {
  const [message, setMessage] = useState('')

  // Check if current session is busy with operations
  const isBusy = useIsCurrentSessionBusy()

  // HTTP submit hook for new research requests.
  const researchSubmit = useResearchSubmit()

  // Get current conversation for filtering files and ensureSession for auto-creation
  const currentConversation = useChatStore((state) => state.currentConversation)
  const ensureSession = useChatStore((state) => state.ensureSession)

  // Deep research completion state - disables new submissions after research completes
  const deepResearchStatus = useChatStore((state) => state.deepResearchStatus)
  const deepResearchJobId = useChatStore((state) => state.deepResearchJobId)
  const isDeepResearchStreaming = useChatStore((state) => state.isDeepResearchStreaming)
  const deepResearchOwnerConversationId = useChatStore((state) => state.deepResearchOwnerConversationId)
  const currentResearchStatus = useChatStore((state) => state.currentStatus)
  const deepResearchTodos = useChatStore((state) => state.deepResearchTodos)

  // File upload hook - provides session files and handles validation internally
  const {
    sessionFiles,
    isUploading,
    error: uploadError,
    clearError,
  } = useFileUpload({
    sessionId: currentConversation?.id,
  })

  // File upload banner hook - monitors file status and triggers banner messages in chat
  useFileUploadBanners()

  // -- Pending files warning state --
  // Tracks whether we've shown the pending-files warning for the current upload batch.
  // When true, the next submit will dismiss the warning and send the message.
  const [pendingFilesWarningActive, setPendingFilesWarningActive] = useState(false)

  // Track the number of uploading/ingesting files so we can detect NEW upload interactions
  // and reset the acknowledged state.
  const prevPendingCountRef = useRef(0)

  // Store actions for the warning banner
  const addFileUploadStatusCard = useChatStore((state) => state.addFileUploadStatusCard)
  const removeFileUploadWarning = useChatStore((state) => state.removeFileUploadWarning)

  // Compute pending files count for the current session
  const pendingSessionFiles = sessionFiles.filter(
    (f) => f.status === 'uploading' || f.status === 'ingesting'
  )
  const pendingCount = pendingSessionFiles.length

  // Detect NEW file upload interactions: when pendingCount increases from 0 (or from a lower value
  // after all files finished) to > 0, it means the user started a new upload batch.
  // Reset the warning state so it can trigger again on the next submit.
  //
  // Also: if the warning is currently displayed and all files finish ingesting,
  // auto-dismiss the warning since the files are now ready.
  useEffect(() => {
    const prev = prevPendingCountRef.current
    // New upload detected: pending count went from 0 → >0
    if (prev === 0 && pendingCount > 0) {
      setPendingFilesWarningActive(false)
    }
    // Files all finished while warning was active → auto-dismiss the warning
    if (prev > 0 && pendingCount === 0 && pendingFilesWarningActive) {
      removeFileUploadWarning()
      setPendingFilesWarningActive(false)
    }
    prevPendingCountRef.current = pendingCount
  }, [pendingCount, pendingFilesWarningActive, removeFileUploadWarning])

  const { sendMessage, isLoading } = researchSubmit

  // Layout store — individual selectors for minimal re-render surface
  const enabledDataSourceIds = useLayoutStore((s) => s.enabledDataSourceIds)
  const knowledgeLayerAvailable = useLayoutStore((s) => s.knowledgeLayerAvailable)
  const availableDataSources = useLayoutStore((s) => s.availableDataSources)
  const dataSourcesError = useLayoutStore((s) => s.dataSourcesError)
  const openRightPanel = useLayoutStore((s) => s.openRightPanel)
  const closeRightPanel = useLayoutStore((s) => s.closeRightPanel)
  const setDataSourcesPanelTab = useLayoutStore((s) => s.setDataSourcesPanelTab)

  const selectedResearchJob = useMemo(
    () =>
      currentConversation
        ? latestResearchJobFromMessages(currentConversation.messages, {
            ownerConversationId: currentConversation.id,
            activeJobId:
              deepResearchOwnerConversationId === currentConversation.id ? deepResearchJobId : null,
            activeJobStatus: deepResearchStatus,
            activeJobStreaming: isDeepResearchStreaming,
          })
        : null,
    [
      currentConversation,
      deepResearchJobId,
      deepResearchOwnerConversationId,
      deepResearchStatus,
      isDeepResearchStreaming,
    ]
  )

  const jobCapabilities = useMemo(
    () =>
      deriveJobCapabilities({
        selectedJobId: selectedResearchJob?.job_id ?? null,
        selectedJob: selectedResearchJob,
        authState: isAuthenticated ? 'authenticated' : 'anonymous',
        dataSourceState: dataSourcesError
          ? 'failed'
          : availableDataSources && availableDataSources.length === 0
            ? 'unavailable'
            : 'available',
        uploadState: isUploading ? 'uploading' : 'idle',
        activeRequestState: isLoading ? 'submitting' : 'idle',
      }),
    [
      availableDataSources,
      dataSourcesError,
      isAuthenticated,
      isLoading,
      isUploading,
      selectedResearchJob,
    ]
  )
  const jobActions = useMemo(() => deriveJobActionSelectors(jobCapabilities), [jobCapabilities])
  const isResearchSessionComplete = jobActions.isJobTerminal
  const isResearchSessionInProgress =
    selectedResearchJob?.status === 'submitted' ||
    selectedResearchJob?.status === 'running' ||
    selectedResearchJob?.status === 'stale'

  // DISABLE LOGIC
  // Disable input when:
  // 1. Not authenticated
  // 2. Session is busy
  // 3. Deep research has completed/failed

  const isDisabledByAuth = !isAuthenticated
  const disabled = !jobActions.canSubmitPrompt || isBusy

  // Dynamic placeholder based on state
  const getPlaceholder = (): string => {
    if (!isAuthenticated) return 'Sign in to start researching'
    if (isResearchSessionComplete)
      return 'Research completed. Create a new session for further questions.'
    if (isBusy) return 'Please wait...'
    return placeholder
  }

  const handleSubmit = useCallback(async () => {
    if (!message.trim() || disabled) return
    const currentMessage = message.trim()

    // --- Pending files warning logic ---
    // If files are still uploading/ingesting AND we haven't shown the warning yet:
    // 1. Add a warning banner to the chat feed
    // 2. Keep the message in the input (don't clear or send)
    // 3. Mark warning as active so the next submit will proceed
    if (pendingCount > 0 && !pendingFilesWarningActive) {
      addFileUploadStatusCard('pending_warning', pendingCount, `pending-warning-${Date.now()}`)
      setPendingFilesWarningActive(true)
      return // Don't send — keep message in input
    }

    // If the warning is currently active (user is re-submitting to acknowledge):
    // Dismiss the warning banner first, then send the message
    if (pendingFilesWarningActive) {
      removeFileUploadWarning()
      setPendingFilesWarningActive(false)
    }

    // Proceed with normal send
    setMessage('')
    await sendMessage(currentMessage)
  }, [
    message,
    disabled,
    sendMessage,
    pendingCount,
    pendingFilesWarningActive,
    addFileUploadStatusCard,
    removeFileUploadWarning,
  ])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleValueChange = useCallback(
    (value: string) => {
      if (isDisabledByAuth) return // Don't allow typing when not authenticated

      // Persist a session as soon as the user starts interacting via typed input.
      // This keeps logo-triggered "new session" drafts out of history until touched.
      if (!currentConversation && value.trim().length > 0) {
        ensureSession()
      }

      setMessage(value)
    },
    [isDisabledByAuth, currentConversation, ensureSession]
  )

  const preventPromptFileDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const handleStopResearch = useCallback(() => {
    if (!jobActions.canCancelJob || !onStopResearch) return
    void onStopResearch()
  }, [jobActions.canCancelJob, onStopResearch])

  // Count of attached files (successful or in progress) for current session
  const attachedFilesCount = sessionFiles.filter(
    (f) => f.status === 'uploading' || f.status === 'ingesting' || f.status === 'success'
  ).length

  // Data sources counts for indicator
  const enabledSourcesCount = enabledDataSourceIds.length
  const totalSourcesCount = availableDataSources?.length ?? 0
  const promptStatusLabel = jobCapabilities.jobCard.statusLabel
  const promptStatusDetail = getPromptStatusDetail({
    isAuthenticated,
    isBusy,
    isLoading,
    selectedJobStatus: selectedResearchJob?.status,
    disabledReason: jobActions.promptDisabledReason,
    currentTask: getCurrentResearchTask(currentResearchStatus, deepResearchTodos),
  })
  const promptStatusText = getPromptStatusText(promptStatusLabel, promptStatusDetail)
  const canStopResearch = jobActions.canCancelJob && Boolean(onStopResearch)

  return (
    <Flex direction="col" className="mx-auto w-full max-w-3xl p-4">
      <Flex
        direction="col"
        className={`
          bg-surface-base relative overflow-hidden rounded-xl border-[0.5px] border-neutral-500/70
          shadow-[0_18px_50px_rgba(32,34,40,0.46)] transition-colors
          ${isDisabledByAuth ? 'opacity-60' : ''}
        `}
        onDragOver={preventPromptFileDrop}
        onDrop={preventPromptFileDrop}
      >
        <Flex
          align="center"
          justify="between"
          gap="2"
          className="border-base border-b px-4 py-3"
          data-testid="prompt-status-strip"
        >
          <Flex align="center" gap="2" className="min-w-0">
            <PromptStatusIcon statusLabel={promptStatusLabel} />
            <Text kind="label/semibold/sm" className="text-primary truncate">
              {promptStatusText}
            </Text>
          </Flex>
          <Button
            kind="tertiary"
            size="tiny"
            onClick={handleStopResearch}
            disabled={!canStopResearch}
            aria-label="Stop research"
            title={canStopResearch ? 'Stop research' : 'No active research to stop'}
          >
            <Flex align="center" gap="1">
              <Stop className="h-4 w-4" />
              <Text kind="label/semibold/sm" className="text-primary">
                stop
              </Text>
            </Flex>
          </Button>
        </Flex>

        {/* Text Input */}
        <div onKeyDown={handleKeyDown} className="px-4 pt-3">
          <TextArea
            className="bg-surface-base min-h-[120px] border-0"
            value={message}
            onValueChange={handleValueChange}
            placeholder={getPlaceholder()}
            disabled={disabled}
            resizeable="auto"
            size="medium"
            aria-label="Chat message input"
          />
        </div>

        {/* Upload Error Display */}
        {uploadError && (
          <Banner kind="inline" status="error" onClose={clearError} className="mx-4 mt-2">
            {uploadError}
          </Banner>
        )}

        {/* Bottom Actions Bar */}
        <Flex align="center" justify="end" className="px-4 pb-3 pt-2">
          {/* Right Actions: selected source/file counters and submit. */}
          <Flex align="center" gap="2">
            {/* Sources indicator - clickable to toggle data connections tab */}
            <Button
              kind="tertiary"
              size="tiny"
              onClick={() => {
                if (useLayoutStore.getState().rightPanel === 'data-sources') {
                  closeRightPanel()
                } else {
                  setDataSourcesPanelTab('connections')
                  openRightPanel('data-sources')
                }
              }}
              disabled={isDisabledByAuth}
              aria-label="Toggle data sources connections"
              title="Selected data connections"
            >
              <Flex align="center" gap="1">
                <Globe className="h-3.5 w-3.5" />
                <Text kind="label/bold/sm">
                  {enabledSourcesCount}/{totalSourcesCount}
                </Text>
              </Flex>
            </Button>

            {/* Files indicator - clickable to toggle files tab */}
            <Button
              kind="tertiary"
              size="tiny"
              onClick={() => {
                if (useLayoutStore.getState().rightPanel === 'data-sources') {
                  closeRightPanel()
                } else {
                  setDataSourcesPanelTab('files')
                  openRightPanel('data-sources')
                }
              }}
              disabled={isDisabledByAuth || !knowledgeLayerAvailable}
              aria-label="Open uploaded files"
              title={knowledgeLayerAvailable ? "Available files" : "File upload not available"}
            >
              <Flex align="center" gap="1">
                <Paperclip className="h-3.5 w-3.5" />
                <Text kind="label/bold/sm">
                  {attachedFilesCount}
                </Text>
              </Flex>
            </Button>

            {/* Send button - wrapped in Popover when research session is complete/in-progress.
                Active and completed research states block new submissions. */}
            {isResearchSessionComplete ? (
              <Popover
                side="top"
                align="end"
                slotContent={
                  <Text kind="body/regular/sm" className="max-w-xs p-3">
                    Research completed. For further questions or reports, please create a new session.
                  </Text>
                }
              >
                <Button
                  kind="primary"
                  size="small"
                  aria-label="Research completed - create new session"
                  title="Research completed"
                >
                  <Paperplane className="h-4 w-4" />
                </Button>
              </Popover>
            ) : isResearchSessionInProgress ? (
              <Popover
                side="top"
                align="end"
                slotContent={
                  <Text kind="body/regular/sm" className="max-w-xs p-3">
                    Research is currently in progress. Chat is paused to prevent generating multiple reports at
                    the same time.
                  </Text>
                }
              >
                <Button
                  kind="primary"
                  size="small"
                  aria-label="Research in progress - please wait"
                  title="Research in progress"
                >
                  <Paperplane className="h-4 w-4" />
                </Button>
              </Popover>
            ) : (
              <Button
                kind="primary"
                size="small"
                color={!message.trim() || disabled ? undefined : 'brand'}
                onClick={handleSubmit}
                disabled={!message.trim() || disabled}
                aria-label="Send message"
                title="Send query"
              >
                {isLoading ? <span className="animate-pulse">...</span> : <Paperplane className="h-4 w-4" />}
              </Button>
            )}
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  )
})

const getPromptStatusDetail = ({
  isAuthenticated,
  isBusy,
  isLoading,
  selectedJobStatus,
  disabledReason,
  currentTask,
}: {
  isAuthenticated: boolean
  isBusy: boolean
  isLoading: boolean
  selectedJobStatus?: string
  disabledReason?: string
  currentTask?: string
}): string => {
  if (!isAuthenticated) return 'Sign in required'
  if (isLoading) return 'Submitting'
  if (selectedJobStatus === 'submitted' || selectedJobStatus === 'running' || selectedJobStatus === 'stale') {
    if (currentTask) return currentTask
    if (selectedJobStatus === 'submitted') return 'Starting research'
    if (selectedJobStatus === 'stale') return 'Research connection delayed'
    return 'Research in progress'
  }
  if (isBusy) return 'Session busy'
  if (disabledReason === 'job_terminal') return 'Research complete'
  if (disabledReason === 'job_missing') return 'Job unavailable'
  if (disabledReason === 'request_in_progress') return 'Request active'
  if (disabledReason === 'data_source_unavailable') return 'Source unavailable'
  return 'Ready'
}

type PromptTodo = {
  content: string
  status: string
}

const getCurrentResearchTask = (
  currentStatus: string | null | undefined,
  todos: PromptTodo[] | undefined
): string | undefined => {
  const activeTodo = todos?.find((todo) => todo.status === 'in_progress')
  if (activeTodo?.content?.trim()) return activeTodo.content.trim()

  switch (currentStatus) {
    case 'searching':
      return 'Finding sources'
    case 'researching':
      return 'Researching sources'
    case 'writing':
      return 'Writing report'
    case 'complete':
      return 'Report done'
    case 'error':
      return 'Research failed'
    default:
      return undefined
  }
}

const getPromptStatusText = (statusLabel: string, statusDetail: string): string => {
  if (statusLabel === statusDetail) return statusLabel
  return `${statusLabel}: ${statusDetail}`
}

const PromptStatusIcon: FC<{ statusLabel: string }> = ({ statusLabel }) => {
  if (statusLabel === 'Running' || statusLabel === 'Submitted' || statusLabel === 'Stale') {
    return (
      <Circle3Q
        className="text-brand h-6 w-6 shrink-0 animate-spin"
        aria-label={`Prompt status: ${statusLabel}`}
      />
    )
  }

  if (statusLabel === 'Completed') {
    return (
      <DocumentCheckmark
        className="text-success h-6 w-6 shrink-0"
        aria-label={`Prompt status: ${statusLabel}`}
      />
    )
  }

  if (statusLabel === 'Failed' || statusLabel === 'Unavailable') {
    return (
      <Error
        className="text-error h-6 w-6 shrink-0"
        aria-label={`Prompt status: ${statusLabel}`}
      />
    )
  }

  if (statusLabel === 'Expired' || statusLabel === 'Interrupted') {
    return (
      <Warning
        className="text-warning h-6 w-6 shrink-0"
        aria-label={`Prompt status: ${statusLabel}`}
      />
    )
  }

  return (
    <ShapeCircle
      className="text-subtle h-6 w-6 shrink-0"
      aria-label={`Prompt status: ${statusLabel}`}
    />
  )
}
