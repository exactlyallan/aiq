// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Research job API contracts.
 *
 * These schemas intentionally model the planned HTTP/polling contract before
 * the refactor consumes it. Keeping fixtures and selectors pinned to these
 * contracts prevents UI state from being inferred from ad hoc response shapes.
 */

import { z } from 'zod'

export const ResearchApiFailureBoundarySchema = z.enum([
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

export const ResearchApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    user_message: z.string(),
    failure_boundary: ResearchApiFailureBoundarySchema,
    retryable: z.boolean(),
    request_id: z.string().optional(),
    job_id: z.string().optional(),
    details: z.record(z.unknown()).optional(),
  }),
})

export const ResearchJobStatusSchema = z.enum([
  'submitted',
  'running',
  'success',
  'failure',
  'interrupted',
  'expired',
  'unavailable',
  'stale',
])

export const ResearchReportAvailabilitySchema = z.enum([
  'unknown',
  'unavailable',
  'loading',
  'available',
  'expired',
  'error',
])

export const ResearchJobListItemSchema = z.object({
  job_id: z.string(),
  status: ResearchJobStatusSchema,
  agent_type: z.string().optional(),
  input_preview: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string().optional(),
  expires_at: z.string().nullable().optional(),
  data_sources: z.array(z.string()).default([]),
  collection_name: z.string().nullable().optional(),
  has_report: z.boolean(),
  report_availability: ResearchReportAvailabilitySchema.default('unknown'),
  error: z.string().nullable().optional(),
})

export const ResearchJobListResponseSchema = z.object({
  jobs: z.array(ResearchJobListItemSchema),
})

export const ResearchSubmitRequestSchema = z.object({
  prompt: z.string().min(1),
  data_sources: z.array(z.string()).default([]),
  collection_name: z.string().nullable().optional(),
})

export const ResearchShallowAnswerResponseSchema = z.object({
  type: z.literal('shallow_answer'),
  answer: z.string(),
  citations: z.array(z.string()).default([]),
  request_id: z.string().optional(),
})

export const ResearchAsyncJobStartedResponseSchema = z.object({
  type: z.literal('async_job_started'),
  job_id: z.string(),
  status: z.enum(['submitted', 'running']),
  request_id: z.string().optional(),
})

export const ResearchSubmitResponseSchema = z.discriminatedUnion('type', [
  ResearchShallowAnswerResponseSchema,
  ResearchAsyncJobStartedResponseSchema,
])

export type ResearchApiFailureBoundary = z.infer<typeof ResearchApiFailureBoundarySchema>
export type ResearchApiError = z.infer<typeof ResearchApiErrorSchema>
export type ResearchJobStatus = z.infer<typeof ResearchJobStatusSchema>
export type ResearchReportAvailability = z.infer<typeof ResearchReportAvailabilitySchema>
export type ResearchJobListItem = z.infer<typeof ResearchJobListItemSchema>
export type ResearchJobListResponse = z.infer<typeof ResearchJobListResponseSchema>
export type ResearchSubmitRequest = z.infer<typeof ResearchSubmitRequestSchema>
export type ResearchSubmitResponse = z.infer<typeof ResearchSubmitResponseSchema>
