// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import type { ResearchJobListItem } from '@/adapters/api/research-job-contracts'
import {
  bindSubmitResponseToRequestScope,
  deriveMultiJobFlow,
  routeDetailResult,
  shouldApplyJobStatusSnapshot,
  type SubmitRequestScope,
} from './multi-job-flow'

const job = (overrides: Partial<ResearchJobListItem> & { job_id: string }): ResearchJobListItem => ({
  job_id: overrides.job_id,
  status: overrides.status ?? 'running',
  agent_type: 'deep_researcher',
  input_preview: overrides.input_preview ?? overrides.job_id,
  created_at: overrides.created_at ?? '2026-05-01T12:00:00.000Z',
  updated_at: overrides.updated_at ?? '2026-05-01T12:00:00.000Z',
  expires_at: overrides.expires_at ?? null,
  data_sources: overrides.data_sources ?? ['web_search'],
  collection_name: overrides.collection_name ?? null,
  has_report: overrides.has_report ?? false,
  report_availability: overrides.report_availability ?? 'unavailable',
  error: overrides.error ?? null,
})

describe('multi-job flow model', () => {
  test('polls compact status for visible active jobs without hydrating background detail', () => {
    const state = deriveMultiJobFlow({
      selectedJobId: 'job-a',
      jobs: [
        job({ job_id: 'job-a', status: 'running' }),
        job({ job_id: 'job-b', status: 'submitted' }),
        job({
          job_id: 'job-c',
          status: 'success',
          has_report: true,
          report_availability: 'available',
        }),
      ],
    })

    expect(state.compactStatusPollJobIds).toEqual(['job-a', 'job-b'])
    expect(state.liveStreamJobId).toBe('job-a')
    expect(state.backgroundHydrationJobIds).toEqual([])
    expect(state.hasConcurrentActiveJobs).toBe(true)
  })

  test('includes selected active job in polling scope even when it is outside visible list', () => {
    const state = deriveMultiJobFlow({
      selectedJobId: 'job-b',
      visibleJobIds: ['job-a'],
      jobs: [
        job({ job_id: 'job-a', status: 'running' }),
        job({ job_id: 'job-b', status: 'running' }),
      ],
    })

    expect(state.compactStatusPollJobIds).toEqual(['job-a', 'job-b'])
    expect(state.liveStreamJobId).toBe('job-b')
  })

  test('hydrates only the selected terminal job when detail is not loaded', () => {
    const state = deriveMultiJobFlow({
      selectedJobId: 'job-complete',
      jobs: [
        job({
          job_id: 'job-complete',
          status: 'success',
          has_report: true,
          report_availability: 'available',
        }),
        job({
          job_id: 'job-other',
          status: 'success',
          has_report: true,
          report_availability: 'available',
        }),
      ],
      detailHydrationByJobId: {
        'job-other': { status: 'not_loaded' },
      },
    })

    expect(state.selectedJobState).toBe('terminal')
    expect(state.selectedDetailJobId).toBe('job-complete')
    expect(state.shouldHydrateSelectedJob).toBe(true)
    expect(state.backgroundHydrationJobIds).toEqual([])
    expect(state.liveStreamJobId).toBeNull()
  })

  test('does not rehydrate selected job detail while it is loading or already loaded', () => {
    const completeJob = job({
      job_id: 'job-complete',
      status: 'success',
      has_report: true,
      report_availability: 'available',
    })

    expect(
      deriveMultiJobFlow({
        selectedJobId: 'job-complete',
        jobs: [completeJob],
        detailHydrationByJobId: { 'job-complete': { status: 'loading' } },
      }).shouldHydrateSelectedJob
    ).toBe(false)

    expect(
      deriveMultiJobFlow({
        selectedJobId: 'job-complete',
        jobs: [completeJob],
        detailHydrationByJobId: { 'job-complete': { status: 'loaded' } },
      }).shouldHydrateSelectedJob
    ).toBe(false)
  })

  test('routes detail results to cache without replacing the visible selected job after a switch', () => {
    expect(routeDetailResult('job-b', 'job-a')).toEqual({
      writeJobCache: true,
      updateVisibleDetail: false,
    })

    expect(routeDetailResult('job-a', 'job-a')).toEqual({
      writeJobCache: true,
      updateVisibleDetail: true,
    })
  })

  test('tracks pre-job submit requests as orphaned until the backend returns a job id', () => {
    const pendingRequest: SubmitRequestScope = {
      requestId: 'req-a',
      conversationId: 'conversation-a',
      phase: 'submitting',
    }
    const boundRequest = bindSubmitResponseToRequestScope(pendingRequest, {
      type: 'async_job_started',
      job_id: 'job-a',
      status: 'submitted',
      request_id: 'req-a',
    })

    const beforeBinding = deriveMultiJobFlow({
      selectedJobId: null,
      jobs: [],
      activeSubmitRequests: [pendingRequest],
    })
    const afterBinding = deriveMultiJobFlow({
      selectedJobId: 'job-a',
      jobs: [job({ job_id: 'job-a', status: 'submitted' })],
      activeSubmitRequests: [boundRequest],
    })

    expect(beforeBinding.orphanedSubmitRequestIds).toEqual(['req-a'])
    expect(afterBinding.orphanedSubmitRequestIds).toEqual([])
    expect(afterBinding.activeSubmitRequestIdsByJobId).toEqual({ 'job-a': ['req-a'] })
  })

  test('keeps shallow responses conversation-scoped without assigning a job id', () => {
    const pendingRequest: SubmitRequestScope = {
      requestId: 'req-shallow',
      conversationId: 'conversation-a',
      phase: 'submitting',
    }

    expect(
      bindSubmitResponseToRequestScope(pendingRequest, {
        type: 'shallow_answer',
        answer: 'Inline answer',
        citations: [],
        request_id: 'req-shallow',
      })
    ).toEqual({
      requestId: 'req-shallow',
      conversationId: 'conversation-a',
      phase: 'shallow_resolved',
    })
  })

  test('treats missing selected jobs as unavailable without polling or hydrating detail', () => {
    const state = deriveMultiJobFlow({
      selectedJobId: 'missing-job',
      jobs: [job({ job_id: 'job-a', status: 'running' })],
    })

    expect(state.selectedJobState).toBe('missing')
    expect(state.selectedJob).toBeNull()
    expect(state.selectedDetailJobId).toBeNull()
    expect(state.shouldHydrateSelectedJob).toBe(false)
    expect(state.compactStatusPollJobIds).toEqual(['job-a'])
  })

  test('does not apply stale polling snapshots that regress a terminal job', () => {
    const current = job({
      job_id: 'job-a',
      status: 'success',
      updated_at: '2026-05-01T12:05:00.000Z',
      has_report: true,
      report_availability: 'available',
    })
    const olderIncoming = job({
      job_id: 'job-a',
      status: 'running',
      updated_at: '2026-05-01T12:04:00.000Z',
    })
    const newerIncoming = job({
      job_id: 'job-a',
      status: 'failure',
      updated_at: '2026-05-01T12:06:00.000Z',
      report_availability: 'error',
    })

    expect(shouldApplyJobStatusSnapshot(current, olderIncoming)).toBe(false)
    expect(shouldApplyJobStatusSnapshot(current, newerIncoming)).toBe(true)
  })

  test('keeps terminal state when timestamps are unavailable and an incoming poll is non-terminal', () => {
    const current = job({ job_id: 'job-a', status: 'success', updated_at: undefined })
    const incoming = job({ job_id: 'job-a', status: 'running', updated_at: undefined })

    expect(shouldApplyJobStatusSnapshot(current, incoming)).toBe(false)
  })
})
