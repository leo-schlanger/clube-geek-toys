import { useState } from 'react'
import { Ticket, X, Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { checkCoupon, MAX_COUPON_CODE_LENGTH } from '../../lib/promo'
import type { AppliedCouponLike } from '../../lib/shop-discount'

interface CouponFieldProps {
  subtotal: number
  email?: string
  applied: AppliedCouponLike | null
  onApply: (coupon: AppliedCouponLike | null) => void
  /**
   * The label of the discount that beat this coupon, when one did.
   *
   * Silence here would be worse than the rejection: the customer types a valid
   * code, the total does not move, and nothing on the page says why. Only one
   * discount is ever applied, so say which one won.
   */
  beaten?: string | null
}

export function CouponField({ subtotal, email, applied, onApply, beaten }: CouponFieldProps) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const typed = code.trim()
    if (!typed) return
    setChecking(true)
    setError(null)
    // The answer is advisory — the server prices the order again and only takes
    // the use there, so a code that passes here can still be refused if
    // somebody spends the last one in between.
    const result = await checkCoupon(typed, subtotal, email)
    setChecking(false)

    if (!result.valid) {
      setError(result.message)
      onApply(null)
      return
    }
    onApply({ code: result.code, percent: result.percent })
    setCode('')
    setOpen(false)
  }

  function remove() {
    onApply(null)
    setError(null)
    setCode('')
  }

  if (applied) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-green-600/40 bg-green-600/5 px-2.5 py-1.5">
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-green-700 dark:text-green-500">
            <Ticket className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate font-medium">{applied.code}</span>
          </span>
          <button
            type="button"
            onClick={remove}
            aria-label={`Remover cupom ${applied.code}`}
            className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {beaten && (
          <p className="text-xs text-muted-foreground">
            {beaten} é maior, então foi ele que valeu — só um desconto se aplica por pedido.
          </p>
        )}
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        <Ticket className="h-3.5 w-3.5" aria-hidden />
        Tenho um cupom
      </button>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Inside the checkout <form>: without this, Enter submits the
              // order instead of checking the code.
              e.preventDefault()
              void submit()
            }
          }}
          placeholder="Código do cupom"
          aria-label="Código do cupom"
          maxLength={MAX_COUPON_CODE_LENGTH}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="h-9"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void submit()}
          disabled={checking || !code.trim()}
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
