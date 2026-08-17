import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../ui/button'
import { catalogPageCount } from '../../lib/product-sort'

interface CatalogPagerProps {
  page: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
}

/** Storefront pager; only rendered when the total exceeds one page. */
export function CatalogPager({ page, total, pageSize, onPageChange }: CatalogPagerProps) {
  const totalPages = catalogPageCount(total, pageSize)
  if (total <= pageSize) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <nav
      aria-label="Paginação do catálogo"
      className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="text-sm text-muted-foreground">
        {start}–{end} de {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        <span className="min-w-[5.5rem] text-center text-sm font-medium">
          Página {page} de {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Próxima
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  )
}

export default CatalogPager
