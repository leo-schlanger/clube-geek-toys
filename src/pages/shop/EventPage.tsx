import { Link, Navigate } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Gift,
  Clock,
  ArrowRight,
  Images,
} from 'lucide-react'
import { ShopHeader } from '../../components/store/ShopHeader'
import { EventTicketForm } from '../../components/store/EventTicketForm'
import { useShopMember } from '../../components/store/useShopMember'
import { Button } from '../../components/ui/button'
import {
  ACTIVE_EVENT,
  formatEventDateRange,
  isEventVisible,
} from '../../data/event'

/**
 * Página do evento na loja: infos + reserva.
 * Fotos ficam na galeria geral do site principal (geeketoys.com.br#galeria).
 */
export default function EventPage() {
  const { isMember } = useShopMember()
  const event = ACTIVE_EVENT

  if (!isEventVisible(event)) {
    return <Navigate to="/" replace />
  }

  const dateLabel = formatEventDateRange(event.startsAt, event.endsAt)

  return (
    <div className="min-h-screen bg-background">
      <ShopHeader isMember={isMember} />

      <main className="mx-auto max-w-5xl space-y-10 px-4 py-6 pb-16">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2 gap-1.5">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Voltar à loja
            </Link>
          </Button>

          <span className="mb-3 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
            Evento
          </span>
          <h1 className="font-heading text-3xl font-bold sm:text-4xl">{event.title}</h1>
          <p className="mt-2 text-muted-foreground">
            Informações e reserva de ingresso online.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 rounded-2xl border border-border bg-card p-6 lg:col-span-3 md:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3 rounded-xl bg-muted/50 p-4">
                <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Data e horário
                  </p>
                  <p className="mt-0.5 text-sm font-medium capitalize leading-snug">
                    {dateLabel}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 rounded-xl bg-muted/50 p-4">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Local
                  </p>
                  <p className="mt-0.5 text-sm font-medium">{event.location.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {event.location.address}
                  </p>
                  {event.location.mapsUrl && (
                    <a
                      href={event.location.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      Ver no mapa <ArrowRight className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {event.description.map((para) => (
                <p key={para.slice(0, 32)} className="leading-relaxed text-muted-foreground">
                  {para}
                </p>
              ))}
            </div>

            {event.memberPerk && (
              <div className="flex gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4">
                <Gift className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <p className="text-sm font-medium">{event.memberPerk}</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2 md:p-8">
            <div className="mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <h2 className="font-heading text-lg font-bold">Destaques</h2>
            </div>
            <ul className="space-y-3">
              {event.highlights.map((item) => (
                <li
                  key={item}
                  className="flex gap-2.5 text-sm leading-snug text-muted-foreground"
                >
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
            <Button asChild className="mt-6 w-full" size="lg">
              <a href="#ingressos">Reservar ingresso</a>
            </Button>
            <Button asChild variant="outline" className="mt-2 w-full gap-2">
              <a
                href="https://geeketoys.com.br#galeria"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Images className="h-4 w-4" />
                Ver galeria no site
              </a>
            </Button>
          </div>
        </div>

        <EventTicketForm event={event} />
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        <p>Clube GeekPop &amp; Toys — Loja oficial</p>
      </footer>
    </div>
  )
}
