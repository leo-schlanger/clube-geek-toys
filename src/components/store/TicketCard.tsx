import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle2, Clock, Ticket, XCircle } from 'lucide-react'
import { TICKET_KIND_LABEL } from '../../data/event'
import { TICKET_STATUS_LABEL, type PublicTicket } from '../../lib/event-tickets'

/**
 * The ticket.
 *
 * The QR encodes this ticket's public URL, so door staff can scan with any
 * reader and land on the page with the current status — and status is what
 * matters: `used` means this code already entered, print or not.
 */
export function TicketCard({ ticket }: { ticket: PublicTicket }) {
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/ingresso/${ticket.code}`
      : `/ingresso/${ticket.code}`

  const usedAt = ticket.usedAt ? new Date(ticket.usedAt) : null
  const tone =
    ticket.status === 'valid'
      ? { border: 'border-green-500/60', bg: 'bg-green-500/10', text: 'text-green-500', Icon: CheckCircle2 }
      : ticket.status === 'used'
        ? { border: 'border-amber-500/60', bg: 'bg-amber-500/10', text: 'text-amber-500', Icon: Clock }
        : ticket.status === 'cancelled'
          ? { border: 'border-destructive/60', bg: 'bg-destructive/10', text: 'text-destructive', Icon: XCircle }
          : { border: 'border-border', bg: 'bg-muted/40', text: 'text-muted-foreground', Icon: Clock }

  const { Icon } = tone

  return (
    <div className={`overflow-hidden rounded-2xl border-2 ${tone.border} bg-card`}>
      <div className={`flex items-center gap-2 px-5 py-3 ${tone.bg} ${tone.text}`}>
        <Icon className="h-5 w-5 shrink-0" />
        <span className="font-heading text-sm font-bold uppercase tracking-wide">
          {TICKET_STATUS_LABEL[ticket.status]}
          {usedAt && ` · ${usedAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
        </span>
      </div>

      <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="mx-auto rounded-xl bg-white p-3">
          {/* Only a released ticket loads a QR: a pretty QR with pending
              payment is exactly the print the door must not accept. */}
          {ticket.status === 'valid' || ticket.status === 'used' ? (
            <QRCodeSVG value={url} size={148} level="M" includeMargin={false} />
          ) : (
            <div className="flex h-[148px] w-[148px] items-center justify-center text-center text-xs font-semibold text-slate-500">
              QR liberado após a confirmação do pagamento
            </div>
          )}
        </div>

        <div className="space-y-2 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ingresso nominal
          </p>
          <p className="font-heading text-2xl font-extrabold leading-tight">{ticket.attendeeName}</p>
          <p className="text-sm text-muted-foreground">{ticket.event.title}</p>
          <p className="text-sm text-muted-foreground">{ticket.event.locationName}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 sm:justify-start">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              {TICKET_KIND_LABEL[ticket.kind]}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 font-mono text-xs font-bold">
              <Ticket className="h-3.5 w-3.5" />
              {ticket.code}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TicketCard
