// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type {
  PwrApiError,
  PwrFailureBoundary,
  PwrJobListResponse,
  PwrResearchSubmitResponse,
} from './pwr-contracts'

const now = '2026-05-01T12:00:00.000Z'

export const pwrResearchResponses = {
  shallowAnswer: {
    type: 'shallow_answer',
    answer: 'This is a shallow research response.',
    citations: ['https://example.com/source'],
    request_id: 'req_shallow_1',
  },
  asyncJobStarted: {
    type: 'async_job_started',
    job_id: 'job_running_1',
    status: 'submitted',
    request_id: 'req_deep_1',
  },
} satisfies Record<string, PwrResearchSubmitResponse>

export const pwrJobListFixture = {
  jobs: [
    {
      job_id: 'job_running_1',
      status: 'running',
      agent_type: 'deep_researcher',
      input_preview: 'Running job',
      created_at: now,
      updated_at: now,
      expires_at: null,
      data_sources: ['web_search'],
      collection_name: 'collection_running',
      has_report: false,
      report_availability: 'unavailable',
      error: null,
    },
    {
      job_id: 'job_success_1',
      status: 'success',
      agent_type: 'deep_researcher',
      input_preview: 'Completed job',
      created_at: now,
      updated_at: now,
      expires_at: '2026-05-02T12:00:00.000Z',
      data_sources: ['web_search', 'knowledge_layer'],
      collection_name: 'collection_success',
      has_report: true,
      report_availability: 'available',
      error: null,
    },
    {
      job_id: 'job_failure_1',
      status: 'failure',
      agent_type: 'deep_researcher',
      input_preview: 'Failed job',
      created_at: now,
      updated_at: now,
      expires_at: '2026-05-02T12:00:00.000Z',
      data_sources: ['web_search'],
      collection_name: null,
      has_report: false,
      report_availability: 'error',
      error: 'LLM provider timed out',
    },
    {
      job_id: 'job_expired_1',
      status: 'expired',
      agent_type: 'deep_researcher',
      input_preview: 'Expired job',
      created_at: now,
      updated_at: now,
      expires_at: now,
      data_sources: [],
      collection_name: null,
      has_report: false,
      report_availability: 'expired',
      error: null,
    },
  ],
} satisfies PwrJobListResponse

const createApiError = (
  code: string,
  failureBoundary: PwrFailureBoundary,
  retryable: boolean,
  message = code
): PwrApiError => ({
  error: {
    code,
    message,
    user_message: message,
    failure_boundary: failureBoundary,
    retryable,
    request_id: `req_${code.toLowerCase()}`,
  },
})

export const pwrApiErrorFixtures = {
  validationError: createApiError('VALIDATION_ERROR', 'client', false, 'The request is invalid.'),
  authError: createApiError('AUTH_REQUIRED', 'auth', false, 'Sign in is required.'),
  backendUnavailable: createApiError('BACKEND_UNAVAILABLE', 'aiq_backend', true, 'AIQ backend is unavailable.'),
  llmTimeout: createApiError('LLM_TIMEOUT', 'llm_provider', true, 'The model provider timed out.'),
  dataSourceFailure: createApiError('DATA_SOURCE_FAILURE', 'data_source', true, 'A selected data source failed.'),
  expiredJob: createApiError('JOB_EXPIRED', 'job_lookup', false, 'This job has expired.'),
  missingReport: createApiError('REPORT_NOT_FOUND', 'report_lookup', false, 'The report is not available.'),
  malformedResponse: createApiError('MALFORMED_RESPONSE', 'ui_proxy', true, 'The backend returned an invalid response.'),
} satisfies Record<string, PwrApiError>
