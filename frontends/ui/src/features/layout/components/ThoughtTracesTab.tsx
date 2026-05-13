// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ThoughtTracesTab Component
 *
 * Sub-tab within ThinkingTab displaying LLM thought traces and chain-of-thought content.
 *
 * Job-state events: llm.start, llm.chunk, llm.end
 */

'use client'

import { type FC } from 'react'
import { Flex, Text } from '@/adapters/ui'
import { ThinkingReasoning } from '@/adapters/ui/icons'
import { ThoughtCard, type ThoughtInfo } from './ThoughtCard'

interface ThoughtTracesTabProps {
  /** Array of thought traces from job-state events */
  thoughtTraces?: ThoughtInfo[]
  /** Whether LLM is currently generating */
  isStreaming?: boolean
}

/**
 * Thought traces sub-tab content showing LLM inference activity.
 */
export const ThoughtTracesTab: FC<ThoughtTracesTabProps> = ({ thoughtTraces = [] }) => {
  const isEmpty = thoughtTraces.length === 0
  const streamingCount = thoughtTraces.filter((t) => t.isStreaming).length

  return (
    <Flex direction="col" gap="4" className="h-full min-h-0">
      {/* Header */}
      <Flex direction="col" gap="1" className="shrink-0">
        <Flex align="center" gap="2">
          <Text kind="label/semibold/lg" className="text-primary">
            Thoughts
          </Text>
          {thoughtTraces.length > 0 && (
            <Text kind="body/regular/xs" className="text-subtle">
              {streamingCount > 0 ? `${streamingCount} active` : `${thoughtTraces.length}`}
            </Text>
          )}
        </Flex>
        <Text kind="body/regular/xs" className="text-subtle">
          LLM reasoning and inference activity.
        </Text>
      </Flex>

      {/* Content */}
      {isEmpty ? (
        <Flex direction="col" align="center" justify="center" className="flex-1 py-8 text-center">
          <ThinkingReasoning className="text-subtle mb-3 h-8 w-8" />
          <Text kind="body/regular/md" className="text-subtle">
            Thoughts will appear here during research.
          </Text>
        </Flex>
      ) : (
        <Flex direction="col" gap="2" className="min-h-0 flex-1 overflow-y-auto">
          {thoughtTraces.map((thought) => (
            <div key={thought.id} className="shrink-0">
              <ThoughtCard thought={thought} />
            </div>
          ))}
        </Flex>
      )}
    </Flex>
  )
}
