import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  Check,
  CreditCard,
  Hourglass,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { cn } from '../../lib/utils'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from '../../lib/notifications'
import { logger } from '../../lib/logger'
import type { AdminTab } from './AdminSidebar'

/**
 * Payment notifications for the staff.
 *
 * Two things make this different from the customer bell in the shop header:
 *
 *  - **It polls.** The shop bell fetches on mount and on open, because an
 *    answered question can wait. A payment cannot: the panel is open on the
 *    counter all day, and a confirmed PIX means an order to pack. Sixty seconds
 *    is the compromise between "useful" and "hammering the API".
 *  - **It switches tabs, it does not navigate.** The admin SPA keeps its
 *    section in state rather than in the URL, so a stored link like
 *    `/admin?tab=orders` is read for its `tab` and handed to the dashboard.
 *    Following it as a route would reload the whole panel.
 */

const POLL_INTERVAL_MS = 60_000

/** Rows written by admin-notification.service; anything else falls back. */
const KIND_ICON: Record<string, React.ReactNode> = {
  payment_received: <CreditCard className="h-4 w-4 text-green-500" />,
  payment_pending: <Hourglass className="h-4 w-4 text-yellow-500" />,
  payment_failed: <AlertTriangle className="h-4 w-4 text-red-500" />,
  payment_refunded: <RotateCcw className="h-4 w-4 text-orange-500" />,
  payment_chargeback: <ShieldAlert className="h-4 w-4 text-red-500" />,
}

const KNOWN_TABS = new Set<string>([
  'dashboard',
  'members',
  'products',
  'categories',
  'stock',
  'orders',
  'wholesale',
  'reviews',
  'questions',
  'event-config',
  'events',
  'gallery',
  'users',
  'logs',
  'reports',
  'settings',
])

/** `/admin?tab=orders` → `orders`, and nothing at all for a link we don't know. */
function tabFromLink(link: string | null): AdminTab | null {
  if (!link) return null
  const query = link.split('?')[1]
  if (!query) return null
  const tab = new URLSearchParams(query).get('tab')
  return tab && KNOWN_TABS.has(tab) ? (tab as AdminTab) : null
}

interface AdminNotificationBellProps {
  onOpenTab: (tab: AdminTab) => void
}

export function AdminNotificationBell({ onOpenTab }: AdminNotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await listNotifications({ limit: 25 })
      setNotifications(result.notifications)
      setUnread(result.unread)
    } catch (error) {
      logger.error('Error loading admin notifications:', error)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void refresh()
    const id = setInterval(() => {
      // A hidden tab is the panel left open on a phone that went to sleep;
      // polling it wakes the API for nobody.
      if (!document.hidden) void refresh()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

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
      // Optimistic: the badge drops immediately and the request follows. A
      // failed mark-read only means the row comes back unread on the next poll.
      setUnread((u) => Math.max(0, u - 1))
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n))
      )
      void markNotificationRead(notification.id)
    }
    const tab = tabFromLink(notification.link)
    if (tab) onOpenTab(tab)
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
        title="Notificações de pagamento"
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
        // Right-aligned and width-capped so it stays on screen on a phone,
        // which is where this panel is actually used.
        <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-medium">Pagamentos</p>
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
              Nada por aqui ainda. Avisamos a cada pagamento, estorno e chargeback.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
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
                      <span className="mt-0.5 shrink-0">
                        {KIND_ICON[n.kind] ?? <Bell className="h-4 w-4 text-muted-foreground" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{n.title}</p>
                        {n.body && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                        )}
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {new Date(n.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      {!n.readAt && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      )}
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
