import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    query,
    type DocumentData,
    type QueryConstraint,
    type UpdateData
} from 'firebase/firestore'
import { db } from './firebase'

/**
 * Generic Firestore Manager
 */
export class FirestoreManager {
    /**
     * Get a single document by ID
     */
    static async getById<T>(collectionName: string, id: string, mapper: (id: string, data: DocumentData) => T): Promise<T | null> {
        try {
            const docRef = doc(db, collectionName, id)
            const docSnap = await getDoc(docRef)

            if (!docSnap.exists()) return null
            return mapper(docSnap.id, docSnap.data())
        } catch (error) {
            console.error(`Firestore [${collectionName}]: Error getting by ID ${id}:`, error)
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
            return snapshot.docs.map(doc => mapper(doc.id, doc.data()))
        } catch (error) {
            console.error(`Firestore [${collectionName}]: Error in query:`, error)
            return []
        }
    }

    /**
     * Create or overwrite a document
     */
    static async save(collectionName: string, id: string | null, data: any): Promise<string | null> {
        try {
            const docRef = id ? doc(db, collectionName, id) : doc(collection(db, collectionName))
            await setDoc(docRef, {
                ...data,
                updated_at: new Date().toISOString(),
                created_at: data.created_at || new Date().toISOString()
            }, { merge: true })
            return docRef.id
        } catch (error) {
            console.error(`Firestore [${collectionName}]: Error saving document:`, error)
            return null
        }
    }

    /**
     * Update specific fields of a document
     */
    static async update(collectionName: string, id: string, data: UpdateData<any>): Promise<boolean> {
        try {
            const docRef = doc(db, collectionName, id)
            await updateDoc(docRef, {
                ...data,
                updated_at: new Date().toISOString()
            })
            return true
        } catch (error) {
            console.error(`Firestore [${collectionName}]: Error updating document ${id}:`, error)
            return false
        }
    }
}

/**
 * Common field mapping helpers
 */
export const MapperUtils = {
    toCamel: (data: DocumentData) => {
        const newData: any = {}
        for (const key in data) {
            const camelKey = key.replace(/([-_][a-z])/ig, ($1) => $1.toUpperCase().replace('-', '').replace('_', ''))
            newData[camelKey] = data[key]
        }
        return newData
    },
    toSnake: (data: any) => {
        const newData: any = {}
        for (const key in data) {
            const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
            newData[snakeKey] = data[key]
        }
        return newData
    }
}
