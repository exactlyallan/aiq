// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import {
  researchApiErrorFixtures,
  researchJobListFixture,
  researchSubmitResponses,
} from './research-job-contract-fixtures'
import {
  ResearchApiErrorSchema,
  ResearchJobListResponseSchema,
  ResearchSubmitResponseSchema,
} from './research-job-contracts'

describe('Research job API contract fixtures', () => {
  test('validates planned research submit responses', () => {
    expect(ResearchSubmitResponseSchema.parse(researchSubmitResponses.shallowAnswer)).toEqual(
      researchSubmitResponses.shallowAnswer
    )
    expect(ResearchSubmitResponseSchema.parse(researchSubmitResponses.asyncJobStarted)).toEqual(
      researchSubmitResponses.asyncJobStarted
    )
  })

  test('validates planned job list response', () => {
    expect(ResearchJobListResponseSchema.parse(researchJobListFixture)).toEqual(researchJobListFixture)
  })

  test('requires diagnostic fields on every planned API error fixture', () => {
    Object.values(researchApiErrorFixtures).forEach((fixture) => {
      const parsed = ResearchApiErrorSchema.parse(fixture)

      expect(parsed.error.code).toBeTruthy()
      expect(parsed.error.user_message).toBeTruthy()
      expect(parsed.error.failure_boundary).toBeTruthy()
      expect(typeof parsed.error.retryable).toBe('boolean')
      expect(parsed.error.request_id || parsed.error.job_id).toBeTruthy()
    })
  })
})
