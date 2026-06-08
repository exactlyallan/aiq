// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@/test-utils'
import { describe, expect, test } from 'vitest'
import { DeepResearchBanner } from './DeepResearchBanner'

describe('DeepResearchBanner', () => {
  test('renders starting status', () => {
    render(<DeepResearchBanner bannerType="starting" jobId="job-123" />)

    expect(screen.getByText('Starting Deep Research')).toBeInTheDocument()
    expect(screen.getByText(/Job ID: job-123/)).toBeInTheDocument()
  })

  test('handles legacy persisted banner data without crashing', () => {
    render(
      <DeepResearchBanner
        bannerType={undefined as unknown as 'starting'}
        jobId="job-legacy"
      />
    )

    expect(screen.getByText('Research Status Unavailable')).toBeInTheDocument()
    expect(screen.getByText(/Job ID: job-legacy/)).toBeInTheDocument()
  })
})
