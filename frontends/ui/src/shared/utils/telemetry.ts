// SPDX-FileCopyrightText: Copyright (c) 2025-2026, NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Platform-agnostic telemetry hooks for AI-Q.
 *
 * This module defines a provider-registration pattern for client-side
 * telemetry (error tracking, user actions, lifecycle events). It ships
 * no vendor-specific code — deployment overlays register a concrete
 * provider (Datadog RUM, Sentry, New Relic, etc.) at app startup.
 *
 * All exported functions are no-ops until a provider is registered,
 * making them safe to call unconditionally in the public repo.
 *
 * ## Provider registration
 *
 * Deployment overlays call `registerTelemetryProvider()` once during
 * app initialization. For example, the internal Datadog overlay:
 *
 * ```typescript
 * import { registerTelemetryProvider } from '@/shared/utils/telemetry'
 *
 * registerTelemetryProvider({
 *   trackError: (msg, ctx) => window.DD_RUM?.addError?.(new Error(msg), ctx),
 *   trackAction: (name, ctx) => window.DD_RUM?.addAction?.(name, ctx),
 * })
 * ```
 *
 * ## Event naming conventions
 *
 * Use snake_case names scoped by domain. Include structured context
 * fields so events are filterable in the telemetry UI:
 *
 * ```typescript
 * // Errors — unexpected failures that may need investigation
 * trackError('report_generation_failed', { jobId, reason })
 * trackError('document_upload_failed', { filename, statusCode })
 *
 * // Actions — expected lifecycle events for product analytics
 * trackAction('research_shallow_started', { conversationId })
 * trackAction('research_deep_started', { conversationId })
 * trackAction('report_generated', { jobId, durationMs })
 * trackAction('research_stopped_by_user', { conversationId })
 * ```
 *
 * ### Guidelines for adding new events
 *
 * - **trackError**: Something went wrong that the user didn't expect.
 *   Appears in error tracking dashboards and may trigger alerts.
 * - **trackAction**: A meaningful lifecycle event occurred. Appears in
 *   analytics/actions views. Use for product metrics, not debugging.
 * - **Context fields**: Include IDs (conversationId, jobId) for
 *   correlation and categorical fields (reason, source) for filtering.
 *   Avoid PII (usernames, emails, query text).
 * - **Naming**: `{domain}_{event}` in snake_case. Domains: `auth_`,
 *   `research_`, `report_`, `document_`, `connection_`.
 */

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Contract for telemetry providers.
 *
 * Implementors map these to their vendor's API:
 * - Datadog: trackError → DD_RUM.addError, trackAction → DD_RUM.addAction
 * - Sentry: trackError → Sentry.captureException, trackAction → Sentry.addBreadcrumb
 * - Custom: any implementation that satisfies this interface
 */
export interface TelemetryProvider {
  /** Report an unexpected error (appears in error tracking / alerting). */
  trackError: (message: string, context?: Record<string, unknown>) => void
  /** Report an expected/informational event (appears in action/event logs). */
  trackAction: (name: string, context?: Record<string, unknown>) => void
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let provider: TelemetryProvider | null = null

/**
 * Register a telemetry provider. Call once at app initialization.
 * Subsequent calls replace the previous provider.
 */
export const registerTelemetryProvider = (p: TelemetryProvider): void => {
  provider = p
}

// ---------------------------------------------------------------------------
// Core tracking functions
// ---------------------------------------------------------------------------

/**
 * Emit an error event — use for unexpected failures.
 * No-op when no provider is registered.
 */
export const trackError = (message: string, context: Record<string, unknown> = {}): void => {
  provider?.trackError(message, context)
}

/**
 * Emit an action event — use for expected/informational lifecycle events.
 * No-op when no provider is registered.
 */
export const trackAction = (name: string, context: Record<string, unknown> = {}): void => {
  provider?.trackAction(name, context)
}

// ---------------------------------------------------------------------------
// Auth-specific helpers
// ---------------------------------------------------------------------------

/** Auth error codes that represent expected lifecycle events, not bugs. */
const EXPECTED_AUTH_CODES = new Set(['token_expired', 'session_refresh_failed'])

/**
 * Route an auth event to the appropriate telemetry channel based on error code.
 * Expected codes (token expiration, session refresh) → action (informational).
 * Unexpected codes (invalid token, unknown) → error (alertable).
 */
export const trackAuthEvent = (code: string, context: Record<string, unknown> = {}): void => {
  const enriched = { auth_error_code: code, ...context }
  if (EXPECTED_AUTH_CODES.has(code)) {
    trackAction(`auth_${code}`, enriched)
  } else {
    trackError(`auth_${code}`, enriched)
  }
}
