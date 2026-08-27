/**
 * Error Tracking Service
 *
 * Sends errors to the backend PostgreSQL error_logs table.
 * Also keeps a local buffer for debugging.
 *
 * Usage:
 * import { ErrorTracker } from './lib/error-tracking'
 *
 * ErrorTracker.captureException(error, { userId, context: 'payment_flow' })
 * ErrorTracker.captureMessage('Payment failed', 'warning', { paymentId })
 */

import { logger } from './logger'
import {
  hasAttemptedStaleBundleRecovery,
  isStaleBundleError,
  recoverFromStaleBundle,
} from './stale-bundle'

type Severity = 'debug' | 'info' | 'warning' | 'error' | 'fatal'

interface ErrorContext {
  userId?: string
  memberId?: string
  context?: string
  [key: string]: unknown
}

interface ErrorEvent {
  timestamp: string
  message: string
  severity: Severity
  stack?: string
  context: ErrorContext
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

/**
 * An error raised by a visitor's browser extension, not by the store.
 *
 * These once accounted for 299 of 485 `error_logs` rows — wallet
 * cripto e afins estourando `unhandledrejection` na home. Enterravam o erro real
 * and let any visitor write to the database through the public log route.
 */
export function isExtensionNoise(stack?: string): boolean {
  if (!stack) return false
  return /(chrome|moz|safari-web|ms-browser)-extension:\/\//i.test(stack)
}

class ErrorTrackingService {
  private events: ErrorEvent[] = []
  private maxEvents = 100
  private isProduction = import.meta.env.PROD

  /**
   * Capture an exception with optional context
   */
  captureException(error: Error | unknown, context: ErrorContext = {}): void {
    const err = error instanceof Error ? error : new Error(String(error))

    const event: ErrorEvent = {
      timestamp: new Date().toISOString(),
      message: err.message,
      severity: 'error',
      stack: err.stack,
      context,
    }

    this.addEvent(event)
    this.logToConsole(event)
    if (!isExtensionNoise(event.stack)) {
      this.sendToBackend(event)
    }
  }

  /**
   * Capture a message with severity level
   */
  captureMessage(
    message: string,
    severity: Severity = 'info',
    context: ErrorContext = {}
  ): void {
    const event: ErrorEvent = {
      timestamp: new Date().toISOString(),
      message,
      severity,
      context,
    }

    this.addEvent(event)

    if (severity === 'error' || severity === 'fatal') {
      this.logToConsole(event)
    }

    if (severity === 'warning' || severity === 'error' || severity === 'fatal') {
      this.sendToBackend(event)
    }
  }

  /**
   * Set user context for error tracking
   */
  setUser(userId: string, email?: string): void {
    logger.debug('User set:', { userId, email })
  }

  /**
   * Clear user context (on logout)
   */
  clearUser(): void {
    // No-op — user is extracted from JWT on the backend
  }

  /**
   * Get recent error events (for debugging)
   */
  getRecentEvents(): ErrorEvent[] {
    return [...this.events]
  }

  /**
   * Clear all stored events
   */
  clearEvents(): void {
    this.events = []
  }

  private addEvent(event: ErrorEvent): void {
    this.events.push(event)
    if (this.events.length > this.maxEvents) {
      this.events.shift()
    }
  }

  private sendToBackend(event: ErrorEvent): void {
    // Fire-and-forget — don't block on error reporting
    const token = localStorage.getItem('clube_geek_access_token')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    fetch(`${API_URL}/logs/errors`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        severity: event.severity,
        message: event.message,
        stack: event.stack,
        context: event.context,
        url: window.location.href,
      }),
    }).catch(() => {
      // Silently fail — can't report errors about error reporting
    })
  }

  private logToConsole(event: ErrorEvent): void {
    if (this.isProduction) return

    const { message, severity, stack, context } = event
    const contextStr = Object.keys(context).length > 0
      ? `\nContext: ${JSON.stringify(context, null, 2)}`
      : ''

    switch (severity) {
      case 'fatal':
      case 'error':
        logger.error(`[${severity.toUpperCase()}] ${message}${contextStr}`)
        if (stack) logger.error(stack)
        break
      case 'warning':
        logger.warn(`[${severity.toUpperCase()}] ${message}${contextStr}`)
        break
      default:
        logger.info(`[${severity.toUpperCase()}] ${message}${contextStr}`)
    }
  }
}

// Singleton instance
export const ErrorTracker = new ErrorTrackingService()

// Helper function for wrapping async operations
export async function withErrorTracking<T>(
  operation: () => Promise<T>,
  context: ErrorContext = {}
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    ErrorTracker.captureException(error, context)
    throw error
  }
}

// Global error handlers — capture unhandled errors
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    ErrorTracker.captureException(event.error || event.message, {
      context: 'window.onerror',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    ErrorTracker.captureException(event.reason || 'Unhandled promise rejection', {
      context: 'unhandledrejection',
    })

    // A chunk that 404s outside a React render (a route preload, a lazy import
    // fired from a click handler) lands here instead of the ErrorBoundary. Same
    // cause, same fix: the tab is holding a build the server no longer has.
    if (isStaleBundleError(event.reason) && !hasAttemptedStaleBundleRecovery()) {
      void recoverFromStaleBundle()
    }
  })
}
