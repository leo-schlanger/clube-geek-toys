import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, Clock, MapPin, Ticket } from 'lucide-react'
import { Button } from '../ui/button'
import {
  eventArt,
  formatEventDay,
  formatEventTime,
  formatPriceShort,
} from '../../data/event'
import { useActiveEvent } from '../../hooks/useActiveEvent'

/**
 * Featured event on the shop home: poster, the four facts, two buttons.
 * Compact on purpose — it sits above the catalogue, and the full story is
 * one tap away on `/evento`.
 */
export function EventPromoCard() {
  const { event, visible } = useActiveEvent()
  if (!visible) return null

  const [cover] = eventArt(event)
  const price = event.ticketReservation.priceBRL
  const canReserve = event.ticketReservation.enabled

  return (
    <section
      aria-labelledby="event-promo-title"
      className="mb-8 overflow-hidden rounded-3xl border border-primary/25 bg-linear-to-br/srgb from-primary/10 via-card to-accent/10 shadow-xs"
    >
      <div className="flex gap-4 p-4 sm:gap-8 sm:p-6">
        {cover && (
          <Link
            to="/evento"
            className="block w-28 shrink-0 self-start overflow-hidden rounded-2xl border border-border bg-muted shadow-md sm:w-44 lg:w-52"
            aria-label={`Ver o evento ${event.title}`}
          >
            <img
              src={cover}
              alt={`Cartaz: ${event.title}`}
              className="aspect-4/5 h-full w-full object-cover object-top"
            />
          </Link>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:justify-center">
          <span className="w-fit rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
            Próximo evento
          </span>
          <h2
            id="event-promo-title"
            className="font-heading text-xl font-bold leading-tight sm:leading-9 sm:text-3xl"
          >
            {event.title}
          </h2>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
              {formatEventDay(event.startsAt, { withYear: false })}
            </li>
            <li className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-primary" />
              {formatEventTime(event.startsAt, event.endsAt)}
            </li>
            {event.location.name && (
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{event.location.name}</span>
              </li>
            )}
            {price != null && (
              <li className="flex items-center gap-2">
                <Ticket className="h-4 w-4 shrink-0 text-primary" />
                <span>
                  Entrada{' '}
                  <strong className="text-foreground">
                    {price === 0
                      ? 'gratuita'
                      : formatPriceShort(price, event.ticketReservation.currencyLabel)}
                  </strong>
                </span>
              </li>
            )}
          </ul>

          <div className="hidden gap-3 pt-1 sm:flex">
            <PromoButtons canReserve={canReserve} />
          </div>
        </div>
      </div>

      {/* On a phone the buttons get the full width under the poster. */}
      <div className="flex flex-col gap-2 px-4 pb-4 sm:hidden">
        <PromoButtons canReserve={canReserve} />
      </div>
    </section>
  )
}

function PromoButtons({ canReserve }: { canReserve: boolean }) {
  return (
    <>
      {canReserve && (
        <Button asChild size="lg" className="gap-2">
          <Link to="/evento#ingressos">
            <Ticket className="h-4 w-4" />
            Reservar ingresso
          </Link>
        </Button>
      )}
      <Button asChild variant="outline" size="lg" className="gap-2">
        <Link to="/evento">
          Ver detalhes
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </>
  )
}

export default EventPromoCard
