// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * MSW Handler Exports
 *
 * Combines all MSW handlers for use in browser and server setups.
 */

import { documentHandlers } from './documents'
import { pwrJobHandlers } from './pwr-jobs'

export const handlers = [...documentHandlers, ...pwrJobHandlers]

// Re-export individual handler groups for selective use in tests
export { documentHandlers }
export { pwrJobHandlers }
export { resetDocumentMockState } from './documents'

// Re-export database utilities for test isolation
export { resetDatabase } from '../database'
