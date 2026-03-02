import {
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    Timestamp
} from 'firebase/firestore'
import { db } from './firebase'

const LOGS_COLLECTION = 'audit_logs'

export interface AuditLog {
    id: string
    action: string
    member_id?: string
    payment_id?: string
    timestamp: string
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
        console.error('Error fetching audit logs:', error)
        return []
    }
}
