import { api } from './api-client'

export interface AuditLog {
    id: string
    action: string
    member_id?: string
    memberId?: string
    payment_id?: string
    details?: Record<string, unknown>
    timestamp: string
}

/**
 * Get audit logs for a specific member
 */
export async function getMemberLogs(memberId: string, maxLogs = 20): Promise<AuditLog[]> {
    const result = await api.get<AuditLog[]>(`/logs/audit?memberId=${memberId}&limit=${maxLogs}`)
    return result.data || []
}

/**
 * Get recent audit logs
 */
export async function getRecentLogs(maxLogs = 50): Promise<AuditLog[]> {
    const result = await api.get<AuditLog[]>(`/logs/audit?limit=${maxLogs}`)
    return result.data || []
}
