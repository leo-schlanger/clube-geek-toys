import { Link } from 'react-router-dom'
import type { Category } from '../../types'
import { cn } from '../../lib/utils'
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
 * Navegação horizontal de categorias. Cada item linka para /categoria/:slug,
 * e "Todos" volta para a raiz da loja (ou basePath).
 */
export function CategoryNav({
  categories,
  activeSlug,
  loading = false,
  basePath = '',
  queryParam = false,
}: CategoryNavProps) {
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
      <Link to={allHref} className={pillClass(!activeSlug)}>
        Todos
      </Link>
      {categories.map((category) => (
        <Link
          key={category.id}
          to={catHref(category.slug)}
          className={pillClass(activeSlug === category.slug)}
        >
          {category.name}
        </Link>
      ))}
    </nav>
  )
}

export default CategoryNav
