import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from '../../lib/notifications'
import { logger } from '../../lib/logger'

/**
 * Header bell. Fetches on mount and on open, with no polling: an answered
 * question is not urgent enough to justify constant traffic, and email covers
 * anyone without the shop open.
 */
export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await listNotifications({ limit: 20 })
      setNotifications(result.notifications)
      setUnread(result.unread)
    } catch (error) {
      logger.error('Error loading notifications:', error)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void refresh()
  }, [refresh])

  // Closes on outside click; the panel is a plain dropdown, no portal.
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  async function handleOpen() {
    const next = !open
    setOpen(next)
    if (next) await refresh()
  }

  async function handleClick(notification: Notification) {
    setOpen(false)
    if (!notification.readAt) {
      setUnread((u) => Math.max(0, u - 1))
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n))
      )
      void markNotificationRead(notification.id)
    }
    if (notification.link) navigate(notification.link)
  }

  async function handleMarkAll() {
    const now = new Date().toISOString()
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })))
    setUnread(0)
    await markAllNotificationsRead()
  }

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleOpen}
        aria-label={unread > 0 ? `Notificações (${unread} não lidas)` : 'Notificações'}
        aria-expanded={open}
        title="Notificações"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <Badge
            variant="destructive"
            className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center px-1 text-[10px]"
          >
            {unread > 9 ? '9+' : unread}
          </Badge>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-medium">Notificações</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Check className="h-3 w-3" />
                Marcar todas
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nenhuma notificação por aqui.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className={cn(
                      'w-full border-b px-3 py-2 text-left transition-colors last:border-0 hover:bg-muted/50',
                      !n.readAt && 'bg-primary/5'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.readAt && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                      <div className={cn('min-w-0 flex-1', n.readAt && 'pl-3.5')}>
                        <p className="truncate text-sm font-medium">{n.title}</p>
                        {n.body && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                        )}
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {new Date(n.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
