/**
 * Contract Storage - Firebase Storage and Firestore operations
 */

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import {
  collection,
  doc,
  setDoc,
  query,
  where,
  getDocs,
  updateDoc,
  orderBy,
  limit,
} from 'firebase/firestore'
import { db, storage } from './firebase'
import { logger } from './logger'
import type { ContractData, Contract, ContractStatus } from '../types'

const CONTRACTS_COLLECTION = 'contracts'
const STORAGE_PATH = 'contracts'
const MAX_RETRIES = 3
const RETRY_DELAY = 1000

/**
 * Delay helper for retries
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Upload PDF to Firebase Storage with retry
 */
export async function uploadContractPDF(
  memberId: string,
  pdfBytes: Uint8Array,
  timestamp: string
): Promise<{ url: string; path: string }> {
  const fileName = `contract_${memberId}_${timestamp.replace(/[:.]/g, '-')}.pdf`
  const filePath = `${STORAGE_PATH}/${memberId}/${fileName}`
  const storageRef = ref(storage, filePath)

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Upload file
      const snapshot = await uploadBytes(storageRef, pdfBytes, {
        contentType: 'application/pdf',
      })

      // Get download URL
      const url = await getDownloadURL(snapshot.ref)

      logger.info(`Contract PDF uploaded successfully: ${filePath}`)
      return { url, path: filePath }
    } catch (error) {
      lastError = error as Error
      logger.warn(`Upload attempt ${attempt}/${MAX_RETRIES} failed:`, error)

      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY * attempt)
      }
    }
  }

  throw lastError || new Error('Failed to upload contract PDF')
}

/**
 * Mark previous contracts as superseded
 */
async function supersedePreviousContracts(memberId: string): Promise<void> {
  try {
    const q = query(
      collection(db, CONTRACTS_COLLECTION),
      where('memberId', '==', memberId),
      where('status', '==', 'active')
    )

    const snapshot = await getDocs(q)

    const updates = snapshot.docs.map(docSnap =>
      updateDoc(doc(db, CONTRACTS_COLLECTION, docSnap.id), {
        status: 'superseded' as ContractStatus,
      })
    )

    await Promise.all(updates)

    if (snapshot.docs.length > 0) {
      logger.info(`Superseded ${snapshot.docs.length} previous contracts for member ${memberId}`)
    }
  } catch (error) {
    logger.warn('Failed to supersede previous contracts:', error)
    // Don't throw - this is not critical
  }
}

/**
 * Save contract data to Firestore
 */
export async function saveContractToFirestore(
  contractData: ContractData,
  pdfUrl: string,
  pdfPath: string
): Promise<string> {
  // First, supersede any previous active contracts
  await supersedePreviousContracts(contractData.memberId)

  // Create new contract document
  const contractId = `${contractData.memberId}_${Date.now()}`
  const contractRef = doc(db, CONTRACTS_COLLECTION, contractId)

  const contract: Contract = {
    id: contractId,
    memberId: contractData.memberId,
    memberName: contractData.memberName,
    memberCPF: contractData.memberCPF,
    memberEmail: contractData.memberEmail,
    plan: contractData.plan,
    signaturePreview: contractData.signatureImage.substring(0, 100),
    signedAt: contractData.signedAt,
    ipAddress: contractData.ipAddress,
    userAgent: contractData.userAgent,
    documentHash: contractData.documentHash,
    pdfUrl,
    pdfPath,
    status: 'active',
    createdAt: new Date().toISOString(),
  }

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await setDoc(contractRef, contract)
      logger.info(`Contract saved to Firestore: ${contractId}`)
      return contractId
    } catch (error) {
      lastError = error as Error
      logger.warn(`Firestore save attempt ${attempt}/${MAX_RETRIES} failed:`, error)

      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY * attempt)
      }
    }
  }

  throw lastError || new Error('Failed to save contract to Firestore')
}

/**
 * Get active contract for a member
 */
export async function getMemberContract(memberId: string): Promise<Contract | null> {
  try {
    const q = query(
      collection(db, CONTRACTS_COLLECTION),
      where('memberId', '==', memberId),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc'),
      limit(1)
    )

    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return null
    }

    return snapshot.docs[0].data() as Contract
  } catch (error) {
    logger.error('Failed to get member contract:', error)
    return null
  }
}

/**
 * Get all contracts for a member (including superseded)
 */
export async function getMemberContractHistory(memberId: string): Promise<Contract[]> {
  try {
    const q = query(
      collection(db, CONTRACTS_COLLECTION),
      where('memberId', '==', memberId),
      orderBy('createdAt', 'desc')
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => doc.data() as Contract)
  } catch (error) {
    logger.error('Failed to get contract history:', error)
    return []
  }
}

/**
 * Store complete contract (upload PDF + save to Firestore)
 */
export async function storeContract(
  contractData: ContractData,
  pdfBytes: Uint8Array
): Promise<{ contractId: string; pdfUrl: string }> {
  // Upload PDF to Storage
  const { url: pdfUrl, path: pdfPath } = await uploadContractPDF(
    contractData.memberId,
    pdfBytes,
    contractData.signedAt
  )

  // Save to Firestore
  const contractId = await saveContractToFirestore(contractData, pdfUrl, pdfPath)

  return { contractId, pdfUrl }
}
