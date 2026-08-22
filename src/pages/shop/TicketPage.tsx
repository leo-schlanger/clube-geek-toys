import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Calendar, MapPin, Printer } from 'lucide-react'
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

type Props = {
  /** `ticket` mostra um ingresso; `reservation` mostra todos os da compra. */
  mode: 'ticket' | 'reservation'
}

/**
 * Página pública do ingresso.
 *
 * Sem login de propósito: o ingresso é repassado para quem vai entrar, e essa
 * pessoa não tem conta na loja. O código é longo e inadivinhável, e o que
 * protege a portaria não é o sigilo do link — é o check-in queimar o código.
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

  if (loading) return <LoadingPage />

  const event = tickets?.[0]?.event

  return (
    <div className="min-h-screen bg-background">
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

            {/* Pendente: o QR do ingresso ainda não vale na portaria. */}
            {reservation?.pix && reservation.status === 'pending' && (
              <ReservationPixPanel
                code={reservation.code}
                pix={reservation.pix}
                totalCents={reservation.totalCents}
                className="print:hidden"
              />
            )}

            {event && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex gap-3 rounded-xl bg-muted/50 p-4">
                  <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Data e horário
                    </p>
                    <p className="mt-0.5 text-sm font-medium capitalize leading-snug">
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
