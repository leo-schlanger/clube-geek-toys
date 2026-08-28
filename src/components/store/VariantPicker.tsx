import { useMemo } from 'react'
import type { Product, ProductVariant } from '../../types'
import { cn } from '../../lib/utils'
import { formatCurrency } from '../../lib/utils'
import { availableStock } from '../../lib/products'

interface VariantPickerProps {
  product: Product
  selected: Record<string, string>
  onChange: (next: Record<string, string>) => void
  /** Variant resolved from the current selection; null if incomplete or sold out. */
  matched: ProductVariant | null
  /**
   * What the SKU line should quote. The page owns the pricing rules — the
   * online promotion, and the fact that wholesale is exempt from it — so the
   * SKU line takes the figure rather than recomputing it and contradicting the
   * price printed right above it.
   */
  displayPrice?: number
}

/**
 * Variant picker: one row of option buttons per axis. Options whose variant has
 * a photo render as swatches, and price and stock appear once the combination
 * is complete.
 */
export function VariantPicker({
  product,
  selected,
  onChange,
  matched,
  displayPrice,
}: VariantPickerProps) {
  const axes = useMemo(() => product.variantAxes ?? [], [product.variantAxes])
  const variants = useMemo(
    () => (product.variants ?? []).filter((v) => v.active),
    [product.variants]
  )

  const availableFor = useMemo(() => {
    // Per axis: which options still have stock given the rest of the selection
    const map: Record<string, Set<string>> = {}
    for (const axis of axes) {
      map[axis.name] = new Set()
      for (const opt of axis.options) {
        const ok = variants.some((v) => {
          if ((v.options[axis.name] || '') !== opt) return false
          if (availableStock(v) <= 0) return false
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

  /**
   * Prefers a variant matching the current selection; failing that, any active
   * variant with a photo for this option.
   */
  const optionImage = useMemo(() => {
    const map: Record<string, Record<string, string | null>> = {}
    for (const axis of axes) {
      map[axis.name] = {}
      for (const opt of axis.options) {
        const withOpt = variants.filter(
          (v) => (v.options[axis.name] || '') === opt && v.images?.length
        )
        const compatible = withOpt.find((v) => {
          for (const [k, val] of Object.entries(selected)) {
            if (k === axis.name) continue
            if (!val) continue
            if ((v.options[k] || '') !== val) return false
          }
          return true
        })
        map[axis.name][opt] = compatible?.images?.[0] ?? withOpt[0]?.images?.[0] ?? null
      }
    }
    return map
  }, [axes, variants, selected])

  const anyOptionHasImage = useMemo(
    () =>
      axes.some((axis) =>
        axis.options.some((opt) => Boolean(optionImage[axis.name]?.[opt]))
      ),
    [axes, optionImage]
  )

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
              const thumb = optionImage[axis.name]?.[opt]
              const showThumb = Boolean(thumb) || anyOptionHasImage

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
                    'group relative flex items-center gap-2 rounded-md border text-sm transition-colors',
                    showThumb ? 'p-1 pr-2.5' : 'px-3 py-1.5',
                    isSelected
                      ? 'border-primary bg-primary/10 font-medium text-primary ring-1 ring-primary/40'
                      : available
                        ? 'border-input hover:border-primary/50'
                        : 'cursor-not-allowed border-dashed opacity-40 line-through'
                  )}
                  title={opt}
                >
                  {showThumb && (
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted',
                        isSelected && 'ring-1 ring-primary/50'
                      )}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={opt}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </span>
                  )}
                  <span className={cn(showThumb && 'text-xs sm:text-sm')}>{opt}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {matched && (
        <p className="text-xs text-muted-foreground">
          SKU: {matched.sku || matched.name} · {formatCurrency(displayPrice ?? matched.price)} ·{' '}
          {availableStock(matched) > 0
            ? `${availableStock(matched)} em estoque`
            : 'Esgotado'}
        </p>
      )}
      {!matched && axes.every((a) => selected[a.name]) && (
        <p className="text-xs text-destructive">Combinação indisponível. Escolha outra variação.</p>
      )}
    </div>
  )
}

/** Resolves the active variant from the axis selection. */
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

/**
 * Gallery shown on the product page, in order of preference:
 * 1) complete combination with its own photos → the variant's photos
 * 2) partial selection → first matching variant that has photos
 * 3) fallback → the listing's photos
 */
export function resolveVariantImages(
  product: Product,
  selected: Record<string, string>,
  matched: ProductVariant | null
): string[] {
  if (matched?.images?.length) return matched.images

  const variants = (product.variants ?? []).filter((v) => v.active)
  if (variants.length && Object.values(selected).some(Boolean)) {
    const partial = variants.find((v) => {
      if (!v.images?.length) return false
      for (const [k, val] of Object.entries(selected)) {
        if (!val) continue
        if ((v.options[k] || '') !== val) return false
      }
      return true
    })
    if (partial?.images?.length) return partial.images
  }

  return product.images ?? []
}
