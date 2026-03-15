/**
 * Generic retry utility with exponential backoff
 */

import { logger } from './logger'

const MAX_RETRIES = 3
const INITIAL_DELAY = 500 // 500ms

interface RetryOptions {
  maxRetries?: number
  initialDelay?: number
  shouldRetry?: (error: unknown) => boolean
}

/**
 * Default retry condition: retry on network errors and temporary failures
 */
function defaultShouldRetry(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    // Retry on network errors, timeouts, and temporary failures
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('unavailable') ||
      message.includes('deadline') ||
      message.includes('aborted')
    ) {
      return true
    }

    // Firestore-specific: retry on permission errors that might be transient
    const firebaseError = error as { code?: string }
    if (firebaseError.code === 'unavailable' || firebaseError.code === 'deadline-exceeded') {
      return true
    }
  }

  return false
}

/**
 * Execute an async function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = MAX_RETRIES,
    initialDelay = INITIAL_DELAY,
    shouldRetry = defaultShouldRetry
  } = options

  let lastError: unknown = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Check if we should retry
      if (!shouldRetry(error) || attempt === maxRetries - 1) {
        throw error
      }

      // Wait with exponential backoff before retrying
      const delay = initialDelay * Math.pow(2, attempt)
      logger.debug(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`)
      await sleep(delay)
    }
  }

  throw lastError
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Wrap a function to add retry capability
 */
export function withRetryWrapper<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: RetryOptions = {}
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => fn(...args), options)
}
