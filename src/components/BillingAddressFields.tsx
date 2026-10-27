import { useRef, useState } from 'react'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { lookupCep, maskCep } from '../lib/shipping'
import {
  BRAZILIAN_UFS,
  type BillingAddressInput,
} from '../lib/billing-address'

/**
 * Billing address for a club charge. Same fields as the shop checkout, without
 * the freight quote: nothing is shipped. CEP lookup fills empty lines and
 * leaves a street the member already typed alone, including when the lookup
 * fails.
 */
export function BillingAddressFields({
  value,
  onChange,
  idPrefix = 'bill',
}: {
  value: BillingAddressInput
  onChange: (next: BillingAddressInput) => void
  idPrefix?: string
}) {
  const [looking, setLooking] = useState(false)
  // The lookup resolves after the member has moved on to the next field; merge
  // into what is on screen then, not into the value captured at blur.
  const latest = useRef(value)
  latest.current = value

  function patch(partial: Partial<BillingAddressInput>) {
    onChange({ ...value, ...partial })
  }

  async function handleCepBlur() {
    const digits = value.cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setLooking(true)
    try {
      const found = await lookupCep(digits)
      const now = latest.current
      if (now.cep.replace(/\D/g, '') !== digits) return
      onChange({
        ...now,
        street: now.street.trim() ? now.street : found.street,
        neighborhood: now.neighborhood.trim() ? now.neighborhood : found.neighborhood,
        city: now.city.trim() ? now.city : found.city,
        state: now.state.trim() ? now.state : found.state.toUpperCase().slice(0, 2),
      })
    } catch {
      // A missed lookup must not wipe what was typed.
    } finally {
      setLooking(false)
    }
  }

  return (
    <div data-testid="billing-address" className="space-y-3">
      <div>
        <p className="text-sm font-medium">Endereço de cobrança</p>
        <p className="text-xs text-muted-foreground">
          O banco usa este endereço para validar o cartão. Nada é enviado pelos Correios.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-cep`}>CEP</Label>
          <Input
            id={`${idPrefix}-cep`}
            value={value.cep}
            onChange={(e) => patch({ cep: maskCep(e.target.value) })}
            onBlur={() => void handleCepBlur()}
            placeholder="00000-000"
            inputMode="numeric"
            autoComplete="postal-code"
          />
        </div>
        <div className="flex items-end">
          {looking ? (
            <p className="pb-2 text-xs text-muted-foreground">Buscando…</p>
          ) : (
            <p className="pb-2 text-xs text-muted-foreground">O CEP preenche a rua e a cidade.</p>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-street`}>Rua</Label>
        <Input
          id={`${idPrefix}-street`}
          value={value.street}
          onChange={(e) => patch({ street: e.target.value })}
          autoComplete="address-line1"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-number`}>Número</Label>
          <Input
            id={`${idPrefix}-number`}
            value={value.number}
            onChange={(e) => patch({ number: e.target.value })}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-complement`}>Complemento</Label>
          <Input
            id={`${idPrefix}-complement`}
            value={value.complement}
            onChange={(e) => patch({ complement: e.target.value })}
            placeholder="Apto, bloco…"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-neighborhood`}>Bairro</Label>
        <Input
          id={`${idPrefix}-neighborhood`}
          value={value.neighborhood}
          onChange={(e) => patch({ neighborhood: e.target.value })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-city`}>Cidade</Label>
          <Input
            id={`${idPrefix}-city`}
            value={value.city}
            onChange={(e) => patch({ city: e.target.value })}
            autoComplete="address-level2"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-state`}>UF</Label>
          <select
            id={`${idPrefix}-state`}
            value={value.state}
            onChange={(e) => patch({ state: e.target.value })}
            className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">UF</option>
            {BRAZILIAN_UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
