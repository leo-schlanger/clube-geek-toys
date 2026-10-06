import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ExternalLink,
  Gift,
  Images,
  MapPin,
  Ticket,
} from 'lucide-react'
import { ShopHeader } from '../../components/store/ShopHeader'
import { EventTicketForm } from '../../components/store/EventTicketForm'
import { useShopMember } from '../../components/store/useShopMember'
import { Button } from '../../components/ui/button'
import {
  eventArt,
  eventLinks,
  formatEventDay,
  formatEventTime,
  formatPriceShort,
  ticketPriceBRL,
  type EventConfig,
} from '../../data/event'
import { useActiveEvent } from '../../hooks/useActiveEvent'
import { CreatorCredit } from '../../components/CreatorCredit'
import { SeoHead } from '../../components/store/SeoHead'
import { getCanonicalOrigin } from '../../lib/subdomain'
import { breadcrumbJsonLd, eventJsonLd } from '../../lib/structured-data'

/**
 * Event page in the shop.
 *
 * Laid out the way ticketing pages are: the first screen answers what, when,
 * where and how much, with the button to reserve. The flyers used to come
 * first and pushed all of that below ~1000px of images on a phone.
 */
export default function EventPage() {
  const { isMember } = useShopMember()
  const { event, visible, isPlaceholder } = useActiveEvent()

  // Redirect only after the API answers: with the fallback still on screen,
  // an unpublished DB event would kick the visitor out for no reason —
  // and a newly published one would be hidden.
  if (!visible && !isPlaceholder) {
    return <Navigate to="/" replace />
  }

  const art = eventArt(event)
  const links = eventLinks(event)
  const canReserve = event.ticketReservation.enabled
  const subtitle = event.shortTitle.trim() !== event.title.trim() ? event.shortTitle.trim() : ''

  return (
    <div className="min-h-screen bg-background">
      {/* The page used to inherit the store's title and a canonical pointing
          at the shop home — to Google, a copy of it. */}
      <SeoHead
        title={`${event.title} — ${formatEventDay(event.startsAt, { withYear: false })}`}
        description={eventSeoDescription(event)}
        path="/evento"
        image={art[0]}
        // Not from the bundled fallback: it is always a past event.
        jsonLd={
          isPlaceholder
            ? undefined
            : [
                eventJsonLd(event, getCanonicalOrigin()),
                breadcrumbJsonLd([{ name: event.title, path: '/evento' }], getCanonicalOrigin()),
              ]
        }
      />
      <ShopHeader isMember={isMember} />

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:pb-16">
        <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2 gap-1.5">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Voltar à loja
          </Link>
        </Button>

        {/* Hero: what, when, where, how much — then the art. */}
        <section
          aria-labelledby="event-title"
          className={`grid items-start gap-8 lg:gap-12 ${art.length > 1 ? 'lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]' : 'lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]'}`}
        >
          <div className="order-1 space-y-6 lg:order-2 lg:sticky lg:top-24">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
                Evento
              </span>
              <span
                className={
                  canReserve
                    ? 'rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400'
                    : 'rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground'
                }
              >
                {canReserve ? 'Ingressos à venda' : 'Reservas encerradas'}
              </span>
            </div>

            <div className="space-y-2">
              <h1
                id="event-title"
                className="font-heading text-3xl font-bold leading-tight sm:leading-10 lg:leading-none sm:text-4xl lg:text-5xl"
              >
                {event.title}
              </h1>
              {subtitle && <p className="text-lg text-muted-foreground">{subtitle}</p>}
            </div>

            <EventFacts event={event} />

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {canReserve && (
                <Button asChild size="lg" className="h-12 gap-2 px-8 text-base">
                  <a href="#ingressos">
                    <Ticket className="h-5 w-5" />
                    Reservar ingresso
                  </a>
                </Button>
              )}
              {links.map((link) => (
                <Button
                  key={link.url}
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 gap-2 px-6 text-base"
                >
                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {link.label}
                  </a>
                </Button>
              ))}
            </div>
          </div>

          {art.length > 0 && (
            <div className="order-2 lg:order-1">
              <Posters art={art} title={event.title} />
            </div>
          )}
        </section>

        {(event.description.length > 0 || event.highlights.length > 0) && (
          <section aria-labelledby="event-about" className="mt-16 grid gap-8 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <h2 id="event-about" className="font-heading text-2xl font-bold">
                Sobre o evento
              </h2>
              {event.description.map((para) => (
                <p key={para.slice(0, 32)} className="leading-relaxed text-muted-foreground">
                  {para}
                </p>
              ))}
            </div>

            <aside className="space-y-4">
              {event.highlights.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-6">
                  <h3 className="mb-4 font-heading text-lg font-bold">O que vai rolar</h3>
                  <ul className="space-y-3">
                    {event.highlights.map((item) => (
                      <li key={item} className="flex gap-3 text-sm leading-snug">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Check className="h-3 w-3 text-primary" />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {event.memberPerk && (
                <div className="flex gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-5">
                  <Gift className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <p className="text-sm font-medium">{event.memberPerk}</p>
                </div>
              )}
            </aside>
          </section>
        )}

        <div className="mt-16">
          <EventTicketForm event={event} />
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          <a
            href="https://geeketoys.com.br#galeria"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
          >
            <Images className="h-4 w-4" />
            Fotos dos eventos anteriores
          </a>
        </p>
      </main>

      {canReserve && <MobileReserveBar event={event} />}

      <footer className="space-y-2 border-t py-6 text-center text-sm text-muted-foreground">
        <p>Clube GeekPop &amp; Toys — Loja oficial</p>
        <CreatorCredit />
      </footer>
    </div>
  )
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="mt-0.5">{children}</div>
      </div>
    </li>
  )
}

/** The four answers a visitor looks for first, one per row. */
function EventFacts({ event }: { event: EventConfig }) {
  const price = event.ticketReservation.priceBRL
  const currency = event.ticketReservation.currencyLabel
  const memberPrice = price ? ticketPriceBRL(event, 'member') : null

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      <Fact icon={<CalendarDays className="h-5 w-5" />} label="Quando">
        <p className="font-semibold">{formatEventDay(event.startsAt)}</p>
        <p className="text-sm text-muted-foreground">
          {formatEventTime(event.startsAt, event.endsAt)}
        </p>
      </Fact>
      {(event.location.name || event.location.address) && (
        <Fact icon={<MapPin className="h-5 w-5" />} label="Local">
          {event.location.name && <p className="font-semibold">{event.location.name}</p>}
          {event.location.address && (
            <p className="text-sm text-muted-foreground">{event.location.address}</p>
          )}
          {event.location.mapsUrl && (
            <a
              href={event.location.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              Ver no mapa <ArrowRight className="h-3.5 w-3.5" />
            </a>
          )}
        </Fact>
      )}
      {price != null && (
        <Fact icon={<Ticket className="h-5 w-5" />} label="Entrada">
          <p className="font-semibold">
            {price === 0 ? 'Gratuita' : `${formatPriceShort(price, currency)} por pessoa`}
          </p>
          {memberPrice != null && (
            <p className="text-sm text-muted-foreground">
              Membros do Clube: {formatPriceShort(memberPrice, currency)}
            </p>
          )}
        </Fact>
      )}
    </ul>
  )
}

/**
 * Every poster, side by side — the event one and the competition one. Laura
 * asked for both on the site; one of them tucked further down read as missing.
 */
function Posters({ art, title }: { art: string[]; title: string }) {
  if (art.length === 1) return <Artwork url={art[0]} alt={`Cartaz: ${title}`} priority />
  return (
    <div>
      <div className="grid grid-cols-2 items-start gap-3 sm:gap-4">
        {art.map((url, i) => (
          <Artwork key={url} url={url} alt={`Cartaz ${i + 1}: ${title}`} priority />
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Toque em um cartaz para ver em tamanho cheio.
      </p>
    </div>
  )
}

/** Flyer text is small on a phone: a tap opens it full size. */
function Artwork({ url, alt, priority }: { url: string; alt: string; priority?: boolean }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-3xl border border-border bg-card shadow-lg transition-shadow hover:shadow-xl"
    >
      <img src={url} alt={alt} loading={priority ? 'eager' : 'lazy'} className="h-auto w-full" />
    </a>
  )
}

/**
 * Phone-only bar that keeps "reserve" one tap away while reading. It steps
 * aside once the reservation form is on screen, where it would cover the
 * form's own button.
 */
function MobileReserveBar({ event }: { event: EventConfig }) {
  const [formInView, setFormInView] = useState(false)

  useEffect(() => {
    const form = document.getElementById('ingressos')
    if (!form || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setFormInView(entry.isIntersecting))
    observer.observe(form)
    return () => observer.disconnect()
  }, [])

  if (formInView) return null
  const price = event.ticketReservation.priceBRL

  return (
    <div
      data-testid="mobile-reserve-bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:hidden"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{event.title}</p>
          <p className="text-xs text-muted-foreground">
            {formatEventDay(event.startsAt, { withYear: false })}
            {price ? ` · ${formatPriceShort(price, event.ticketReservation.currencyLabel)}` : ''}
          </p>
        </div>
        <Button asChild className="shrink-0 gap-1.5">
          <a href="#ingressos">
            <Ticket className="h-4 w-4" />
            Reservar
          </a>
        </Button>
      </div>
    </div>
  )
}

/** `Domingo, 11 de outubro, 14h às 18h · Mar Palace… Entrada R$ 22.` */
function eventSeoDescription(event: EventConfig): string {
  const price = event.ticketReservation.priceBRL
  const place = event.location.name || event.location.address
  const priceText =
    price == null
      ? ''
      : price === 0
        ? ' Entrada gratuita.'
        : ` Entrada ${formatPriceShort(price, event.ticketReservation.currencyLabel)}.`
  return `${formatEventDay(event.startsAt, { withYear: false })}, ${formatEventTime(
    event.startsAt,
    event.endsAt
  ).toLowerCase()}${place ? ` · ${place}` : ''}.${priceText} Reserve seu ingresso online.`
}
