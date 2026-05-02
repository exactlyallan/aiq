// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Research job MSW handlers.
 *
 * These handlers mock the planned HTTP/polling flow before the UI consumes it.
 * Tests can opt into error cases by including `fail:<scenario>` in the prompt.
 */

import { http, HttpResponse } from 'msw'
import {
  researchApiErrorFixtures,
  researchJobListFixture,
  researchSubmitResponses,
} from '@/adapters/api/research-job-contract-fixtures'

const errorByPromptToken = {
  'fail:validation': { fixture: researchApiErrorFixtures.validationError, status: 400 },
  'fail:auth': { fixture: researchApiErrorFixtures.authError, status: 401 },
  'fail:backend': { fixture: researchApiErrorFixtures.backendUnavailable, status: 503 },
  'fail:llm_timeout': { fixture: researchApiErrorFixtures.llmTimeout, status: 504 },
  'fail:data_source': { fixture: researchApiErrorFixtures.dataSourceFailure, status: 502 },
  'fail:malformed': { fixture: researchApiErrorFixtures.malformedResponse, status: 502 },
} as const

export const researchJobHandlers = [
  http.post('/api/research/submit', async ({ request }) => {
    const body = (await request.json()) as { prompt?: string }
    const prompt = body.prompt ?? ''

    for (const [token, { fixture, status }] of Object.entries(errorByPromptToken)) {
      if (prompt.includes(token)) {
        return HttpResponse.json(fixture, { status })
      }
    }

    if (prompt.toLowerCase().includes('deep')) {
      return HttpResponse.json(researchSubmitResponses.asyncJobStarted, { status: 202 })
    }

    return HttpResponse.json(researchSubmitResponses.shallowAnswer)
  }),

  http.get('/api/jobs/async/jobs', () => HttpResponse.json(researchJobListFixture)),

  http.get('/api/jobs/async/job/job_success_1/report', () =>
    HttpResponse.json({
      job_id: 'job_success_1',
      has_report: true,
      report: 'Completed report content.',
    })
  ),

  http.get('/api/jobs/async/job/job_expired_1/report', () =>
    HttpResponse.json(researchApiErrorFixtures.expiredJob, { status: 410 })
  ),

  http.get('/api/jobs/async/job/job_missing_report/report', () =>
    HttpResponse.json(researchApiErrorFixtures.missingReport, { status: 404 })
  ),
]
