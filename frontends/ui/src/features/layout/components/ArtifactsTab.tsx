// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ArtifactsTab Component
 *
 * Research panel view for generated report artifacts and files.
 */

'use client'

import { type FC, type ReactNode } from 'react'
import { Flex, Text } from '@/adapters/ui'
import { useShallow } from 'zustand/react/shallow'
import { Document } from '@/adapters/ui/icons'
import { useChatStore } from '@/features/chat'
import { FileCard } from './FileCard'

export const ArtifactsTab: FC = () => {
  const { deepResearchFiles, reportContent } = useChatStore(
    useShallow((s) => ({
      deepResearchFiles: s.deepResearchFiles,
      reportContent: s.reportContent,
    }))
  )

  const hasReport = Boolean(reportContent.trim())
  const hasArtifacts = hasReport || deepResearchFiles.length > 0

  return (
    <Flex direction="col" gap="5" className="h-full min-h-0">
      <Flex align="center" gap="2" className="shrink-0 flex-wrap">
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
      </Flex>

      <Flex direction="col" gap="5" className="min-h-0 flex-1 overflow-y-auto">
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

        {!hasArtifacts && (
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
