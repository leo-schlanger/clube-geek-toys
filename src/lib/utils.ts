import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format number as Brazilian currency
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

/**
 * Format CPF with mask (000.000.000-00)
 */
export function formatCPF(cpf: string): string {
  const cleaned = cpf.replace(/\D/g, '')
  return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

/**
 * Format phone number with mask
 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  }
  return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
}

/**
 * Validate Brazilian CPF
 */
export function validateCPF(cpf: string): boolean {
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
 * Get status color class
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-500'
    case 'pending':
      return 'bg-yellow-500'
    case 'inactive':
    case 'expired':
      return 'bg-red-500'
    default:
      return 'bg-gray-500'
  }
}

/**
 * Get status label in Portuguese
 */
export function getStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Ativo'
    case 'pending':
      return 'Pendente'
    case 'inactive':
      return 'Inativo'
    case 'expired':
      return 'Expirado'
    default:
      return status
  }
}

/**
 * Get plan label
 */
export function getPlanLabel(plan: string): string {
  switch (plan) {
    case 'silver':
      return 'Silver'
    case 'gold':
      return 'Gold'
    case 'black':
      return 'Black'
    default:
      return plan
  }
}

/**
 * Get plan discount percentage
 */
export function getPlanDiscount(plan: string): number {
  switch (plan) {
    case 'silver':
      return 10
    case 'gold':
      return 15
    case 'black':
      return 20
    default:
      return 0
  }
}

/**
 * Calculate days until expiry date
 */
export function calculateDaysUntilExpiry(expiryDate: Date): number {
  const today = new Date()
  const expiry = new Date(expiryDate)
  const diffTime = expiry.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Check if date is expired
 */
export function isExpired(expiryDate: Date): boolean {
  return new Date(expiryDate) < new Date()
}

/**
 * Format date to Brazilian format
 */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('pt-BR')
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}
