/**
 * Contract Storage — API-based (PostgreSQL + file storage on VPS)
 */

import { api } from './api-client'
import type { ContractData, Contract } from '../types'

/**
 * Upload PDF to server and save contract data
 */
export async function uploadContractPDF(
  memberId: string,
  pdfBytes: Uint8Array,
  _timestamp: string
): Promise<{ url: string; path: string }> {
  try {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' })
    const formData = new FormData()
    formData.append('pdf', blob, `contract-${memberId}.pdf`)
    formData.append('memberId', memberId)

    const { getAccessToken, API_URL: apiUrl } = await import('./api-client')
    const token = getAccessToken()

    const response = await fetch(`${apiUrl}/contracts`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })

    if (!response.ok) throw new Error('Upload failed')
    const data = await response.json()
    return { url: data.pdfUrl || '', path: data.pdfPath || '' }
  } catch {
    return { url: '', path: '' }
  }
}

/**
 * Save contract data to API
 */
export async function saveContract(
  contractData: ContractData,
  _pdfUrl: string,
  _pdfPath: string
): Promise<string> {
  const result = await api.post('/contracts', {
    memberId: contractData.memberId,
    memberName: contractData.memberName,
    memberCpf: contractData.memberCPF,
    memberEmail: contractData.memberEmail,
    plan: contractData.plan,
    signaturePreview: contractData.signatureImage?.substring(0, 100),
    signedAt: contractData.signedAt,
    ipAddress: contractData.ipAddress,
    userAgent: contractData.userAgent,
    documentHash: contractData.documentHash,
  })

  if (result.error || !result.data) {
    throw new Error(result.error || 'Resposta inválida ao salvar contrato')
  }

  return result.data.id
}

/**
 * Get active contract for a member
 */
export async function getMemberContract(memberId: string): Promise<Contract | null> {
  const result = await api.get<Contract>(`/contracts/${memberId}`)
  return result.data || null
}

/**
 * Get all contracts for a member (including superseded)
 */
export async function getMemberContractHistory(memberId: string): Promise<Contract[]> {
  const result = await api.get<Contract[]>(`/contracts/${memberId}/history`)
  return result.data || []
}

/**
 * Store complete contract (upload PDF + save to database)
 * Uses FormData because the backend expects multer file upload.
 */
export async function storeContract(
  contractData: ContractData,
  pdfBytes: Uint8Array
): Promise<{ contractId: string; pdfUrl: string }> {
  const { getAccessToken, API_URL: apiUrl } = await import('./api-client')
  const token = getAccessToken()

  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  const formData = new FormData()
  formData.append('pdf', blob, `contract-${contractData.memberId}.pdf`)
  formData.append('memberId', contractData.memberId)
  formData.append('memberName', contractData.memberName)
  formData.append('memberCpf', contractData.memberCPF)
  formData.append('memberEmail', contractData.memberEmail)
  formData.append('plan', contractData.plan)
  formData.append('signedAt', contractData.signedAt)
  formData.append('ipAddress', contractData.ipAddress || '')
  formData.append('userAgent', contractData.userAgent || '')
  formData.append('documentHash', contractData.documentHash || '')
  if (contractData.signatureImage) {
    formData.append('signaturePreview', contractData.signatureImage.substring(0, 100))
  }

  const response = await fetch(`${apiUrl}/contracts`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
    body: formData,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `Erro ao salvar contrato (${response.status})`)
  }

  const data = await response.json()
  return {
    contractId: data.id || '',
    pdfUrl: data.pdfUrl || '',
  }
}
