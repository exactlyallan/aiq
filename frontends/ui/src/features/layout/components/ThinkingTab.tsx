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
import { useShallow } from 'zustand/react/shallow'
import { ThoughtTracesTab } from './ThoughtTracesTab'
import type { ThoughtInfo } from './ThoughtCard'
import type { DeepResearchLLMStep, ThinkingStep } from '@/features/chat/types'

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

const mapThinkingStepToThoughtInfo = (step: ThinkingStep): ThoughtInfo => ({
  id: `thinking-${step.id}`,
  modelName: step.displayName || step.functionName,
  content: step.content,
  workflow:
    step.category === 'tools'
      ? 'Tool activity'
      : step.category === 'tasks'
        ? 'Task activity'
        : 'Research activity',
  isStreaming: !step.isComplete,
  timestamp: step.timestamp,
})

const hasThoughtContent = (thought: ThoughtInfo): boolean => {
  if (thought.isStreaming) return true
  const hasContent = thought.content && thought.content.trim().length > 0
  const hasThinking = thought.thinking && thought.thinking.trim().length > 0
  return Boolean(hasContent || hasThinking)
}

const getThoughtTimestamp = (thought: ThoughtInfo): number => {
  if (!thought.timestamp) return 0
  const timestamp =
    typeof thought.timestamp === 'string' ? new Date(thought.timestamp) : thought.timestamp
  return Number.isNaN(timestamp.getTime()) ? 0 : timestamp.getTime()
}

export const ThinkingTab: FC = () => {
  const { deepResearchLLMSteps, thinkingSteps } = useChatStore(
    useShallow((state) => ({
      deepResearchLLMSteps: state.deepResearchLLMSteps,
      thinkingSteps: state.thinkingSteps,
    }))
  )

  const thoughtTraces = useMemo(() => {
    const shallowResearchThoughts = thinkingSteps
      .filter((step) => step.displaySurface === 'research_panel')
      .map(mapThinkingStepToThoughtInfo)

    return [...shallowResearchThoughts, ...deepResearchLLMSteps.map(mapLLMStepToThoughtInfo)]
      .filter(hasThoughtContent)
      .sort((a, b) => getThoughtTimestamp(a) - getThoughtTimestamp(b))
  }, [deepResearchLLMSteps, thinkingSteps])

  return (
    <Flex direction="col" className="h-full min-h-0">
      <ThoughtTracesTab thoughtTraces={thoughtTraces} />
    </Flex>
  )
}
