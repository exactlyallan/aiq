// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import {
  getFilesForResearchCollection,
  getResearchCollectionName,
  isFileUsableForResearch,
} from './research-collections'
import type { TrackedFile } from './types'

const file = (overrides: Partial<TrackedFile>): TrackedFile => ({
  id: overrides.id ?? 'file-1',
  fileName: overrides.fileName ?? 'source.pdf',
  fileSize: overrides.fileSize ?? 100,
  status: overrides.status ?? 'success',
  progress: overrides.progress ?? 100,
  collectionName: overrides.collectionName ?? 'collection-1',
})

describe('research collection helpers', () => {
  test('uses the conversation id as the current collection bridge', () => {
    expect(getResearchCollectionName('session-1')).toBe('session-1')
    expect(getResearchCollectionName('  session-1  ')).toBe('session-1')
    expect(getResearchCollectionName('')).toBeNull()
    expect(getResearchCollectionName(null)).toBeNull()
  })

  test('only treats ingesting and successful files as usable for submit', () => {
    expect(isFileUsableForResearch(file({ status: 'ingesting' }))).toBe(true)
    expect(isFileUsableForResearch(file({ status: 'success' }))).toBe(true)
    expect(isFileUsableForResearch(file({ status: 'uploading' }))).toBe(false)
    expect(isFileUsableForResearch(file({ status: 'failed' }))).toBe(false)
  })

  test('filters files by collection and usable status', () => {
    const files = [
      file({ id: 'file-1', collectionName: 'collection-1', status: 'success' }),
      file({ id: 'file-2', collectionName: 'collection-1', status: 'uploading' }),
      file({ id: 'file-3', collectionName: 'collection-2', status: 'success' }),
    ]

    expect(getFilesForResearchCollection(files, 'collection-1').map((item) => item.id)).toEqual([
      'file-1',
    ])
  })
})
