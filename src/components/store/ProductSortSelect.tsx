import { ArrowUpDown } from 'lucide-react'
import { PRODUCT_SORT_OPTIONS, type ProductSort } from '../../lib/product-sort'
import { cn } from '../../lib/utils'

interface ProductSortSelectProps {
  value: ProductSort
  onChange: (sort: ProductSort) => void
  className?: string
  id?: string
}

/** Select nativo de ordenação do catálogo (A–Z, postagem, preço). */
export function ProductSortSelect({ value, onChange, className, id = 'product-sort' }: ProductSortSelectProps) {
  return (
    <label
      htmlFor={id}
      className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}
    >
      <ArrowUpDown className="h-4 w-4 shrink-0" aria-hidden />
      <span className="hidden sm:inline">Ordenar</span>
      <select
        id={id}
        aria-label="Ordenar produtos"
        value={value}
        onChange={(e) => onChange(e.target.value as ProductSort)}
        className="h-9 min-w-[11.5rem] rounded-md border border-input bg-background px-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {PRODUCT_SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default ProductSortSelect
