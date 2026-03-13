/**
 * Rate Limiting para proteção contra brute force
 *
 * - Rastreia tentativas falhas por email
 * - Bloqueia temporariamente após muitas tentativas
 * - Usa localStorage para persistência
 */

const STORAGE_KEY = 'login_attempts'
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION = 5 * 60 * 1000 // 5 minutos
const ATTEMPT_WINDOW = 15 * 60 * 1000 // 15 minutos

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
    // Manter se ainda está bloqueado ou se as tentativas são recentes
    if (
      (record.lockedUntil && record.lockedUntil > now) ||
      (now - record.firstAttempt < ATTEMPT_WINDOW)
    ) {
      cleaned[email] = record
    }
  }

  return cleaned
}

/**
 * Verifica se o email está bloqueado
 */
export function isBlocked(email: string): { blocked: boolean; remainingTime: number } {
  const store = getStore()
  const record = store[email.toLowerCase()]

  if (!record) {
    return { blocked: false, remainingTime: 0 }
  }

  const now = Date.now()

  // Verificar lockout
  if (record.lockedUntil && record.lockedUntil > now) {
    return {
      blocked: true,
      remainingTime: Math.ceil((record.lockedUntil - now) / 1000),
    }
  }

  // Limpar lockout expirado
  if (record.lockedUntil && record.lockedUntil <= now) {
    delete store[email.toLowerCase()]
    saveStore(store)
  }

  return { blocked: false, remainingTime: 0 }
}

/**
 * Registra uma tentativa falha
 */
export function recordFailedAttempt(email: string): {
  blocked: boolean
  attemptsRemaining: number
  lockoutSeconds: number
} {
  const normalizedEmail = email.toLowerCase()
  let store = cleanOldAttempts(getStore())
  const now = Date.now()

  let record = store[normalizedEmail]

  if (!record || now - record.firstAttempt >= ATTEMPT_WINDOW) {
    // Nova janela de tentativas
    record = {
      attempts: 1,
      firstAttempt: now,
      lockedUntil: null,
    }
  } else {
    // Incrementar tentativas
    record.attempts++
  }

  // Verificar se atingiu o limite
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

/**
 * Limpa tentativas após login bem-sucedido
 */
export function clearAttempts(email: string): void {
  const store = getStore()
  delete store[email.toLowerCase()]
  saveStore(store)
}

/**
 * Retorna informações sobre tentativas restantes
 */
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
