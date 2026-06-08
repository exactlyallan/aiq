// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * InputArea Component
 *
 * Chat input area at the bottom of the chat view.
 * Includes text input, tool buttons, and send action.
 * Uses the backend-routed HTTP research submit API for new messages.
 *
 * Prompt control state is derived from the selected backend job state matrix.
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
import type { DeepResearchTodo } from '@/features/chat/types'
import {
  deriveJobCapabilities,
  deriveResearchUiState,
  latestResearchJobFromMessages,
  type PromptStatusIconKind,
} from '@/features/jobs'
import { useLayoutStore } from '../store'
import { useFileUpload, useFileUploadBanners } from '@/features/documents'
import {
  Circle3Q,
  DocumentCheckmark,
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
  const [isTaskListOpen, setIsTaskListOpen] = useState(false)

  // Check if current session is busy with operations
  const isBusy = useIsCurrentSessionBusy()

  // HTTP submit hook for new research requests.
  const researchSubmit = useResearchSubmit()

  // Get current conversation for file filtering and selected job derivation.
  const currentConversation = useChatStore((state) => state.currentConversation)

  // Deep research completion state - disables new submissions after research completes
  const deepResearchStatus = useChatStore((state) => state.deepResearchStatus)
  const deepResearchJobId = useChatStore((state) => state.deepResearchJobId)
  const isDeepResearchStreaming = useChatStore((state) => state.isDeepResearchStreaming)
  const deepResearchOwnerConversationId = useChatStore(
    (state) => state.deepResearchOwnerConversationId
  )
  const currentResearchStatus = useChatStore((state) => state.currentStatus)
  const deepResearchTodos = useChatStore((state) => state.deepResearchTodos)
  const deepResearchToolCalls = useChatStore((state) => state.deepResearchToolCalls)

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
  const researchUiState = useMemo(
    () =>
      deriveResearchUiState({
        capabilities: jobCapabilities,
        isAuthenticated,
        isCurrentSessionBusy: isBusy,
        isSubmitLoading: isLoading,
        selectedJobStatus: selectedResearchJob?.status,
        currentStatus: currentResearchStatus,
        todos: deepResearchTodos,
        toolCalls: deepResearchToolCalls,
        defaultPromptPlaceholder: placeholder,
        hasStopHandler: Boolean(onStopResearch),
        knowledgeLayerAvailable,
      }),
    [
      currentResearchStatus,
      deepResearchTodos,
      deepResearchToolCalls,
      isAuthenticated,
      isBusy,
      isLoading,
      jobCapabilities,
      knowledgeLayerAvailable,
      onStopResearch,
      placeholder,
      selectedResearchJob?.status,
    ]
  )
  const isResearchSessionComplete = researchUiState.prompt.sendControl === 'research_complete'
  const isResearchSessionInProgress = researchUiState.prompt.sendControl === 'research_in_progress'

  const isDisabledByAuth = !isAuthenticated
  const disabled = researchUiState.prompt.disabled

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

      setMessage(value)
    },
    [isDisabledByAuth]
  )

  const preventPromptFileDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const handleStopResearch = useCallback(() => {
    if (!researchUiState.stopResearch.enabled || !onStopResearch) return
    void onStopResearch()
  }, [onStopResearch, researchUiState.stopResearch.enabled])

  // Count of attached files (successful or in progress) for current session
  const attachedFilesCount = sessionFiles.filter(
    (f) => f.status === 'uploading' || f.status === 'ingesting' || f.status === 'success'
  ).length

  // Data sources counts for indicator
  const enabledSourcesCount = enabledDataSourceIds.length
  const totalSourcesCount = availableDataSources?.length ?? 0
  const canStopResearch = researchUiState.stopResearch.enabled
  const stopControlClass = canStopResearch ? 'text-primary' : 'text-subtle opacity-60'
  const hasResearchTasks = deepResearchTodos.length > 0

  useEffect(() => {
    if (!hasResearchTasks) {
      setIsTaskListOpen(false)
    }
  }, [hasResearchTasks])

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
          {hasResearchTasks ? (
            <Popover
              open={isTaskListOpen}
              onOpenChange={setIsTaskListOpen}
              side="top"
              align="start"
              className="border-0 bg-transparent p-0 shadow-none"
              style={{ zIndex: 20 }}
              slotContent={<PromptTaskListPopover todos={deepResearchTodos} />}
            >
              <button
                type="button"
                className="
                  hover:bg-surface-raised focus-visible:ring-brand min-w-0 cursor-pointer rounded px-1
                  py-1 text-left outline-none transition-colors focus-visible:ring-2
                "
                aria-label={`Show research task list: ${researchUiState.statusStrip.text}`}
                title="Show research task list"
              >
                <PromptStatusContent
                  icon={researchUiState.statusStrip.icon}
                  label={researchUiState.statusStrip.label}
                  text={researchUiState.statusStrip.text}
                />
              </button>
            </Popover>
          ) : (
            <PromptStatusContent
              icon={researchUiState.statusStrip.icon}
              label={researchUiState.statusStrip.label}
              text={researchUiState.statusStrip.text}
            />
          )}
          <Button
            kind="tertiary"
            size="tiny"
            onClick={handleStopResearch}
            disabled={!canStopResearch}
            aria-label="Stop research"
            title={researchUiState.stopResearch.title}
          >
            <Flex align="center" gap="1" className={stopControlClass}>
              <Stop className="h-4 w-4" />
              <Text
                kind="label/semibold/sm"
                className={canStopResearch ? 'text-primary' : 'text-subtle'}
              >
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
            placeholder={researchUiState.prompt.placeholder}
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
              disabled={!researchUiState.sourceCounter.enabled}
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
              disabled={!researchUiState.fileCounter.enabled}
              aria-label="Open uploaded files"
              title={knowledgeLayerAvailable ? 'Available files' : 'File upload not available'}
            >
              <Flex align="center" gap="1">
                <Paperclip className="h-3.5 w-3.5" />
                <Text kind="label/bold/sm">{attachedFilesCount}</Text>
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
                    Research completed. For further questions or reports, please create a new
                    session.
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
                    Research is currently in progress. Chat is paused to prevent generating multiple
                    reports at the same time.
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
                {isLoading ? (
                  <span className="animate-pulse">...</span>
                ) : (
                  <Paperplane className="h-4 w-4" />
                )}
              </Button>
            )}
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  )
})

const PromptStatusContent: FC<{
  icon: PromptStatusIconKind
  label: string
  text: string
}> = ({ icon, label, text }) => (
  <Flex align="center" gap="2" className="min-w-0">
    <PromptStatusIcon icon={icon} statusLabel={label} />
    <Text kind="label/semibold/sm" className="text-primary truncate">
      {text}
    </Text>
  </Flex>
)

const PromptTaskListPopover: FC<{ todos: DeepResearchTodo[] }> = ({ todos }) => (
  <Flex
    direction="col"
    className="
      bg-surface-base max-h-[320px] w-max min-w-48 max-w-[min(32rem,calc(100vw-2rem))]
      overflow-y-auto rounded-md border border-white p-4
      shadow-[0_16px_40px_rgba(0,0,0,0.28)]
    "
    data-testid="prompt-task-list-popover"
  >
    <ol className="space-y-2">
      {todos.map((todo, index) => (
        <li key={todo.id ?? `${index}-${todo.content}`}>
          <Text
            kind="body/regular/md"
            className={`${getPromptTaskClass(todo.status)} block whitespace-normal`}
          >
            {index + 1} - {todo.content}
          </Text>
        </li>
      ))}
    </ol>
  </Flex>
)

const getPromptTaskClass = (status: DeepResearchTodo['status']): string => {
  if (status === 'completed') return 'text-primary line-through decoration-2'
  if (status === 'in_progress') return 'text-primary'
  if (status === 'stopped') return 'text-error'
  return 'text-primary'
}

const PromptStatusIcon: FC<{ icon: PromptStatusIconKind; statusLabel: string }> = ({
  icon,
  statusLabel,
}) => {
  if (icon === 'active') {
    return (
      <Circle3Q
        className="text-success h-6 w-6 shrink-0 animate-spin"
        aria-label={`Prompt status: ${statusLabel}`}
      />
    )
  }

  if (icon === 'complete') {
    return (
      <DocumentCheckmark
        className="text-success h-6 w-6 shrink-0"
        aria-label={`Prompt status: ${statusLabel}`}
      />
    )
  }

  if (icon === 'error' || icon === 'warning') {
    return (
      <Warning
        className="text-warning h-6 w-6 shrink-0"
        aria-label={`Prompt status: ${statusLabel}`}
      />
    )
  }

  return (
    <ShapeCircle
      className="text-success h-6 w-6 shrink-0"
      aria-label={`Prompt status: ${statusLabel}`}
    />
  )
}
