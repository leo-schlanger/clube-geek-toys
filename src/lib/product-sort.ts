/**
 * Ordenação do catálogo (loja, atacado e aba admin).
 * `newest` é o padrão atual da API: destaques primeiro, depois data de postagem.
 */

export const PRODUCT_SORTS = [
  'newest',
  'oldest',
  'name',
  'name_desc',
  'price_asc',
  'price_desc',
] as const

export type ProductSort = (typeof PRODUCT_SORTS)[number]

export const DEFAULT_PRODUCT_SORT: ProductSort = 'newest'

/** Página do catálogo da loja / atacado (ORDER BY + LIMIT/OFFSET no banco). */
export const SHOP_CATALOG_PAGE_SIZE = 24
/** Página da aba admin de produtos. */
export const ADMIN_CATALOG_PAGE_SIZE = 25

export function parseCatalogPage(value: string | null | undefined): number {
  const n = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

export function catalogPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)))
}

export const PRODUCT_SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'newest', label: 'Mais recentes (postagem)' },
  { value: 'oldest', label: 'Mais antigos' },
  { value: 'name', label: 'A–Z (alfabética)' },
  { value: 'name_desc', label: 'Z–A' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
]

const SORT_SET = new Set<string>(PRODUCT_SORTS)

export function isProductSort(value: string | null | undefined): value is ProductSort {
  return Boolean(value && SORT_SET.has(value))
}

export function parseProductSort(value: string | null | undefined): ProductSort {
  return isProductSort(value) ? value : DEFAULT_PRODUCT_SORT
}

export interface SortableProduct {
  name: string
  price: number
  createdAt: string
}

function timeValue(iso: string): number {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : 0
}

/** Ordena uma lista já carregada (admin / testes). A loja ordena no servidor. */
export function sortProducts<T extends SortableProduct>(products: T[], sort: ProductSort): T[] {
  const copy = products.slice()
  copy.sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
      case 'name_desc':
        return b.name.localeCompare(a.name, 'pt-BR', { sensitivity: 'base' })
      case 'price_asc':
        return a.price - b.price || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
      case 'price_desc':
        return b.price - a.price || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
      case 'oldest':
        return timeValue(a.createdAt) - timeValue(b.createdAt)
      case 'newest':
      default:
        return timeValue(b.createdAt) - timeValue(a.createdAt)
    }
  })
  return copy
}
