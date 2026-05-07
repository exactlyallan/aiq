// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { JobStateResponse } from '@/adapters/api'

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
}

const toDate = (value?: string): Date => {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

const normalizeTodoStatus = (status: string): 'pending' | 'in_progress' | 'completed' | 'stopped' => {
  if (status === 'completed' || status === 'in_progress' || status === 'pending') return status
  return 'stopped'
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

export const buildDeepResearchJobStateSnapshot = (
  stateResponse: JobStateResponse
): DeepResearchJobStateSnapshot | null => {
  if (!stateResponse.has_state || !stateResponse.artifacts) return null

  const { tools = [], outputs = [], sources } = stateResponse.artifacts
  const toolCalls = tools.map((tool, index) => ({
    id: `tool-${index}-${stableIdPart(tool.name || 'tool')}`,
    name: tool.name || 'tool',
    input: toRecord(tool.input),
    output: typeof tool.output === 'string' ? tool.output : undefined,
    workflow: tool.workflow,
    agentId: tool.agent_id || tool.agentId,
    status: tool.output ? ('complete' as const) : ('running' as const),
    timestamp: toDate(tool.timestamp),
  }))

  const citations: DeepResearchJobStateSnapshot['citations'] = []
  const files: DeepResearchJobStateSnapshot['files'] = []
  let todos: DeepResearchJobStateSnapshot['todos']
  let reportContent: string | undefined

  outputs.forEach((output, index) => {
    if (output.type === 'todo' && Array.isArray(output.content)) {
      todos = output.content.map((todo, todoIndex) => {
        const content = isRecord(todo) && typeof todo.content === 'string' ? todo.content : String(todo)
        const status = isRecord(todo) && typeof todo.status === 'string' ? todo.status : 'pending'
        return {
          id: `todo-${todoIndex}-${stableIdPart(content)}`,
          content,
          status: normalizeTodoStatus(status),
        }
      })
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
      const content = typeof output.content === 'string' ? output.content : JSON.stringify(output.content)
      const filePath = output.file_path || output.path || output.url || output.name || `file-${index}`
      const filename = filePath.split('/').pop() || filePath
      files.push({
        id: `file-${index}-${stableIdPart(filename)}`,
        filename,
        content,
        timestamp: toDate(output.timestamp),
      })
      return
    }

    if (
      typeof output.content === 'string' &&
      (output.type === 'report' ||
        output.output_category === 'final_report' ||
        (output.type === 'output' && output.output_category !== 'research_notes'))
    ) {
      reportContent = output.content
    }
  })

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
    citations,
    files,
    ...(todos ? { todos } : {}),
    ...(reportContent ? { reportContent } : {}),
  }
}
