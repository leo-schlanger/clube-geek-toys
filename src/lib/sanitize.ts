/**
 * Input sanitization utilities
 *
 * Funções para normalizar e sanitizar inputs de usuário
 * antes de enviar ao servidor ou armazenar no banco.
 */

/**
 * Sanitiza string removendo caracteres perigosos e normalizando espaços
 */
export function sanitizeString(input: string): string {
  if (!input) return ''

  return input
    .trim()
    // Remove múltiplos espaços
    .replace(/\s+/g, ' ')
    // Remove caracteres de controle ASCII (0-31 e 127)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '')
}

/**
 * Normaliza email: trim, lowercase, remove espaços internos
 */
export function normalizeEmail(email: string): string {
  if (!email) return ''

  return email
    .trim()
    .toLowerCase()
    // Remove espaços que podem ter sido colados acidentalmente
    .replace(/\s/g, '')
}

/**
 * Sanitiza nome: trim, capitaliza primeira letra de cada palavra
 */
export function sanitizeName(name: string): string {
  if (!name) return ''

  return sanitizeString(name)
    // Capitaliza primeira letra de cada palavra
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

/**
 * Normaliza telefone: remove caracteres não numéricos, mantém apenas dígitos
 */
export function normalizePhone(phone: string): string {
  if (!phone) return ''

  // Remove tudo que não é dígito
  const digits = phone.replace(/\D/g, '')

  // Formata para (XX) XXXXX-XXXX se tiver 11 dígitos
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }

  // Formata para (XX) XXXX-XXXX se tiver 10 dígitos
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }

  // Retorna os dígitos sem formatação se não tiver 10 ou 11
  return digits
}

/**
 * Normaliza CPF: remove caracteres não numéricos
 */
export function normalizeCPF(cpf: string): string {
  if (!cpf) return ''
  return cpf.replace(/\D/g, '')
}

/**
 * Sanitiza dados de formulário de membro
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
