// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Hook for the lightweight backend job list.
 *
 * The sessions panel only needs compact job metadata for all jobs. Full report
 * and stream hydration should stay selected-job only so multiple concurrent
 * jobs do not create multiple expensive data streams.
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/adapters/auth'
import { listResearchJobs, ResearchJobsError } from '@/adapters/api'
import type { ResearchJobListItem } from '@/adapters/api'
import { isPollableJobStatus } from '../state'

interface UseResearchJobsOptions {
  enabled?: boolean
  pollIntervalMs?: number
}

interface UseResearchJobsResult {
  jobs: ResearchJobListItem[]
  isLoading: boolean
  error: ResearchJobsError | Error | null
  refresh: () => Promise<void>
  hasPollableJobs: boolean
  hasVerified: boolean
  isCheckingInitialState: boolean
  lastVerifiedAt: number | null
}

const DEFAULT_POLL_INTERVAL_MS = 5000

export const useResearchJobs = ({
  enabled = true,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseResearchJobsOptions = {}): UseResearchJobsResult => {
  const { idToken } = useAuth()
  const [jobs, setJobs] = useState<ResearchJobListItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<ResearchJobsError | Error | null>(null)
  const [hasVerified, setHasVerified] = useState(false)
  const [lastVerifiedAt, setLastVerifiedAt] = useState<number | null>(null)
  const jobsRef = useRef<ResearchJobListItem[]>([])
  const mountedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const hasPollableJobs = useMemo(
    () => jobs.some((job) => isPollableJobStatus(job.status)),
    [jobs]
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!enabled) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsLoading(jobsRef.current.length === 0)

    try {
      const response = await listResearchJobs({
        authToken: idToken || undefined,
        signal: controller.signal,
      })
      if (!mountedRef.current) return
      jobsRef.current = response.jobs
      setJobs(response.jobs)
      setError(null)
      setHasVerified(true)
      setLastVerifiedAt(Date.now())
    } catch (nextError) {
      if (nextError instanceof DOMException && nextError.name === 'AbortError') {
        return
      }
      if (!mountedRef.current) return
      setError(nextError instanceof Error ? nextError : new Error('Failed to load research jobs.'))
    } finally {
      const isCurrentRequest = abortRef.current === controller
      if (isCurrentRequest) {
        abortRef.current = null
      }
      if (mountedRef.current && isCurrentRequest) {
        setIsLoading(false)
      }
    }
  }, [enabled, idToken])

  useEffect(() => {
    if (!enabled) return
    void refresh()
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled || !hasPollableJobs || pollIntervalMs <= 0) return

    const intervalId = window.setInterval(() => {
      void refresh()
    }, pollIntervalMs)

    return () => window.clearInterval(intervalId)
  }, [enabled, hasPollableJobs, pollIntervalMs, refresh])

  return {
    jobs,
    isLoading,
    error,
    refresh,
    hasPollableJobs,
    hasVerified,
    isCheckingInitialState: enabled && isLoading && !hasVerified,
    lastVerifiedAt,
  }
}
