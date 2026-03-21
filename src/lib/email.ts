/**
 * Email client for sending transactional emails via the API Worker
 */

import { logger } from './logger'

const API_URL = import.meta.env.VITE_API_URL || 'https://api-worker.leoschlanger.workers.dev'
const DEFAULT_TIMEOUT = 10000 // 10 seconds

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout')
    }
    throw error
  }
}

export type EmailTemplate =
  | 'welcome'
  | 'payment-confirmed'
  | 'payment-failed'
  | 'renewal-reminder'
  | 'points-expiring'
  | 'verify-email'

export interface EmailVariables {
  nome?: string
  plano?: string
  valor?: string
  validade?: string
  motivo?: string
  pontos?: string
  data_expiracao?: string
  dashboard_url?: string
  retry_url?: string
  renew_url?: string
  verification_link?: string
}

export interface SendEmailParams {
  template: EmailTemplate
  to: string
  variables: EmailVariables
  memberId?: string
}

export interface EmailResponse {
  success: boolean
  message?: string
  id?: string
  error?: string
}

export interface EmailTemplateInfo {
  name: string
  subject: string
}

/**
 * Send an email using the API Worker
 */
export async function sendEmail(params: SendEmailParams): Promise<EmailResponse> {
  try {
    const response = await fetchWithTimeout(`${API_URL}/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template: params.template,
        to: params.to,
        variables: params.variables,
        member_id: params.memberId,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to send email',
      }
    }

    return {
      success: true,
      message: data.message,
      id: data.id,
    }
  } catch (error: unknown) {
    logger.error('Email send error:', error)
    const err = error as { message?: string }
    return {
      success: false,
      error: err.message || 'Network error',
    }
  }
}

/**
 * Get available email templates
 */
export async function getEmailTemplates(): Promise<EmailTemplateInfo[]> {
  try {
    const response = await fetchWithTimeout(`${API_URL}/email/templates`, {
      method: 'GET',
    })
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch templates')
    }

    return data.templates
  } catch (error: unknown) {
    logger.error('Email templates fetch error:', error)
    return []
  }
}

/**
 * Send welcome email to new member
 */
export async function sendWelcomeEmail(
  email: string,
  name: string,
  plan: string,
  memberId?: string
): Promise<EmailResponse> {
  return sendEmail({
    template: 'welcome',
    to: email,
    variables: {
      nome: name,
      plano: plan,
    },
    memberId,
  })
}

/**
 * Send payment confirmation email
 */
export async function sendPaymentConfirmedEmail(
  email: string,
  name: string,
  amount: number,
  plan: string,
  expiryDate: string,
  memberId?: string
): Promise<EmailResponse> {
  return sendEmail({
    template: 'payment-confirmed',
    to: email,
    variables: {
      nome: name,
      valor: amount.toFixed(2).replace('.', ','),
      plano: plan,
      validade: new Date(expiryDate).toLocaleDateString('pt-BR'),
    },
    memberId,
  })
}

/**
 * Send payment failed email
 */
export async function sendPaymentFailedEmail(
  email: string,
  name: string,
  amount: number,
  reason?: string,
  memberId?: string
): Promise<EmailResponse> {
  return sendEmail({
    template: 'payment-failed',
    to: email,
    variables: {
      nome: name,
      valor: amount.toFixed(2).replace('.', ','),
      motivo: reason,
    },
    memberId,
  })
}

/**
 * Send renewal reminder email
 */
export async function sendRenewalReminderEmail(
  email: string,
  name: string,
  expiryDate: string,
  memberId?: string
): Promise<EmailResponse> {
  return sendEmail({
    template: 'renewal-reminder',
    to: email,
    variables: {
      nome: name,
      validade: new Date(expiryDate).toLocaleDateString('pt-BR'),
    },
    memberId,
  })
}

/**
 * Send points expiring email
 */
export async function sendPointsExpiringEmail(
  email: string,
  name: string,
  points: number,
  expirationDate: string,
  memberId?: string
): Promise<EmailResponse> {
  return sendEmail({
    template: 'points-expiring',
    to: email,
    variables: {
      nome: name,
      pontos: points.toString(),
      data_expiracao: new Date(expirationDate).toLocaleDateString('pt-BR'),
    },
    memberId,
  })
}

/**
 * Send verification email via Worker (custom template)
 */
export async function sendVerificationEmail(
  email: string,
  uid: string,
  name?: string
): Promise<EmailResponse> {
  try {
    const response = await fetchWithTimeout(`${API_URL}/auth/send-verification-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        uid,
        name,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to send verification email',
      }
    }

    return {
      success: true,
      message: 'Verification email sent',
    }
  } catch (error: unknown) {
    logger.error('Verification email error:', error)
    const err = error as { message?: string }
    return {
      success: false,
      error: err.message || 'Network error',
    }
  }
}

/**
 * Verify email token via Worker
 */
export async function verifyEmailToken(
  token: string
): Promise<{ success: boolean; uid?: string; error?: string }> {
  try {
    const response = await fetchWithTimeout(`${API_URL}/auth/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Verification failed',
      }
    }

    return {
      success: true,
      uid: data.uid,
    }
  } catch (error: unknown) {
    logger.error('Email verification error:', error)
    const err = error as { message?: string }
    return {
      success: false,
      error: err.message || 'Network error',
    }
  }
}
