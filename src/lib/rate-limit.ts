/**
 * Client-side brute-force throttling.
 *
 * This is **not** a security control: it can be bypassed by clearing
 * localStorage, only covers the current browser, and does nothing against an
 * attacker with several devices. The real limit lives in the Express
 * middleware; this only saves an honest user from hammering a wrong password.
 *
 */

import { STORAGE_KEYS, TIMEOUTS, LIMITS } from './constants'

const STORAGE_KEY = STORAGE_KEYS.LOGIN_ATTEMPTS
const MAX_ATTEMPTS = LIMITS.MAX_LOGIN_ATTEMPTS
const LOCKOUT_DURATION = TIMEOUTS.LOCKOUT_DURATION
const ATTEMPT_WINDOW = TIMEOUTS.ATTEMPT_WINDOW

interface AttemptRecord {
  attempts: number
  firstAttempt: number
  lockedUntil: number | null
}

interface AttemptsStore {
  [email: string]: AttemptRecord
}

function getStore(): AttemptsStore {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : {}
  } catch {
    return {}
  }
}

function saveStore(store: AttemptsStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Ignore storage errors
  }
}

function cleanOldAttempts(store: AttemptsStore): AttemptsStore {
  const now = Date.now()
  const cleaned: AttemptsStore = {}

  for (const [email, record] of Object.entries(store)) {
    // Keep while still locked out, or while the attempts are recent.
    if (
      (record.lockedUntil && record.lockedUntil > now) ||
      (now - record.firstAttempt < ATTEMPT_WINDOW)
    ) {
      cleaned[email] = record
    }
  }

  return cleaned
}


export function isBlocked(email: string): { blocked: boolean; remainingTime: number } {
  const store = getStore()
  const record = store[email.toLowerCase()]

  if (!record) {
    return { blocked: false, remainingTime: 0 }
  }

  const now = Date.now()

  if (record.lockedUntil && record.lockedUntil > now) {
    return {
      blocked: true,
      remainingTime: Math.ceil((record.lockedUntil - now) / 1000),
    }
  }

  if (record.lockedUntil && record.lockedUntil <= now) {
    delete store[email.toLowerCase()]
    saveStore(store)
  }

  return { blocked: false, remainingTime: 0 }
}


export function recordFailedAttempt(email: string): {
  blocked: boolean
  attemptsRemaining: number
  lockoutSeconds: number
} {
  const normalizedEmail = email.toLowerCase()
  const store = cleanOldAttempts(getStore())
  const now = Date.now()

  let record = store[normalizedEmail]

  if (!record || now - record.firstAttempt >= ATTEMPT_WINDOW) {
    record = {
      attempts: 1,
      firstAttempt: now,
      lockedUntil: null,
    }
  } else {
    record.attempts++
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION
    store[normalizedEmail] = record
    saveStore(store)

    return {
      blocked: true,
      attemptsRemaining: 0,
      lockoutSeconds: Math.ceil(LOCKOUT_DURATION / 1000),
    }
  }

  store[normalizedEmail] = record
  saveStore(store)

  return {
    blocked: false,
    attemptsRemaining: MAX_ATTEMPTS - record.attempts,
    lockoutSeconds: 0,
  }
}


export function clearAttempts(email: string): void {
  const store = getStore()
  delete store[email.toLowerCase()]
  saveStore(store)
}


export function getAttemptsInfo(email: string): {
  attempts: number
  remaining: number
  blocked: boolean
} {
  const store = getStore()
  const record = store[email.toLowerCase()]

  if (!record) {
    return { attempts: 0, remaining: MAX_ATTEMPTS, blocked: false }
  }

  const { blocked } = isBlocked(email)

  return {
    attempts: record.attempts,
    remaining: Math.max(0, MAX_ATTEMPTS - record.attempts),
    blocked,
  }
}
