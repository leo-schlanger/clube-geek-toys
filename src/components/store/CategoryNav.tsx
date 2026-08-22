import { Link, useSearchParams } from 'react-router-dom'
import type { Category } from '../../types'
import { isProductSort } from '../../lib/product-sort'
import { cn } from '../../lib/utils'
import { categoryIcon, guessCategoryIcon } from '../../lib/category-icons'
import { Skeleton } from '../ui/skeleton'

interface CategoryNavProps {
  categories: Category[]
  /** Currently selected category slug (undefined = "Todos"). */
  activeSlug?: string
  loading?: boolean
  /** Base path for links: "" (default) or "/atacado". */
  basePath?: string
  /** Use ?category=slug instead of /categoria/:slug (wholesale home). */
  queryParam?: boolean
}

/**
 * Horizontal category navigation. Each item links to /categoria/:slug, and
 * "all" returns to the shop root.
 *
 * Two rows when the selected branch has subcategories: parents on top, that
 * parent's children below. Only one level is drawn — the API refuses deeper
 * trees for exactly this reason.
 */
export function CategoryNav({
  categories,
  activeSlug,
  loading = false,
  basePath = '',
  queryParam = false,
}: CategoryNavProps) {
  const [searchParams] = useSearchParams()
  const sort = searchParams.get('sort')
  const sortQuery = isProductSort(sort) ? `sort=${encodeURIComponent(sort)}` : ''

  function withSort(href: string): string {
    if (!sortQuery) return href
    return href.includes('?') ? `${href}&${sortQuery}` : `${href}?${sortQuery}`
  }

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>
    )
  }

  if (categories.length === 0) return null

  const parents = categories.filter((c) => !c.parentId)
  const childrenOf = (parentId: string) => categories.filter((c) => c.parentId === parentId)

  // The active slug may be a child; the parent row must still show it selected.
  const active = categories.find((c) => c.slug === activeSlug)
  const activeParentId = active?.parentId ?? active?.id ?? null
  const subcategories = activeParentId ? childrenOf(activeParentId) : []

  const pillClass = (active: boolean) =>
    cn(
      'shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground'
    )

  const root = basePath || '/'
  const allHref = queryParam ? root : root === '/' ? '/' : root
  const catHref = (slug: string) =>
    queryParam
      ? `${basePath || '/'}?category=${encodeURIComponent(slug)}`
      : `${basePath}/categoria/${slug}`

  return (
    <div className="space-y-2">
      <nav aria-label="Categorias" className="flex gap-2 overflow-x-auto pb-2">
        <Link to={withSort(allHref)} className={pillClass(!activeSlug)}>
          Todos
        </Link>
        {parents.map((category) => {
          const Icon = categoryIcon(category.icon) ?? categoryIcon(guessCategoryIcon(category.name))
          return (
            <Link
              key={category.id}
              to={withSort(catHref(category.slug))}
              className={cn(
                pillClass(activeSlug === category.slug || category.id === activeParentId),
                'inline-flex items-center gap-1.5'
              )}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
              {category.name}
            </Link>
          )
        })}
      </nav>

      {subcategories.length > 0 && (
        <nav aria-label="Subcategorias" className="flex gap-2 overflow-x-auto pb-2 pl-1">
          {subcategories.map((sub) => (
            <Link
              key={sub.id}
              to={withSort(catHref(sub.slug))}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                activeSlug === sub.slug
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              {sub.name}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}

export default CategoryNav
