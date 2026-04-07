/**
 * Email client — uses Express API (replaces Cloudflare Worker calls)
 */

import { api } from './api-client'
import { logger } from './logger'

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
 * Send an email using the API
 */
export async function sendEmail(params: SendEmailParams): Promise<EmailResponse> {
  try {
    const result = await api.post('/email/send', {
      template: params.template,
      to: params.to,
      variables: params.variables,
      member_id: params.memberId,
    })

    if (result.error) {
      return { success: false, error: result.error }
    }

    return { success: true, message: result.data?.message, id: result.data?.id }
  } catch (error: unknown) {
    logger.error('Email send error:', error)
    return { success: false, error: 'Erro ao enviar email' }
  }
}

/**
 * Get available email templates
 */
export async function getEmailTemplates(): Promise<EmailTemplateInfo[]> {
  try {
    const result = await api.get('/email/templates')
    return result.data?.templates || []
  } catch {
    return []
  }
}

/**
 * Send welcome email to new member
 */
export async function sendWelcomeEmail(
  email: string, name: string, plan: string, memberId?: string
): Promise<EmailResponse> {
  return sendEmail({ template: 'welcome', to: email, variables: { nome: name, plano: plan }, memberId })
}

/**
 * Send payment confirmation email
 */
export async function sendPaymentConfirmedEmail(
  email: string, name: string, amount: number, plan: string, expiryDate: string, memberId?: string
): Promise<EmailResponse> {
  return sendEmail({
    template: 'payment-confirmed', to: email,
    variables: {
      nome: name, valor: amount.toFixed(2).replace('.', ','),
      plano: plan, validade: new Date(expiryDate).toLocaleDateString('pt-BR'),
    },
    memberId,
  })
}

/**
 * Send payment failed email
 */
export async function sendPaymentFailedEmail(
  email: string, name: string, amount: number, reason?: string, memberId?: string
): Promise<EmailResponse> {
  return sendEmail({
    template: 'payment-failed', to: email,
    variables: { nome: name, valor: amount.toFixed(2).replace('.', ','), motivo: reason },
    memberId,
  })
}

/**
 * Send renewal reminder email
 */
export async function sendRenewalReminderEmail(
  email: string, name: string, expiryDate: string, memberId?: string
): Promise<EmailResponse> {
  return sendEmail({
    template: 'renewal-reminder', to: email,
    variables: { nome: name, validade: new Date(expiryDate).toLocaleDateString('pt-BR') },
    memberId,
  })
}

/**
 * Send points expiring email
 */
export async function sendPointsExpiringEmail(
  email: string, name: string, points: number, expirationDate: string, memberId?: string
): Promise<EmailResponse> {
  return sendEmail({
    template: 'points-expiring', to: email,
    variables: { nome: name, pontos: points.toString(), data_expiracao: new Date(expirationDate).toLocaleDateString('pt-BR') },
    memberId,
  })
}

/**
 * Send verification email via API
 */
export async function sendVerificationEmail(
  email: string, uid: string, name?: string
): Promise<EmailResponse> {
  try {
    const result = await api.post('/auth/send-verification-email', { email, uid, name })
    if (result.error) return { success: false, error: result.error }
    return { success: true, message: 'Verification email sent' }
  } catch (error: unknown) {
    logger.error('Verification email error:', error)
    return { success: false, error: 'Erro ao enviar email de verificação' }
  }
}

/**
 * Send password reset email via API
 */
export async function sendPasswordResetEmail(email: string): Promise<EmailResponse> {
  try {
    const result = await api.post('/auth/send-password-reset', { email })
    if (result.error) return { success: false, error: result.error }
    return { success: true, message: 'Password reset email sent' }
  } catch (error: unknown) {
    logger.error('Password reset email error:', error)
    return { success: false, error: 'Erro ao enviar email de redefinição' }
  }
}

/**
 * Send contract email with PDF attachment
 */
export async function sendContractEmail(
  email: string, memberName: string, plan: string, signedAt: string,
  hash: string, pdfBase64: string, adminEmail?: string
): Promise<EmailResponse> {
  try {
    const result = await api.post('/email/send-contract', {
      to: email, member_name: memberName, plan, signed_at: signedAt,
      hash, pdf_base64: pdfBase64, admin_email: adminEmail,
    })
    if (result.error) return { success: false, error: result.error }
    return { success: true, message: 'Contract email sent', id: result.data?.id }
  } catch (error: unknown) {
    logger.error('Contract email error:', error)
    return { success: false, error: 'Erro ao enviar contrato' }
  }
}

/**
 * Resend contract email by downloading PDF from URL
 */
export async function resendContractEmail(
  email: string, memberName: string, plan: string, signedAt: string,
  hash: string, pdfUrl: string
): Promise<EmailResponse> {
  try {
    const pdfResponse = await fetch(pdfUrl)
    if (!pdfResponse.ok) return { success: false, error: 'Não foi possível baixar o contrato' }

    const pdfArrayBuffer = await pdfResponse.arrayBuffer()
    const pdfBytes = new Uint8Array(pdfArrayBuffer)
    let binary = ''
    for (let i = 0; i < pdfBytes.length; i++) {
      binary += String.fromCharCode(pdfBytes[i])
    }
    const pdfBase64 = btoa(binary)

    return sendContractEmail(email, memberName, plan, signedAt, hash, pdfBase64)
  } catch (error: unknown) {
    logger.error('Resend contract error:', error)
    return { success: false, error: 'Erro ao reenviar contrato' }
  }
}

/**
 * Verify email token via API
 */
export async function verifyEmailToken(
  token: string
): Promise<{ success: boolean; uid?: string; error?: string }> {
  try {
    const result = await api.post('/auth/verify-email', { token })
    if (result.error) return { success: false, error: result.error }
    return { success: true, uid: result.data?.uid }
  } catch (error: unknown) {
    logger.error('Email verification error:', error)
    return { success: false, error: 'Erro ao verificar email' }
  }
}
