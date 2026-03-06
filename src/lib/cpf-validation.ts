/**
 * CPF Validation Service
 * Uses Brasil API (free) to validate CPF existence
 */

export interface CPFValidationResult {
  valid: boolean
  exists: boolean | null // null if API unavailable
  name?: string
  message: string
}

/**
 * Validate CPF format using checksum algorithm
 */
export function validateCPFFormat(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, '')

  if (cleaned.length !== 11) return false
  if (/^(\d)\1+$/.test(cleaned)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned[i]) * (10 - i)
  }
  let remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(cleaned[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleaned[i]) * (11 - i)
  }
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(cleaned[10])) return false

  return true
}

/**
 * Validate CPF existence via Brasil API
 * This is a FREE API with no rate limits for basic usage
 * https://brasilapi.com.br/docs#tag/CPF
 *
 * Note: This API may not always return data for all CPFs
 * We use it as an additional check, not a blocker
 */
export async function validateCPFExistence(cpf: string): Promise<CPFValidationResult> {
  const cleaned = cpf.replace(/\D/g, '')

  // First, validate format
  if (!validateCPFFormat(cleaned)) {
    return {
      valid: false,
      exists: false,
      message: 'CPF inválido (formato incorreto)',
    }
  }

  // Try to validate via Brasil API
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout

    const response = await fetch(`https://brasilapi.com.br/api/cpf/v1/${cleaned}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      const data = await response.json()
      return {
        valid: true,
        exists: true,
        name: data.nome,
        message: `CPF válido - ${data.nome}`,
      }
    } else if (response.status === 404) {
      // CPF not found in the database
      // This doesn't necessarily mean it's invalid - the API may not have all CPFs
      return {
        valid: true,
        exists: null, // Unknown - API doesn't have this CPF
        message: 'CPF com formato válido (não verificado na Receita)',
      }
    } else if (response.status === 400) {
      return {
        valid: false,
        exists: false,
        message: 'CPF inválido',
      }
    } else {
      // API error - don't block, just warn
      return {
        valid: true,
        exists: null,
        message: 'CPF com formato válido (verificação indisponível)',
      }
    }
  } catch (error) {
    // Network error or timeout - don't block registration
    console.warn('CPF validation API unavailable:', error)
    return {
      valid: true,
      exists: null,
      message: 'CPF com formato válido (verificação offline)',
    }
  }
}

/**
 * Quick CPF format validation (synchronous)
 * Use this for real-time form validation
 */
export function isValidCPFFormat(cpf: string): boolean {
  return validateCPFFormat(cpf)
}

/**
 * Full CPF validation with API check (async)
 * Use this before final submission
 */
export async function fullCPFValidation(cpf: string): Promise<CPFValidationResult> {
  return validateCPFExistence(cpf)
}
