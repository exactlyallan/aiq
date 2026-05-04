// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * API Adapters
 *
 * Re-exports all API-related functionality for use in features.
 * Features should import from '@/adapters/api' only.
 */

// Configuration
export { apiConfig } from './config'

// Chat Client (SSE Streaming)
export { streamGenerate } from './chat-client'
export type {
  StreamGenerateOptions,
  GenerateStreamCallbacks,
  GenerateStreamMessage,
  BackendStatusType,
  BackendPromptType,
  GenerateMessageType,
} from './chat-client'

// Schemas and Types
export {
  MessageSchema,
  ChatCompletionChunkSchema,
  WorkflowConfigSchema,
  ApiErrorSchema,
} from './schemas'

export type {
  Message,
  ChatCompletionRequest,
  ChatCompletionChunk,
  ChatCompletionChoice,
  WorkflowConfig,
  ApiError,
} from './schemas'

export {
  ResearchApiErrorSchema,
  ResearchApiFailureBoundarySchema,
  ResearchJobListResponseSchema,
  ResearchJobStatusSchema,
  ResearchReportAvailabilitySchema,
  ResearchJobListItemSchema,
  ResearchSubmitRequestSchema,
  ResearchSubmitResponseSchema,
  ResearchShallowAnswerResponseSchema,
  ResearchAsyncJobStartedResponseSchema,
} from './research-job-contracts'
export type {
  ResearchApiFailureBoundary,
  ResearchApiError,
  ResearchJobStatus,
  ResearchReportAvailability,
  ResearchJobListItem,
  ResearchJobListResponse,
  ResearchSubmitRequest,
  ResearchSubmitResponse,
} from './research-job-contracts'

// Research Submit Client (backend-routed shallow/deep submit)
export { ResearchSubmitError, submitResearch } from './research-submit-client'
export type { ResearchSubmitOptions } from './research-submit-client'

// Research Jobs Client (backend-owned session/job list)
export { ResearchJobsError, listResearchJobs } from './research-jobs-client'
export type { ListResearchJobsOptions } from './research-jobs-client'

// Documents Client
export { createDocumentsClient } from './documents-client'
export type {
  DocumentsClient,
  DocumentsClientOptions,
  UploadFilesOptions,
} from './documents-client'

// Data Sources Client
export { createDataSourcesClient } from './data-sources-client'
export type {
  DataSourcesClient,
  DataSourcesClientOptions,
  DataSourceFromAPI,
  DataSourcesResponse,
} from './data-sources-client'

// Documents Schemas
export {
  DocumentFileStatusSchema,
  JobStateSchema,
  CollectionInfoSchema,
  FileInfoSchema,
  FileProgressSchema,
  IngestionJobStatusSchema,
} from './documents-schemas'

export type {
  DocumentFileStatus,
  JobState,
  CollectionInfo,
  FileInfo,
  FileProgress,
  IngestionJobStatus,
} from './documents-schemas'

// Deep Research Client (SSE Streaming for async jobs)
export { createDeepResearchClient, getJobStatus, getJobState, getJobReport, cancelJob } from './deep-research-client'
export type {
  DeepResearchJobStatus,
  DeepResearchEventType,
  ArtifactType,
  DeepResearchSSEEvent,
  StreamStartEvent,
  JobStatusEvent,
  WorkflowStartEvent,
  WorkflowEndEvent,
  LLMStartEvent,
  LLMChunkEvent,
  LLMEndEvent,
  ToolStartEvent,
  ToolEndEvent,
  TodoItem,
  ArtifactUpdateEvent,
  DeepResearchEvent,
  DeepResearchCallbacks,
  DeepResearchStreamOptions,
  DeepResearchClient,
  JobStateResponse,
} from './deep-research-client'
