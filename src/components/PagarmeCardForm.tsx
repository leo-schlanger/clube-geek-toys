/**
 * PagarmeCardForm — replaces StripePaymentForm.
 *
 * Stripe shipped an iframe that collected the card for us. Pagar.me does not,
 * so the fields are ours — but the data still never touches our server: the
 * form exchanges the card for a single-use token against `api.pagar.me` with
 * the public key, and hands only that token to `onToken`.
 *
 * Three consequences of that, which the code below is shaped by:
 *
 *  - **Nothing is stored.** No autofill name that a password manager would save
 *    as a login, no state kept after submit, no value ever logged.
 *  - **Validation is local first.** A Luhn check and an expiry check turn the
 *    provider's "recusado" into "confira o número", before a round-trip.
 *  - **The parent charges.** This component tokenizes and reports; it never
 *    knows the amount is actually being taken, so a decline is the parent's to
 *    display and to retry.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { CreditCard, Loader2, Lock } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  createCardToken,
  formatCardNumber,
  formatExpiry,
  getPaymentConfig,
  guessCardBrand,
  installmentOptions,
  isFutureExpiry,
  isPlausibleCardNumber,
  type PaymentConfig,
} from '../lib/pagarme'
import { isValidCPFFormat } from '../lib/cpf-validation'
import { isValidCnpj } from '../lib/cnpj'
import { formatCurrency } from '../lib/utils'

interface PagarmeCardFormProps {
  /** Total being charged, in reais. Drives the instalment list and the button. */
  amount: number
  /**
   * Called with the token and the chosen split. The parent runs the charge —
   * this component has done its job once the token exists.
   */
  onToken: (token: string, installments: number) => Promise<void> | void
  onCancel?: () => void
  submitLabel?: string
  /** Hide the instalment picker where splitting makes no sense (the R$12,50 plan). */
  allowInstallments?: boolean
  /** Pre-fills the holder document from the checkout, which already asked for it. */
  defaultDocument?: string
  /** Pre-fills the holder name from the buyer's name. */
  defaultHolderName?: string
}

interface FieldErrors {
  number?: string
  holderName?: string
  document?: string
  expiry?: string
  cvv?: string
}

const BRAND_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  elo: 'Elo',
  amex: 'American Express',
  hipercard: 'Hipercard',
}

export function PagarmeCardForm({
  amount,
  onToken,
  onCancel,
  submitLabel,
  allowInstallments = true,
  defaultDocument = '',
  defaultHolderName = '',
}: PagarmeCardFormProps) {
  const [config, setConfig] = useState<PaymentConfig | null>(null)
  const [number, setNumber] = useState('')
  const [holderName, setHolderName] = useState(defaultHolderName)
  const [holderDocument, setHolderDocument] = useState(defaultDocument)
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [installments, setInstallments] = useState(1)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    void getPaymentConfig().then((c) => {
      if (active) setConfig(c)
    })
    return () => {
      active = false
    }
  }, [])

  const brand = guessCardBrand(number)
  const options = config && allowInstallments ? installmentOptions(amount, config) : []
  const showInstallments = options.length > 1

  /**
   * Everything checkable without the network, checked at once.
   *
   * All errors are reported together rather than one per submit: a customer
   * with two typos should fix both in one pass, not discover the second after
   * the first is corrected.
   */
  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!isPlausibleCardNumber(number)) {
      next.number = 'Número de cartão inválido.'
    }
    if (holderName.trim().length < 3 || !holderName.trim().includes(' ')) {
      next.holderName = 'Digite o nome completo como está impresso no cartão.'
    }
    const digits = holderDocument.replace(/\D/g, '')
    const documentOk =
      digits.length === 11 ? isValidCPFFormat(digits) : digits.length === 14 && isValidCnpj(digits)
    if (!documentOk) {
      next.document = 'CPF ou CNPJ do titular inválido.'
    }
    const [month = '', year = ''] = expiry.split('/')
    if (!isFutureExpiry(month, year)) {
      next.expiry = 'Validade inválida ou vencida.'
    }
    // Amex uses four digits; everyone else three.
    const expectedCvv = brand === 'amex' ? 4 : 3
    if (cvv.replace(/\D/g, '').length !== expectedCvv) {
      next.cvv = `O código de segurança tem ${expectedCvv} dígitos.`
    }
    return next
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    if (!config?.publicKey) {
      setFormError('Pagamento com cartão indisponível no momento. Tente o PIX.')
      return
    }

    setSubmitting(true)
    try {
      const [month = '', year = ''] = expiry.split('/')
      const token = await createCardToken(
        {
          number,
          holderName,
          holderDocument,
          expMonth: month,
          expYear: year,
          cvv,
        },
        config.publicKey
      )

      // The card is gone from memory as soon as it has become a token. The
      // browser would drop it on unmount anyway; clearing here means it is not
      // sitting in state while the charge round-trips.
      setNumber('')
      setCvv('')
      setExpiry('')

      await onToken(token, installments)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível processar o cartão.'
      setFormError(message)
      // The parent charge failed after tokenization: let them try again.
      setSubmitting(false)
      return
    }
    setSubmitting(false)
  }

  const cvvLength = brand === 'amex' ? 4 : 3

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="card-number">Número do cartão</Label>
        <div className="relative">
          <Input
            id="card-number"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="0000 0000 0000 0000"
            value={formatCardNumber(number)}
            onChange={(e) => setNumber(e.target.value)}
            error={Boolean(errors.number)}
            disabled={submitting}
            className="pr-20 font-mono tracking-wide"
          />
          {brand && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
              {BRAND_LABEL[brand] ?? brand}
            </span>
          )}
        </div>
        {errors.number && <p className="text-xs text-red-500">{errors.number}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="card-holder">Nome impresso no cartão</Label>
        <Input
          id="card-holder"
          autoComplete="cc-name"
          placeholder="COMO ESTÁ NO CARTÃO"
          value={holderName}
          onChange={(e) => setHolderName(e.target.value)}
          error={Boolean(errors.holderName)}
          disabled={submitting}
          className="uppercase"
        />
        {errors.holderName && <p className="text-xs text-red-500">{errors.holderName}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="card-document">CPF do titular</Label>
        <Input
          id="card-document"
          inputMode="numeric"
          placeholder="000.000.000-00"
          value={holderDocument}
          onChange={(e) => setHolderDocument(e.target.value)}
          error={Boolean(errors.document)}
          disabled={submitting}
        />
        {errors.document && <p className="text-xs text-red-500">{errors.document}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="card-expiry">Validade</Label>
          <Input
            id="card-expiry"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/AA"
            value={formatExpiry(expiry)}
            onChange={(e) => setExpiry(e.target.value)}
            error={Boolean(errors.expiry)}
            disabled={submitting}
            className="font-mono"
          />
          {errors.expiry && <p className="text-xs text-red-500">{errors.expiry}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="card-cvv">Código de segurança</Label>
          <Input
            id="card-cvv"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder={'0'.repeat(cvvLength)}
            maxLength={cvvLength}
            value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
            error={Boolean(errors.cvv)}
            disabled={submitting}
            className="font-mono"
          />
          {errors.cvv && <p className="text-xs text-red-500">{errors.cvv}</p>}
        </div>
      </div>

      {showInstallments && (
        <div className="space-y-2">
          <Label htmlFor="card-installments">Parcelas</Label>
          <select
            id="card-installments"
            value={installments}
            onChange={(e) => setInstallments(Number(e.target.value))}
            disabled={submitting}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {options.map((opt) => (
              <option key={opt.installments} value={opt.installments}>
                {opt.installments}x de {formatCurrency(opt.amount)}
                {opt.installments > 1 ? ' sem juros' : ' à vista'}
              </option>
            ))}
          </select>
        </div>
      )}

      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400"
        >
          {formError}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5 text-green-500" />
        <span>
          Os dados do cartão vão direto para a Pagar.me. Nossos servidores não recebem nem guardam
          o número.
        </span>
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1"
          >
            Voltar
          </Button>
        )}
        <Button type="submit" disabled={submitting || !config} className="flex-1">
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processando...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4" />
              {submitLabel ?? `Pagar ${formatCurrency(amount)}`}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
