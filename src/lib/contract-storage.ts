/**
 * Contract Storage — API-based (replaces Firebase Storage + Firestore)
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
  // Convert to base64 for JSON upload
  let binary = ''
  for (let i = 0; i < pdfBytes.length; i++) {
    binary += String.fromCharCode(pdfBytes[i])
  }
  void btoa(binary)

  // Upload will happen as part of storeContract
  return { url: '', path: '' }
}

/**
 * Save contract data to API
 */
export async function saveContractToFirestore(
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

  if (result.error) {
    throw new Error(result.error)
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
 */
export async function storeContract(
  contractData: ContractData,
  pdfBytes: Uint8Array
): Promise<{ contractId: string; pdfUrl: string }> {
  // Convert PDF to base64
  let binary = ''
  for (let i = 0; i < pdfBytes.length; i++) {
    binary += String.fromCharCode(pdfBytes[i])
  }
  const pdfBase64 = btoa(binary)

  // Send contract data + PDF as JSON (server handles file storage)
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
    pdfBase64,
  })

  if (result.error) {
    throw new Error(result.error)
  }

  return {
    contractId: result.data.id,
    pdfUrl: result.data.pdfUrl || '',
  }
}
