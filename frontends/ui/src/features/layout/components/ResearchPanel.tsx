// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * ResearchPanel Component
 *
 * Permanent right-side research rail with a drawer that opens to the left.
 * The rail owns navigation for data sources plus the research detail sections.
 */

'use client'

import {
  type FC,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
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

const TABS_REQUIRING_STATE: ResearchPanelTab[] = ['citations', 'artifacts', 'thinking']
const RAIL_WIDTH_PX = 188
const RAIL_HEADER_HEIGHT_PX = 58
const DRAWER_REVEAL_DELAY_MS = 220
const DRAWER_DEFAULT_WIDTH_PX = 720
const DRAWER_MIN_WIDTH_PX = 420
const DRAWER_MAX_WIDTH_PX = 960
const DRAWER_RESIZE_STEP_PX = 40

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

const tabRequiresReportHydration = (tab: ResearchPanelTab): boolean => tab === 'research'

const tabRequiresStateHydration = (tab: ResearchPanelTab): boolean =>
  TABS_REQUIRING_STATE.includes(tab)

const clampDrawerWidth = (width: number): number =>
  Math.min(DRAWER_MAX_WIDTH_PX, Math.max(DRAWER_MIN_WIDTH_PX, Math.round(width)))

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
  const reportContent = useChatStore((state) => state.reportContent)
  const selectedJobCanLoadReport = useChatStore((state) => {
    const jobId = state.deepResearchJobId
    if (!jobId) return false

    const trackingMessage = [...(state.currentConversation?.messages ?? [])]
      .reverse()
      .find(
        (message) => message.messageType === 'agent_response' && message.deepResearchJobId === jobId
      )

    return Boolean(
      trackingMessage?.showViewReport ||
      trackingMessage?.reportContent?.trim() ||
      trackingMessage?.deepResearchJobStatus === 'success'
    )
  })
  const { loadReport, importStreamOnly, isLoading: isStreamLoading } = useLoadJobData()

  const prefersReducedMotion = useReducedMotion()
  const isDrawerOpen = rightPanel === 'research' || rightPanel === 'data-sources'
  const drawerTitle = getDrawerTitle(rightPanel, researchPanelTab)
  const [showDrawerContent, setShowDrawerContent] = useState(isDrawerOpen)
  const [drawerWidthPx, setDrawerWidthPx] = useState(DRAWER_DEFAULT_WIDTH_PX)
  const [isResizingDrawer, setIsResizingDrawer] = useState(false)
  const drawerResizeStartRef = useRef<{
    pointerId: number
    startX: number
    startWidthPx: number
  } | null>(null)

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

  const loadResearchDataIfNeeded = useCallback(
    (tab: ResearchPanelTab) => {
      if (
        tabRequiresReportHydration(tab) &&
        deepResearchJobId &&
        selectedJobCanLoadReport &&
        !reportContent.trim() &&
        !isDeepResearchStreaming &&
        !isStreamLoading
      ) {
        void loadReport(deepResearchJobId)
        return
      }

      if (
        tabRequiresStateHydration(tab) &&
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
      loadReport,
      reportContent,
      selectedJobCanLoadReport,
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
      loadResearchDataIfNeeded(item.tab)
    },
    [isAuthenticated, loadResearchDataIfNeeded, openRightPanel, setResearchPanelTab]
  )

  const handleClose = useCallback(() => {
    closeRightPanel()
  }, [closeRightPanel])

  const handleResizePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isDrawerOpen) return

      event.preventDefault()
      drawerResizeStartRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidthPx: drawerWidthPx,
      }
      setIsResizingDrawer(true)
      event.currentTarget.setPointerCapture?.(event.pointerId)
    },
    [drawerWidthPx, isDrawerOpen]
  )

  const handleResizePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const resizeStart = drawerResizeStartRef.current
    if (!resizeStart || resizeStart.pointerId !== event.pointerId) return

    const dragDeltaPx = resizeStart.startX - event.clientX
    setDrawerWidthPx(clampDrawerWidth(resizeStart.startWidthPx + dragDeltaPx))
  }, [])

  const handleResizePointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const resizeStart = drawerResizeStartRef.current
    if (!resizeStart || resizeStart.pointerId !== event.pointerId) return

    drawerResizeStartRef.current = null
    setIsResizingDrawer(false)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }, [])

  const handleResizeKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setDrawerWidthPx((width) => clampDrawerWidth(width + DRAWER_RESIZE_STEP_PX))
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      setDrawerWidthPx((width) => clampDrawerWidth(width - DRAWER_RESIZE_STEP_PX))
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      setDrawerWidthPx(DRAWER_MIN_WIDTH_PX)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      setDrawerWidthPx(DRAWER_MAX_WIDTH_PX)
    }
  }, [])

  const drawerTransition =
    prefersReducedMotion || isResizingDrawer ? 'none' : 'width 260ms ease-in-out'

  return (
    <div
      className="relative h-full shrink-0 overflow-hidden"
      style={{
        width: isDrawerOpen ? `${drawerWidthPx + RAIL_WIDTH_PX}px` : `${RAIL_WIDTH_PX}px`,
        transition: drawerTransition,
      }}
      data-testid="research-panel-root"
    >
      <div
        className="absolute bottom-0 top-0 z-20 overflow-hidden"
        style={{
          right: `${RAIL_WIDTH_PX}px`,
          width: isDrawerOpen ? `${drawerWidthPx}px` : '0px',
          transition: drawerTransition,
        }}
        aria-hidden={!isDrawerOpen}
      >
        <div
          className="border-base bg-surface-base h-full rounded-tl-xl border-b border-l border-t"
          style={{ width: `${drawerWidthPx}px` }}
        >
          {isDrawerOpen && (
            <div
              role="separator"
              aria-label="Resize research panel"
              aria-orientation="vertical"
              aria-valuemin={DRAWER_MIN_WIDTH_PX}
              aria-valuemax={DRAWER_MAX_WIDTH_PX}
              aria-valuenow={drawerWidthPx}
              tabIndex={0}
              className="group absolute bottom-0 left-0 top-0 z-40 w-2 cursor-ew-resize touch-none outline-none"
              data-testid="research-panel-resize-handle"
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerEnd}
              onPointerCancel={handleResizePointerEnd}
              onKeyDown={handleResizeKeyDown}
            >
              <span
                className={`
                  group-hover:bg-brand group-focus-visible:bg-brand absolute bottom-0 left-0 top-3 w-px
                  bg-neutral-500/60 transition-colors
                  ${isResizingDrawer ? 'bg-brand' : ''}
                `}
              />
              <span
                aria-hidden="true"
                data-testid="research-panel-resize-grip"
                className={`
                  bg-surface-base group-hover:border-brand group-focus-visible:border-brand absolute left-2 top-1/2 flex -translate-y-1/2
                  flex-col gap-1 rounded-full border border-neutral-500/60 px-1 py-1
                  shadow-sm transition-colors
                  ${isResizingDrawer ? 'border-brand' : ''}
                `}
              >
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className={`
                      group-hover:bg-brand group-focus-visible:bg-brand h-1 w-1 rounded-full
                      bg-neutral-500/80 transition-colors
                      ${isResizingDrawer ? 'bg-brand' : ''}
                    `}
                  />
                ))}
              </span>
            </div>
          )}
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

              <Flex direction="col" className="min-h-0 flex-1 overflow-hidden px-6 py-5">
                {rightPanel === 'data-sources' ? (
                  <DataSourcesPanelBody />
                ) : isStreamLoading ? (
                  <Flex direction="col" align="center" justify="center" className="h-full gap-4">
                    <Spinner size="medium" aria-label="Loading research data" />
                    <Text kind="body/regular/md" className="text-tertiary">
                      {TABS_REQUIRING_STATE.includes(researchPanelTab)
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
