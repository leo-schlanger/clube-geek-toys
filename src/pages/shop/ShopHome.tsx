import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Sparkles, Search as SearchIcon } from 'lucide-react'
import type { Product, Category } from '../../types'
import { listProducts, listCategories } from '../../lib/products'
import { ShopHeader } from '../../components/store/ShopHeader'
import { ProductGrid } from '../../components/store/ProductGrid'
import { CategoryNav } from '../../components/store/CategoryNav'
import { useShopMember } from '../../components/store/useShopMember'

/**
 * Vitrine principal da loja. Serve tanto a rota "/" quanto "/categoria/:slug",
 * e lê ?search=... do query param para filtrar por busca.
 */
export default function ShopHome() {
  const { slug: categorySlug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const search = searchParams.get('search')?.trim() || ''

  const { isMember } = useShopMember()

  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)

  const [products, setProducts] = useState<Product[]>([])
  const [featured, setFeatured] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  // Categorias (carregadas uma vez).
  useEffect(() => {
    let active = true
    listCategories()
      .then((cats) => {
        if (active) setCategories(cats)
      })
      .catch(() => {
        if (active) setCategories([])
      })
      .finally(() => {
        if (active) setCategoriesLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Destaques — só na home sem filtros de categoria/busca.
  useEffect(() => {
    let active = true

    async function loadFeatured() {
      if (categorySlug || search) {
        setFeatured([])
        return
      }
      try {
        const res = await listProducts({ featured: true, limit: 8 })
        if (active) setFeatured(res.products)
      } catch {
        if (active) setFeatured([])
      }
    }

    loadFeatured()

    return () => {
      active = false
    }
  }, [categorySlug, search])

  // Produtos (reagem a categoria e busca).
  useEffect(() => {
    let active = true

    async function loadProducts() {
      setLoading(true)
      try {
        const res = await listProducts({
          category: categorySlug || undefined,
          search: search || undefined,
          limit: 48,
        })
        if (active) setProducts(res.products)
      } catch {
        if (active) setProducts([])
      } finally {
        if (active) setLoading(false)
      }
    }

    loadProducts()

    return () => {
      active = false
    }
  }, [categorySlug, search])

  const activeCategory = categories.find((c) => c.slug === categorySlug)

  let heading = 'Todos os produtos'
  if (search) heading = `Resultados para "${search}"`
  else if (activeCategory) heading = activeCategory.name

  return (
    <div className="min-h-screen bg-background">
      <ShopHeader isMember={isMember} />

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Hero — apenas na home sem filtros */}
        {!categorySlug && !search && (
          <section className="mb-8 overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-violet-500/10 p-6 sm:p-10">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Loja oficial do Clube GeekPop & Toys
              </span>
              <h1 className="mt-3 text-2xl font-heading font-bold sm:text-4xl">
                Colecionáveis, games e cultura geek
              </h1>
              <p className="mt-2 text-muted-foreground">
                Membros do clube ganham <strong className="text-green-600">15% de desconto</strong> em
                qualquer produto. Entre e economize.
              </p>
            </div>
          </section>
        )}

        {/* Categorias */}
        <div className="mb-6">
          <CategoryNav
            categories={categories}
            activeSlug={categorySlug}
            loading={categoriesLoading}
          />
        </div>

        {/* Destaques */}
        {featured.length > 0 && (
          <section className="mb-10">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-heading font-semibold">Destaques</h2>
            </div>
            <ProductGrid products={featured} isMember={isMember} />
          </section>
        )}

        {/* Grade principal */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            {search ? (
              <SearchIcon className="h-5 w-5 text-muted-foreground" />
            ) : null}
            <h2 className="text-lg font-heading font-semibold">{heading}</h2>
          </div>
          <ProductGrid
            products={products}
            loading={loading}
            isMember={isMember}
            emptyMessage={
              search
                ? `Nenhum produto encontrado para "${search}".`
                : 'Nenhum produto disponível nesta categoria.'
            }
          />
        </section>
      </main>

      <footer className="mt-12 border-t py-6 text-center text-sm text-muted-foreground">
        <p>Clube Geek &amp; Toys — Loja oficial</p>
      </footer>
    </div>
  )
}
