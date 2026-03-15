/**
 * Error Tracking Service
 *
 * A lightweight error tracking service that can be integrated with
 * Sentry, LogRocket, or other error tracking services.
 *
 * Usage:
 * import { ErrorTracker } from './lib/error-tracking'
 *
 * // Capture an error
 * ErrorTracker.captureException(error, { userId, context: 'payment_flow' })
 *
 * // Capture a message
 * ErrorTracker.captureMessage('Payment failed', 'warning', { paymentId })
 */

import { logger } from './logger'

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

    // TODO: Send to Sentry or other service
    // if (this.isProduction) {
    //   Sentry.captureException(error, { extra: context })
    // }
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

    // TODO: Send to Sentry or other service
    // if (this.isProduction) {
    //   Sentry.captureMessage(message, severity)
    // }
  }

  /**
   * Set user context for error tracking
   */
  setUser(userId: string, email?: string): void {
    // TODO: Send to Sentry
    // Sentry.setUser({ id: userId, email })
    logger.debug('User set:', { userId, email })
  }

  /**
   * Clear user context (on logout)
   */
  clearUser(): void {
    // TODO: Send to Sentry
    // Sentry.setUser(null)
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

  private logToConsole(event: ErrorEvent): void {
    if (this.isProduction) {
      // In production, we rely on error tracking service
      return
    }

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
