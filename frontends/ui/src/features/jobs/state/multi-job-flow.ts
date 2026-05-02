// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Multi-job flow model for the HTTP/polling research UI.
 *
 * This is intentionally pure state logic. Components and hooks should be able
 * to ask this layer which jobs need compact polling, whether the selected job
 * is allowed to hydrate detail, and where delayed request results should land.
 */

import type {
  ResearchJobListItem,
  ResearchJobStatus,
  ResearchSubmitResponse,
} from '@/adapters/api/research-job-contracts'

export type MultiJobSelectedState = 'none' | 'active' | 'terminal' | 'missing'
export type JobDetailHydrationStatus = 'not_loaded' | 'loading' | 'loaded' | 'error'
export type SubmitRequestPhase = 'submitting' | 'shallow_resolved' | 'job_started' | 'failed'

export interface JobDetailHydrationState {
  status: JobDetailHydrationStatus
  updatedAtMs?: number
  error?: string
}

export interface SubmitRequestScope {
  requestId: string
  conversationId: string
  phase: SubmitRequestPhase
  jobId?: string
}

export interface MultiJobFlowInput {
  jobs: ResearchJobListItem[]
  selectedJobId: string | null
  /**
   * Jobs currently visible or otherwise in scope for compact status polling.
   * If omitted, all jobs from the backend list are considered visible.
   */
  visibleJobIds?: string[]
  detailHydrationByJobId?: Record<string, JobDetailHydrationState | undefined>
  activeSubmitRequests?: SubmitRequestScope[]
}

export interface MultiJobFlowState {
  selectedJobState: MultiJobSelectedState
  selectedJob: ResearchJobListItem | null
  compactStatusPollJobIds: string[]
  selectedDetailJobId: string | null
  shouldHydrateSelectedJob: boolean
  liveStreamJobId: string | null
  backgroundHydrationJobIds: string[]
  activeSubmitRequestIdsByJobId: Record<string, string[]>
  orphanedSubmitRequestIds: string[]
  hasConcurrentActiveJobs: boolean
}

export interface DetailResultRoute {
  writeJobCache: boolean
  updateVisibleDetail: boolean
}

const terminalJobStatuses = new Set<ResearchJobStatus>([
  'success',
  'failure',
  'interrupted',
  'expired',
  'unavailable',
])

const pollableJobStatuses = new Set<ResearchJobStatus>(['submitted', 'running', 'stale'])

export const isTerminalJobStatus = (status: ResearchJobStatus): boolean =>
  terminalJobStatuses.has(status)

export const isPollableJobStatus = (status: ResearchJobStatus): boolean =>
  pollableJobStatuses.has(status)

const createJobMap = (jobs: ResearchJobListItem[]): Map<string, ResearchJobListItem> =>
  new Map(jobs.map((job) => [job.job_id, job]))

export const deriveSelectedJobState = (
  jobs: ResearchJobListItem[],
  selectedJobId: string | null
): { state: MultiJobSelectedState; job: ResearchJobListItem | null } => {
  if (!selectedJobId) {
    return { state: 'none', job: null }
  }

  const selectedJob = jobs.find((job) => job.job_id === selectedJobId) ?? null
  if (!selectedJob) {
    return { state: 'missing', job: null }
  }

  return {
    state: isTerminalJobStatus(selectedJob.status) ? 'terminal' : 'active',
    job: selectedJob,
  }
}

const isDetailHydratable = (job: ResearchJobListItem): boolean => {
  if (!isTerminalJobStatus(job.status)) return false
  if (job.status === 'expired' || job.status === 'unavailable') return false
  if (job.report_availability === 'expired') return false
  return true
}

const shouldHydrateDetail = (
  job: ResearchJobListItem | null,
  hydrationState: JobDetailHydrationState | undefined
): boolean => {
  if (!job || !isDetailHydratable(job)) return false
  return hydrationState?.status !== 'loading' && hydrationState?.status !== 'loaded'
}

export const deriveMultiJobFlow = (input: MultiJobFlowInput): MultiJobFlowState => {
  const { jobs, selectedJobId, detailHydrationByJobId = {}, activeSubmitRequests = [] } = input
  const jobMap = createJobMap(jobs)
  const selected = deriveSelectedJobState(jobs, selectedJobId)
  const pollScopeIds = new Set(input.visibleJobIds ?? jobs.map((job) => job.job_id))

  if (selectedJobId) {
    pollScopeIds.add(selectedJobId)
  }

  const compactStatusPollJobIds = Array.from(pollScopeIds).filter((jobId) => {
    const job = jobMap.get(jobId)
    return Boolean(job && isPollableJobStatus(job.status))
  })

  const activeJobsInList = jobs.filter((job) => isPollableJobStatus(job.status))
  const hydrationState = selected.job ? detailHydrationByJobId[selected.job.job_id] : undefined
  const shouldHydrateSelectedJob = shouldHydrateDetail(selected.job, hydrationState)
  const activeSubmitRequestIdsByJobId: Record<string, string[]> = {}
  const orphanedSubmitRequestIds: string[] = []

  activeSubmitRequests
    .filter((request) => request.phase === 'submitting' || request.phase === 'job_started')
    .forEach((request) => {
      if (!request.jobId) {
        orphanedSubmitRequestIds.push(request.requestId)
        return
      }

      activeSubmitRequestIdsByJobId[request.jobId] = [
        ...(activeSubmitRequestIdsByJobId[request.jobId] ?? []),
        request.requestId,
      ]
    })

  return {
    selectedJobState: selected.state,
    selectedJob: selected.job,
    compactStatusPollJobIds,
    selectedDetailJobId: selected.job?.job_id ?? null,
    shouldHydrateSelectedJob,
    liveStreamJobId:
      selected.job && isPollableJobStatus(selected.job.status) ? selected.job.job_id : null,
    // Full detail hydration should be selected-job only. Background jobs stay
    // cheap: compact status poll, card update, no report/progress replay.
    backgroundHydrationJobIds: [],
    activeSubmitRequestIdsByJobId,
    orphanedSubmitRequestIds,
    hasConcurrentActiveJobs: activeJobsInList.length > 1,
  }
}

export const bindSubmitResponseToRequestScope = (
  request: SubmitRequestScope,
  response: ResearchSubmitResponse
): SubmitRequestScope => {
  if (response.type === 'async_job_started') {
    return {
      ...request,
      jobId: response.job_id,
      phase: 'job_started',
    }
  }

  return {
    ...request,
    phase: 'shallow_resolved',
  }
}

export const routeDetailResult = (
  selectedJobId: string | null,
  resultJobId: string
): DetailResultRoute => ({
  writeJobCache: true,
  updateVisibleDetail: selectedJobId === resultJobId,
})

const parseTimestamp = (value: string | null | undefined): number | null => {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Guards against stale polling responses regressing job state. A terminal job
 * should not be moved back to running because an older poll response arrived
 * after a newer terminal response.
 */
export const shouldApplyJobStatusSnapshot = (
  current: ResearchJobListItem | undefined,
  incoming: ResearchJobListItem
): boolean => {
  if (!current) return true

  if (isTerminalJobStatus(current.status) && !isTerminalJobStatus(incoming.status)) {
    return false
  }

  const currentTime = parseTimestamp(current.updated_at ?? current.created_at)
  const incomingTime = parseTimestamp(incoming.updated_at ?? incoming.created_at)

  if (currentTime !== null && incomingTime !== null) {
    return incomingTime >= currentTime
  }

  return true
}
