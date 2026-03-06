// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Factory for building a typed mock of useChatStore.getState() for tests.
 * Avoids the `as unknown as typeof useChatStore.getState` casts.
 */

import { vi } from 'vitest'

type MockActions = Record<string, ReturnType<typeof vi.fn>>

interface MockStoreStateBase {
  deepResearchJobId: string | null
  deepResearchLastEventId: string | null
  isDeepResearchStreaming: boolean
  deepResearchStatus: string | null
  reportContent: string
  deepResearchLLMSteps: unknown[]
  deepResearchToolCalls: unknown[]
  deepResearchCitations: unknown[]
  deepResearchOwnerConversationId: string | null
  currentConversation: { id: string } | null
  activeDeepResearchMessageId: string | null
  currentUserMessageId: string | null
}

const DEFAULT_STATE: MockStoreStateBase = {
  deepResearchJobId: null,
  deepResearchLastEventId: null,
  isDeepResearchStreaming: false,
  deepResearchStatus: null,
  reportContent: '',
  deepResearchLLMSteps: [],
  deepResearchToolCalls: [],
  deepResearchCitations: [],
  deepResearchOwnerConversationId: 'test-conv-123',
  currentConversation: { id: 'test-conv-123' },
  activeDeepResearchMessageId: null,
  currentUserMessageId: 'user-msg-1',
}

/**
 * Build a getState-compatible object from partial state + action mocks.
 * Usage:
 * ```ts
 * vi.mocked(useChatStore).getState = vi.fn(() =>
 *   createMockGetState({ isDeepResearchStreaming: true }, { addErrorCard: mockAddErrorCard })
 * )
 * ```
 */
export function createMockGetState(
  overrides: Partial<MockStoreStateBase> = {},
  actions: MockActions = {}
): MockStoreStateBase & MockActions {
  return { ...DEFAULT_STATE, ...overrides, ...actions }
}
