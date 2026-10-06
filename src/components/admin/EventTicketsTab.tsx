import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  History,
  Search,
  Ticket,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Loading } from '../ui/loading'
import { Pagination } from '../ui/pagination'
import { logger } from '../../lib/logger'
import { TicketCheckIn } from '../TicketCheckIn'
import {
  formatEventDay,
  isEventOver,
  pickCurrentEvent,
  TICKET_KIND_LABEL,
  type EventConfig,
} from '../../data/event'
import { listEvents } from '../../lib/events'
import {
  adminListReservations,
  cancelReservation,
  confirmReservation,
  dayAndTime,
  ticketPriceMix,
  ticketSituation,
  type EventReservation,
  type ReservationStatus,
} from '../../lib/event-tickets'
import { getShopUrl } from '../../lib/subdomain'

const PAGE_SIZE = 20

type FilterId = ReservationStatus | 'all'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'confirmed', label: 'Pagas' },
  { id: 'pending', label: 'Aguardando pagamento' },
  { id: 'cancelled', label: 'Canceladas' },
  { id: 'all', label: 'Todas' },
]

/** `eventId` value that lists every event together. */
const ALL_EVENTS = '__all__'

const RIO = 'America/Sao_Paulo'

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: RIO,
  })
}

export function EventTicketsTab() {
  const [reservations, setReservations] = useState<EventReservation[]>([])
  const [summary, setSummary] = useState({
    pending: 0,
    confirmed: 0,
    cancelled: 0,
    ticketsValid: 0,
    ticketsUsed: 0,
  })
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [filter, setFilter] = useState<FilterId>('confirmed')
  const [events, setEvents] = useState<EventConfig[] | null>(null)
  const [eventId, setEventId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)


  useEffect(() => {
    let cancelled = false
    listEvents()
      .then((list) => {
        if (cancelled) return
        setEvents(list)
        setEventId(pickCurrentEvent(list)?.id ?? ALL_EVENTS)
      })
      .catch((error) => {
        if (cancelled) return
        logger.error('Error fetching events:', error)
        setEvents([])
        setEventId(ALL_EVENTS)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedEvent = events?.find((e) => e.id === eventId) ?? null
  const selectedOver = selectedEvent ? isEventOver(selectedEvent) : false
  const upcomingEvents = (events ?? [])
    .filter((e) => !isEventOver(e))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const pastEvents = (events ?? [])
    .filter((e) => isEventOver(e))
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))

  const fetchReservations = useCallback(async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const result = await adminListReservations({
        status: filter === 'all' ? undefined : filter,
        eventId: eventId === ALL_EVENTS ? undefined : eventId,
        search: appliedSearch || undefined,
        page,
        limit: pageSize,
      })
      setReservations(result.reservations)
      setTotal(result.total)
      setSummary(result.summary)
    } catch (error) {
      logger.error('Error fetching event reservations:', error)
      toast.error('Erro ao carregar as reservas')
    }
    setLoading(false)
  }, [eventId, filter, appliedSearch, page, pageSize])

  useEffect(() => {
    fetchReservations()
  }, [fetchReservations])

  const handleConfirm = useCallback(async (reservation: EventReservation) => {
    // A Pagar.me PIX confirms itself; confirming by hand is for when the money
    // arrived another way (cash, transfer to the key) — say so before it happens.
    if (
      reservation.paymentProvider === 'pagarme' &&
      !window.confirm(
        `A reserva de ${reservation.buyerName} é confirmada sozinha quando o PIX cai. ` +
          'Confirmar à mão só se o pagamento chegou por outro meio (dinheiro, transferência). Liberar os ingressos agora?'
      )
    ) {
      return
    }
    setBusyId(reservation.id)
    try {
      const updated = await confirmReservation(reservation.id)
      if (!updated) {
        toast.error('Não foi possível confirmar a reserva')
        return
      }
      setReservations((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
      setSummary((s) => ({
        ...s,
        pending: Math.max(0, s.pending - 1),
        confirmed: s.confirmed + 1,
        ticketsValid: s.ticketsValid + (updated.tickets?.length ?? 0),
      }))
      toast.success(`Ingressos liberados — ${reservation.buyerName} recebeu o link por e-mail`)
    } catch (error) {
      logger.error('Error confirming reservation:', error)
      toast.error('Erro ao confirmar a reserva')
    } finally {
      setBusyId(null)
    }
  }, [])

  const handleCancel = useCallback(async (reservation: EventReservation) => {
    const refunds = reservation.paymentProvider === 'pagarme' && reservation.status === 'confirmed'
    const message = refunds
      ? `Cancelar a reserva de ${reservation.buyerName}? ${brl(reservation.totalCents)} voltam para o cliente pela Pagar.me e os ingressos deixam de valer.`
      : `Cancelar a reserva de ${reservation.buyerName}? Os ingressos deixam de valer.`
    if (!window.confirm(message)) {
      return
    }
    setBusyId(reservation.id)
    try {
      const updated = await cancelReservation(reservation.id)
      if (!updated) {
        toast.error('Não foi possível cancelar a reserva')
        return
      }
      setReservations((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
      toast.success(refunds ? 'Reserva cancelada e valor estornado' : 'Reserva cancelada')
    } catch (error) {
      logger.error('Error cancelling reservation:', error)
      toast.error(
        refunds ? 'Não foi possível estornar — a reserva continua ativa' : 'Erro ao cancelar a reserva'
      )
    } finally {
      setBusyId(null)
    }
  }, [])

  const ticketsPaid = summary.ticketsValid + summary.ticketsUsed
  const filterCount: Partial<Record<FilterId, number>> = {
    confirmed: summary.confirmed,
    pending: summary.pending,
    cancelled: summary.cancelled,
  }
  const overFor = (id: string): boolean => {
    if (eventId !== ALL_EVENTS) return selectedOver
    const event = events?.find((e) => e.id === id)
    return event ? isEventOver(event) : false
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Qual evento?
          </CardTitle>
          <CardDescription>
            Tudo nesta tela — números, compras e ingressos — é do evento escolhido aqui. Eventos
            que já aconteceram ficam no <strong>Histórico</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {events === null ? (
            <Loading />
          ) : (
            <select
              aria-label="Evento"
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value)
                setPage(1)
              }}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-md"
            >
              {upcomingEvents.length > 0 && (
                <optgroup label="Próximos eventos">
                  {upcomingEvents.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} — {shortDay(e.startsAt)}
                    </option>
                  ))}
                </optgroup>
              )}
              {pastEvents.length > 0 && (
                <optgroup label="Histórico — eventos que já aconteceram">
                  {pastEvents.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} — {shortDay(e.startsAt)}
                    </option>
                  ))}
                </optgroup>
              )}
              <option value={ALL_EVENTS}>Todos os eventos juntos</option>
            </select>
          )}

          {selectedEvent &&
            (selectedOver ? (
              <div
                role="status"
                className="flex items-start gap-3 rounded-xl border-2 border-amber-500/60 bg-amber-500/10 p-3 text-sm"
              >
                <History className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <p>
                  <strong>Histórico.</strong> Este evento já aconteceu (
                  {formatEventDay(selectedEvent.startsAt)}). Os ingressos dele não valem para
                  nenhum outro evento — a portaria recusa.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                <span className="mr-2 rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-500">
                  Próximo evento
                </span>
                {formatEventDay(selectedEvent.startsAt)}
              </p>
            ))}
        </CardContent>
      </Card>

      {eventId && !selectedOver && (
        <TicketCheckIn key={eventId} onChecked={() => void fetchReservations()} />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: 'Ingressos pagos',
            hint: `em ${summary.confirmed} compra(s)`,
            value: ticketsPaid,
            tone: 'text-primary',
          },
          {
            label: 'Já entraram',
            hint: 'passaram pela portaria',
            value: summary.ticketsUsed,
            tone: 'text-blue-400',
          },
          selectedOver
            ? {
                label: 'Não compareceram',
                hint: 'pagaram e não vieram',
                value: summary.ticketsValid,
                tone: 'text-muted-foreground',
              }
            : {
                label: 'Ainda vão entrar',
                hint: 'pagos, esperando o dia',
                value: summary.ticketsValid,
                tone: 'text-green-500',
              },
          {
            label: 'Aguardando pagamento',
            hint: 'PIX gerado, ainda não pago',
            value: summary.pending,
            tone: 'text-amber-500',
          },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">{item.label}</p>
              <p className={`mt-1 font-heading text-2xl font-extrabold ${item.tone}`}>
                {item.value}
              </p>
              <p className="text-xs text-muted-foreground">{item.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5" />
            Quem comprou
          </CardTitle>
          <CardDescription>
            Cada compra mostra quem pagou e, embaixo, cada pessoa com o valor do ingresso dela.
            Uma meia deixa o total menor que o número de nomes — os dois aparecem na mesma linha.
            O PIX se confirma sozinho — não precisa conferir extrato.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <Button
                  key={f.id}
                  size="sm"
                  variant={filter === f.id ? 'default' : 'outline'}
                  onClick={() => {
                    setFilter(f.id)
                    setPage(1)
                  }}
                >
                  {f.label}
                  {filterCount[f.id] !== undefined && ` (${filterCount[f.id]})`}
                </Button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                setAppliedSearch(search.trim())
                setPage(1)
              }}
            >
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome de quem paga ou de quem entra, telefone, e-mail ou código"
                className="sm:w-72"
              />
              <Button type="submit" variant="outline" size="icon" aria-label="Buscar">
                <Search className="h-4 w-4" />
              </Button>
            </form>
          </div>

          {loading ? (
            <Loading />
          ) : reservations.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {filter === 'confirmed'
                ? 'Ninguém comprou ingresso para este evento ainda.'
                : 'Nenhuma compra nesta lista.'}
            </p>
          ) : (
            <div className="space-y-3">
              {reservations.map((reservation) => (
                <div key={reservation.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-heading text-base font-bold">{reservation.buyerName}</p>
                        <Badge
                          variant={
                            reservation.status === 'confirmed'
                              ? 'default'
                              : reservation.status === 'cancelled'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {reservation.status === 'confirmed'
                            ? 'Paga'
                            : reservation.status === 'cancelled'
                              ? 'Cancelada'
                              : 'Aguardando pagamento'}
                        </Badge>
                        <span className="font-mono text-xs font-bold text-muted-foreground">
                          {reservation.code}
                        </span>
                        {reservation.paymentProvider === 'pagarme' && reservation.status === 'pending' && (
                          <Badge variant="outline">PIX automático</Badge>
                        )}
                        {reservation.paymentProvider === 'local' && reservation.status === 'pending' && (
                          <Badge variant="outline">PIX manual — confira o extrato</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {reservation.buyerPhone} · {reservation.buyerEmail}
                      </p>
                      <p className="mt-0.5 text-sm">
                        {reservation.quantity} ingresso(s)
                        {reservation.tickets && reservation.tickets.length > 0 && (
                          <> · {ticketPriceMix(reservation.tickets)}</>
                        )}
                        {' · '}
                        <strong>{brl(reservation.totalCents)}</strong> · comprou{' '}
                        {dayAndTime(reservation.createdAt)}
                      </p>
                      {eventId === ALL_EVENTS && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Evento:{' '}
                          {events?.find((e) => e.id === reservation.eventId)?.title ??
                            reservation.eventId}
                        </p>
                      )}
                      {reservation.notes && (
                        <p className="mt-1 text-sm italic text-muted-foreground">
                          “{reservation.notes}”
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {reservation.status === 'pending' && !overFor(reservation.eventId) && (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={busyId === reservation.id}
                          onClick={() => void handleConfirm(reservation)}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {reservation.paymentProvider === 'pagarme'
                            ? 'Confirmar à mão'
                            : 'Confirmar pagamento'}
                        </Button>
                      )}
                      {reservation.status !== 'cancelled' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === reservation.id}
                          onClick={() => void handleCancel(reservation)}
                        >
                          Cancelar
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" asChild>
                        <a
                          // Absolute: `/ingressos/:code` is a shop route, and
                          // the admin host's catch-all sends a relative link
                          // to /login — which is exactly where the PIX and the
                          // "resend by e-mail" button live.
                          href={`${getShopUrl()}/ingressos/${reservation.code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gap-1.5"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Ingressos
                        </a>
                      </Button>
                    </div>
                  </div>

                  {reservation.tickets && reservation.tickets.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      {reservation.tickets.map((ticket) => {
                        const situation = ticketSituation(ticket, overFor(ticket.eventId))
                        return (
                          <div
                            key={ticket.code}
                            className="flex flex-col gap-1 rounded-lg bg-muted/40 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Ticket className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate font-medium">{ticket.attendeeName}</span>
                              {/*
                                Half price is a membership the server checked.
                                `memberId` is that member. A member ticket from
                                before the check has no id: the row says so,
                                because the total alone cannot (R$ 40 for three
                                people is also two full tickets).
                              */}
                              {ticket.kind === 'member' && (
                                <span
                                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                    ticket.memberId
                                      ? 'bg-green-500/15 text-green-500'
                                      : 'bg-amber-500/20 text-amber-500'
                                  }`}
                                >
                                  {ticket.memberId ? 'Sócio conferido' : 'Meia sem sócio conferido'}
                                </span>
                              )}
                              {ticket.kind === 'free' && (
                                <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                  {TICKET_KIND_LABEL[ticket.kind]}
                                </span>
                              )}
                            </span>
                            <span className="flex shrink-0 items-center gap-3 pl-[22px] sm:pl-0">
                              <span className="font-semibold tabular-nums">{brl(ticket.priceCents)}</span>
                              <span className={`text-xs font-semibold ${situation.tone}`}>
                                {situation.label}
                              </span>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}

              <Pagination
                currentPage={page}
                totalPages={Math.max(1, Math.ceil(total / pageSize))}
                totalItems={total}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setPage(1)
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default EventTicketsTab
