// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

'use client'

import { Component, type ReactNode, type ErrorInfo } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Shown when the boundary catches an error. Defaults to a minimal fallback. */
  fallback?: ReactNode | ((error: Error) => ReactNode)
  /** Called after an error is caught — useful for logging services. */
  onError?: (error: Error, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
    this.props.onError?.(error, info)
  }

  private handleReset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    const { fallback } = this.props
    if (typeof fallback === 'function') return fallback(error)
    if (fallback) return fallback

    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-on-surface-secondary">Something went wrong.</p>
        <button
          onClick={this.handleReset}
          className="rounded-md bg-surface-secondary px-3 py-1.5 text-xs text-on-surface-secondary hover:bg-surface-tertiary"
        >
          Try again
        </button>
      </div>
    )
  }
}
