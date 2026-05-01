// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Project Weight Reduction MSW handlers.
 *
 * These handlers mock the planned HTTP/polling flow before the UI consumes it.
 * Tests can opt into error cases by including `fail:<scenario>` in the prompt.
 */

import { http, HttpResponse } from 'msw'
import {
  pwrApiErrorFixtures,
  pwrJobListFixture,
  pwrResearchResponses,
} from '@/adapters/api/pwr-contract-fixtures'

const errorByPromptToken = {
  'fail:validation': { fixture: pwrApiErrorFixtures.validationError, status: 400 },
  'fail:auth': { fixture: pwrApiErrorFixtures.authError, status: 401 },
  'fail:backend': { fixture: pwrApiErrorFixtures.backendUnavailable, status: 503 },
  'fail:llm_timeout': { fixture: pwrApiErrorFixtures.llmTimeout, status: 504 },
  'fail:data_source': { fixture: pwrApiErrorFixtures.dataSourceFailure, status: 502 },
  'fail:malformed': { fixture: pwrApiErrorFixtures.malformedResponse, status: 502 },
} as const

export const pwrJobHandlers = [
  http.post('/api/research/submit', async ({ request }) => {
    const body = (await request.json()) as { prompt?: string }
    const prompt = body.prompt ?? ''

    for (const [token, { fixture, status }] of Object.entries(errorByPromptToken)) {
      if (prompt.includes(token)) {
        return HttpResponse.json(fixture, { status })
      }
    }

    if (prompt.toLowerCase().includes('deep')) {
      return HttpResponse.json(pwrResearchResponses.asyncJobStarted, { status: 202 })
    }

    return HttpResponse.json(pwrResearchResponses.shallowAnswer)
  }),

  http.get('/api/jobs/async/jobs', () => HttpResponse.json(pwrJobListFixture)),

  http.get('/api/jobs/async/job/job_success_1/report', () =>
    HttpResponse.json({
      job_id: 'job_success_1',
      has_report: true,
      report: 'Completed report content.',
    })
  ),

  http.get('/api/jobs/async/job/job_expired_1/report', () =>
    HttpResponse.json(pwrApiErrorFixtures.expiredJob, { status: 410 })
  ),

  http.get('/api/jobs/async/job/job_missing_report/report', () =>
    HttpResponse.json(pwrApiErrorFixtures.missingReport, { status: 404 })
  ),
]
