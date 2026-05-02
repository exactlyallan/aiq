// SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Research submit proxy.
 *
 * Keeps browser calls on the UI origin while routing through the AIQ-owned
 * backend research endpoint. This is intentionally separate from
 * /api/jobs/async/submit so the backend keeps shallow/deep routing authority.
 */

import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { isAuthRequired } from '@/adapters/auth/config'

const getBackendUrl = (): string => {
  const url = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
  return url.replace(/\/$/, '')
}

const getAuthHeaders = async (req: NextRequest): Promise<Record<string, string>> => {
  if (!isAuthRequired()) {
    return {}
  }

  const authToken = req.headers.get('Authorization')
  const cookieStore = await cookies()
  const idToken = cookieStore.get('idToken')?.value

  return {
    ...(authToken ? { Authorization: authToken } : {}),
    ...(idToken ? { Cookie: `idToken=${idToken}` } : {}),
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const authHeaders = await getAuthHeaders(req)
    const body = await req.json()
    const response = await fetch(`${getBackendUrl()}/v1/research/submit`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
        'X-AIQ-Mode': 'headless',
      },
      body: JSON.stringify(body),
    })

    const payload = await response.json()
    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        error: {
          code: 'PROXY_ERROR',
          message,
          user_message: 'The UI could not reach the research backend.',
          failure_boundary: 'ui_proxy',
          retryable: true,
        },
      },
      { status: 500 }
    )
  }
}
