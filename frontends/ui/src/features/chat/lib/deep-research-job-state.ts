// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { JobStateResponse } from '@/adapters/api'

export type ReportContentCategory = 'research_notes' | 'draft' | 'final_report'

export interface DeepResearchJobStateSnapshot {
  toolCalls: Array<{
    id: string
    name: string
    input?: Record<string, unknown>
    output?: string
    workflow?: string
    agentId?: string
    status: 'running' | 'complete'
    timestamp: Date
  }>
  llmSteps: Array<{
    id: string
    name: string
    workflow?: string
    content: string
    thinking?: string
    usage?: { input_tokens: number; output_tokens: number }
    timestamp: Date
    isComplete: boolean
  }>
  currentActivity?: {
    id: string
    type: string
    label: string
    status: 'running' | 'complete' | 'error'
    timestamp: Date
  }
  citations: Array<{
    id: string
    url: string
    content: string
    isCited?: boolean
    timestamp: Date
  }>
  files: Array<{
    id: string
    filename: string
    content: string
    timestamp: Date
  }>
  todos?: Array<{
    id: string
    content: string
    status: 'pending' | 'in_progress' | 'completed' | 'stopped'
  }>
  reportContent?: string
  reportContentCategory?: ReportContentCategory
}

const toDate = (value?: string): Date => {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

const normalizeTodoStatus = (
  status: string
): 'pending' | 'in_progress' | 'completed' | 'stopped' => {
  if (status === 'completed' || status === 'in_progress' || status === 'pending') return status
  return 'stopped'
}

const normalizeToolStatus = (status?: string, output?: string): 'running' | 'complete' => {
  if (status === 'completed' || status === 'complete' || status === 'success') return 'complete'
  return output ? 'complete' : 'running'
}

const normalizeUsage = (usage?: {
  input_tokens?: number
  output_tokens?: number
}): { input_tokens: number; output_tokens: number } | undefined => {
  if (!usage) return undefined
  return {
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
  }
}

const stableIdPart = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'item'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (isRecord(value)) return value
  if (typeof value !== 'string') return undefined

  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : { _raw: value }
  } catch {
    return { _raw: value, _truncated: true }
  }
}

const stringifyMarkdownValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined

    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return stringifyMarkdownValue(JSON.parse(trimmed))
      } catch {
        return value
      }
    }

    return value
  }

  if (isRecord(value)) {
    for (const key of [
      'markdown',
      'report',
      'draft',
      'content',
      'text',
      'summary',
      'final_report',
      'research_notes',
    ]) {
      const extracted = stringifyMarkdownValue(value[key])
      if (extracted) return extracted
    }

    return Object.entries(value)
      .filter(
        ([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== ''
      )
      .map(([key, entryValue]) => {
        const sectionTitle = key
          .replace(/[_-]+/g, ' ')
          .replace(/\b\w/g, (letter) => letter.toUpperCase())
        const sectionContent =
          typeof entryValue === 'string'
            ? entryValue
            : `\`\`\`json\n${JSON.stringify(entryValue, null, 2)}\n\`\`\``
        return `## ${sectionTitle}\n\n${sectionContent}`
      })
      .join('\n\n')
  }

  return undefined
}

const normalizeReportCategory = (
  outputType: string,
  outputCategory?: string
): ReportContentCategory | undefined => {
  if (outputType === 'report' || outputCategory === 'final_report') return 'final_report'
  if (outputType !== 'output') return undefined
  if (outputCategory === 'research_notes' || outputCategory === 'intermediate')
    return 'research_notes'
  return 'draft'
}

const getReportPriority = (category: ReportContentCategory, source: 'file' | 'output'): number => {
  if (category === 'final_report') return 100
  if (source === 'file' && category === 'research_notes') return 60
  if (category === 'research_notes') return 40
  return 20
}

const isResearchMarkdownFile = (filename: string): boolean => {
  const normalized = filename.toLowerCase()
  return /^research(?:[-_]\d+|[-_]notes)?\.(md|markdown)$/.test(normalized)
}

type TodoCandidate = {
  todos: NonNullable<DeepResearchJobStateSnapshot['todos']>
  workflow?: string
  name?: string
  timestamp: Date
}

const todoCandidateScore = (candidate: TodoCandidate): number => {
  const source = `${candidate.workflow ?? ''} ${candidate.name ?? ''}`.toLowerCase()
  let score = candidate.todos.length

  if (/(orchestr|supervisor|planner|plan|main|deep[-_\s]?research)/.test(source)) {
    score += 100
  }

  if (/(researcher|worker|sub[-_\s]?agent|summarizer|citation|source)/.test(source)) {
    score -= 25
  }

  return score
}

const chooseTopLevelTodoList = (candidates: TodoCandidate[]): TodoCandidate | undefined =>
  candidates.reduce<TodoCandidate | undefined>((best, candidate) => {
    if (!best) return candidate

    const score = todoCandidateScore(candidate)
    const bestScore = todoCandidateScore(best)
    if (score !== bestScore) return score > bestScore ? candidate : best

    // When metadata is not enough, keep the earliest broad plan. Sub-agent todo
    // lists are usually emitted later during delegated work.
    return candidate.timestamp.getTime() < best.timestamp.getTime() ? candidate : best
  }, undefined)

const normalizeTodoList = (
  content: unknown
): NonNullable<DeepResearchJobStateSnapshot['todos']> | undefined => {
  if (!Array.isArray(content)) return undefined

  return content.map((todo, todoIndex) => {
    const todoContent =
      isRecord(todo) && typeof todo.content === 'string' ? todo.content : String(todo)
    const status = isRecord(todo) && typeof todo.status === 'string' ? todo.status : 'pending'
    return {
      id: `todo-${todoIndex}-${stableIdPart(todoContent)}`,
      content: todoContent,
      status: normalizeTodoStatus(status),
    }
  })
}

export const buildDeepResearchJobStateSnapshot = (
  stateResponse: JobStateResponse
): DeepResearchJobStateSnapshot | null => {
  if (!stateResponse.has_state || !stateResponse.artifacts) return null

  const { tools = [], outputs = [], sources, llm_steps = [], activity } = stateResponse.artifacts
  const toolCalls = tools.map((tool, index) => ({
    id: `tool-${index}-${stableIdPart(tool.name || 'tool')}`,
    name: tool.name || 'tool',
    input: toRecord(tool.input),
    output: typeof tool.output === 'string' ? tool.output : undefined,
    workflow: tool.workflow,
    agentId: tool.agent_id || tool.agentId,
    status: normalizeToolStatus(
      tool.status,
      typeof tool.output === 'string' ? tool.output : undefined
    ),
    timestamp: toDate(tool.timestamp),
  }))

  const llmSteps = llm_steps.map((step) => ({
    id: step.id,
    name: step.name || 'LLM',
    workflow: step.workflow,
    content: step.content || '',
    thinking: step.thinking,
    usage: normalizeUsage(step.usage),
    timestamp: toDate(step.timestamp),
    isComplete: Boolean(step.is_complete),
  }))

  const citations: DeepResearchJobStateSnapshot['citations'] = []
  const files: DeepResearchJobStateSnapshot['files'] = []
  const todoCandidates: TodoCandidate[] = []
  let reportContent: string | undefined
  let reportContentCategory: ReportContentCategory | undefined
  let reportContentPriority = 0

  const maybeSetReportContent = (
    content: string | undefined,
    category: ReportContentCategory,
    source: 'file' | 'output'
  ): void => {
    if (!content) return

    const priority = getReportPriority(category, source)
    if (priority >= reportContentPriority) {
      reportContent = content
      reportContentCategory = category
      reportContentPriority = priority
    }
  }

  outputs.forEach((output, index) => {
    if (output.type === 'todo') {
      const todoList = normalizeTodoList(output.content)
      if (todoList?.length) {
        todoCandidates.push({
          todos: todoList,
          workflow: output.workflow,
          name: output.name,
          timestamp: toDate(output.timestamp),
        })
      }
      return
    }

    if (output.type === 'citation_source' || output.type === 'citation_use') {
      const content = typeof output.content === 'string' ? output.content : ''
      const url = output.url || content
      if (url) {
        citations.push({
          id: `citation-${index}-${stableIdPart(url)}`,
          url,
          content,
          isCited: output.type === 'citation_use',
          timestamp: toDate(output.timestamp),
        })
      }
      return
    }

    if (output.type === 'file') {
      const content =
        typeof output.content === 'string' ? output.content : JSON.stringify(output.content)
      const filePath =
        output.file_path || output.path || output.url || output.name || `file-${index}`
      const filename = filePath.split('/').pop() || filePath
      files.push({
        id: `file-${index}-${stableIdPart(filename)}`,
        filename,
        content,
        timestamp: toDate(output.timestamp),
      })

      if (isResearchMarkdownFile(filename)) {
        maybeSetReportContent(stringifyMarkdownValue(content), 'research_notes', 'file')
      }
      return
    }

    const outputReportCategory = normalizeReportCategory(output.type, output.output_category)
    const outputReportContent = outputReportCategory
      ? stringifyMarkdownValue(output.content)
      : undefined
    if (outputReportCategory && outputReportContent) {
      maybeSetReportContent(outputReportContent, outputReportCategory, 'output')
    }
  })

  const todos = chooseTopLevelTodoList(todoCandidates)?.todos

  sources?.found_urls?.forEach((url, index) => {
    if (!citations.some((citation) => citation.url === url)) {
      citations.push({
        id: `source-found-${index}-${stableIdPart(url)}`,
        url,
        content: url,
        isCited: false,
        timestamp: new Date(),
      })
    }
  })

  sources?.cited_urls?.forEach((url, index) => {
    const existing = citations.find((citation) => citation.url === url)
    if (existing) {
      existing.isCited = true
    } else {
      citations.push({
        id: `source-cited-${index}-${stableIdPart(url)}`,
        url,
        content: url,
        isCited: true,
        timestamp: new Date(),
      })
    }
  })

  return {
    toolCalls,
    llmSteps,
    ...(activity?.current
      ? {
          currentActivity: {
            id: activity.current.id,
            type: activity.current.type,
            label: activity.current.label,
            status: activity.current.status,
            timestamp: toDate(activity.current.timestamp),
          },
        }
      : {}),
    citations,
    files,
    ...(todos ? { todos } : {}),
    ...(reportContent ? { reportContent } : {}),
    ...(reportContentCategory ? { reportContentCategory } : {}),
  }
}
