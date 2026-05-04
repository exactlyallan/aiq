// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Helpers for the knowledge-layer collection used by research submits.
 *
 * Until the backend can issue a collection before job submission, the UI uses
 * the lightweight local conversation id as the collection key. Keeping that
 * rule behind helpers makes the current bridge explicit and leaves one place
 * to change when collection ownership moves fully backend-side.
 */

import type { TrackedFile } from './types'

export const KNOWLEDGE_LAYER_DATA_SOURCE_ID = 'knowledge_layer'

export const getResearchCollectionName = (
  conversationId: string | null | undefined
): string | null => {
  const value = conversationId?.trim()
  return value ? value : null
}

export const isFileUsableForResearch = (file: TrackedFile): boolean =>
  file.status === 'ingesting' || file.status === 'success'

export const getFilesForResearchCollection = (
  files: TrackedFile[],
  collectionName: string | null | undefined
): TrackedFile[] => {
  if (!collectionName) return []
  return files.filter((file) =>
    file.collectionName === collectionName && isFileUsableForResearch(file)
  )
}

export const getResearchCollectionDescription = (collectionName: string): string =>
  `Documents for research collection ${collectionName}`
