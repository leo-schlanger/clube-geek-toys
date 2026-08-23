import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  CalendarCheck,
  CheckCircle2,
  ExternalLink,
  QrCode,
  ScanLine,
  Search,
  Ticket,
  XCircle,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Loading } from '../ui/loading'
import { Pagination } from '../ui/pagination'
import { QRScanner } from '../QRScanner'
import { logger } from '../../lib/logger'
import { TICKET_KIND_LABEL } from '../../data/event'
import {
  adminListReservations,
  cancelReservation,
  checkInTicket,
  confirmReservation,
  extractTicketCode,
  TICKET_STATUS_LABEL,
  type CheckInResponse,
  type EventReservation,
  type ReservationStatus,
} from '../../lib/event-tickets'
import { getShopUrl } from '../../lib/subdomain'

const PAGE_SIZE = 20

type FilterId = ReservationStatus | 'all'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'pending', label: 'Aguardando pagamento' },
  { id: 'confirmed', label: 'Confirmadas' },
  { id: 'cancelled', label: 'Canceladas' },
  { id: 'all', label: 'Todas' },
]

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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
  const [filter, setFilter] = useState<FilterId>('pending')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [scannerOpen, setScannerOpen] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [lastCheckIn, setLastCheckIn] = useState<CheckInResponse | null>(null)

  const fetchReservations = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminListReservations({
        status: filter === 'all' ? undefined : filter,
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
  }, [filter, appliedSearch, page, pageSize])

  useEffect(() => {
    fetchReservations()
  }, [fetchReservations])

  const handleConfirm = useCallback(async (reservation: EventReservation) => {
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
    if (!window.confirm(`Cancelar a reserva de ${reservation.buyerName}? Os ingressos deixam de valer.`)) {
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
      toast.success('Reserva cancelada')
    } catch (error) {
      logger.error('Error cancelling reservation:', error)
      toast.error('Erro ao cancelar a reserva')
    } finally {
      setBusyId(null)
    }
  }, [])

  const runCheckIn = useCallback(async (rawCode: string) => {
    const code = extractTicketCode(rawCode)
    if (!code) return
    setChecking(true)
    try {
      const result = await checkInTicket(code)
      setLastCheckIn(result)
      if (result.ok) toast.success(`Entrada liberada — ${result.ticket.attendeeName}`)
      else toast.error(result.message)
    } catch (error) {
      logger.error('Error checking in ticket:', error)
      toast.error('Erro ao validar o ingresso')
    } finally {
      setChecking(false)
    }
  }, [])

  return (
    <div className="space-y-6">
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            Portaria — check-in
          </CardTitle>
          <CardDescription>
            Leia o QR do ingresso ou digite o código. Cada código vale{' '}
            <strong>uma única entrada</strong>: na segunda leitura ele aparece como já utilizado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {scannerOpen ? (
            <QRScanner
              onScan={(data) => {
                setScannerOpen(false)
                void runCheckIn(data)
              }}
              onClose={() => setScannerOpen(false)}
            />
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button className="gap-2" onClick={() => setScannerOpen(true)}>
                <QrCode className="h-4 w-4" />
                Abrir leitor de QR
              </Button>
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void runCheckIn(manualCode)
                  setManualCode('')
                }}
              >
                <Input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="T-XXXX-XXXX-XXXX"
                  className="font-mono uppercase"
                />
                <Button type="submit" variant="outline" disabled={checking || !manualCode.trim()}>
                  Validar
                </Button>
              </form>
            </div>
          )}

          {lastCheckIn && (
            <div
              className={`rounded-xl border-2 p-4 ${
                lastCheckIn.ok
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-destructive bg-destructive/10'
              }`}
            >
              <div className="flex items-start gap-3">
                {lastCheckIn.ok ? (
                  <CheckCircle2 className="h-8 w-8 shrink-0 text-green-500" />
                ) : (
                  <XCircle className="h-8 w-8 shrink-0 text-destructive" />
                )}
                <div>
                  <p
                    className={`font-heading text-lg font-bold ${
                      lastCheckIn.ok ? 'text-green-500' : 'text-destructive'
                    }`}
                  >
                    {lastCheckIn.ok ? 'ENTRADA LIBERADA' : 'ENTRADA NEGADA'}
                  </p>
                  <p className="text-sm font-semibold">
                    {lastCheckIn.ok
                      ? lastCheckIn.ticket.attendeeName
                      : (lastCheckIn.ticket?.attendeeName ?? '—')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {lastCheckIn.ok
                      ? `${TICKET_KIND_LABEL[lastCheckIn.ticket.kind]} · reserva de ${lastCheckIn.buyerName}`
                      : lastCheckIn.message}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Aguardando pagamento', value: summary.pending, tone: 'text-amber-500' },
          { label: 'Reservas confirmadas', value: summary.confirmed, tone: 'text-green-500' },
          { label: 'Ingressos válidos', value: summary.ticketsValid, tone: 'text-primary' },
          { label: 'Já entraram', value: summary.ticketsUsed, tone: 'text-blue-400' },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">{item.label}</p>
              <p className={`mt-1 font-heading text-2xl font-extrabold ${item.tone}`}>
                {item.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5" />
            Reservas de ingresso
          </CardTitle>
          <CardDescription>
            Confirme o pagamento para liberar os ingressos. Antes disso, a portaria recusa a
            entrada.
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
                placeholder="Nome, telefone, e-mail ou código"
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
              Nenhuma reserva por aqui.
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
                            ? 'Confirmada'
                            : reservation.status === 'cancelled'
                              ? 'Cancelada'
                              : 'Aguardando pagamento'}
                        </Badge>
                        <span className="font-mono text-xs font-bold text-muted-foreground">
                          {reservation.code}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {reservation.buyerPhone} · {reservation.buyerEmail}
                      </p>
                      <p className="mt-0.5 text-sm">
                        {reservation.quantity} ingresso(s) ·{' '}
                        <strong>{brl(reservation.totalCents)}</strong> ·{' '}
                        {new Date(reservation.createdAt).toLocaleString('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </p>
                      {reservation.notes && (
                        <p className="mt-1 text-sm italic text-muted-foreground">
                          “{reservation.notes}”
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {reservation.status === 'pending' && (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={busyId === reservation.id}
                          onClick={() => void handleConfirm(reservation)}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Confirmar pagamento
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
                    <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
                      {reservation.tickets.map((ticket) => (
                        <div
                          key={ticket.code}
                          className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <Ticket className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate font-medium">{ticket.attendeeName}</span>
                          </span>
                          <span
                            className={`shrink-0 text-xs font-semibold ${
                              ticket.status === 'used'
                                ? 'text-blue-400'
                                : ticket.status === 'valid'
                                  ? 'text-green-500'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {TICKET_STATUS_LABEL[ticket.status]}
                          </span>
                        </div>
                      ))}
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
