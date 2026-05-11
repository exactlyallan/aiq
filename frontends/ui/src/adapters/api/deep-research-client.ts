// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Deep Research REST Client
 *
 * Browser code uses explicit HTTP requests for async job status, state,
 * report, and cancellation. It does not open app-owned WebSocket, SSE, or
 * EventSource transports.
 */

import { apiConfig } from './config'

export type DeepResearchJobStatus = 'submitted' | 'running' | 'success' | 'failure' | 'interrupted'

export interface JobStatusResponse {
  job_id: string
  status: DeepResearchJobStatus
  error: string | null
  agent_type?: string | null
  created_at?: string | null
}

export interface JobReportResponse {
  job_id: string
  has_report: boolean
  report: string | null
}

export interface CancelJobResponse {
  cancelled?: boolean
  job_id?: string
  status?: DeepResearchJobStatus
  task_cancelled?: boolean
}

export interface JobStateResponse {
  job_id: string
  has_state: boolean
  state: Record<string, unknown> | null
  artifacts: {
    tools: Array<{
      name: string
      input?: unknown
      output?: string
      status?: string
      timestamp?: string
      workflow?: string
      agent_id?: string
      agentId?: string
    }>
    outputs: Array<{
      type: string
      content: unknown
      timestamp?: string
      name?: string
      workflow?: string
      url?: string
      path?: string
      file_path?: string
      output_category?: string
    }>
    sources?: {
      found?: number
      cited?: number
      found_urls?: string[]
      cited_urls?: string[]
    }
    llm_steps?: Array<{
      id: string
      name: string
      workflow?: string
      content?: string
      thinking?: string
      usage?: { input_tokens?: number; output_tokens?: number }
      timestamp?: string
      is_complete?: boolean
    }>
    activity?: {
      current?: {
        id: string
        type: string
        label: string
        status: 'running' | 'complete' | 'error'
        timestamp?: string
      } | null
      items?: Array<{
        id: string
        type: string
        label: string
        status: 'running' | 'complete' | 'error'
        timestamp?: string
      }>
    }
  } | null
}

const getDeepResearchBaseUrl = (): string => {
  const isBrowser = typeof window !== 'undefined'
  return isBrowser ? '/api/jobs/async' : `${apiConfig.baseUrl}/v1/jobs/async`
}

const buildHeaders = (authToken?: string): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
})

const parseJsonResponse = async <T>(response: Response, failureMessage: string): Promise<T> => {
  if (!response.ok) {
    throw new Error(`${failureMessage}: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const getJobStatus = async (
  jobId: string,
  authToken?: string
): Promise<JobStatusResponse> => {
  const response = await fetch(`${getDeepResearchBaseUrl()}/job/${jobId}`, {
    headers: buildHeaders(authToken),
  })

  return parseJsonResponse<JobStatusResponse>(response, 'Failed to get job status')
}

export const getJobReport = async (
  jobId: string,
  authToken?: string
): Promise<JobReportResponse> => {
  const response = await fetch(`${getDeepResearchBaseUrl()}/job/${jobId}/report`, {
    headers: buildHeaders(authToken),
  })

  return parseJsonResponse<JobReportResponse>(response, 'Failed to get job report')
}

export const cancelJob = async (
  jobId: string,
  authToken?: string
): Promise<CancelJobResponse> => {
  const response = await fetch(`${getDeepResearchBaseUrl()}/job/${jobId}/cancel`, {
    method: 'POST',
    headers: buildHeaders(authToken),
  })

  return parseJsonResponse<CancelJobResponse>(response, 'Failed to cancel job')
}

export const getJobState = async (
  jobId: string,
  authToken?: string
): Promise<JobStateResponse> => {
  const response = await fetch(`${getDeepResearchBaseUrl()}/job/${jobId}/state`, {
    headers: buildHeaders(authToken),
  })

  return parseJsonResponse<JobStateResponse>(response, 'Failed to get job state')
}
