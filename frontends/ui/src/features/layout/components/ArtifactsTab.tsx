// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ArtifactsTab Component
 *
 * Research panel view for generated report artifacts and files.
 */

'use client'

import { type FC } from 'react'
import { Flex, Text } from '@/adapters/ui'
import { useShallow } from 'zustand/react/shallow'
import { Document } from '@/adapters/ui/icons'
import { useChatStore } from '@/features/chat'
import { FileCard } from './FileCard'

export const ArtifactsTab: FC = () => {
  const { deepResearchFiles } = useChatStore(
    useShallow((s) => ({
      deepResearchFiles: s.deepResearchFiles,
    }))
  )

  const hasArtifacts = deepResearchFiles.length > 0

  return (
    <Flex direction="col" gap="5" className="h-full min-h-0 overflow-hidden">
      <Flex direction="col" gap="5" className="min-h-0 flex-1 overflow-y-auto pr-1">
        {deepResearchFiles.length > 0 && (
          <Flex direction="col" gap="3" className="min-h-0">
            <Text kind="label/semibold/lg" className="text-primary">
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
