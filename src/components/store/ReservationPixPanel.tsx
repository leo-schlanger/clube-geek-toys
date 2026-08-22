import { toast } from 'sonner'
import { PixPaymentPanel } from './PixPaymentPanel'
import { resendPaymentLink, type ReservationPix } from '../../lib/event-tickets'

interface Props {
  code: string
  pix: ReservationPix
  /** Total da reserva em centavos — a fonte do valor mostrado. */
  totalCents: number
  className?: string
}

/** PIX da reserva, com reenvio por e-mail para quem já fechou a aba. */
export function ReservationPixPanel({ code, pix, totalCents, className }: Props) {
  async function handleResend() {
    const result = await resendPaymentLink(code)
    if (result.ok) toast.success(`Enviamos o código PIX para ${result.email}.`)
    else toast.error(result.error)
  }

  return (
    <PixPaymentPanel
      emvCode={pix.emvCode}
      pixKey={pix.pixKey}
      merchantName={pix.merchantName}
      amount={totalCents / 100}
      reference={code}
      referenceLabel="Reserva"
      description="Assim que o pagamento cair, a equipe confirma e cada pessoa recebe o QR Code de entrada."
      onResend={handleResend}
      className={className}
    />
  )
}

export default ReservationPixPanel
