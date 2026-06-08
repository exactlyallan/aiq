// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * DeepResearchBanner Component
 *
 * Displays status banners for deep research jobs in the chat area.
 * Variants:
 * - "starting": Research in progress
 * - "success": Research completed, report is ready
 * - "failure": Research failed or was interrupted
 */

'use client'

import { type FC } from 'react'
import { Banner, Flex, Text } from '@/adapters/ui'
import { formatTime } from '@/shared/utils/format-time'
import type { DeepResearchBannerType } from '../types'

export interface DeepResearchBannerProps {
  /** Type of banner: success or failure */
  bannerType: DeepResearchBannerType
  /** Job ID for identification */
  jobId: string
  /** Total tokens used (for success banner) */
  totalTokens?: number
  /** Number of tool calls (for success banner) */
  toolCallCount?: number
  /** Timestamp of the status update (Date or ISO string from persisted state) */
  timestamp?: Date | string
}

/** Banner status type for KUI Banner component */
type BannerStatus = 'success' | 'info' | 'warning' | 'error'

interface BannerConfig {
  heading: string
  subheading: string
  status: BannerStatus
}

/** Format token count with K suffix for thousands */
const formatTokens = (count: number): string => {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`
  }
  return count.toString()
}

/**
 * Banner configuration for each banner type
 */
const getBannerConfig = (
  bannerType: DeepResearchBannerType | null | undefined,
  jobId: string,
  stats?: { totalTokens?: number; toolCallCount?: number }
): BannerConfig => {
  const jobIdLine = `Job ID: ${jobId}\n`

  switch (bannerType) {
    case 'success': {
      // Build stats suffix for success banner
      const statsParts: string[] = []
      if (stats?.totalTokens && stats.totalTokens > 0) {
        statsParts.push(`${formatTokens(stats.totalTokens)} tokens`)
      }
      if (stats?.toolCallCount && stats.toolCallCount > 0) {
        statsParts.push(`${stats.toolCallCount} tool calls`)
      }
      const statsText = statsParts.length > 0 ? ` (${statsParts.join(' · ')})` : ''

      return {
        heading: `Report Completed!${statsText}`,
        subheading: `Research has finished and a report is ready to view in the research panel. (${jobIdLine})`,
        status: 'success',
      }
    }
    case 'failure':
      return {
        heading: 'Report Failed to Complete',
        subheading: `Something prevented the research report from completing. Check the research activity for details. (${jobIdLine})`,
        status: 'error',
      }
    case 'cancelled':
      return {
        heading: 'Research Cancelled',
        subheading: `Research was stopped by user. You can view any partial progress in the research panel. (${jobIdLine})`,
        status: 'warning',
      }
    case 'starting':
      return {
        heading: 'Starting Deep Research',
        subheading: `Chat is paused while the report is created to prevent generating multiple reports. You can click away while this runs. This may take several minutes. (${jobIdLine})`,
        status: 'info',
      }
    default:
      // Older persisted sessions can contain partially migrated banner records.
      // Keep the conversation readable and expose enough context to recover the job.
      return {
        heading: 'Research Status Unavailable',
        subheading: `This saved research status was created by an older UI state shape. (${jobIdLine})`,
        status: 'warning',
      }
  }
}

/**
 * Deep research status banner displayed in the chat area
 */
export const DeepResearchBanner: FC<DeepResearchBannerProps> = ({
  bannerType,
  jobId,
  totalTokens,
  toolCallCount,
  timestamp,
}) => {
  const config = getBannerConfig(bannerType, jobId, { totalTokens, toolCallCount })

  return (
    <Flex direction="col" gap="1" className="w-full">
      <Banner
        slotSubheading={config.subheading}
        slotIcon={null}
        kind="header"
        status={config.status}
      >
        {config.heading}
      </Banner>
      {timestamp && (
        <Text kind="body/regular/xs" className="text-subtle mr-3 self-end">
          {formatTime(timestamp)}
        </Text>
      )}
    </Flex>
  )
}
