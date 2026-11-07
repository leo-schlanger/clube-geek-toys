import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronRight, MapPin, Ticket } from 'lucide-react'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet'
import { StatusChip, type ChipTone } from './StatusChip'
import { MemberSection, SectionEmpty, SectionError } from './MemberSection'
import { useActiveEvent } from '../../hooks/useActiveEvent'
import { eventArt, formatBRL, formatEventDateRange, ticketPriceBRL } from '../../data/event'
import { getMyReservations, type PublicReservation, type PublicTicket } from '../../lib/event-tickets'
import { getShopUrl } from '../../lib/subdomain'

const KIND_LABEL: Record<PublicTicket['kind'], string> = {
  member: 'Meia de membro',
  full: 'Inteira',
  free: 'Isento',
}

function ticketChip(ticket: PublicTicket, reservation: PublicReservation): { tone: ChipTone; label: string } {
  if (reservation.status === 'pending') return { tone: 'warning', label: 'Aguardando PIX' }
  if (ticket.status === 'used') return { tone: 'muted', label: 'Usado' }
  if (ticket.status === 'valid') return { tone: 'success', label: 'Válido' }
  if (ticket.status === 'pending') return { tone: 'warning', label: 'Pendente' }
  return { tone: 'muted', label: 'Cancelado' }
}

function shopLink(path: string): string {
  return `${getShopUrl().replace(/\/$/, '')}${path}`
}

interface Row {
  ticket: PublicTicket
  reservation: PublicReservation
}

function TicketRow({ ticket, reservation }: Row) {
  const chip = ticketChip(ticket, reservation)
  const href =
    reservation.status === 'pending' ? shopLink(`/ingressos/${reservation.code}`) : shopLink(`/ingresso/${ticket.code}`)
  return (
    <a
      href={href}
      className="flex min-h-14 items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/60"
    >
      <Ticket className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{ticket.attendeeName}</span>
        <span className="block text-xs text-muted-foreground">
          {KIND_LABEL[ticket.kind]} · {ticket.code}
        </span>
      </span>
      <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </a>
  )
}

const linkClass =
  'inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-4'

/** Next event with the member's half-price ticket, and the tickets already bought. */
export function MemberEvents({ paused = false }: { paused?: boolean }) {
  const { event, visible, loading: eventLoading } = useActiveEvent()
  const reservations = useQuery({ queryKey: ['events', 'my-reservations'], queryFn: getMyReservations, staleTime: 60_000 })
  const [pastOpen, setPastOpen] = useState(false)

  const { current, past } = useMemo(() => {
    const rows: Row[] = (reservations.data ?? [])
      .filter((r) => r.status !== 'cancelled')
      .flatMap((reservation) => reservation.tickets.map((ticket) => ({ ticket, reservation })))
    return {
      current: visible ? rows.filter((r) => r.ticket.event.id === event.id) : [],
      past: rows.filter((r) => !visible || r.ticket.event.id !== event.id),
    }
  }, [reservations.data, visible, event.id])

  if (eventLoading || reservations.isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />
  }

  const art = visible ? eventArt(event)[0] : undefined
  const halfPrice = event.ticketReservation.priceBRL != null ? ticketPriceBRL(event, 'member') : null

  return (
    <MemberSection icon={CalendarDays} title="Próximo evento">
      {!visible ? (
        <SectionEmpty>Nenhum evento anunciado agora. Quando abrir a venda, a meia de membro aparece aqui.</SectionEmpty>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-3">
            {art ? (
              <img src={art} alt="" className="h-[120px] w-24 shrink-0 rounded-lg object-cover" loading="lazy" />
            ) : (
              <div className="flex h-[120px] w-24 shrink-0 items-center justify-center rounded-lg bg-linear-to-br/srgb from-primary to-accent p-2 text-center text-xs font-bold text-primary-foreground">
                {event.shortTitle || event.title}
              </div>
            )}
            <div className="min-w-0 space-y-1.5">
              <p className="font-heading text-base font-bold leading-snug">{event.title}</p>
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {formatEventDateRange(event.startsAt, event.endsAt)}
              </p>
              {event.location?.name && (
                <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {event.location.name}
                </p>
              )}
              {halfPrice != null && halfPrice > 0 && (
                <StatusChip tone={paused ? 'muted' : 'primary'} className="whitespace-normal">
                  {paused ? 'Meia de membro volta ao renovar' : `Membro paga ${formatBRL(halfPrice)} (meia)`}
                </StatusChip>
              )}
            </div>
          </div>

          {reservations.isError ? (
            <SectionError onRetry={() => reservations.refetch()} />
          ) : current.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Seus ingressos para este evento
              </p>
              {current.map((row) => (
                <TicketRow key={row.ticket.code} {...row} />
              ))}
              {event.ticketReservation.enabled && (
                <a href={shopLink('/evento')} className={linkClass}>
                  Comprar mais ingressos
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </a>
              )}
            </div>
          ) : (
            event.ticketReservation.enabled && (
              <Button asChild className="h-12 w-full text-[19px] font-bold">
                <a href={shopLink('/evento')}>Garantir meu ingresso</a>
              </Button>
            )
          )}
        </div>
      )}

      {past.length > 0 && (
        <>
          <button type="button" onClick={() => setPastOpen(true)} className={`${linkClass} mt-2`}>
            Ingressos de eventos anteriores ({past.length})
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <Sheet open={pastOpen} onOpenChange={setPastOpen}>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Ingressos de eventos anteriores</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-2">
                {past.map((row) => (
                  <div key={row.ticket.code} className="space-y-1">
                    <p className="text-xs text-muted-foreground">{row.ticket.event.title}</p>
                    <TicketRow {...row} />
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </MemberSection>
  )
}
