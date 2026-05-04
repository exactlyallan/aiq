// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ArtifactsTab Component
 *
 * Top-level research workspace tab for generated files and compact execution
 * activity. This intentionally avoids exposing raw model token streams.
 */

'use client'

import { type FC, type ReactNode } from 'react'
import { Flex, ProgressBar, Text } from '@/adapters/ui'
import { useShallow } from 'zustand/react/shallow'
import { CheckCircle, Document, Wrench } from '@/adapters/ui/icons'
import { useChatStore } from '@/features/chat'
import { FileCard } from './FileCard'

export const ArtifactsTab: FC = () => {
  const {
    deepResearchFiles,
    deepResearchTodos,
    deepResearchToolCalls,
    reportContent,
    currentStatus,
    isDeepResearchStreaming,
  } = useChatStore(useShallow((s) => ({
    deepResearchFiles: s.deepResearchFiles,
    deepResearchTodos: s.deepResearchTodos,
    deepResearchToolCalls: s.deepResearchToolCalls,
    reportContent: s.reportContent,
    currentStatus: s.currentStatus,
    isDeepResearchStreaming: s.isDeepResearchStreaming,
  })))

  const completedTaskCount = deepResearchTodos.filter((todo) => todo.status === 'completed').length
  const totalTaskCount = deepResearchTodos.length
  const progressValue = totalTaskCount > 0
    ? Math.round((completedTaskCount / totalTaskCount) * 100)
    : 0
  const runningToolCount = deepResearchToolCalls.filter((toolCall) => toolCall.status === 'running').length
  const hasReport = Boolean(reportContent.trim())
  const hasActivity = totalTaskCount > 0 || deepResearchToolCalls.length > 0 || isDeepResearchStreaming
  const hasArtifacts = hasReport || deepResearchFiles.length > 0

  return (
    <Flex direction="col" gap="5" className="h-full min-h-0">
      <Flex direction="col" gap="3" className="shrink-0">
        <Text kind="label/semibold/md" className="text-primary">
          Artifacts
        </Text>
        <Flex align="center" gap="2" className="flex-wrap">
          <ArtifactSummaryItem
            icon={<Document className="h-4 w-4" />}
            label="Report"
            value={hasReport ? 'Available' : 'Pending'}
          />
          <ArtifactSummaryItem
            icon={<Document className="h-4 w-4" />}
            label="Files"
            value={String(deepResearchFiles.length)}
          />
          <ArtifactSummaryItem
            icon={<CheckCircle className="h-4 w-4" />}
            label="Tasks"
            value={totalTaskCount > 0 ? `${completedTaskCount}/${totalTaskCount}` : '0'}
          />
          <ArtifactSummaryItem
            icon={<Wrench className="h-4 w-4" />}
            label="Tools"
            value={runningToolCount > 0 ? `${runningToolCount} running` : String(deepResearchToolCalls.length)}
          />
        </Flex>
      </Flex>

      <Flex direction="col" gap="5" className="min-h-0 flex-1 overflow-y-auto">
        {hasActivity && (
          <Flex direction="col" gap="3" className="shrink-0">
            <Flex align="center" justify="between" gap="2">
              <Text kind="label/semibold/sm" className="text-subtle">
                Research Activity
              </Text>
              {currentStatus && (
                <Text kind="body/regular/xs" className="text-subtle">
                  {getCurrentStatusLabel(currentStatus)}
                </Text>
              )}
            </Flex>
            {totalTaskCount > 0 && (
              <ProgressBar value={progressValue} aria-label="Research activity progress" />
            )}
            {deepResearchTodos.length > 0 ? (
              <Flex direction="col" gap="1">
                {deepResearchTodos.map((todo) => (
                  <Flex
                    key={todo.id}
                    align="center"
                    gap="2"
                    className="border-base rounded-md border px-3 py-2"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${getTodoStatusClass(todo.status)}`}
                      aria-hidden="true"
                    />
                    <Text kind="body/regular/sm" className="min-w-0 flex-1 truncate text-primary">
                      {todo.content}
                    </Text>
                    <Text kind="body/regular/xs" className="shrink-0 text-subtle">
                      {getTodoStatusLabel(todo.status)}
                    </Text>
                  </Flex>
                ))}
              </Flex>
            ) : (
              <Text kind="body/regular/sm" className="text-subtle">
                Waiting for research activity.
              </Text>
            )}
          </Flex>
        )}

        {deepResearchFiles.length > 0 && (
          <Flex direction="col" gap="3" className="min-h-0">
            <Text kind="label/semibold/sm" className="text-subtle">
              Generated Files
            </Text>
            <Flex direction="col" gap="2" className="min-h-0">
              {deepResearchFiles.map((file) => (
                <FileCard key={file.id} file={file} />
              ))}
            </Flex>
          </Flex>
        )}

        {!hasArtifacts && !hasActivity && (
          <Flex direction="col" align="center" justify="center" className="flex-1 py-8 text-center">
            <Document className="text-subtle mb-3 h-8 w-8" />
            <Text kind="body/regular/md" className="text-subtle">
              No artifacts for this research session.
            </Text>
          </Flex>
        )}
      </Flex>
    </Flex>
  )
}

interface ArtifactSummaryItemProps {
  icon: ReactNode
  label: string
  value: string
}

const ArtifactSummaryItem: FC<ArtifactSummaryItemProps> = ({ icon, label, value }) => (
  <Flex
    align="center"
    gap="2"
    className="border-base bg-surface-raised min-h-8 rounded-md border px-2 py-1"
  >
    <span className="text-subtle" aria-hidden="true">
      {icon}
    </span>
    <Text kind="label/regular/xs" className="text-subtle">
      {label}
    </Text>
    <Text kind="label/semibold/xs" className="text-primary">
      {value}
    </Text>
  </Flex>
)

const getCurrentStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    thinking: 'Thinking',
    searching: 'Searching',
    planning: 'Planning',
    researching: 'Researching',
    writing: 'Writing',
    complete: 'Complete',
    error: 'Error',
  }
  return labels[status] ?? status
}

const getTodoStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    pending: 'Pending',
    in_progress: 'Running',
    completed: 'Done',
    stopped: 'Stopped',
  }
  return labels[status] ?? status
}

const getTodoStatusClass = (status: string): string => {
  if (status === 'completed') return 'bg-brand'
  if (status === 'in_progress') return 'bg-brand'
  if (status === 'stopped') return 'bg-[var(--border-color-base)]'
  return 'bg-[var(--text-color-subtle)]'
}
