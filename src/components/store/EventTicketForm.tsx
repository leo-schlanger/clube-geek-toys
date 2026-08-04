import { useState } from 'react'
import { MessageCircle, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  ACTIVE_EVENT,
  buildReservationWhatsAppUrl,
  type EventConfig,
} from '../../data/event'

type Props = {
  event?: EventConfig
}

export function EventTicketForm({ event = ACTIVE_EVENT }: Props) {
  const max = event.ticketReservation.maxPerReservation
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    quantity: 1,
    notes: '',
  })

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

  const unit = event.ticketReservation.priceBRL
  const total =
    unit == null ? null : unit * Math.min(Math.max(form.quantity, 1), max)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const qty = Math.min(Math.max(Number(form.quantity) || 1, 1), max)
    const url = buildReservationWhatsAppUrl({
      event,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      quantity: qty,
      notes: form.notes,
    })
    window.open(url, '_blank', 'noopener,noreferrer')
    toast.success('Abrindo WhatsApp com sua reserva…')
    setForm({ name: '', phone: '', email: '', quantity: 1, notes: '' })
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
            Preencha e envie pelo WhatsApp da loja para confirmar.
            {unit != null && (
              <>
                {' '}
                Valor:{' '}
                <span className="font-semibold text-foreground">
                  {event.ticketReservation.currencyLabel ?? 'R$'}{' '}
                  {unit.toFixed(2).replace('.', ',')}
                </span>{' '}
                por pessoa.
              </>
            )}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="evt-name">Nome completo</Label>
          <Input
            id="evt-name"
            required
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
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
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="voce@email.com"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="evt-qty">Quantidade</Label>
          <Input
            id="evt-qty"
            type="number"
            required
            min={1}
            max={max}
            value={form.quantity}
            onChange={(e) =>
              setForm({
                ...form,
                quantity: Math.min(Math.max(Number(e.target.value) || 1, 1), max),
              })
            }
          />
          <p className="text-xs text-muted-foreground">Máximo {max} por reserva</p>
        </div>

        <div className="flex flex-col justify-end gap-1.5">
          <Label>Total estimado</Label>
          <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 font-heading text-lg font-bold">
            {total == null
              ? 'A combinar'
              : `${event.ticketReservation.currencyLabel ?? 'R$'} ${total
                  .toFixed(2)
                  .replace('.', ',')}`}
          </div>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="evt-notes">Observações (opcional)</Label>
          <textarea
            id="evt-notes"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Ex.: nome dos acompanhantes…"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          />
        </div>

        <div className="flex flex-col gap-3 pt-1 sm:col-span-2 sm:flex-row sm:items-center">
          <Button
            type="submit"
            className="bg-[#25D366] text-white hover:bg-[#20ba5a] gap-2"
            size="lg"
          >
            <MessageCircle className="h-5 w-5" />
            Enviar reserva no WhatsApp
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
