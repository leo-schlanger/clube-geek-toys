import { useMemo } from 'react'
import type { Product, ProductVariant } from '../../types'
import { cn } from '../../lib/utils'
import { formatCurrency } from '../../lib/utils'

interface VariantPickerProps {
  product: Product
  selected: Record<string, string>
  onChange: (next: Record<string, string>) => void
  /** Variante resolvida pela seleção atual (ou null se incompleta/esgotada). */
  matched: ProductVariant | null
}

/**
 * Seletor de variações: eixos (Cor, Tamanho, Material…) com botões de opção.
 * Mostra estoque/preço da combinação quando completa.
 */
export function VariantPicker({ product, selected, onChange, matched }: VariantPickerProps) {
  const axes = useMemo(() => product.variantAxes ?? [], [product.variantAxes])
  const variants = useMemo(
    () => (product.variants ?? []).filter((v) => v.active),
    [product.variants]
  )

  const availableFor = useMemo(() => {
    // Para cada eixo, quais opções ainda têm estoque dado o restante da seleção
    const map: Record<string, Set<string>> = {}
    for (const axis of axes) {
      map[axis.name] = new Set()
      for (const opt of axis.options) {
        const ok = variants.some((v) => {
          if ((v.options[axis.name] || '') !== opt) return false
          if (v.stock <= 0) return false
          for (const [k, val] of Object.entries(selected)) {
            if (k === axis.name) continue
            if (!val) continue
            if ((v.options[k] || '') !== val) return false
          }
          return true
        })
        if (ok) map[axis.name].add(opt)
      }
    }
    return map
  }, [axes, variants, selected])

  if (!product.hasVariants || axes.length === 0) return null

  return (
    <div className="mt-5 space-y-4">
      <h2 className="text-sm font-semibold">Variações</h2>
      {axes.map((axis) => (
        <div key={axis.name} className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {axis.name}
            {selected[axis.name] ? (
              <span className="ml-1 font-medium text-foreground">: {selected[axis.name]}</span>
            ) : (
              <span className="ml-1 text-xs">(escolha)</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {axis.options.map((opt) => {
              const isSelected = selected[axis.name] === opt
              const available = availableFor[axis.name]?.has(opt) ?? false
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={!available && !isSelected}
                  onClick={() =>
                    onChange({
                      ...selected,
                      [axis.name]: isSelected ? '' : opt,
                    })
                  }
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-sm transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : available
                        ? 'border-input hover:border-primary/50'
                        : 'cursor-not-allowed border-dashed opacity-40 line-through'
                  )}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {matched && (
        <p className="text-xs text-muted-foreground">
          SKU: {matched.sku || matched.name} · {formatCurrency(matched.price)} ·{' '}
          {matched.stock > 0 ? `${matched.stock} em estoque` : 'Esgotado'}
        </p>
      )}
      {!matched && axes.every((a) => selected[a.name]) && (
        <p className="text-xs text-destructive">Combinação indisponível. Escolha outra variação.</p>
      )}
    </div>
  )
}

/** Resolve variante ativa a partir da seleção de eixos. */
export function matchVariant(
  product: Product,
  selected: Record<string, string>
): ProductVariant | null {
  const axes = product.variantAxes ?? []
  if (!product.hasVariants || !axes.length) return null
  if (!axes.every((a) => selected[a.name])) return null
  const variants = (product.variants ?? []).filter((v) => v.active)
  return (
    variants.find((v) => axes.every((a) => (v.options[a.name] || '') === selected[a.name])) ?? null
  )
}
