// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * DataSourcesPanel Component
 *
 * Right-side panel for managing data sources and file uploads.
 * Shows file attachments first, then API data connections.
 */

'use client'

import { type FC, memo, useCallback, useMemo, type ReactNode } from 'react'
import { Flex, Text, SidePanel, Switch, Button, Banner } from '@/adapters/ui'
import { useShallow } from 'zustand/react/shallow'
import { Globe, LoadingSpinner } from '@/adapters/ui/icons'
import { useAuth } from '@/adapters/auth'
import { useLayoutStore } from '../store'
import { useIsCurrentSessionBusy, useChatStore } from '@/features/chat'
import type { DataSource } from '../data-sources'
import { DataConnectionCard } from './DataConnectionCard'
import { FileSourcesTab } from './FileSourcesTab'
import { useDocumentsStore } from '@/features/documents'
import {
  deriveJobActionSelectors,
  deriveJobCapabilities,
  latestResearchJobFromMessages,
} from '@/features/jobs'

interface DataSourcesPanelProps {
  /** Callback when source enabled state changes */
  onSourceToggle?: (sourceId: string, enabled: boolean) => void
  /** Callback when a file is deleted */
  onDeleteFile?: (id: string) => void
}

interface DataSourcesPanelModel {
  authRequired: boolean
  hasValidToken: boolean
  displaySources: DataSource[]
  dataSourcesLoading: boolean
  dataSourcesError: string | null
  isBusy: boolean
  enabledAvailableCount: number
  availableCount: number
  allAvailableEnabled: boolean
  hasAuthenticatedSources: boolean
  enabledSourcesSet: Set<string>
  onDeleteFile?: (id: string) => void
  handleToggleAll: () => void
  handleToggle: (sourceId: string, enabled: boolean) => void
  fetchDataSources: () => Promise<void>
  getFooter: () => ReactNode
}

const useDataSourcesPanelModel = ({
  onSourceToggle,
  onDeleteFile,
}: DataSourcesPanelProps): DataSourcesPanelModel => {
  const { idToken, authRequired } = useAuth()
  const saveDataSourcesToConversation = useChatStore((state) => state.saveDataSourcesToConversation)
  const currentConversation = useChatStore((state) => state.currentConversation)
  const deepResearchStatus = useChatStore((state) => state.deepResearchStatus)
  const deepResearchJobId = useChatStore((state) => state.deepResearchJobId)
  const isDeepResearchStreaming = useChatStore((state) => state.isDeepResearchStreaming)
  const deepResearchOwnerConversationId = useChatStore(
    (state) => state.deepResearchOwnerConversationId
  )
  const isUploading = useDocumentsStore((state) => state.isUploading)

  const { enabledDataSourceIds, availableDataSources, dataSourcesLoading, dataSourcesError } =
    useLayoutStore(
      useShallow((s) => ({
        enabledDataSourceIds: s.enabledDataSourceIds,
        availableDataSources: s.availableDataSources,
        dataSourcesLoading: s.dataSourcesLoading,
        dataSourcesError: s.dataSourcesError,
      }))
    )

  const toggleDataSource = useLayoutStore((s) => s.toggleDataSource)
  const setEnabledDataSources = useLayoutStore((s) => s.setEnabledDataSources)
  const fetchDataSourcesFromStore = useLayoutStore((s) => s.fetchDataSources)

  const isCurrentSessionBusy = useIsCurrentSessionBusy()
  const hasValidToken = !!idToken
  const enabledSourcesSet = useMemo(() => new Set(enabledDataSourceIds), [enabledDataSourceIds])

  const displaySources: DataSource[] = useMemo(() => {
    if (!availableDataSources || availableDataSources.length === 0) {
      return []
    }

    return availableDataSources.map((source) => ({
      id: source.id,
      name: source.name,
      description: source.description ?? '',
      category: source.category ?? 'enterprise',
      defaultEnabled: true,
      requiresAuth: source.requires_auth ?? false,
    }))
  }, [availableDataSources])

  const selectedResearchJob = useMemo(
    () =>
      currentConversation
        ? latestResearchJobFromMessages(currentConversation.messages ?? [], {
            ownerConversationId: currentConversation.id,
            activeJobId:
              deepResearchOwnerConversationId === currentConversation.id ? deepResearchJobId : null,
            activeJobStatus: deepResearchStatus,
            activeJobStreaming: isDeepResearchStreaming,
          })
        : null,
    [
      currentConversation,
      deepResearchJobId,
      deepResearchOwnerConversationId,
      deepResearchStatus,
      isDeepResearchStreaming,
    ]
  )

  const jobCapabilities = useMemo(
    () =>
      deriveJobCapabilities({
        selectedJobId: selectedResearchJob?.job_id ?? null,
        selectedJob: selectedResearchJob,
        authState: authRequired && !idToken ? 'anonymous' : 'authenticated',
        dataSourceState: dataSourcesError
          ? 'failed'
          : displaySources.length === 0
            ? 'unavailable'
            : 'available',
        uploadState: isUploading ? 'uploading' : 'idle',
      }),
    [
      authRequired,
      dataSourcesError,
      displaySources.length,
      idToken,
      isUploading,
      selectedResearchJob,
    ]
  )
  const jobActions = useMemo(() => deriveJobActionSelectors(jobCapabilities), [jobCapabilities])
  const isBusy = isCurrentSessionBusy || !jobActions.canEditDataSources

  const hasAuthenticatedSources = useMemo(
    () => displaySources.some((source) => source.requiresAuth),
    [displaySources]
  )

  const availableSources = useMemo(
    () => displaySources.filter((source) => !source.requiresAuth || hasValidToken),
    [displaySources, hasValidToken]
  )

  const enabledAvailableCount = enabledDataSourceIds.filter((id) =>
    availableSources.some((source) => source.id === id)
  ).length
  const availableCount = availableSources.length
  const allAvailableEnabled = enabledAvailableCount === availableCount && availableCount > 0

  const handleToggle = useCallback(
    (sourceId: string, enabled: boolean) => {
      const updatedIds = enabled
        ? [...enabledDataSourceIds, sourceId]
        : enabledDataSourceIds.filter((id) => id !== sourceId)

      toggleDataSource(sourceId)
      saveDataSourcesToConversation(updatedIds)
      onSourceToggle?.(sourceId, enabled)
    },
    [enabledDataSourceIds, onSourceToggle, saveDataSourcesToConversation, toggleDataSource]
  )

  const handleToggleAll = useCallback(() => {
    const updatedIds = allAvailableEnabled ? [] : availableSources.map((source) => source.id)
    setEnabledDataSources(updatedIds)
    saveDataSourcesToConversation(updatedIds)
  }, [allAvailableEnabled, availableSources, saveDataSourcesToConversation, setEnabledDataSources])

  const fetchDataSources = useCallback(
    async () => fetchDataSourcesFromStore(),
    [fetchDataSourcesFromStore]
  )

  const getFooter = useCallback(
    () => (
      <Flex direction="col" gap="1">
        <Text kind="body/regular/xs" className="text-subtle">
          {enabledAvailableCount} of {availableCount} available connections enabled. Enabled
          connections will be available to the AI assistant.
        </Text>
        <Text kind="body/regular/xs" className="text-subtle text-left">
          Attached files remain available to agents until deleted.
        </Text>
      </Flex>
    ),
    [availableCount, enabledAvailableCount]
  )

  return {
    authRequired,
    hasValidToken,
    displaySources,
    dataSourcesLoading,
    dataSourcesError,
    isBusy,
    enabledAvailableCount,
    availableCount,
    allAvailableEnabled,
    hasAuthenticatedSources,
    enabledSourcesSet,
    onDeleteFile,
    handleToggleAll,
    handleToggle,
    fetchDataSources,
    getFooter,
  }
}

const DataSourcesPanelContent: FC<{ model: DataSourcesPanelModel }> = ({ model }) => (
  <Flex direction="col" className="min-h-0 flex-1 overflow-y-auto">
    <Flex direction="col" gap="3" className="mb-6 shrink-0">
      <Text kind="label/semibold/xs" className="text-subtle uppercase">
        File Attachments
      </Text>
      <FileSourcesTab onDeleteFile={model.onDeleteFile} />
    </Flex>

    <Flex direction="col" className="shrink-0">
      {model.hasAuthenticatedSources && !model.hasValidToken && (
        <Banner
          kind="inline"
          status={!model.authRequired ? 'info' : 'warning'}
          className="mb-6 px-4 py-3"
        >
          {!model.authRequired
            ? 'Enable authentication to access additional data sources.'
            : 'Sign in to access additional data sources.'}
        </Banner>
      )}

      <Text kind="label/semibold/xs" className="text-subtle mb-3 uppercase">
        All Connections
      </Text>
      <Flex
        align="center"
        justify="between"
        role="button"
        tabIndex={model.isBusy ? -1 : 0}
        onClick={model.isBusy ? undefined : model.handleToggleAll}
        onKeyDown={(e) => {
          if (!model.isBusy && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            model.handleToggleAll()
          }
        }}
        className={`border-base mb-4 rounded-lg border p-3 transition-colors ${
          model.isBusy
            ? 'cursor-not-allowed opacity-50'
            : 'hover:bg-surface-raised-50 cursor-pointer'
        }`}
        aria-pressed={model.allAvailableEnabled}
        aria-disabled={model.isBusy}
        aria-label={
          model.isBusy
            ? 'All available connections (disabled during operations)'
            : `All available connections: ${model.allAvailableEnabled ? 'enabled' : 'disabled'}`
        }
        title={model.isBusy ? 'Data source changes disabled during active operations' : undefined}
      >
        <Text kind="label/semibold/sm" className="text-primary">
          Disable / Enable All
        </Text>
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            size="small"
            checked={model.allAvailableEnabled}
            onCheckedChange={model.handleToggleAll}
            disabled={model.isBusy}
            aria-label={
              model.isBusy
                ? 'Toggle all connections (disabled)'
                : model.allAvailableEnabled
                  ? 'Disable all connections'
                  : 'Enable all connections'
            }
          />
        </div>
      </Flex>

      <Text kind="label/semibold/xs" className="text-subtle mb-3 uppercase">
        Individual Connections ({model.displaySources.length})
      </Text>

      {model.dataSourcesLoading ? (
        <Flex align="center" justify="center" className="py-8">
          <LoadingSpinner size="medium" aria-label="Loading data sources" />
        </Flex>
      ) : model.dataSourcesError ? (
        <Flex direction="col" align="center" className="py-4">
          <Text kind="body/regular/sm" className="text-error mb-2">
            Unable to load data sources
          </Text>
          <Text kind="body/regular/xs" className="text-subtle mb-3">
            {model.dataSourcesError}
          </Text>
          <Button
            kind="secondary"
            size="small"
            onClick={() => void model.fetchDataSources()}
            aria-label="Retry loading data sources"
          >
            Retry
          </Button>
        </Flex>
      ) : model.displaySources.length === 0 ? (
        <Flex direction="col" align="center" className="py-4">
          <Text kind="body/regular/sm" className="text-subtle">
            No data sources available
          </Text>
        </Flex>
      ) : (
        <Flex direction="col" gap="2">
          {model.displaySources.map((source) => {
            const isSourceAvailable = !source.requiresAuth || model.hasValidToken
            return (
              <DataConnectionCard
                key={source.id}
                source={source}
                isEnabled={model.enabledSourcesSet.has(source.id)}
                isAvailable={isSourceAvailable}
                isBusy={model.isBusy}
                unavailableReason={
                  !isSourceAvailable ? 'Sign in required to access this data source' : undefined
                }
                onToggle={model.handleToggle}
              />
            )
          })}
        </Flex>
      )}
    </Flex>
  </Flex>
)

export const DataSourcesPanelBody: FC<DataSourcesPanelProps> = memo(
  function DataSourcesPanelBody(props) {
    const model = useDataSourcesPanelModel(props)

    return (
      <Flex direction="col" className="h-full min-h-0">
        <div className="min-h-0 flex-1 overflow-hidden">
          <DataSourcesPanelContent model={model} />
        </div>
        <div className="border-base mt-4 border-t pt-3">{model.getFooter()}</div>
      </Flex>
    )
  }
)

/**
 * Panel for managing data sources and file uploads.
 * Opens from the right side of the screen.
 */
export const DataSourcesPanel: FC<DataSourcesPanelProps> = memo(function DataSourcesPanel(props) {
  const isOpen = useLayoutStore((s) => s.rightPanel === 'data-sources')
  const closeRightPanel = useLayoutStore((s) => s.closeRightPanel)
  const openRightPanel = useLayoutStore((s) => s.openRightPanel)
  const model = useDataSourcesPanelModel(props)

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        openRightPanel('data-sources')
      } else {
        closeRightPanel()
      }
    },
    [closeRightPanel, openRightPanel]
  )

  return (
    <SidePanel
      className="bg-surface-base top-[var(--header-height)] h-[calc(100vh-var(--header-height))] w-[406px] rounded-l-2xl"
      open={isOpen}
      onOpenChange={handleOpenChange}
      side="right"
      bordered
      closeOnClickOutside={false}
      style={
        {
          height: 'calc(100vh - 3.5rem)',
        } as React.CSSProperties
      }
      slotHeading={
        <Flex align="center" gap="2">
          <Globe className="h-5 w-5" />
          Data Sources
        </Flex>
      }
      slotFooter={model.getFooter()}
    >
      <DataSourcesPanelContent model={model} />
    </SidePanel>
  )
})
