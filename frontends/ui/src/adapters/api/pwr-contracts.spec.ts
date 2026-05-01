// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import {
  pwrApiErrorFixtures,
  pwrJobListFixture,
  pwrResearchResponses,
} from './pwr-contract-fixtures'
import {
  PwrApiErrorSchema,
  PwrJobListResponseSchema,
  PwrResearchSubmitResponseSchema,
} from './pwr-contracts'

describe('Project Weight Reduction API contract fixtures', () => {
  test('validates planned research submit responses', () => {
    expect(PwrResearchSubmitResponseSchema.parse(pwrResearchResponses.shallowAnswer)).toEqual(
      pwrResearchResponses.shallowAnswer
    )
    expect(PwrResearchSubmitResponseSchema.parse(pwrResearchResponses.asyncJobStarted)).toEqual(
      pwrResearchResponses.asyncJobStarted
    )
  })

  test('validates planned job list response', () => {
    expect(PwrJobListResponseSchema.parse(pwrJobListFixture)).toEqual(pwrJobListFixture)
  })

  test('requires diagnostic fields on every planned API error fixture', () => {
    Object.values(pwrApiErrorFixtures).forEach((fixture) => {
      const parsed = PwrApiErrorSchema.parse(fixture)

      expect(parsed.error.code).toBeTruthy()
      expect(parsed.error.user_message).toBeTruthy()
      expect(parsed.error.failure_boundary).toBeTruthy()
      expect(typeof parsed.error.retryable).toBe('boolean')
      expect(parsed.error.request_id || parsed.error.job_id).toBeTruthy()
    })
  })
})
