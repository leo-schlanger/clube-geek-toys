import { useCallback, useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { TicketCheckIn } from './TicketCheckIn'
import { logger } from '../lib/logger'
import { getActiveEvent } from '../lib/events'
import { getEventDoorStats, type EventDoorStats } from '../lib/event-tickets'
import { formatEventDateRange, isEventVisible, type EventConfig } from '../data/event'

/** PDV door mode: the current event, its counters and the shared check-in. */
export function PDVDoor() {
  const [event, setEvent] = useState<EventConfig | null | undefined>(undefined)
  const [stats, setStats] = useState<EventDoorStats | null>(null)

  const loadStats = useCallback(async (eventId: string) => {
    try {
      setStats(await getEventDoorStats(eventId))
    } catch (error) {
      logger.error('Error loading door stats:', error)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getActiveEvent().then((active) => {
      if (cancelled) return
      // The bundled fallback is a past event; a stale one is no event at all.
      const current = isEventVisible(active) ? active : null
      setEvent(current)
      if (current) void loadStats(current.id)
    })
    return () => {
      cancelled = true
    }
  }, [loadStats])

  const onChecked = useCallback(() => {
    if (event) void loadStats(event.id)
  }, [event, loadStats])

  return (
    <TicketCheckIn onChecked={onChecked}>
      {event === undefined ? null : event ? (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              <strong>{event.title}</strong>
              <span className="block text-muted-foreground">
                {formatEventDateRange(event.startsAt, event.endsAt)}
              </span>
            </span>
          </p>
          {stats && (
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Já entraram', value: stats.used, tone: 'text-blue-400' },
                { label: 'Ainda vão entrar', value: stats.valid, tone: 'text-green-500' },
                { label: 'Aguardando pagamento', value: stats.pending, tone: 'text-amber-500' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border p-2">
                  <p className={`font-heading text-2xl font-extrabold ${item.tone}`}>
                    {item.value}
                  </p>
                  <p className="text-[11px] leading-tight text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          Nenhum evento publicado no momento. A portaria só aceita ingressos no dia do próprio
          evento.
        </p>
      )}
    </TicketCheckIn>
  )
}

export default PDVDoor
