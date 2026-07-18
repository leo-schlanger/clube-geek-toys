/**
 * Error Tracking — Unit Tests
 *
 * Tests the ErrorTrackingService class and withErrorTracking helper:
 * - captureException
 * - captureMessage
 * - setUser / clearUser
 * - getRecentEvents / clearEvents
 * - Event buffer rotation (maxEvents)
 * - Backend sending logic
 * - withErrorTracking wrapper
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock logger
vi.mock('./logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// We need to import after mocks are set up
import { ErrorTracker, withErrorTracking } from './error-tracking'

beforeEach(() => {
  vi.clearAllMocks()
  ErrorTracker.clearEvents()
  // fetch should silently succeed by default
  mockFetch.mockResolvedValue({ ok: true })
  // localStorage mock from setup.ts
  vi.mocked(localStorage.getItem).mockReturnValue(null)
})

// =============================================================================
// captureException
// =============================================================================

describe('captureException', () => {
  it('should capture an Error and store the event', () => {
    const error = new Error('Something broke')
    ErrorTracker.captureException(error, { userId: 'u1' })

    const events = ErrorTracker.getRecentEvents()
    expect(events).toHaveLength(1)
    expect(events[0].message).toBe('Something broke')
    expect(events[0].severity).toBe('error')
    expect(events[0].stack).toBeDefined()
    expect(events[0].context.userId).toBe('u1')
    expect(events[0].timestamp).toBeTruthy()
  })

  it('should handle non-Error values', () => {
    ErrorTracker.captureException('string error')

    const events = ErrorTracker.getRecentEvents()
    expect(events).toHaveLength(1)
    expect(events[0].message).toBe('string error')
  })

  it('should handle numeric error', () => {
    ErrorTracker.captureException(42)

    const events = ErrorTracker.getRecentEvents()
    expect(events[0].message).toBe('42')
  })

  it('should send event to backend', () => {
    ErrorTracker.captureException(new Error('test'))

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toContain('/logs/errors')
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(options.body)
    expect(body.severity).toBe('error')
    expect(body.message).toBe('test')
  })

  it('should include auth token when available', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('my-token')

    ErrorTracker.captureException(new Error('test'))

    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers['Authorization']).toBe('Bearer my-token')
  })

  it('should not throw when fetch fails', () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'))

    expect(() => ErrorTracker.captureException(new Error('test'))).not.toThrow()
  })

  it('should default to empty context', () => {
    ErrorTracker.captureException(new Error('test'))

    const events = ErrorTracker.getRecentEvents()
    expect(events[0].context).toEqual({})
  })
})

// =============================================================================
// captureMessage
// =============================================================================

describe('captureMessage', () => {
  it('should capture info message (default severity)', () => {
    ErrorTracker.captureMessage('Info message')

    const events = ErrorTracker.getRecentEvents()
    expect(events).toHaveLength(1)
    expect(events[0].message).toBe('Info message')
    expect(events[0].severity).toBe('info')
    expect(events[0].stack).toBeUndefined()
  })

  it('should send warning to backend', () => {
    ErrorTracker.captureMessage('Warning msg', 'warning')

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should send error to backend', () => {
    ErrorTracker.captureMessage('Error msg', 'error')

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should send fatal to backend', () => {
    ErrorTracker.captureMessage('Fatal msg', 'fatal')

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should NOT send info to backend', () => {
    ErrorTracker.captureMessage('Info msg', 'info')

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should NOT send debug to backend', () => {
    ErrorTracker.captureMessage('Debug msg', 'debug')

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should accept context', () => {
    ErrorTracker.captureMessage('msg', 'warning', { memberId: 'm1' })

    const events = ErrorTracker.getRecentEvents()
    expect(events[0].context.memberId).toBe('m1')
  })
})

// =============================================================================
// setUser / clearUser
// =============================================================================

describe('setUser', () => {
  it('should not throw', () => {
    expect(() => ErrorTracker.setUser('user-1', 'test@email.com')).not.toThrow()
  })
})

describe('clearUser', () => {
  it('should not throw', () => {
    expect(() => ErrorTracker.clearUser()).not.toThrow()
  })
})

// =============================================================================
// getRecentEvents / clearEvents
// =============================================================================

describe('getRecentEvents', () => {
  it('should return a copy of events array', () => {
    ErrorTracker.captureMessage('msg1', 'info')
    ErrorTracker.captureMessage('msg2', 'info')

    const events = ErrorTracker.getRecentEvents()
    expect(events).toHaveLength(2)

    // Should be a copy, not a reference
    events.pop()
    expect(ErrorTracker.getRecentEvents()).toHaveLength(2)
  })
})

describe('clearEvents', () => {
  it('should remove all stored events', () => {
    ErrorTracker.captureMessage('msg1', 'info')
    ErrorTracker.captureMessage('msg2', 'info')
    expect(ErrorTracker.getRecentEvents()).toHaveLength(2)

    ErrorTracker.clearEvents()

    expect(ErrorTracker.getRecentEvents()).toHaveLength(0)
  })
})

// =============================================================================
// Event Buffer Rotation
// =============================================================================

describe('event buffer rotation', () => {
  it('should cap events at maxEvents (100)', () => {
    for (let i = 0; i < 110; i++) {
      ErrorTracker.captureMessage(`msg-${i}`, 'info')
    }

    const events = ErrorTracker.getRecentEvents()
    expect(events).toHaveLength(100)
    // Oldest events should have been dropped
    expect(events[0].message).toBe('msg-10')
    expect(events[99].message).toBe('msg-109')
  })
})

// =============================================================================
// withErrorTracking
// =============================================================================

describe('withErrorTracking', () => {
  it('should return result of successful operation', async () => {
    const result = await withErrorTracking(() => Promise.resolve(42))

    expect(result).toBe(42)
  })

  it('should re-throw error after capturing', async () => {
    const error = new Error('operation failed')

    await expect(
      withErrorTracking(() => Promise.reject(error), { context: 'test' })
    ).rejects.toThrow('operation failed')

    const events = ErrorTracker.getRecentEvents()
    expect(events).toHaveLength(1)
    expect(events[0].message).toBe('operation failed')
    expect(events[0].context.context).toBe('test')
  })

  it('should pass context to captureException', async () => {
    try {
      await withErrorTracking(
        () => { throw new Error('fail') },
        { userId: 'u1', context: 'payment' }
      )
    } catch {
      // expected
    }

    const events = ErrorTracker.getRecentEvents()
    expect(events[0].context.userId).toBe('u1')
    expect(events[0].context.context).toBe('payment')
  })

  it('should work with async operations', async () => {
    const result = await withErrorTracking(async () => {
      return 'async-result'
    })

    expect(result).toBe('async-result')
  })
})
