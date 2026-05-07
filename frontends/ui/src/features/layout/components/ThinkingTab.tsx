// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ThinkingTab Component
 *
 * Research panel view for LLM thought traces during deep research.
 *
 * Job-state events:
 * - llm.start, llm.chunk, llm.end -> deepResearchLLMSteps -> ThoughtTracesTab
 */

'use client'

import { type FC, useMemo } from 'react'
import { Flex } from '@/adapters/ui'
import { useChatStore } from '@/features/chat'
import { ThoughtTracesTab } from './ThoughtTracesTab'
import type { ThoughtInfo } from './ThoughtCard'
import type { DeepResearchLLMStep } from '@/features/chat/types'

const mapLLMStepToThoughtInfo = (step: DeepResearchLLMStep): ThoughtInfo => ({
  id: step.id,
  modelName: step.name,
  content: step.content,
  thinking: step.thinking,
  workflow: step.workflow,
  isStreaming: !step.isComplete,
  timestamp: step.timestamp,
  usage: step.usage
    ? {
        prompt_tokens: step.usage.input_tokens,
        completion_tokens: step.usage.output_tokens,
      }
    : undefined,
})

export const ThinkingTab: FC = () => {
  const deepResearchLLMSteps = useChatStore((state) => state.deepResearchLLMSteps)

  const thoughtTraces = useMemo(
    () =>
      deepResearchLLMSteps.map(mapLLMStepToThoughtInfo).filter((thought) => {
        if (thought.isStreaming) return true
        const hasContent = thought.content && thought.content.trim().length > 0
        const hasThinking = thought.thinking && thought.thinking.trim().length > 0
        return hasContent || hasThinking
      }),
    [deepResearchLLMSteps]
  )

  return (
    <Flex direction="col" className="h-full min-h-0">
      <ThoughtTracesTab thoughtTraces={thoughtTraces} />
    </Flex>
  )
}
