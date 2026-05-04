// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Report-level job filtering.
 *
 * The backend async job table can contain implementation details such as
 * sub-agent jobs. The sessions panel should show user-facing report jobs only:
 * active top-level research jobs, completed jobs with an available report, and
 * interrupted/failed top-level research runs that have UI context.
 */

import type { ResearchJobListItem } from '@/adapters/api/research-job-contracts'
import { isPollableJobStatus } from './multi-job-flow'

const hasUiJobContext = (job: ResearchJobListItem): boolean =>
  Boolean(
    job.input_preview?.trim() ||
      job.collection_name?.trim() ||
      job.data_sources.length > 0
  )

export const isReportLevelResearchJob = (job: ResearchJobListItem): boolean => {
  if (isPollableJobStatus(job.status)) {
    return hasUiJobContext(job)
  }

  if (job.status === 'success') {
    return job.has_report && job.report_availability === 'available'
  }

  if (job.status === 'interrupted' || job.status === 'failure') {
    return hasUiJobContext(job) || job.has_report
  }

  return false
}
