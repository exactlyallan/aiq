// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * API Schemas and Types
 *
 * Zod schemas for runtime validation of API responses.
 * All external data passes through these schemas at the adapter boundary.
 */

import { z } from 'zod'

// ============================================================================
// Chat Completion API (OpenAI-Compatible)
// ============================================================================

export const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
  name: z.string().optional(),
})

export const ChatCompletionRequestSchema = z.object({
  messages: z.array(MessageSchema),
  model: z.string().optional(),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  stream: z.boolean().optional(),
  session_id: z.string().optional(),
})

export const ChatCompletionChoiceSchema = z.object({
  index: z.number(),
  delta: z.object({
    role: z.enum(['assistant']).optional(),
    content: z.string().optional(),
  }),
  finish_reason: z.enum(['stop', 'length', 'tool_calls']).nullable(),
})

export const ChatCompletionChunkSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion.chunk'),
  created: z.number(),
  model: z.string(),
  choices: z.array(ChatCompletionChoiceSchema),
})

// ============================================================================
// Workflow Configuration
// ============================================================================

export const WorkflowConfigSchema = z.object({
  Workflow: z.object({
    DisplayName: z.string(),
    Description: z.string(),
    Version: z.string(),
  }),
  Application: z.object({
    EnableConversationSideBar: z.boolean(),
    EnableFeedback: z.boolean(),
    EnableFileUpload: z.boolean(),
    MaxFileSize: z.number(),
    AllowedFileTypes: z.array(z.string()),
  }),
  Chat: z.object({
    SystemPrompt: z.string(),
    WelcomeMessage: z.string(),
    SuggestedQuestions: z.array(z.string()),
    MaxTokens: z.number(),
    Temperature: z.number(),
  }),
  Theme: z.object({
    PrimaryColor: z.string(),
    LogoUrl: z.string(),
    FaviconUrl: z.string(),
  }),
})

// ============================================================================
// Error Response
// ============================================================================

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
})

// ============================================================================
// Type Exports
// ============================================================================

export type Message = z.infer<typeof MessageSchema>
export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>
export type ChatCompletionChunk = z.infer<typeof ChatCompletionChunkSchema>
export type ChatCompletionChoice = z.infer<typeof ChatCompletionChoiceSchema>

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>
export type ApiError = z.infer<typeof ApiErrorSchema>
