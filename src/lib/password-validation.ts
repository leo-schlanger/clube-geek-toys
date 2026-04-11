/**
 * Centralized password validation rules.
 * MUST stay in sync with backend `passwordSchema` in server/api/src/routes/auth.routes.ts.
 *
 * Rules:
 *  - min 8 characters
 *  - at least 1 uppercase letter
 *  - at least 1 digit
 */

export const PASSWORD_MIN_LENGTH = 8

export interface PasswordValidationResult {
  valid: boolean
  errors: string[]
  strength: 'weak' | 'medium' | 'strong'
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = []

  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('A senha deve conter pelo menos 1 letra maiúscula.')
  }
  if (!/[0-9]/.test(password)) {
    errors.push('A senha deve conter pelo menos 1 número.')
  }

  // Strength heuristic for visual feedback
  let score = 0
  if (password.length >= PASSWORD_MIN_LENGTH) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  const strength: 'weak' | 'medium' | 'strong' =
    score <= 2 ? 'weak' : score <= 4 ? 'medium' : 'strong'

  return {
    valid: errors.length === 0,
    errors,
    strength,
  }
}

/**
 * Single-line message for the first error, or null if valid.
 * Convenient for inline form errors.
 */
export function passwordError(password: string): string | null {
  const r = validatePassword(password)
  return r.valid ? null : r.errors[0]
}
