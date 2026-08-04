import { Link } from 'react-router-dom'
import { Calendar, MapPin, Ticket, ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '../ui/button'
import {
  ACTIVE_EVENT,
  formatEventDateRange,
  isEventVisible,
} from '../../data/event'

/**
 * Card de destaque do evento na home da loja.
 */
export function EventPromoCard() {
  const event = ACTIVE_EVENT
  if (!isEventVisible(event)) return null

  const dateLabel = formatEventDateRange(event.startsAt, event.endsAt)
  const price = event.ticketReservation.priceBRL

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-accent/10 p-6 sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Evento na loja
          </span>
          <h2 className="font-heading text-2xl font-bold sm:text-3xl">{event.title}</h2>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-4">
            <span className="inline-flex items-center gap-1.5 capitalize">
              <Calendar className="h-4 w-4 text-primary" />
              {dateLabel}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-primary" />
              {event.location.name}
            </span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {event.description[0]}
          </p>
          {price != null && event.ticketReservation.enabled && (
            <p className="text-sm">
              Ingresso a partir de{' '}
              <strong className="text-accent">
                {event.ticketReservation.currencyLabel ?? 'R$'}{' '}
                {price.toFixed(2).replace('.', ',')}
              </strong>
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <Button asChild size="lg" className="gap-2">
            <Link to="/evento#ingressos">
              <Ticket className="h-4 w-4" />
              Reservar ingresso
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="gap-2">
            <Link to="/evento">
              Ver detalhes
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

export default EventPromoCard
