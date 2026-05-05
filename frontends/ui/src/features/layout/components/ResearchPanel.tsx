// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ResearchPanel Component
 *
 * Permanent right-side research rail with a drawer that opens to the left.
 * The rail owns navigation for data sources plus the research detail sections.
 */

'use client'

import { type FC, type ReactNode, memo, useCallback, useEffect, useState } from 'react'
import { Flex, Button, Spinner, Text } from '@/adapters/ui'
import {
  Close,
  DocumentPreview,
  Globe,
  ListCheckmark,
  StickerImage,
  Stair,
} from '@/adapters/ui/icons'
import { useChatStore, useLoadJobData } from '@/features/chat'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useLayoutStore } from '../store'
import { CitationsTab } from './CitationsTab'
import { ReportTab } from './ReportTab'
import { ArtifactsTab } from './ArtifactsTab'
import { ThinkingTab } from './ThinkingTab'
import { DataSourcesPanelBody } from './DataSourcesPanel'
import type { ResearchPanelTab, RightPanelType } from '../types'

const TABS_REQUIRING_STREAM: ResearchPanelTab[] = ['citations', 'artifacts']
const RAIL_WIDTH_PX = 188
const RAIL_HEADER_HEIGHT_PX = 58
const DRAWER_REVEAL_DELAY_MS = 220
const DRAWER_WIDTH = 'min(60vw, 720px)'

type ResearchRailItem =
  | {
      label: 'Data Sources'
      panel: 'data-sources'
      icon: FC<{ className?: string }>
    }
  | {
      label: 'Citations' | 'Research' | 'Artifacts' | 'Thinking'
      panel: 'research'
      tab: ResearchPanelTab
      icon: FC<{ className?: string }>
    }

const TOP_RAIL_ITEMS: ResearchRailItem[] = [
  { label: 'Data Sources', panel: 'data-sources', icon: Globe },
  { label: 'Citations', panel: 'research', tab: 'citations', icon: ListCheckmark },
  { label: 'Research', panel: 'research', tab: 'research', icon: DocumentPreview },
  { label: 'Artifacts', panel: 'research', tab: 'artifacts', icon: StickerImage },
]

const BOTTOM_RAIL_ITEM: ResearchRailItem = {
  label: 'Thinking',
  panel: 'research',
  tab: 'thinking',
  icon: Stair,
}

interface ResearchPanelProps {
  children?: ReactNode
  isAuthenticated?: boolean
}

const getDrawerTitle = (rightPanel: RightPanelType, researchPanelTab: ResearchPanelTab): string => {
  if (rightPanel === 'data-sources') {
    return 'Data Sources'
  }

  switch (researchPanelTab) {
    case 'citations':
      return 'Citations'
    case 'artifacts':
      return 'Artifacts'
    case 'thinking':
      return 'Thinking'
    case 'research':
    default:
      return 'Research'
  }
}

const isRailItemActive = (
  item: ResearchRailItem,
  rightPanel: RightPanelType,
  researchPanelTab: ResearchPanelTab
): boolean => {
  if (item.panel === 'data-sources') {
    return rightPanel === 'data-sources'
  }

  return rightPanel === 'research' && researchPanelTab === item.tab
}

/**
 * Permanent right rail plus left-opening drawer.
 * The drawer hosts either the data sources surface or research detail views.
 */
export const ResearchPanel: FC<ResearchPanelProps> = memo(function ResearchPanel({
  children,
  isAuthenticated = false,
}) {
  const rightPanel = useLayoutStore((s) => s.rightPanel)
  const researchPanelTab = useLayoutStore((s) => s.researchPanelTab)
  const setResearchPanelTab = useLayoutStore((s) => s.setResearchPanelTab)
  const closeRightPanel = useLayoutStore((s) => s.closeRightPanel)
  const openRightPanel = useLayoutStore((s) => s.openRightPanel)
  const isDeepResearchStreaming = useChatStore((state) => state.isDeepResearchStreaming)
  const deepResearchJobId = useChatStore((state) => state.deepResearchJobId)
  const deepResearchStreamLoaded = useChatStore((state) => state.deepResearchStreamLoaded)
  const { importStreamOnly, isLoading: isStreamLoading } = useLoadJobData()

  const prefersReducedMotion = useReducedMotion()
  const isDrawerOpen = rightPanel === 'research' || rightPanel === 'data-sources'
  const drawerTitle = getDrawerTitle(rightPanel, researchPanelTab)
  const [showDrawerContent, setShowDrawerContent] = useState(isDrawerOpen)

  useEffect(() => {
    if (!isDrawerOpen) {
      setShowDrawerContent(false)
      return
    }

    if (prefersReducedMotion) {
      setShowDrawerContent(true)
      return
    }

    const timer = window.setTimeout(() => {
      setShowDrawerContent(true)
    }, DRAWER_REVEAL_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [isDrawerOpen, prefersReducedMotion])

  const loadStreamIfNeeded = useCallback(
    (tab: ResearchPanelTab) => {
      if (
        TABS_REQUIRING_STREAM.includes(tab) &&
        deepResearchJobId &&
        !deepResearchStreamLoaded &&
        !isDeepResearchStreaming &&
        !isStreamLoading
      ) {
        void importStreamOnly(deepResearchJobId)
      }
    },
    [
      deepResearchJobId,
      deepResearchStreamLoaded,
      importStreamOnly,
      isDeepResearchStreaming,
      isStreamLoading,
    ]
  )

  const handleNavSelect = useCallback(
    (item: ResearchRailItem) => {
      if (!isAuthenticated) {
        return
      }

      if (item.panel === 'data-sources') {
        openRightPanel('data-sources')
        return
      }

      setResearchPanelTab(item.tab)
      openRightPanel('research')
      loadStreamIfNeeded(item.tab)
    },
    [isAuthenticated, loadStreamIfNeeded, openRightPanel, setResearchPanelTab]
  )

  const handleClose = useCallback(() => {
    closeRightPanel()
  }, [closeRightPanel])

  return (
    <div
      className="relative h-full shrink-0 overflow-hidden"
      style={{
        width: isDrawerOpen ? `calc(${DRAWER_WIDTH} + ${RAIL_WIDTH_PX}px)` : `${RAIL_WIDTH_PX}px`,
        transition: prefersReducedMotion ? 'none' : 'width 260ms ease-in-out',
      }}
    >
      <div
        className="absolute bottom-0 top-0 z-20 overflow-hidden"
        style={{
          right: `${RAIL_WIDTH_PX}px`,
          width: isDrawerOpen ? DRAWER_WIDTH : '0px',
          transition: prefersReducedMotion ? 'none' : 'width 260ms ease-in-out',
        }}
        aria-hidden={!isDrawerOpen}
      >
        <div
          className="border-base bg-surface-base h-full rounded-tl-xl border-b border-l border-t"
          style={{ width: DRAWER_WIDTH }}
        >
          {showDrawerContent && (
            <Flex direction="col" className="h-full w-full">
              <Flex
                align="center"
                justify="between"
                className="border-base shrink-0 border-b px-6"
                style={{ height: `${RAIL_HEADER_HEIGHT_PX}px` }}
              >
                <Text kind="label/semibold/lg" className="text-primary truncate">
                  {drawerTitle}
                </Text>
                <Button
                  kind="tertiary"
                  size="small"
                  onClick={handleClose}
                  aria-label="Close research panel"
                  title="Close research panel"
                  data-testid="research-panel-close"
                >
                  <Close className="h-4 w-4" aria-hidden="true" />
                </Button>
              </Flex>

              <Flex direction="col" className="flex-1 overflow-hidden px-6 py-5">
                {rightPanel === 'data-sources' ? (
                  <DataSourcesPanelBody />
                ) : isStreamLoading ? (
                  <Flex direction="col" align="center" justify="center" className="h-full gap-4">
                    <Spinner size="medium" aria-label="Loading research data" />
                    <Text kind="body/regular/md" className="text-tertiary">
                      {TABS_REQUIRING_STREAM.includes(researchPanelTab)
                        ? 'Loading research data...'
                        : 'Loading report...'}
                    </Text>
                  </Flex>
                ) : (
                  <>
                    {researchPanelTab === 'research' && <ReportTab>{children}</ReportTab>}
                    {researchPanelTab === 'citations' && <CitationsTab />}
                    {researchPanelTab === 'artifacts' && <ArtifactsTab />}
                    {researchPanelTab === 'thinking' && <ThinkingTab />}
                  </>
                )}
              </Flex>
            </Flex>
          )}
        </div>
      </div>

      <aside
        className="border-base bg-surface-base absolute bottom-0 top-0 z-30 flex h-full shrink-0 flex-col border-l px-4 py-4"
        style={{ right: '0px', width: `${RAIL_WIDTH_PX}px` }}
        aria-label="Research navigation"
        data-testid="research-panel-rail"
      >
        <Text kind="label/semibold/lg" className="text-primary truncate">
          Deep Research
        </Text>
        <div className="border-base my-5 h-px w-full border-t" />

        <Flex direction="col" gap="2">
          {TOP_RAIL_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = isRailItemActive(item, rightPanel, researchPanelTab)
            return (
              <Button
                key={item.label}
                kind="tertiary"
                size="small"
                onClick={() => handleNavSelect(item)}
                className={`justify-start px-2 py-2 ${isActive ? 'bg-surface-raised' : ''}`}
                aria-label={item.label}
                title={item.label}
              >
                <Flex align="center" gap="3" className="min-w-0">
                  <Icon className="h-6 w-6 shrink-0" />
                  <Text kind="body/regular/md" className="truncate">
                    {item.label}
                  </Text>
                </Flex>
              </Button>
            )
          })}
        </Flex>

        <div className="mt-auto pt-6">
          <Button
            kind="tertiary"
            size="small"
            onClick={() => handleNavSelect(BOTTOM_RAIL_ITEM)}
            className={`justify-start px-2 py-2 ${
              isRailItemActive(BOTTOM_RAIL_ITEM, rightPanel, researchPanelTab)
                ? 'bg-surface-raised'
                : ''
            }`}
            aria-label={BOTTOM_RAIL_ITEM.label}
            title={BOTTOM_RAIL_ITEM.label}
          >
            <Flex align="center" gap="3" className="min-w-0">
              <Stair className="h-6 w-6 shrink-0" />
              <Text kind="body/regular/md" className="truncate">
                {BOTTOM_RAIL_ITEM.label}
              </Text>
            </Flex>
          </Button>
        </div>
      </aside>
    </div>
  )
})
