/**
 * Contract Storage — API-based (PostgreSQL + file storage on VPS)
 */

import { api, getAccessToken, tryRefreshToken, API_URL } from './api-client'
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
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' })
    const formData = new FormData()
    formData.append('memberId', memberId)
    formData.append('pdf', blob, `contract-${memberId}.pdf`)

    const token = getAccessToken()

    const response = await fetch(`${API_URL}/contracts`, {
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
  const result = await api.post<{ id: string }>('/contracts', {
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
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' })
  const formData = new FormData()
  // IMPORTANT: Text fields MUST come before the file so multer's destination
  // callback can read req.body.memberId when deciding where to store the file.
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
  // File must be appended LAST so text fields are available in multer callbacks
  formData.append('pdf', blob, `contract-${contractData.memberId}.pdf`)

  const doUpload = (token: string | null) =>
    fetch(`${API_URL}/contracts`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
      body: formData,
    })

  let response = await doUpload(getAccessToken())

  // Token may have expired while the user was reading/signing the contract.
  // Refresh and retry once on 401.
  if (response.status === 401) {
    const refreshed = await tryRefreshToken()
    if (refreshed === 'refreshed') {
      response = await doUpload(getAccessToken())
    }
  }

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

/**
 * Download a signed contract. The PDF sits behind login (GET /contracts/:id/pdf),
 * so a plain link cannot open it: fetch it with the session, then hand the
 * browser a local copy. The token only goes to our own API.
 */
export async function fetchContractPdf(pdfUrl: string): Promise<Blob> {
  if (!pdfUrl.startsWith(`${API_URL}/contracts/`)) {
    throw new Error('Endereço de contrato inválido')
  }
  const get = (token: string | null) =>
    fetch(pdfUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })

  let response = await get(getAccessToken())
  if (response.status === 401 && (await tryRefreshToken()) === 'refreshed') {
    response = await get(getAccessToken())
  }
  if (!response.ok) throw new Error('Não foi possível baixar o contrato')
  return response.blob()
}

/**
 * Open the contract in a new tab. The tab is opened before the download so the
 * click still counts as the user's gesture (popup blockers, iOS Safari).
 */
export async function openContractPdf(pdfUrl: string): Promise<void> {
  const tab = window.open('', '_blank')
  try {
    const blob = await fetchContractPdf(pdfUrl)
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
    if (tab) {
      tab.location.href = url
    } else {
      const link = document.createElement('a')
      link.href = url
      link.download = 'contrato.pdf'
      document.body.appendChild(link)
      link.click()
      link.remove()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    tab?.close()
    throw err
  }
}
