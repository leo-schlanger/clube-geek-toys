import {
    collection,
    doc,
    getDoc,
    getDocs,
    getCountFromServer,
    setDoc,
    updateDoc,
    query,
    limit,
    startAfter,
    type DocumentData,
    type QueryConstraint,
    type UpdateData,
    type WithFieldValue,
    type DocumentSnapshot
} from 'firebase/firestore'
import { db } from './firebase'

// =============================================================================
// Types
// =============================================================================

interface FirestoreError {
    code?: string
    message?: string
    name?: string
}

type RecordData = Record<string, unknown>

// =============================================================================
// Firestore Manager
// =============================================================================

/**
 * Generic Firestore Manager for CRUD operations
 */
export class FirestoreManager {
    /**
     * Get a single document by ID
     */
    static async getById<T>(
        collectionName: string,
        id: string,
        mapper: (id: string, data: DocumentData) => T
    ): Promise<T | null> {
        try {
            const docRef = doc(db, collectionName, id)
            const docSnap = await getDoc(docRef)

            if (!docSnap.exists()) {
                return null
            }

            return mapper(docSnap.id, docSnap.data())
        } catch (error: unknown) {
            const err = error as FirestoreError
            console.error(`[Firestore] Error getting ${collectionName}/${id}:`, {
                code: err?.code,
                message: err?.message,
            })

            if (err?.code === 'permission-denied') {
                console.error(`[Firestore] PERMISSION DENIED for: ${collectionName}`)
            }

            return null
        }
    }

    /**
     * Query documents with constraints
     */
    static async findMany<T>(
        collectionName: string,
        constraints: QueryConstraint[],
        mapper: (id: string, data: DocumentData) => T
    ): Promise<T[]> {
        try {
            const q = query(collection(db, collectionName), ...constraints)
            const snapshot = await getDocs(q)
            return snapshot.docs.map(d => mapper(d.id, d.data()))
        } catch (error: unknown) {
            const err = error as FirestoreError
            console.error(`[Firestore] Query error in ${collectionName}:`, err?.message)
            return []
        }
    }

    /**
     * Query documents with pagination
     */
    static async findManyPaginated<T>(
        collectionName: string,
        constraints: QueryConstraint[],
        mapper: (id: string, data: DocumentData) => T,
        pageSize: number,
        lastDoc?: DocumentSnapshot
    ): Promise<{ data: T[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }> {
        try {
            const paginatedConstraints = [...constraints, limit(pageSize + 1)]
            if (lastDoc) {
                paginatedConstraints.push(startAfter(lastDoc))
            }

            const q = query(collection(db, collectionName), ...paginatedConstraints)
            const snapshot = await getDocs(q)

            const hasMore = snapshot.docs.length > pageSize
            const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs
            const data = docs.map(d => mapper(d.id, d.data()))
            const newLastDoc = docs.length > 0 ? docs[docs.length - 1] : null

            return { data, lastDoc: newLastDoc, hasMore }
        } catch (error: unknown) {
            const err = error as FirestoreError
            console.error(`[Firestore] Paginated query error in ${collectionName}:`, err?.message)
            return { data: [], lastDoc: null, hasMore: false }
        }
    }

    /**
     * Get total count of documents matching query
     */
    static async getCount(
        collectionName: string,
        constraints: QueryConstraint[]
    ): Promise<number> {
        try {
            const q = query(collection(db, collectionName), ...constraints)
            const snapshot = await getCountFromServer(q)
            return snapshot.data().count
        } catch (error: unknown) {
            const err = error as FirestoreError
            console.error(`[Firestore] Count error in ${collectionName}:`, err?.message)
            return 0
        }
    }

    /**
     * Create or overwrite a document
     */
    static async save<T extends RecordData>(
        collectionName: string,
        id: string | null,
        data: T
    ): Promise<string | null> {
        try {
            const docRef = id
                ? doc(db, collectionName, id)
                : doc(collection(db, collectionName))

            const docData = {
                ...data,
                updated_at: new Date().toISOString(),
                created_at: (data.created_at as string) || new Date().toISOString()
            } as WithFieldValue<DocumentData>

            await setDoc(docRef, docData, { merge: true })
            return docRef.id
        } catch (error: unknown) {
            const err = error as FirestoreError
            console.error(`[Firestore] Save error in ${collectionName}:`, err?.message)
            return null
        }
    }

    /**
     * Update specific fields of a document
     */
    static async update<T extends RecordData>(
        collectionName: string,
        id: string,
        data: T
    ): Promise<boolean> {
        try {
            const docRef = doc(db, collectionName, id)
            const updateData = {
                ...data,
                updated_at: new Date().toISOString()
            } as UpdateData<DocumentData>

            await updateDoc(docRef, updateData)
            return true
        } catch (error: unknown) {
            const err = error as FirestoreError
            console.error(`[Firestore] Update error for ${collectionName}/${id}:`, err?.message)
            return false
        }
    }
}

// =============================================================================
// Mapper Utilities
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Common field mapping helpers for snake_case <-> camelCase conversion
 * Note: Uses 'any' intentionally for flexibility with DocumentData mapping
 */
export const MapperUtils = {
    /**
     * Convert snake_case keys to camelCase
     */
    toCamel: (data: DocumentData): any => {
        const result: any = {}
        for (const key in data) {
            const camelKey = key.replace(
                /([-_][a-z])/gi,
                ($1) => $1.toUpperCase().replace('-', '').replace('_', '')
            )
            result[camelKey] = data[key]
        }
        return result
    },

    /**
     * Convert camelCase keys to snake_case
     */
    toSnake: (data: any): any => {
        const result: any = {}
        for (const key in data) {
            const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
            result[snakeKey] = data[key]
        }
        return result
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
