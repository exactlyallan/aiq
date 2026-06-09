// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * MainLayout Component
 *
 * The main application layout container that orchestrates:
 * - AppBar (top)
 * - SessionsPanel (left, persistent compact/expanded rail)
 * - ChatArea + InputArea (center content)
 * - ResearchPanel (fixed right rail + overlay drawer)
 *
 * Handles auth state to show different UI for logged-in vs logged-out users.
 */

'use client'

import { type FC, useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Flex } from '@/adapters/ui'
import { AppBar } from './AppBar'
import { SessionsPanel } from './SessionsPanel'
import { ChatArea } from './ChatArea'
import { InputArea } from './InputArea'
import { ResearchPanel } from './ResearchPanel'
import { useChatStore, useDeepResearch, NoSourcesBanner } from '@/features/chat'
import {
  getLatestDeepResearchJobId,
  getLatestDeepResearchCompletionDate,
  hasActiveDeepResearchJob,
} from '@/features/chat/lib/session-activity'
import { useLayoutStore } from '../store'
import { useSessionUrl } from '@/hooks/use-session-url'
import type { ResearchJobListItem } from '@/adapters/api'

interface MainLayoutProps {
  /** Whether the user is authenticated */
  isAuthenticated?: boolean
  /** Whether authentication is required (false = using default user) */
  authRequired?: boolean
  /** User information for AppBar */
  user?: {
    name?: string
    email?: string
    image?: string
  }
  /** Callback when sign in is clicked */
  onSignIn?: () => void
  /** Callback when sign out is clicked */
  onSignOut?: () => void
}

/**
 * Main application layout with all panels and regions.
 * Manages the overall structure and panel states.
 * Chat state is managed via the useChatStore.
 */
export const MainLayout: FC<MainLayoutProps> = ({
  isAuthenticated = false,
  authRequired = false,
  user,
  onSignIn,
  onSignOut,
}) => {
  const {
    currentConversation,
    conversations,
    isDeepResearchStreaming,
    deepResearchOwnerConversationId,
    currentUserId,
  } = useChatStore(
    useShallow((s) => ({
      currentConversation: s.currentConversation,
      conversations: s.conversations,
      isDeepResearchStreaming: s.isDeepResearchStreaming,
      deepResearchOwnerConversationId: s.deepResearchOwnerConversationId,
      currentUserId: s.currentUserId,
    }))
  )

  const selectConversation = useChatStore((s) => s.selectConversation)
  const selectOrCreateJobConversation = useChatStore((s) => s.selectOrCreateJobConversation)
  const startNewSessionDraft = useChatStore((s) => s.startNewSessionDraft)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const deleteAllConversations = useChatStore((s) => s.deleteAllConversations)
  const updateConversationTitle = useChatStore((s) => s.updateConversationTitle)

  const closeRightPanel = useLayoutStore((s) => s.closeRightPanel)

  // Deep research polling hook - manages connection when deep research starts
  const { cancelCurrentJob } = useDeepResearch()

  // Sync session state with URL query parameters
  const { updateSessionUrl, clearSessionUrl } = useSessionUrl({ isAuthenticated })

  // Wrap selectConversation to also update URL
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      selectConversation(sessionId)
      updateSessionUrl(sessionId)
    },
    [selectConversation, updateSessionUrl]
  )

  const handleSelectJob = useCallback(
    (job: ResearchJobListItem) => {
      selectOrCreateJobConversation(job)
      updateSessionUrl(job.job_id)
    },
    [selectOrCreateJobConversation, updateSessionUrl]
  )

  // Start a new unsaved draft session and clear URL until first interaction.
  const handleNewSession = useCallback(() => {
    startNewSessionDraft()
    clearSessionUrl()
    closeRightPanel()
  }, [startNewSessionDraft, clearSessionUrl, closeRightPanel])

  // Wrap deleteConversation to clear URL if deleting current session
  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      const wasCurrentSession = currentConversation?.id === sessionId
      deleteConversation(sessionId)
      if (wasCurrentSession) {
        clearSessionUrl()
      }
    },
    [deleteConversation, currentConversation?.id, clearSessionUrl]
  )

  // Delete all sessions for the current user
  const handleDeleteAllSessions = useCallback(() => {
    deleteAllConversations()
    clearSessionUrl()
  }, [deleteAllConversations, clearSessionUrl])

  const userConversations = useMemo(
    () => (currentUserId ? conversations.filter((c) => c.userId === currentUserId) : []),
    [conversations, currentUserId]
  )

  const sessions = useMemo(
    () =>
      userConversations.map((conv) => ({
        id: conv.id,
        title: conv.title,
        date: conv.updatedAt,
        linkedJobId: getLatestDeepResearchJobId(conv.messages),
        completedAt: getLatestDeepResearchCompletionDate(conv.messages),
        hasActiveDeepResearch:
          hasActiveDeepResearchJob(conv.messages) ||
          (isDeepResearchStreaming && deepResearchOwnerConversationId === conv.id),
      })),
    [userConversations, isDeepResearchStreaming, deepResearchOwnerConversationId]
  )

  return (
    <Flex direction="col" className="h-screen min-w-[768px] overflow-x-auto overflow-y-hidden">
      {/* AppBar - Fixed at top */}
      <AppBar
        sessionTitle={currentConversation?.title || 'New Session'}
        isAuthenticated={isAuthenticated}
        authRequired={authRequired}
        user={user}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        onNewSession={handleNewSession}
      />

      {/* Main Content Area */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Sessions Panel (Left) - persistent rail */}
        <SessionsPanel
          sessions={sessions}
          selectedSessionId={currentConversation?.id}
          onSelectSession={handleSelectSession}
          onSelectJob={handleSelectJob}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onDeleteAllSessions={handleDeleteAllSessions}
          onRenameSession={updateConversationTitle}
        />

        <div className="relative flex min-w-0 flex-1 overflow-hidden">
          {/* Center Content: Chat + Input */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Chat Area - Scrollable */}
            <ChatArea isAuthenticated={isAuthenticated} onSignIn={onSignIn} />

            {/* No sources warning - shown when no data sources or files available */}
            <NoSourcesBanner isAuthenticated={isAuthenticated} />

            {/* Input Area - Fixed at bottom of chat */}
            <InputArea isAuthenticated={isAuthenticated} onStopResearch={cancelCurrentJob} />
          </div>

          {/* Research Panel (Right) - fixed rail with overlay drawer */}
          <ResearchPanel isAuthenticated={isAuthenticated} />
        </div>
      </div>
    </Flex>
  )
}
