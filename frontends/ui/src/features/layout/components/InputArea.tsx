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

import { type FC, memo, useState, useCallback, useRef, useEffect, useMemo, type KeyboardEvent } from 'react'
import { Flex, Text, Button, TextArea, Banner, Popover } from '@/adapters/ui'
import { useResearchSubmit, useChatStore, useIsCurrentSessionBusy } from '@/features/chat'
import {
  deriveJobActionSelectors,
  deriveJobCapabilities,
  latestResearchJobFromMessages,
} from '@/features/jobs'
import { useLayoutStore } from '../store'
import { useAppConfig } from '@/shared/context'
import {
  getResearchCollectionName,
  useFileUpload,
  useFileDragDrop,
  useFileUploadBanners,
} from '@/features/documents'
import { Globe, Document, Paperclip, Paperplane, Cancel } from '@/adapters/ui/icons'

interface InputAreaProps {
  /** Placeholder text */
  placeholder?: string
  /** Whether the user is authenticated */
  isAuthenticated?: boolean
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
}) {
  const [message, setMessage] = useState('')

  // File input ref for attachment button
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Get file upload configuration from app config
  const { fileUpload: fileUploadConfig } = useAppConfig()

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

  // File upload hook - provides session files and handles validation internally
  const {
    uploadFiles,
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

  // Handle attach button click
  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || !jobActions.canUploadFiles || isBusy) return

      const conversationId = ensureSession()
      const collectionName = getResearchCollectionName(conversationId)
      if (!collectionName) {
        console.error('Failed to create session for upload')
        return
      }

      // Open the files tab immediately so the user sees instant feedback
      setDataSourcesPanelTab('files')
      openRightPanel('data-sources')

      // uploadFiles validates internally and sets error if invalid
      await uploadFiles(files, collectionName)
    },
    [
      ensureSession,
      uploadFiles,
      openRightPanel,
      setDataSourcesPanelTab,
      isBusy,
      jobActions.canUploadFiles,
    ]
  )

  const { isDragging, isUnsupportedDrag, dragHandlers } = useFileDragDrop({
    onDrop: handleFilesSelected,
    disabled: !jobActions.canUploadFiles || isBusy,
  })

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      await handleFilesSelected(files)
      // Reset input so same file can be selected again
      e.target.value = ''
    },
    [handleFilesSelected]
  )

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
  })
  const sourceStatusLabel = `${enabledSourcesCount}/${totalSourcesCount} sources`
  const fileStatusLabel = `${attachedFilesCount} ${attachedFilesCount === 1 ? 'file' : 'files'}`

  return (
    <Flex direction="col" className="mx-auto w-full max-w-3xl p-4">
      <Flex
        direction="col"
        className={`
          bg-surface-raised relative rounded-2xl border border-black p-4 transition-colors
          ${isDisabledByAuth ? 'opacity-60' : ''}
          ${isDragging && isUnsupportedDrag ? 'border-error border-dashed' : isDragging ? 'border-brand border-dashed' : ''}
        `}
        {...dragHandlers}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="bg-surface-raised-90 absolute inset-0 z-10 flex items-center justify-center rounded-2xl">
            <Flex direction="col" align="center" gap="2">
              {isUnsupportedDrag ? (
                <Cancel className="text-error h-8 w-8" />
              ) : (
                <Paperclip className="text-brand h-8 w-8" />
              )}
              <Text
                kind="label/semibold/sm"
                className={isUnsupportedDrag ? 'text-error' : 'text-brand'}
              >
                {isUnsupportedDrag ? 'Unsupported file type' : 'Drop files to upload'}
              </Text>
              {isUnsupportedDrag && (
                <Text kind="body/regular/xs" className="text-subtle">
                  Accepts: {fileUploadConfig.acceptedTypes}
                </Text>
              )}
            </Flex>
          </div>
        )}

        <Flex
          align="center"
          justify="between"
          gap="2"
          className="mb-2 flex-wrap"
          data-testid="prompt-status-strip"
        >
          <Flex align="center" gap="2" className="min-w-0">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${getPromptStatusDotClass(promptStatusLabel)}`}
              aria-hidden="true"
            />
            <Text kind="label/semibold/xs" className="text-primary">
              {promptStatusLabel}
            </Text>
            <Text kind="body/regular/xs" className="text-subtle">
              {promptStatusDetail}
            </Text>
          </Flex>
          <Flex align="center" gap="1" className="shrink-0">
            <Text kind="label/regular/xs" className="border-base rounded border px-1.5 py-0.5 text-subtle">
              {sourceStatusLabel}
            </Text>
            <Text kind="label/regular/xs" className="border-base rounded border px-1.5 py-0.5 text-subtle">
              {fileStatusLabel}
            </Text>
          </Flex>
        </Flex>

        {/* Text Input */}
        <div onKeyDown={handleKeyDown}>
          <TextArea
            className="bg-surface-raised border-0"
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
          <Banner kind="inline" status="error" onClose={clearError} className="mt-2">
            {uploadError}
          </Banner>
        )}

        {/* Bottom Actions Bar */}
        <Flex align="center" justify="end" className="mt-3">
          {/* Right Actions: Counters, Attach, Research, Submit */}
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
                <Globe className="h-3 w-3" />
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
                <Document className="h-3 w-3" />
                <Text kind="label/bold/sm">
                  {attachedFilesCount}
                </Text>
              </Flex>
            </Button>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={fileUploadConfig.acceptedTypes}
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Attach files */}
            <Button
              kind="tertiary"
              size="small"
              onClick={handleAttachClick}
              disabled={!jobActions.canUploadFiles || isBusy || !knowledgeLayerAvailable}
              aria-label="Attach files"
              title={
                isBusy
                  ? 'File upload disabled during active operations'
                  : !knowledgeLayerAvailable
                    ? 'File upload not available'
                    : 'Select files to upload'
              }
            >
              <Paperclip className="h-4 w-4" />
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
}: {
  isAuthenticated: boolean
  isBusy: boolean
  isLoading: boolean
  selectedJobStatus?: string
  disabledReason?: string
}): string => {
  if (!isAuthenticated) return 'Sign in required'
  if (isLoading) return 'Submitting'
  if (isBusy) return 'Session busy'
  if (selectedJobStatus === 'submitted' || selectedJobStatus === 'running' || selectedJobStatus === 'stale') {
    return 'Prompt paused'
  }
  if (disabledReason === 'job_terminal') return 'Research complete'
  if (disabledReason === 'job_missing') return 'Job unavailable'
  if (disabledReason === 'request_in_progress') return 'Request active'
  if (disabledReason === 'data_source_unavailable') return 'Source unavailable'
  return 'Ready'
}

const getPromptStatusDotClass = (statusLabel: string): string => {
  if (statusLabel === 'Running' || statusLabel === 'Submitted') return 'bg-brand animate-pulse'
  if (statusLabel === 'Failed' || statusLabel === 'Unavailable') return 'bg-[var(--text-color-feedback-danger)]'
  if (statusLabel === 'Expired' || statusLabel === 'Interrupted' || statusLabel === 'Stale') {
    return 'bg-[var(--text-color-feedback-warning)]'
  }
  return 'bg-brand'
}
