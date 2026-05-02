// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * MSW Handler Exports
 *
 * Combines all MSW handlers for use in browser and server setups.
 */

import { documentHandlers } from './documents'
import { researchJobHandlers } from './research-jobs'

export const handlers = [...documentHandlers, ...researchJobHandlers]

// Re-export individual handler groups for selective use in tests
export { documentHandlers }
export { researchJobHandlers }
export { resetDocumentMockState } from './documents'

// Re-export database utilities for test isolation
export { resetDatabase } from '../database'
