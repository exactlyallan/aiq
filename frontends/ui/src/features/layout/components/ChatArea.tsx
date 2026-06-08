// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ChatArea Component
 *
 * Main chat display area showing messages between user and assistant.
 * Includes the message list and is positioned in the center of the layout.
 *
 * Shows different welcome states based on authentication:
 * - Logged out: Prompt to sign in with CTA button
 * - Logged in: Ready to start chatting
 *

 */

'use client'

import { type FC, memo, useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { Flex, Text, Button } from '@/adapters/ui'
import { Document, Lock } from '@/adapters/ui/icons'
import { useShallow } from 'zustand/react/shallow'
import {
  useChatStore,
  AgentResponse,
  ErrorBanner,
  FileUploadBanner,
  DeepResearchBanner,
  UserMessage,
} from '@/features/chat'
import type { ChatMessage } from '@/features/chat'
import { StarfieldAnimation } from '@/shared/components/StarfieldAnimation'

interface ChatAreaProps {
  /** Whether the user is authenticated */
  isAuthenticated?: boolean
  /** Callback when sign in is clicked */
  onSignIn?: () => void
}

/**
 * Main chat area container with scrollable message list.
 * Shows welcome state when no messages exist.
 */
export const ChatArea: FC<ChatAreaProps> = memo(function ChatArea({
  isAuthenticated = false,
  onSignIn,
}) {
  const { currentConversation } = useChatStore(
    useShallow((s) => ({
      currentConversation: s.currentConversation,
    }))
  )

  const dismissErrorCard = useChatStore((s) => s.dismissErrorCard)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const messages = currentConversation?.messages

  // Filter to only show displayable message types in the chat area
  // Assistant text messages (full reports) are displayed in the Details Panel instead
  const displayableMessages = useMemo(
    () =>
      (messages ?? []).filter((msg) => {
        const messageType = msg.messageType || (msg.role === 'user' ? 'user' : 'assistant')
        return (
          messageType === 'user' ||
          messageType === 'status' ||
          messageType === 'agent_response' ||
          messageType === 'file' ||
          messageType === 'file_upload_status' ||
          messageType === 'error' ||
          messageType === 'deep_research_banner'
        )
      }),
    [messages]
  )

  const isEmpty = displayableMessages.length === 0

  // Track previous message count for scroll detection
  const [prevMessageCount, setPrevMessageCount] = useState(displayableMessages.length)

  // Auto-scroll to bottom only when a new message is added (not on re-renders or panel toggles)
  useEffect(() => {
    const currentCount = displayableMessages.length
    if (currentCount > prevMessageCount) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    setPrevMessageCount(currentCount)
  }, [displayableMessages.length, prevMessageCount])

  // TODO: Implement file retry/cancel/delete handlers when file upload is added
  // For now, these are placeholders
  const handleFileRetry = useCallback((_messageId: string) => {
    // Will be implemented with file upload feature
  }, [])

  return (
    <Flex direction="col" className="min-h-0 flex-1" aria-label="Chat messages">
      <Flex direction="col" className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
        {isEmpty ? (
          <WelcomeState isAuthenticated={isAuthenticated} onSignIn={onSignIn} />
        ) : (
          <Flex direction="col" gap="4" className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
            {displayableMessages.map((message) => {
              return (
                <div key={message.id} className="flex flex-col gap-4">
                  <MessageRenderer
                    message={message}
                    onFileRetry={handleFileRetry}
                    onErrorDismiss={dismissErrorCard}
                  />
                </div>
              )
            })}

            {/* Invisible scroll anchor */}
            <div ref={messagesEndRef} />
          </Flex>
        )}
      </Flex>
    </Flex>
  )
})

/**
 * Message renderer that dispatches to the correct component based on message type
 */
interface MessageRendererProps {
  message: ChatMessage
  onFileRetry?: (messageId: string) => void
  onFileCancel?: (messageId: string) => void
  onFileDelete?: (messageId: string) => void
  onErrorDismiss?: (messageId: string) => void
}

const MessageRenderer: FC<MessageRendererProps> = ({
  message,
  onFileRetry: _onFileRetry,
  onFileCancel: _onFileCancel,
  onFileDelete: _onFileDelete,
  onErrorDismiss,
}) => {
  const messageType = message.messageType || (message.role === 'user' ? 'user' : 'assistant')

  switch (messageType) {
    case 'user':
      return <UserMessage content={message.content} timestamp={message.timestamp} />

    case 'status':
      // TODO: StatusCard was removed in refactor - implement inline status display
      // Status messages show agent activity (thinking, searching, planning, etc.)
      if (!message.statusType) {
        return null
      }
      return (
        <Flex
          align="center"
          gap="2"
          className="bg-surface-raised-30 border-base rounded-lg border px-4 py-2"
          role="status"
        >
          <Text kind="body/regular/sm" className="text-subtle">
            {message.statusType}: {message.content}
          </Text>
        </Flex>
      )

    case 'agent_response':
      // Short answers from the agent displayed in the chat area
      return (
        <AgentResponse
          content={message.content}
          timestamp={message.timestamp}
          showViewReport={message.showViewReport}
          jobId={message.deepResearchJobId}
          isDeepResearchActive={message.isDeepResearchActive}
          deepResearchJobStatus={message.deepResearchJobStatus}
        />
      )

    case 'file':
      // TODO: FileCard was removed in refactor - file display handled by FileSourceCard in panel
      // File operation messages show upload/ingest status
      if (!message.fileData) {
        return null
      }
      return (
        <Flex
          align="center"
          gap="2"
          className="bg-surface-raised-30 border-base rounded-lg border px-4 py-2"
          role="status"
        >
          <Document className="text-subtle h-4 w-4" />
          <Text kind="body/regular/sm" className="text-subtle">
            {message.fileData.fileName} ({message.fileData.fileStatus})
          </Text>
        </Flex>
      )

    case 'file_upload_status':
      // File upload status banners (uploaded, pending_warning)
      if (!message.fileUploadStatusData) {
        return null
      }
      return (
        <FileUploadBanner
          type={message.fileUploadStatusData.type}
          fileCount={message.fileUploadStatusData.fileCount}
          timestamp={message.timestamp}
          onDismiss={onErrorDismiss ? () => onErrorDismiss(message.id) : undefined}
        />
      )

    case 'error':
      // Error banners (dismissable)
      if (!message.errorData) {
        return null
      }
      return (
        <ErrorBanner
          code={message.errorData.errorCode}
          message={message.errorData.errorMessage}
          details={message.errorData.errorDetails}
          timestamp={message.timestamp}
          onDismiss={onErrorDismiss ? () => onErrorDismiss(message.id) : undefined}
        />
      )

    case 'deep_research_banner':
      // Deep research status banners (success/failure)
      if (!message.deepResearchBannerData) {
        return null
      }
      return (
        <DeepResearchBanner
          bannerType={message.deepResearchBannerData.bannerType}
          jobId={message.deepResearchBannerData.jobId}
          totalTokens={message.deepResearchBannerData.totalTokens}
          toolCallCount={message.deepResearchBannerData.toolCallCount}
          timestamp={message.timestamp}
        />
      )

    case 'assistant':
      // Assistant messages (full reports) are not shown in chat area
      // They are displayed in the Details Panel instead
      return null

    default:
      return null
  }
}

/**
 * Welcome state shown when no messages exist
 * Shows different content based on authentication state
 */
interface WelcomeStateProps {
  isAuthenticated?: boolean
  onSignIn?: () => void
}

const WelcomeState: FC<WelcomeStateProps> = ({ isAuthenticated = false, onSignIn }) => {
  if (!isAuthenticated) {
    // Logged out state - prompt to sign in
    return (
      <Flex direction="col" align="center" justify="center" className="relative flex-1 p-8">
        {/* Starfield background */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-30">
          <div className="h-[500px] w-[500px]">
            <StarfieldAnimation particleCount={300} maxRadius={220} rotationSpeed={0.0005} />
          </div>
        </div>

        {/* Content */}
        <Flex direction="col" align="center" gap="6" className="relative z-10 max-w-md text-center">
          <span className="text-brand text-6xl">
            <Lock />
          </span>
          <Text kind="title/lg" className="text-primary">
            Welcome to AI-Q
          </Text>
          <Text kind="body/regular/md" className="text-subtle">
            Sign in with your account to start your AI-powered research session.
          </Text>
          <Button
            kind="primary"
            size="large"
            onClick={onSignIn}
            aria-label="Sign in with NVIDIA SSO"
            className="mt-2"
          >
            <Flex align="center" gap="2">
              <Text kind="label/semibold/md">Sign In with SSO</Text>
            </Flex>
          </Button>
        </Flex>
      </Flex>
    )
  }

  // Logged in state - ready to chat
  return (
    <Flex direction="col" align="center" justify="center" className="relative flex-1 p-8">
      {/* Starfield background */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-30">
        <div className="h-[500px] w-[500px]">
          <StarfieldAnimation particleCount={300} maxRadius={220} rotationSpeed={0.001} />
        </div>
      </div>

      {/* Content */}
      <Flex direction="col" align="center" gap="4" className="relative z-10 max-w-md text-center">
        <Text kind="title/lg" className="text-primary">
          Welcome to AI-Q
        </Text>
        <Text kind="body/regular/md" className="text-subtle">
          Your AI-powered research companion for exploring technical documentation, market analysis,
          and more.
        </Text>
      </Flex>
    </Flex>
  )
}
