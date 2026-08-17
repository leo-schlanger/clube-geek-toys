import { Link, useSearchParams } from 'react-router-dom'
import type { Category } from '../../types'
import { isProductSort } from '../../lib/product-sort'
import { cn } from '../../lib/utils'
import { categoryIcon, guessCategoryIcon } from '../../lib/category-icons'
import { Skeleton } from '../ui/skeleton'

interface CategoryNavProps {
  categories: Category[]
  /** Slug da categoria atualmente selecionada (undefined = "Todos"). */
  activeSlug?: string
  loading?: boolean
  /** Base path for links: "" (default) or "/atacado". */
  basePath?: string
  /** Use ?category=slug instead of /categoria/:slug (atacado home). */
  queryParam?: boolean
}

/**
 * Horizontal category navigation. Each item links to /categoria/:slug, and
 * "all" returns to the shop root.
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
    <nav aria-label="Categorias" className="flex gap-2 overflow-x-auto pb-2">
      <Link to={withSort(allHref)} className={pillClass(!activeSlug)}>
        Todos
      </Link>
      {categories.map((category) => {
        const Icon = categoryIcon(category.icon) ?? categoryIcon(guessCategoryIcon(category.name))
        return (
          <Link
            key={category.id}
            to={withSort(catHref(category.slug))}
            className={cn(pillClass(activeSlug === category.slug), 'inline-flex items-center gap-1.5')}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
            {category.name}
          </Link>
        )
      })}
    </nav>
  )
}

export default CategoryNav
