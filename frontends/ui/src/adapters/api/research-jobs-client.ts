// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Research jobs API client.
 *
 * Lists backend-owned research jobs for the current user. The frontend treats
 * this list as the durable source of truth for the sessions panel; browser
 * conversations remain a lightweight local viewing shell.
 */

import {
  ResearchApiErrorSchema,
  ResearchJobListResponseSchema,
  type ResearchApiFailureBoundary,
  type ResearchJobListResponse,
} from './research-job-contracts'
import { authenticatedFetch } from './authenticated-fetch'

const RESEARCH_JOBS_URL = '/api/jobs/async/jobs'

type ResearchJobsFetch = (url: string, options?: RequestInit) => Promise<Response>

export interface ListResearchJobsOptions {
  /** Optional fetch implementation for tests. */
  fetchImpl?: ResearchJobsFetch
  /** Optional auth token for callers that already hold one. */
  authToken?: string
  /** Optional cancellation signal for request lifecycle management. */
  signal?: AbortSignal
}

interface ResearchJobsErrorArgs {
  status: number
  code: string
  message: string
  userMessage: string
  failureBoundary: ResearchApiFailureBoundary
  retryable: boolean
  requestId?: string
  details?: Record<string, unknown>
}

export class ResearchJobsError extends Error {
  readonly status: number
  readonly code: string
  readonly userMessage: string
  readonly failureBoundary: ResearchApiFailureBoundary
  readonly retryable: boolean
  readonly requestId?: string
  readonly details?: Record<string, unknown>

  constructor(args: ResearchJobsErrorArgs) {
    super(args.message)
    this.name = 'ResearchJobsError'
    this.status = args.status
    this.code = args.code
    this.userMessage = args.userMessage
    this.failureBoundary = args.failureBoundary
    this.retryable = args.retryable
    this.requestId = args.requestId
    this.details = args.details
  }
}

const parseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const createFallbackError = (
  status: number,
  message: string,
  failureBoundary: ResearchApiFailureBoundary,
  retryable: boolean
): ResearchJobsError =>
  new ResearchJobsError({
    status,
    code: 'RESEARCH_JOBS_ERROR',
    message,
    userMessage: message,
    failureBoundary,
    retryable,
  })

const throwApiError = async (response: Response): Promise<never> => {
  const body = await parseJson(response)
  const parsed = ResearchApiErrorSchema.safeParse(body)

  if (parsed.success) {
    const { error } = parsed.data
    throw new ResearchJobsError({
      status: response.status,
      code: error.code,
      message: error.message,
      userMessage: error.user_message,
      failureBoundary: error.failure_boundary,
      retryable: error.retryable,
      requestId: error.request_id,
      details: error.details,
    })
  }

  throw createFallbackError(
    response.status,
    response.statusText || 'Failed to load research jobs.',
    'unknown',
    response.status >= 500
  )
}

export const listResearchJobs = async (
  options: ListResearchJobsOptions = {}
): Promise<ResearchJobListResponse> => {
  const fetchImpl = options.fetchImpl ?? authenticatedFetch
  let response: Response

  try {
    response = await fetchImpl(RESEARCH_JOBS_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}),
      },
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    const message = error instanceof Error ? error.message : 'Network request failed.'
    throw new ResearchJobsError({
      status: 0,
      code: 'NETWORK_ERROR',
      message,
      userMessage: 'The UI could not reach the research jobs API.',
      failureBoundary: 'ui_proxy',
      retryable: true,
    })
  }

  if (!response.ok) {
    await throwApiError(response)
  }

  const body = await parseJson(response)
  const parsedResponse = ResearchJobListResponseSchema.safeParse(body)
  if (!parsedResponse.success) {
    throw new ResearchJobsError({
      status: response.status,
      code: 'MALFORMED_RESPONSE',
      message: parsedResponse.error.message,
      userMessage: 'The backend returned an invalid research jobs response.',
      failureBoundary: 'ui_proxy',
      retryable: true,
      details: { issues: parsedResponse.error.issues },
    })
  }

  return parsedResponse.data
}
