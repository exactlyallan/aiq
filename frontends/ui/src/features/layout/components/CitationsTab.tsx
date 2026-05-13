// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * CitationsTab Component
 *
 * Displays referenced sources first, then sources read during research.
 *
 * Job-state events:
 * - artifact.update type: "citation_source" - Sources discovered during search
 * - artifact.update type: "citation_use" - Sources actually cited in the report
 */

'use client'

import { type FC, useMemo } from 'react'
import { Flex, Text } from '@/adapters/ui'
import { useChatStore } from '@/features/chat'
import type { CitationSource } from '@/features/chat/types'
import { CitationCard } from './CitationCard'

export const CitationsTab: FC = () => {
  const deepResearchCitations = useChatStore((s) => s.deepResearchCitations)

  const { referencedCitations, readCitations } = useMemo(() => {
    const sortNewestFirst = (citations: CitationSource[]) =>
      [...citations].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )

    return {
      referencedCitations: sortNewestFirst(deepResearchCitations.filter((c) => c.isCited)),
      readCitations: sortNewestFirst(deepResearchCitations.filter((c) => !c.isCited)),
    }
  }, [deepResearchCitations])

  return (
    <Flex direction="col" gap="5" className="h-full min-h-0 overflow-y-auto">
      <CitationSection
        title="Referenced"
        description="Sources referenced in the final report."
        citations={referencedCitations}
      />

      <CitationSection
        title="Read"
        description="Sources discovered during research that were not referenced in the final report."
        citations={readCitations}
      />
    </Flex>
  )
}

interface CitationSectionProps {
  title: string
  description: string
  citations: CitationSource[]
}

const CitationSection: FC<CitationSectionProps> = ({ title, description, citations }) => (
  <Flex direction="col" gap="3" className="shrink-0">
    <Flex direction="col" gap="1">
      <Flex align="center" gap="2">
        <Text kind="label/semibold/lg" className="text-primary">
          {title}
        </Text>
        {citations.length > 0 && (
          <Text kind="body/regular/xs" className="text-subtle">
            {citations.length}
          </Text>
        )}
      </Flex>
      <Text kind="body/regular/xs" className="text-subtle">
        {description}
      </Text>
    </Flex>

    {citations.length > 0 && (
      <Flex direction="col" gap="2">
        {citations.map((citation) => (
          <div key={citation.id} className="shrink-0">
            <CitationCard citation={citation} />
          </div>
        ))}
      </Flex>
    )}
  </Flex>
)
