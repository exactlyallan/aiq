// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import type { ResearchJobListItem } from '@/adapters/api/research-job-contracts'
import { isReportLevelResearchJob } from './report-job-scope'

const job = (overrides: Partial<ResearchJobListItem> & { job_id: string }): ResearchJobListItem => ({
  job_id: overrides.job_id,
  status: overrides.status ?? 'running',
  agent_type: overrides.agent_type,
  input_preview: overrides.input_preview,
  created_at: overrides.created_at ?? '2026-05-04T12:00:00.000Z',
  updated_at: overrides.updated_at ?? '2026-05-04T12:00:00.000Z',
  expires_at: overrides.expires_at ?? null,
  data_sources: overrides.data_sources ?? [],
  collection_name: overrides.collection_name ?? null,
  has_report: overrides.has_report ?? false,
  report_availability: overrides.report_availability ?? 'unavailable',
  error: overrides.error ?? null,
})

describe('isReportLevelResearchJob', () => {
  test('keeps active jobs with UI-facing research context', () => {
    expect(
      isReportLevelResearchJob(job({
        job_id: 'report-running',
        status: 'running',
        input_preview: 'Research CUDA memory trends',
        collection_name: 's_1',
      }))
    ).toBe(true)
  })

  test('filters active implementation jobs without UI context', () => {
    expect(
      isReportLevelResearchJob(job({
        job_id: 'sub-agent-running',
        status: 'running',
      }))
    ).toBe(false)
  })

  test('keeps completed jobs only when their report is available', () => {
    expect(
      isReportLevelResearchJob(job({
        job_id: 'report-success',
        status: 'success',
        has_report: true,
        report_availability: 'available',
      }))
    ).toBe(true)

    expect(
      isReportLevelResearchJob(job({
        job_id: 'expired-report',
        status: 'expired',
        has_report: true,
        report_availability: 'expired',
      }))
    ).toBe(false)
  })

  test('keeps interrupted or failed top-level research runs with context', () => {
    expect(
      isReportLevelResearchJob(job({
        job_id: 'report-interrupted',
        status: 'interrupted',
        input_preview: 'Interrupted report',
      }))
    ).toBe(true)

    expect(
      isReportLevelResearchJob(job({
        job_id: 'report-failed',
        status: 'failure',
        collection_name: 's_2',
      }))
    ).toBe(true)
  })
})
