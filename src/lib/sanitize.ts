/**
 * Input normalisation before data leaves the browser.
 *
 * Defence in depth only: the backend validates and escapes everything again.
 */

/**
 * Strips control characters and collapses whitespace.
 * @example
 * sanitizeString('  Hello   World  ') // 'Hello World'
 */
export function sanitizeString(input: string): string {
  if (!input) return ''

  return input
    .trim()
    // Collapse repeated spaces
    .replace(/\s+/g, ' ')
    // Remove caracteres de controle ASCII (0-31 e 127)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '')
}

/**
 * Normaliza email: trim, lowercase, remove espaços internos
 * @param email - Email a normalizar
 * @returns Email normalizado em lowercase
 * @example
 * normalizeEmail(' User@Email.COM ') // 'user@email.com'
 */
export function normalizeEmail(email: string): string {
  if (!email) return ''

  return email
    .trim()
    .toLowerCase()
    // Spaces sometimes come along with a paste.
    .replace(/\s/g, '')
}

/**
 * Title-cases the name and strips markup.
 * e REMOVE caracteres potencialmente perigosos (XSS-safe).
 *
 * The backend escapes again; this only avoids sending obvious junk.
 *
 * @param name - Nome a sanitizar
 * @returns Nome limpo, capitalizado e limitado a 200 caracteres
 * @example
 * sanitizeName('joão da silva') // 'João Da Silva'
 * sanitizeName('<script>alert(1)</script>João') // 'João'
 */
export function sanitizeName(name: string): string {
  if (!name) return ''

  let cleaned = sanitizeString(name)
    // Strip HTML-tag-like substrings entirely
    .replace(/<[^>]*>/g, '')
    // Strip individual special chars (keep accented letters, hyphens, apostrophes for surnames)
    .replace(/[<>"&]/g, '')
    // Reject `javascript:` and `data:` URI schemes if pasted
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    // Reject inline event handlers like `onclick=`
    .replace(/\bon\w+\s*=/gi, '')

  // Cap length defensively
  if (cleaned.length > 200) {
    cleaned = cleaned.substring(0, 200).trim()
  }

  // Capitalize first letter of each word
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase())
}

/**
 * Formats as (XX) XXXXX-XXXX, falling back to bare digits when the length
 * does not match a Brazilian number.
 * @example
 * normalizePhone('11999998888') // '(11) 99999-8888'
 * normalizePhone('(11) 9999-8888') // '(11) 9999-8888'
 */
export function normalizePhone(phone: string): string {
  if (!phone) return ''

  // Digits only
  const digits = phone.replace(/\D/g, '')

  // 11 digits: mobile
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }

  // 10 digits: landline
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }

  // Unknown length: leave the digits untouched rather than mangle them
  return digits
}

/**
 * Returns the 11 digits, dropping punctuation.
 * @example
 * normalizeCPF('123.456.789-00') // '12345678900'
 */
export function normalizeCPF(cpf: string): string {
  if (!cpf) return ''
  return cpf.replace(/\D/g, '')
}

/**
 * Applies the helpers above across a member form payload.
 */
export function sanitizeMemberForm(data: {
  fullName?: string
  email?: string
  phone?: string
  cpf?: string
}): {
  fullName?: string
  email?: string
  phone?: string
  cpf?: string
} {
  return {
    fullName: data.fullName ? sanitizeName(data.fullName) : undefined,
    email: data.email ? normalizeEmail(data.email) : undefined,
    phone: data.phone ? normalizePhone(data.phone) : undefined,
    cpf: data.cpf ? normalizeCPF(data.cpf) : undefined,
  }
}

/**
 * Sanitiza dados de login
 */
export function sanitizeLoginForm(data: {
  email: string
  password: string
}): {
  email: string
  password: string
} {
  return {
    email: normalizeEmail(data.email),
    password: data.password, // Não sanitizar senha - pode ter caracteres especiais intencionais
  }
}
