import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isBlocked, recordFailedAttempt, clearAttempts, getAttemptsInfo } from './rate-limit'

// Create a proper localStorage mock that stores data
const createLocalStorageMock = () => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    get length() {
      return Object.keys(store).length
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  }
}

describe('rate-limit', () => {
  let localStorageMock: ReturnType<typeof createLocalStorageMock>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T12:00:00'))

    // Setup localStorage mock
    localStorageMock = createLocalStorageMock()
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('isBlocked', () => {
    it('should return not blocked for new email', () => {
      const result = isBlocked('test@email.com')
      expect(result.blocked).toBe(false)
      expect(result.remainingTime).toBe(0)
    })

    it('should be case insensitive', () => {
      recordFailedAttempt('Test@Email.COM')
      const result = getAttemptsInfo('test@email.com')
      expect(result.attempts).toBe(1)
    })
  })

  describe('recordFailedAttempt', () => {
    it('should record first attempt', () => {
      const result = recordFailedAttempt('test@email.com')
      expect(result.blocked).toBe(false)
      expect(result.attemptsRemaining).toBe(4) // MAX_ATTEMPTS - 1
    })

    it('should increment attempts', () => {
      recordFailedAttempt('test@email.com')
      const result = recordFailedAttempt('test@email.com')
      expect(result.attemptsRemaining).toBe(3)
    })

    it('should block after max attempts', () => {
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt('test@email.com')
      }
      const result = recordFailedAttempt('test@email.com')
      expect(result.blocked).toBe(true)
      expect(result.attemptsRemaining).toBe(0)
      expect(result.lockoutSeconds).toBeGreaterThan(0)
    })

    it('should reset attempts after window expires', () => {
      recordFailedAttempt('test@email.com')

      // Advance time past the attempt window (15 minutes)
      vi.advanceTimersByTime(16 * 60 * 1000)

      const result = recordFailedAttempt('test@email.com')
      expect(result.attemptsRemaining).toBe(4) // Fresh start
    })
  })

  describe('clearAttempts', () => {
    it('should clear attempts for email', () => {
      recordFailedAttempt('test@email.com')
      clearAttempts('test@email.com')

      const result = getAttemptsInfo('test@email.com')
      expect(result.attempts).toBe(0)
      expect(result.remaining).toBe(5)
    })

    it('should be case insensitive', () => {
      recordFailedAttempt('test@email.com')
      clearAttempts('TEST@EMAIL.COM')

      const result = getAttemptsInfo('test@email.com')
      expect(result.attempts).toBe(0)
    })
  })

  describe('getAttemptsInfo', () => {
    it('should return default values for new email', () => {
      const result = getAttemptsInfo('new@email.com')
      expect(result.attempts).toBe(0)
      expect(result.remaining).toBe(5)
      expect(result.blocked).toBe(false)
    })

    it('should return correct info after attempts', () => {
      recordFailedAttempt('test@email.com')
      recordFailedAttempt('test@email.com')

      const result = getAttemptsInfo('test@email.com')
      expect(result.attempts).toBe(2)
      expect(result.remaining).toBe(3)
      expect(result.blocked).toBe(false)
    })

    it('should show blocked state', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('test@email.com')
      }

      const result = getAttemptsInfo('test@email.com')
      expect(result.blocked).toBe(true)
      expect(result.remaining).toBe(0)
    })
  })

  describe('lockout expiration', () => {
    it('should unblock after lockout duration', () => {
      // Trigger lockout
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt('test@email.com')
      }

      expect(isBlocked('test@email.com').blocked).toBe(true)

      // Advance time past lockout (5 minutes)
      vi.advanceTimersByTime(6 * 60 * 1000)

      expect(isBlocked('test@email.com').blocked).toBe(false)
    })
  })
})
