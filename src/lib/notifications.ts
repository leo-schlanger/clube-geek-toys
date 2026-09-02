import { api } from './api-client'

/** In-app customer notifications. */

export type NotificationKind =
  | 'question_answered'
  | 'order_shipped'
  | 'generic'
  // Staff-only, read by the bell in the admin panel. Same table as the
  // customer's — an admin is a user like any other; only the audience differs.
  | 'payment_received'
  | 'payment_pending'
  | 'payment_failed'
  | 'payment_refunded'
  | 'payment_chargeback'

export interface Notification {
  id: string
  kind: NotificationKind
  title: string
  body: string | null
  /** Caminho relativo dentro da SPA. */
  link: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationListResult {
  notifications: Notification[]
  unread: number
}

export async function listNotifications(
  params: { limit?: number; unreadOnly?: boolean } = {}
): Promise<NotificationListResult> {
  const qs = new URLSearchParams()
  if (params.limit) qs.set('limit', String(params.limit))
  if (params.unreadOnly) qs.set('unreadOnly', 'true')
  const result = await api.get<NotificationListResult>(
    `/notifications${qs.toString() ? `?${qs}` : ''}`
  )
  return result.data ?? { notifications: [], unread: 0 }
}

export async function markNotificationRead(id: string): Promise<boolean> {
  const result = await api.patch(`/notifications/${id}/read`, {})
  return !result.error
}

export async function markAllNotificationsRead(): Promise<number> {
  const result = await api.post<{ updated: number }>('/notifications/read-all', {})
  return result.data?.updated ?? 0
}
