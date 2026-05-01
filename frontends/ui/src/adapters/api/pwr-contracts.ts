// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Project Weight Reduction API contracts.
 *
 * These schemas intentionally model the planned HTTP/polling contract before
 * the refactor consumes it. Keeping fixtures and selectors pinned to these
 * contracts prevents UI state from being inferred from ad hoc response shapes.
 */

import { z } from 'zod'

export const PwrFailureBoundarySchema = z.enum([
  'client',
  'ui_proxy',
  'aiq_backend',
  'async_job_worker',
  'llm_provider',
  'data_source',
  'auth',
  'job_lookup',
  'report_lookup',
  'unknown',
])

export const PwrApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    user_message: z.string(),
    failure_boundary: PwrFailureBoundarySchema,
    retryable: z.boolean(),
    request_id: z.string().optional(),
    job_id: z.string().optional(),
    details: z.record(z.unknown()).optional(),
  }),
})

export const PwrJobStatusSchema = z.enum([
  'submitted',
  'running',
  'success',
  'failure',
  'interrupted',
  'expired',
  'unavailable',
  'stale',
])

export const PwrReportAvailabilitySchema = z.enum([
  'unknown',
  'unavailable',
  'loading',
  'available',
  'expired',
  'error',
])

export const PwrJobListItemSchema = z.object({
  job_id: z.string(),
  status: PwrJobStatusSchema,
  agent_type: z.string().optional(),
  input_preview: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  expires_at: z.string().nullable().optional(),
  data_sources: z.array(z.string()).default([]),
  collection_name: z.string().nullable().optional(),
  has_report: z.boolean(),
  report_availability: PwrReportAvailabilitySchema.default('unknown'),
  error: z.string().nullable().optional(),
})

export const PwrJobListResponseSchema = z.object({
  jobs: z.array(PwrJobListItemSchema),
})

export const PwrResearchSubmitRequestSchema = z.object({
  prompt: z.string().min(1),
  data_sources: z.array(z.string()).default([]),
  collection_name: z.string().nullable().optional(),
})

export const PwrShallowAnswerResponseSchema = z.object({
  type: z.literal('shallow_answer'),
  answer: z.string(),
  citations: z.array(z.string()).default([]),
  request_id: z.string().optional(),
})

export const PwrAsyncJobStartedResponseSchema = z.object({
  type: z.literal('async_job_started'),
  job_id: z.string(),
  status: z.enum(['submitted', 'running']),
  request_id: z.string().optional(),
})

export const PwrResearchSubmitResponseSchema = z.discriminatedUnion('type', [
  PwrShallowAnswerResponseSchema,
  PwrAsyncJobStartedResponseSchema,
])

export type PwrFailureBoundary = z.infer<typeof PwrFailureBoundarySchema>
export type PwrApiError = z.infer<typeof PwrApiErrorSchema>
export type PwrJobStatus = z.infer<typeof PwrJobStatusSchema>
export type PwrReportAvailability = z.infer<typeof PwrReportAvailabilitySchema>
export type PwrJobListItem = z.infer<typeof PwrJobListItemSchema>
export type PwrJobListResponse = z.infer<typeof PwrJobListResponseSchema>
export type PwrResearchSubmitRequest = z.infer<typeof PwrResearchSubmitRequestSchema>
export type PwrResearchSubmitResponse = z.infer<typeof PwrResearchSubmitResponseSchema>
