/**
 * Reporting for the admin panel's write paths.
 *
 * Every `catch` in the panel used to end at `logger.error`, which is silenced in
 * production: when the product form failed, nothing was written to the console,
 * nothing reached `error_logs`, and the only trace left was a toast that said
 * "Erro ao criar produto" without saying why. Diagnosing it meant asking the
 * person at the counter to describe a screen.
 *
 * `reportAdminError` keeps the dev console behaviour and also files the error,
 * tagged with the operation that failed, so the next report starts from data.
 */

import { logger } from './logger'
import { ErrorTracker } from './error-tracking'
import { ApiError } from './api-client'

/**
 * @param operation dotted name of what was being attempted, e.g. `product.create`.
 */
export function reportAdminError(operation: string, error: unknown): void {
  logger.error(`[admin] ${operation} failed:`, error)

  ErrorTracker.captureException(error, {
    context: 'admin',
    operation,
    ...(error instanceof ApiError
      ? { httpStatus: error.status, errorCode: error.code, details: error.details }
      : {}),
  })
}
