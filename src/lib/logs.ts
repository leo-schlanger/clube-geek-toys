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

export interface ErrorLog {
    id: string
    severity: 'debug' | 'info' | 'warning' | 'error' | 'fatal'
    message: string
    stack?: string
    source: 'frontend' | 'backend'
    context?: Record<string, unknown>
    userId?: string
    url?: string
    userAgent?: string
    ipAddress?: string
    createdAt: string
}

export interface ErrorStats {
    last_24h: string
    last_7d: string
    errors_24h: string
    fatal_24h: string
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

/**
 * Get error logs (admin only)
 */
export async function getErrorLogs(opts?: { severity?: string; source?: string; limit?: number }): Promise<ErrorLog[]> {
    const params = new URLSearchParams()
    if (opts?.severity) params.set('severity', opts.severity)
    if (opts?.source) params.set('source', opts.source)
    if (opts?.limit) params.set('limit', String(opts.limit))
    const result = await api.get<ErrorLog[]>(`/logs/errors?${params}`)
    return result.data || []
}

/**
 * Get error stats (admin only)
 */
export async function getErrorStats(): Promise<ErrorStats> {
    const result = await api.get<ErrorStats>('/logs/errors/stats')
    return result.data || { last_24h: '0', last_7d: '0', errors_24h: '0', fatal_24h: '0' }
}
