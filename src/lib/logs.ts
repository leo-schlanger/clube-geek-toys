import {
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    Timestamp
} from 'firebase/firestore'
import { db } from './firebase'
import { firestoreLogger } from './logger'
import { COLLECTIONS } from './constants'

const LOGS_COLLECTION = COLLECTIONS.AUDIT_LOGS

export interface AuditLog {
    id: string
    action: string
    member_id?: string
    payment_id?: string
    timestamp: string
}

/**
 * Get audit logs for a specific member
 * @param memberId - The member ID to filter logs by
 * @param maxLogs - Maximum number of logs to return (default: 20)
 */
export async function getMemberLogs(memberId: string, maxLogs = 20): Promise<AuditLog[]> {
    try {
        const logsRef = collection(db, LOGS_COLLECTION)
        const q = query(
            logsRef,
            orderBy('timestamp', 'desc'),
            limit(maxLogs * 3) // Fetch more to filter client-side
        )
        const querySnapshot = await getDocs(q)

        const logs = querySnapshot.docs
            .map((doc) => {
                const data = doc.data()
                return {
                    id: doc.id,
                    action: data.action,
                    member_id: data.member_id,
                    payment_id: data.payment_id,
                    timestamp: data.timestamp instanceof Timestamp
                        ? data.timestamp.toDate().toISOString()
                        : data.timestamp,
                }
            })
            .filter((log) => log.member_id === memberId)
            .slice(0, maxLogs)

        return logs
    } catch (error) {
        firestoreLogger.error('Error fetching member logs:', error)
        return []
    }
}

/**
 * Get recent audit logs
 */
export async function getRecentLogs(maxLogs = 50): Promise<AuditLog[]> {
    try {
        const logsRef = collection(db, LOGS_COLLECTION)
        const q = query(logsRef, orderBy('timestamp', 'desc'), limit(maxLogs))
        const querySnapshot = await getDocs(q)

        return querySnapshot.docs.map((doc) => {
            const data = doc.data()
            return {
                id: doc.id,
                action: data.action,
                member_id: data.member_id,
                payment_id: data.payment_id,
                timestamp: data.timestamp instanceof Timestamp
                    ? data.timestamp.toDate().toISOString()
                    : data.timestamp,
            }
        })
    } catch (error) {
        firestoreLogger.error('Error fetching audit logs:', error)
        return []
    }
}
