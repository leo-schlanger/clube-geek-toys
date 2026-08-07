import { useState, useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Sparkles, Search as SearchIcon, Ticket } from 'lucide-react'
import type { Product, Category } from '../../types'
import { listProducts, listCategories } from '../../lib/products'
import { ShopHeader } from '../../components/store/ShopHeader'
import { ProductGrid } from '../../components/store/ProductGrid'
import { CategoryNav } from '../../components/store/CategoryNav'
import { EventPromoCard } from '../../components/store/EventPromoCard'
import { useShopMember } from '../../components/store/useShopMember'
import { Button } from '../../components/ui/button'
import { isEventVisible } from '../../data/event'

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
          <section className="mb-8 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-background to-accent/10 p-6 sm:p-10">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Loja oficial GeekPop & Toys
              </span>
              <h1 className="mt-3 text-2xl font-heading font-bold sm:text-4xl">
                Colecionáveis, K-pop e cultura geek
              </h1>
              <p className="mt-2 text-muted-foreground">
                Membros do clube ganham <strong className="text-accent">15% de desconto</strong> em
                qualquer produto. Entre e economize.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline" className="gap-2 border-primary/40">
                  <a href="https://club.geeketoys.com.br/assinar" target="_blank" rel="noopener noreferrer">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Entrar no Clube
                  </a>
                </Button>
                {isEventVisible() && (
                  <Button asChild className="gap-2" size="sm">
                    <Link to="/evento">
                      <Ticket className="h-4 w-4" />
                      Evento &amp; ingressos
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Destaque do evento ativo */}
        {!categorySlug && !search && <EventPromoCard />}

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

      <footer className="mt-12 border-t py-6 text-center text-sm text-muted-foreground space-y-2">
        <p>GeekPop &amp; Toys — Loja oficial</p>
        <p>
          <a
            href="https://wa.me/5511914662881"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            WhatsApp loja (11) 91466-2881
          </a>
          {' · '}
          <a
            href="https://wa.me/5521985464666"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            (21) 98546-4666
          </a>
        </p>
      </footer>
    </div>
  )
}
