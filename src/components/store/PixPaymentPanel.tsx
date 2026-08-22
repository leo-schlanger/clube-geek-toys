import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, Loader2, Mail, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { formatCurrency } from '../../lib/utils'
import { usePixExitGuard } from '../../hooks/usePixExitGuard'

interface Props {
  /** EMV copy-paste payload; also the QR content. */
  emvCode: string
  pixKey: string
  /** Amount in BRL. */
  amount: number
  /** Order/reservation code, for the customer to quote if paying by key. */
  reference: string
  referenceLabel?: string
  merchantName?: string
  title?: string
  description?: string
  /** When set, shows "Reenviar por e-mail". */
  onResend?: () => Promise<void>
  className?: string
}

/** On-screen PIX for a shop order or a ticket reservation. Manual settlement. */
export function PixPaymentPanel({
  emvCode,
  pixKey,
  amount,
  reference,
  referenceLabel = 'Pedido',
  merchantName,
  title = 'Pague por PIX',
  description,
  onResend,
  className,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)

  usePixExitGuard(true)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(emvCode)
      setCopied(true)
      toast.success('Código PIX copiado! Cole no app do seu banco.')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('Não foi possível copiar. Selecione o código e copie à mão.')
    }
  }

  async function handleResend() {
    if (!onResend) return
    setSending(true)
    try {
      await onResend()
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className={`rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-6 ${className ?? ''}`}
    >
      <div className="flex items-center gap-2">
        <QrCode className="h-5 w-5 text-primary" />
        <h3 className="font-heading text-lg font-bold">{title}</h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Total: <strong className="text-foreground">{formatCurrency(amount)}</strong>.{' '}
        {description ?? 'Assim que o pagamento cair, a equipe confirma e você é avisada por e-mail.'}
      </p>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <QRCodeSVG value={emvCode} size={168} level="M" />
        </div>

        <div className="w-full min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              PIX Copia e Cola
            </p>
            <p className="mt-1 max-h-24 overflow-y-auto break-all rounded-md border bg-background p-2 font-mono text-[11px] leading-relaxed">
              {emvCode}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleCopy} className="flex-1 sm:flex-none">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copiado!' : 'Copiar código'}
            </Button>
            {onResend && (
              <Button
                variant="outline"
                onClick={handleResend}
                disabled={sending}
                className="flex-1 sm:flex-none"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Reenviar por e-mail
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {merchantName && (
              <>
                Recebedor: <strong className="text-foreground">{merchantName}</strong> ·{' '}
              </>
            )}
            chave <strong className="text-foreground">{pixKey}</strong>. {referenceLabel}{' '}
            <strong className="text-foreground">{reference}</strong> — informe esse código se pagar
            pela chave.
          </p>
        </div>
      </div>
    </div>
  )
}

export default PixPaymentPanel
