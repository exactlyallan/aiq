// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Research submit API client.
 *
 * Submits user research requests through the UI proxy instead of calling the
 * generic async job API directly. The backend remains responsible for deciding
 * whether the request can be answered shallowly or should escalate to a deep
 * async research job.
 */

import {
  ResearchApiErrorSchema,
  ResearchSubmitRequestSchema,
  ResearchSubmitResponseSchema,
  type ResearchApiFailureBoundary,
  type ResearchSubmitRequest,
  type ResearchSubmitResponse,
} from './research-job-contracts'
import { authenticatedFetch } from './authenticated-fetch'

const RESEARCH_SUBMIT_URL = '/api/research/submit'

type ResearchSubmitFetch = (url: string, options?: RequestInit) => Promise<Response>

export interface ResearchSubmitOptions {
  /** Optional fetch implementation for tests. */
  fetchImpl?: ResearchSubmitFetch
  /** Optional cancellation signal for the request. */
  signal?: AbortSignal
}

interface ResearchSubmitErrorArgs {
  status: number
  code: string
  message: string
  userMessage: string
  failureBoundary: ResearchApiFailureBoundary
  retryable: boolean
  requestId?: string
  jobId?: string
  details?: Record<string, unknown>
}

export class ResearchSubmitError extends Error {
  readonly status: number
  readonly code: string
  readonly userMessage: string
  readonly failureBoundary: ResearchApiFailureBoundary
  readonly retryable: boolean
  readonly requestId?: string
  readonly jobId?: string
  readonly details?: Record<string, unknown>

  constructor(args: ResearchSubmitErrorArgs) {
    super(args.message)
    this.name = 'ResearchSubmitError'
    this.status = args.status
    this.code = args.code
    this.userMessage = args.userMessage
    this.failureBoundary = args.failureBoundary
    this.retryable = args.retryable
    this.requestId = args.requestId
    this.jobId = args.jobId
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
): ResearchSubmitError =>
  new ResearchSubmitError({
    status,
    code: 'RESEARCH_SUBMIT_ERROR',
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
    throw new ResearchSubmitError({
      status: response.status,
      code: error.code,
      message: error.message,
      userMessage: error.user_message,
      failureBoundary: error.failure_boundary,
      retryable: error.retryable,
      requestId: error.request_id,
      jobId: error.job_id,
      details: error.details,
    })
  }

  throw createFallbackError(
    response.status,
    response.statusText || 'Research request failed.',
    'unknown',
    response.status >= 500
  )
}

/**
 * Submit a research request to the backend-routed research API.
 */
export const submitResearch = async (
  request: ResearchSubmitRequest,
  options: ResearchSubmitOptions = {}
): Promise<ResearchSubmitResponse> => {
  const parsedRequest = ResearchSubmitRequestSchema.safeParse(request)
  if (!parsedRequest.success) {
    throw new ResearchSubmitError({
      status: 0,
      code: 'VALIDATION_ERROR',
      message: parsedRequest.error.message,
      userMessage: 'The research request is invalid.',
      failureBoundary: 'client',
      retryable: false,
      details: { issues: parsedRequest.error.issues },
    })
  }

  const fetchImpl = options.fetchImpl ?? authenticatedFetch
  let response: Response

  try {
    response = await fetchImpl(RESEARCH_SUBMIT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parsedRequest.data),
      signal: options.signal,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed.'
    throw new ResearchSubmitError({
      status: 0,
      code: 'NETWORK_ERROR',
      message,
      userMessage: 'The UI could not reach the research backend.',
      failureBoundary: 'ui_proxy',
      retryable: true,
    })
  }

  if (!response.ok) {
    await throwApiError(response)
  }

  const body = await parseJson(response)
  const parsedResponse = ResearchSubmitResponseSchema.safeParse(body)
  if (!parsedResponse.success) {
    throw new ResearchSubmitError({
      status: response.status,
      code: 'MALFORMED_RESPONSE',
      message: parsedResponse.error.message,
      userMessage: 'The backend returned an invalid research response.',
      failureBoundary: 'ui_proxy',
      retryable: true,
      details: { issues: parsedResponse.error.issues },
    })
  }

  return parsedResponse.data
}
