import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Printer,
} from 'lucide-react'
import { ShopHeader } from '../../components/store/ShopHeader'
import { TicketCard } from '../../components/store/TicketCard'
import { useShopMember } from '../../components/store/useShopMember'
import { Button } from '../../components/ui/button'
import { LoadingPage } from '../../components/ui/loading'
import { formatEventDateRange } from '../../data/event'
import {
  getPublicReservation,
  getPublicTicket,
  type PublicReservation,
  type PublicTicket,
} from '../../lib/event-tickets'
import { ReservationPixPanel } from '../../components/store/ReservationPixPanel'
import { SeoHead } from '../../components/store/SeoHead'
import { useReservationPolling } from '../../hooks/useReservationPolling'

type Props = {
  /** `ticket` shows one ticket; `reservation` shows every ticket in the purchase. */
  mode: 'ticket' | 'reservation'
}

/**
 * Public ticket page.
 *
 * No login on purpose: the ticket is forwarded to whoever is entering, and
 * that person has no shop account. The code is long and unguessable; what
 * protects the door is check-in burning the code, not secrecy of the link.
 */
export default function TicketPage({ mode }: Props) {
  const { code } = useParams<{ code: string }>()
  const { isMember } = useShopMember()
  const [tickets, setTickets] = useState<PublicTicket[] | null>(null)
  const [reservation, setReservation] = useState<PublicReservation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!code) {
        setError('Código não informado.')
        setLoading(false)
        return
      }
      try {
        if (mode === 'ticket') {
          const ticket = await getPublicTicket(code)
          if (cancelled) return
          if (!ticket) setError('Ingresso não encontrado.')
          else setTickets([ticket])
        } else {
          const found = await getPublicReservation(code)
          if (cancelled) return
          if (!found) setError('Reserva não encontrada.')
          else {
            setTickets(found.tickets)
            setReservation(found)
          }
        }
      } catch {
        if (!cancelled) setError('Não foi possível carregar o ingresso.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [code, mode])

  // A Pagar.me PIX confirms itself: the page waits on screen and the tickets
  // appear the moment the payment lands, without a reload.
  const handleUpdate = useCallback((found: PublicReservation) => {
    setReservation((current) => {
      if (current?.status === 'pending' && found.status === 'confirmed') {
        toast.success('Pagamento confirmado! Seus ingressos foram liberados.')
      }
      return found
    })
    setTickets(found.tickets)
  }, [])

  const waitingForPix = Boolean(
    reservation &&
      reservation.status === 'pending' &&
      reservation.paymentProvider === 'pagarme' &&
      reservation.pix &&
      !reservation.pixExpired
  )
  useReservationPolling(mode === 'reservation' ? code : null, waitingForPix, handleUpdate)

  if (loading) return <LoadingPage />

  const event = tickets?.[0]?.event

  return (
    <div className="min-h-screen bg-background">
      {/* The page prints the attendee's full name and is public by URL. It had
          no SeoHead at all, so it inherited `index, follow` from the static
          HTML — one shared ticket link was enough to put a real person's name
          in Google. */}
      <SeoHead
        title={mode === 'reservation' ? 'Meus ingressos' : 'Ingresso'}
        path={`/${mode === 'reservation' ? 'ingressos' : 'ingresso'}/${code ?? ''}`}
        noIndex
      />
      <ShopHeader isMember={isMember} />

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-16">
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1.5 print:hidden">
          <Link to="/evento">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao evento
          </Link>
        </Button>

        {error || !tickets || tickets.length === 0 ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-8 text-center">
            <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-destructive" />
            <h1 className="font-heading text-2xl font-bold">Ingresso não encontrado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {error || 'Confira o link recebido ou fale com a loja pelo WhatsApp.'}
            </p>
          </div>
        ) : (
          <>
            <div>
              <span className="mb-3 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
                {mode === 'reservation' ? 'Meus ingressos' : 'Ingresso'}
              </span>
              <h1 className="font-heading text-2xl font-bold sm:text-3xl">
                {event?.title ?? 'Evento GeekPop & Toys'}
              </h1>
              {reservation && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Reserva de <strong>{reservation.buyerName}</strong> · {tickets.length}{' '}
                  ingresso(s)
                </p>
              )}
            </div>

            {/* Pending PIX: the ticket QR is not valid at the door yet. */}
            {reservation?.pix && reservation.status === 'pending' && (
              <div className="space-y-3 print:hidden">
                <ReservationPixPanel
                  code={reservation.code}
                  pix={reservation.pix}
                  totalCents={reservation.totalCents}
                />
                {waitingForPix && (
                  <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Aguardando o pagamento — esta página atualiza sozinha.
                  </p>
                )}
              </div>
            )}

            {reservation?.status === 'pending' && reservation.pixExpired && (
              <div className="flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm print:hidden">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-semibold">O PIX desta reserva expirou.</p>
                  <p className="mt-1 text-muted-foreground">
                    O código vale 24 horas. Se você já pagou, fale com a loja pelo WhatsApp; se
                    não, faça uma nova reserva.
                  </p>
                  <Button asChild size="sm" className="mt-3">
                    <Link to="/evento#ingressos">Fazer nova reserva</Link>
                  </Button>
                </div>
              </div>
            )}

            {reservation?.status === 'confirmed' && (
              <div className="flex gap-3 rounded-2xl border border-green-500/40 bg-green-500/10 p-4 text-sm print:hidden">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                <p>
                  <strong>Pagamento confirmado.</strong> Os ingressos abaixo já valem na entrada —
                  cada QR Code uma única vez.
                </p>
              </div>
            )}

            {event && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex gap-3 rounded-xl bg-muted/50 p-4">
                  <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Data e horário
                    </p>
                    <p className="mt-0.5 text-sm font-medium leading-snug">
                      {formatEventDateRange(event.startsAt, event.endsAt)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-xl bg-muted/50 p-4">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Local</p>
                    <p className="mt-0.5 text-sm font-medium">{event.locationName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{event.locationAddress}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {tickets.map((ticket) => (
                <TicketCard key={ticket.code} ticket={ticket} />
              ))}
            </div>

            <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm leading-relaxed">
              Cada QR Code vale <strong>uma única entrada</strong> e sai no nome de quem vai usar.
              Depois da leitura na portaria, o ingresso passa a aparecer como utilizado — por isso
              um print repassado não abre a porta duas vezes.
            </div>

            <Button
              variant="outline"
              className="gap-2 print:hidden"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" />
              Imprimir / salvar em PDF
            </Button>
          </>
        )}
      </main>
    </div>
  )
}
