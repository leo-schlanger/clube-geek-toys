import { useCallback, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, MessageCircle, Plus, Ticket, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  FALLBACK_EVENT,
  buildReservationWhatsAppUrl,
  formatBRL,
  ticketPriceBRL,
  TICKET_KIND_LABEL,
  type EventConfig,
  type TicketKind,
} from '../../data/event'
import {
  createReservation,
  type PublicReservation,
  type ReservationPix,
} from '../../lib/event-tickets'
import { formatCPF, validateCPF } from '../../lib/utils'
import { useReservationPolling } from '../../hooks/useReservationPolling'
import { ReservationPixPanel } from './ReservationPixPanel'

type Props = {
  event?: EventConfig
}

type Attendee = { name: string; kind: TicketKind }

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

/** Typing mask: digits only, formatted once all eleven are in. */
function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  return digits.length === 11 ? formatCPF(digits) : digits
}

/**
 * Ticket reservation.
 *
 * One ticket **per person**, named for who is entering. The API returns the
 * codes and a Pagar.me PIX; paying it confirms the reservation on its own, and
 * this form waits on screen until the tickets are released.
 */
export function EventTicketForm({ event = FALLBACK_EVENT }: Props) {
  const [buyer, setBuyer] = useState({ name: '', phone: '', email: '', document: '', notes: '' })
  const [attendees, setAttendees] = useState<Attendee[]>([{ name: '', kind: 'full' }])
  const [submitting, setSubmitting] = useState(false)
  /** Until the first name is edited, it tracks whoever is reserving. */
  const [firstNameTouched, setFirstNameTouched] = useState(false)
  const [result, setResult] = useState<{
    code: string
    ticketsPath: string
    pix: ReservationPix | null
    totalCents: number
    confirmed: boolean
  } | null>(null)

  const max = event.ticketReservation.maxPerReservation
  const unit = event.ticketReservation.priceBRL
  const currency = event.ticketReservation.currencyLabel ?? 'R$'

  const total = useMemo(
    () => attendees.reduce((sum, a) => sum + ticketPriceBRL(event, a.kind), 0),
    [attendees, event]
  )
  // The acquirer needs the buyer's CPF; a free reservation charges nothing.
  const needsDocument = total > 0

  const handlePaid = useCallback((found: PublicReservation) => {
    if (found.status !== 'confirmed') return
    setResult((current) => (current ? { ...current, confirmed: true, pix: null } : current))
    toast.success('Pagamento confirmado! Seus ingressos foram liberados.')
  }, [])

  useReservationPolling(
    result?.code,
    Boolean(result && !result.confirmed && result.pix?.provider === 'pagarme'),
    handlePaid
  )

  if (!event.ticketReservation.enabled) {
    return (
      <div
        id="ingressos"
        className="scroll-mt-28 rounded-2xl border border-border bg-card p-6 text-center md:p-8"
      >
        <Ticket className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h3 className="mb-2 font-heading text-xl font-bold">Reservas encerradas</h3>
        <p className="text-sm text-muted-foreground">
          As reservas online para este evento não estão disponíveis no momento.
        </p>
      </div>
    )
  }

  function setQuantity(next: number) {
    const target = Math.max(1, max == null ? next : Math.min(next, max))
    setAttendees((current) => {
      if (target === current.length) return current
      if (target < current.length) return current.slice(0, target)
      return [
        ...current,
        ...Array.from({ length: target - current.length }, () => ({
          name: '',
          kind: 'full' as TicketKind,
        })),
      ]
    })
  }

  function updateAttendee(index: number, patch: Partial<Attendee>) {
    if (index === 0 && patch.name !== undefined) setFirstNameTouched(true)
    setAttendees((current) =>
      current.map((attendee, i) => (i === index ? { ...attendee, ...patch } : attendee))
    )
  }

  function openWhatsApp(reservationCode: string | null, ticketsUrl: string | null) {
    const url = buildReservationWhatsAppUrl({
      event,
      name: buyer.name.trim(),
      phone: buyer.phone.trim(),
      email: buyer.email.trim(),
      attendees: attendees.map((a) => ({ name: a.name.trim(), kind: a.kind })),
      notes: buyer.notes,
      reservationCode,
      ticketsUrl,
    })
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    const filled = attendees.map((a) => ({ name: a.name.trim(), kind: a.kind }))
    const missing = filled.findIndex((a) => a.name.length < 2)
    if (missing >= 0) {
      toast.error(`Informe o nome da pessoa ${missing + 1}.`)
      return
    }
    if (needsDocument && !validateCPF(buyer.document)) {
      toast.error('Informe um CPF válido — a operadora exige o documento de quem paga.')
      document.getElementById('evt-document')?.focus()
      return
    }

    setSubmitting(true)
    try {
      const created = await createReservation(event.id, {
        buyerName: buyer.name.trim(),
        buyerEmail: buyer.email.trim(),
        buyerPhone: buyer.phone.trim(),
        buyerDocument: needsDocument ? buyer.document.replace(/\D/g, '') : undefined,
        notes: buyer.notes.trim() || undefined,
        attendees: filled,
      })

      if (created.ok) {
        const pix = created.reservation.pix ?? null
        const free = created.reservation.totalCents <= 0
        setResult({
          code: created.reservation.code,
          ticketsPath: `/ingressos/${created.reservation.code}`,
          pix,
          totalCents: created.reservation.totalCents,
          confirmed: false,
        })
        // No PIX (free event or missing key), WhatsApp becomes the path again.
        if (!pix) {
          openWhatsApp(created.reservation.code, created.ticketsUrl)
        }
        toast.success(
          pix
            ? 'Reserva registrada! Pague o PIX para liberar os ingressos.'
            : free
              ? 'Reserva registrada! Confirme pelo WhatsApp.'
              : 'Reserva registrada! Confirme o pagamento pelo WhatsApp.'
        )
      } else if (created.retryable) {
        // The server did not answer, but the sale cannot die here: WhatsApp
        // still carries the full order for staff to enter by hand.
        openWhatsApp(null, null)
        toast.warning(`${created.error} Enviamos sua reserva pelo WhatsApp.`)
      } else {
        // The server said no (a CPF the acquirer refused, reservations closed):
        // the buyer fixes the field and tries again.
        toast.error(created.error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (result?.confirmed) {
    return (
      <div
        id="ingressos"
        className="scroll-mt-28 rounded-2xl border border-green-500/40 bg-card p-6 md:p-8"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-xl bg-green-500/15 p-2.5 text-green-500">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-heading text-xl font-bold md:text-2xl">
              Pagamento confirmado!
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Reserva <span className="font-mono font-bold text-foreground">{result.code}</span>.
              Cada pessoa já tem o QR Code de entrada — também mandamos tudo por e-mail.
            </p>
          </div>
        </div>
        <Button asChild size="lg" className="gap-2">
          <Link to={result.ticketsPath}>
            <Ticket className="h-5 w-5" />
            Abrir meus ingressos
          </Link>
        </Button>
      </div>
    )
  }

  if (result) {
    return (
      <div
        id="ingressos"
        className="scroll-mt-28 rounded-2xl border border-primary/30 bg-card p-6 md:p-8"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-xl bg-primary/15 p-2.5 text-primary">
            <Ticket className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-heading text-xl font-bold md:text-2xl">Reserva registrada!</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Código <span className="font-mono font-bold text-foreground">{result.code}</span>.
              Guarde o link abaixo: é onde seus ingressos aparecem.
            </p>
          </div>
        </div>

        {result.pix ? (
          <>
            <ReservationPixPanel
              code={result.code}
              pix={result.pix}
              totalCents={result.totalCents}
              className="mt-1"
            />
            {result.pix.provider === 'pagarme' && (
              <p
                role="status"
                className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Aguardando o pagamento — esta tela atualiza sozinha.
              </p>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm leading-relaxed">
            Os ingressos ficam <strong>aguardando confirmação</strong> até a equipe conferir o
            pagamento pelo WhatsApp. Depois disso, cada pessoa ganha um QR Code próprio — e ele
            vale uma única entrada.
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="gap-2">
            <Link to={result.ticketsPath}>
              <Ticket className="h-5 w-5" />
              Ver meus ingressos
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="gap-2"
            onClick={() => openWhatsApp(result.code, null)}
          >
            <MessageCircle className="h-5 w-5" />
            {result.pix ? 'Falar no WhatsApp' : 'Reabrir WhatsApp'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      id="ingressos"
      className="scroll-mt-28 rounded-2xl border border-primary/20 bg-card p-6 shadow-sm md:p-8"
    >
      <div className="mb-6 flex items-start gap-3">
        <div className="rounded-xl bg-primary/15 p-2.5 text-primary">
          <Ticket className="h-6 w-6" />
        </div>
        <div>
          <h3 className="font-heading text-xl font-bold md:text-2xl">
            Reserve seu ingresso online
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Um ingresso nominal por pessoa, com QR Code de entrada.
            {unit != null && (
              <>
                {' '}
                Valor:{' '}
                <span className="font-semibold text-foreground">{formatBRL(unit, currency)}</span>{' '}
                por pessoa.
              </>
            )}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="evt-name">Nome de quem está reservando</Label>
          <Input
            id="evt-name"
            required
            autoComplete="name"
            value={buyer.name}
            onChange={(e) => {
              const name = e.target.value
              setBuyer((b) => ({ ...b, name }))
              // The first ticket is usually the reserver's; it can still be changed.
              if (!firstNameTouched) {
                setAttendees((current) => current.map((a, i) => (i === 0 ? { ...a, name } : a)))
              }
            }}
            placeholder="Como no documento"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="evt-phone">Telefone / WhatsApp</Label>
          <Input
            id="evt-phone"
            type="tel"
            required
            autoComplete="tel"
            value={buyer.phone}
            onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })}
            placeholder="(21) 99999-9999"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="evt-email">E-mail</Label>
          <Input
            id="evt-email"
            type="email"
            required
            autoComplete="email"
            value={buyer.email}
            onChange={(e) => setBuyer({ ...buyer, email: e.target.value })}
            placeholder="voce@email.com"
          />
        </div>

        {needsDocument && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="evt-document">CPF de quem paga</Label>
            <Input
              id="evt-document"
              required
              inputMode="numeric"
              autoComplete="off"
              maxLength={14}
              value={buyer.document}
              onChange={(e) => setBuyer({ ...buyer, document: maskCPF(e.target.value) })}
              placeholder="000.000.000-00"
            />
            <p className="text-xs text-muted-foreground">
              Exigido pela operadora para emitir o PIX.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="evt-qty">Quantas pessoas</Label>
          <Input
            id="evt-qty"
            type="number"
            required
            min={1}
            {...(max == null ? {} : { max })}
            value={attendees.length}
            onChange={(e) => setQuantity(Number(e.target.value) || 1)}
          />
        </div>

        <div className="flex flex-col justify-end gap-1.5">
          <Label>Total estimado</Label>
          <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 font-heading text-lg font-bold">
            {unit == null ? 'A combinar' : formatBRL(total, currency)}
          </div>
        </div>

        <div className="space-y-3 sm:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <Label>Quem vai entrar</Label>
            <span className="text-xs text-muted-foreground">
              O nome fica impresso no ingresso
            </span>
          </div>

          {attendees.map((attendee, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"
            >
              <Input
                required
                aria-label={`Nome da pessoa ${index + 1}`}
                value={attendee.name}
                onChange={(e) => updateAttendee(index, { name: e.target.value })}
                placeholder={`Nome da pessoa ${index + 1}`}
              />
              <select
                aria-label={`Tipo de ingresso da pessoa ${index + 1}`}
                className={`${SELECT_CLASS} sm:w-56`}
                value={attendee.kind}
                onChange={(e) => updateAttendee(index, { kind: e.target.value as TicketKind })}
              >
                {(Object.keys(TICKET_KIND_LABEL) as TicketKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {TICKET_KIND_LABEL[kind]}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover pessoa ${index + 1}`}
                disabled={attendees.length === 1}
                onClick={() => setAttendees((current) => current.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={max != null && attendees.length >= max}
            onClick={() => setQuantity(attendees.length + 1)}
          >
            <Plus className="h-4 w-4" />
            Adicionar pessoa
          </Button>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="evt-notes">Observações (opcional)</Label>
          <textarea
            id="evt-notes"
            rows={3}
            value={buyer.notes}
            onChange={(e) => setBuyer({ ...buyer, notes: e.target.value })}
            placeholder="Ex.: chegamos mais tarde, criança de colo…"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          />
        </div>

        <div className="flex flex-col gap-3 pt-1 sm:col-span-2 sm:flex-row sm:items-center">
          <Button type="submit" disabled={submitting} className="gap-2" size="lg">
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Ticket className="h-5 w-5" />
            )}
            {submitting
              ? 'Gerando o PIX…'
              : needsDocument
                ? 'Reservar e pagar com PIX'
                : 'Reservar ingresso'}
          </Button>
          {event.ticketReservation.notes && (
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              {event.ticketReservation.notes}
            </p>
          )}
        </div>
      </form>
    </div>
  )
}

export default EventTicketForm
