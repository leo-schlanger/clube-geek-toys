import { useState, useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Sparkles, Search as SearchIcon, Ticket } from 'lucide-react'
import type { Product, Category } from '../../types'
import { listProducts, listCategories } from '../../lib/products'
import {
  parseProductSort,
  parseCatalogPage,
  catalogPageCount,
  SHOP_CATALOG_PAGE_SIZE,
  type ProductSort,
} from '../../lib/product-sort'
import { ShopHeader } from '../../components/store/ShopHeader'
import { ProductGrid } from '../../components/store/ProductGrid'
import { CategoryNav } from '../../components/store/CategoryNav'
import { ProductSortSelect } from '../../components/store/ProductSortSelect'
import { CatalogPager } from '../../components/store/CatalogPager'
import { EventPromoCard } from '../../components/store/EventPromoCard'
import { useShopMember } from '../../components/store/useShopMember'
import { SeoHead, SHOP_DEFAULT_SEO } from '../../components/store/SeoHead'
import { PaymentTrustBadges } from '../../components/store/PaymentTrustBadges'
import { Button } from '../../components/ui/button'
import { isEventVisible } from '../../data/event'

/**
 * Vitrine principal da loja. Serve tanto a rota "/" quanto "/categoria/:slug",
 * e lê ?search=... do query param para filtrar por busca.
 */
export default function ShopHome() {
  const { slug: categorySlug } = useParams<{ slug: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search')?.trim() || ''
  const sort = parseProductSort(searchParams.get('sort'))
  const page = parseCatalogPage(searchParams.get('page'))

  const { isMember } = useShopMember()

  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)

  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
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
          sort,
          page,
          limit: SHOP_CATALOG_PAGE_SIZE,
        })
        if (active) {
          setProducts(res.products)
          setTotal(res.total)
          const pages = catalogPageCount(res.total, SHOP_CATALOG_PAGE_SIZE)
          if (res.total > 0 && page > pages) {
            const nextParams = new URLSearchParams(searchParams)
            if (pages <= 1) nextParams.delete('page')
            else nextParams.set('page', String(pages))
            setSearchParams(nextParams, { replace: true })
          }
        }
      } catch {
        if (active) {
          setProducts([])
          setTotal(0)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadProducts()

    return () => {
      active = false
    }
  }, [categorySlug, search, sort, page, searchParams, setSearchParams])

  function setSort(next: ProductSort) {
    const nextParams = new URLSearchParams(searchParams)
    if (next === 'newest') nextParams.delete('sort')
    else nextParams.set('sort', next)
    nextParams.delete('page')
    setSearchParams(nextParams, { replace: true })
  }

  function setPage(next: number) {
    const nextParams = new URLSearchParams(searchParams)
    if (next <= 1) nextParams.delete('page')
    else nextParams.set('page', String(next))
    setSearchParams(nextParams)
  }

  const activeCategory = categories.find((c) => c.slug === categorySlug)

  let heading = 'Todos os produtos'
  if (search) heading = `Resultados para "${search}"`
  else if (activeCategory) heading = activeCategory.name

  return (
    <div className="min-h-screen bg-background">
      <SeoHead
        title={
          search
            ? `Busca: ${search}`
            : activeCategory
              ? activeCategory.name
              : SHOP_DEFAULT_SEO.title
        }
        description={
          activeCategory?.description ||
          SHOP_DEFAULT_SEO.description
        }
        path={
          categorySlug
            ? `/categoria/${categorySlug}`
            : search
              ? `/?search=${encodeURIComponent(search)}`
              : '/'
        }
      />
      <ShopHeader isMember={isMember} />

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Hero — apenas na home sem filtros */}
        {!categorySlug && !search && (
          <section className="mb-8 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-background to-accent/10 p-6 sm:p-10">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Loja de K-pop no Rio de Janeiro
              </span>
              <h1 className="mt-3 text-2xl font-heading font-bold sm:text-4xl">
                Photocards, Merch e Cultura Geek e Kpop
              </h1>
              <p className="mt-2 text-muted-foreground">
                Envio pelos Correios para todo o Brasil. Membros do clube ganham{' '}
                <strong className="text-accent">15% de desconto</strong> em qualquer produto.
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
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {search ? (
                <SearchIcon className="h-5 w-5 text-muted-foreground" />
              ) : null}
              <h2 className="text-lg font-heading font-semibold">{heading}</h2>
            </div>
            <ProductSortSelect value={sort} onChange={setSort} />
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
          {!loading && (
            <CatalogPager
              page={page}
              total={total}
              pageSize={SHOP_CATALOG_PAGE_SIZE}
              onPageChange={setPage}
            />
          )}
        </section>
      </main>

      <footer className="mt-12 border-t py-8 text-center text-sm text-muted-foreground space-y-3">
        <p className="font-medium text-foreground">GeekPop &amp; Toys — Loja de K-pop no Rio de Janeiro</p>
        <PaymentTrustBadges className="mx-auto max-w-sm" center />
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
        <p className="text-xs">
          R. Barata Ribeiro, 181 - loja J · Copacabana, RJ · Envio Correios para todo o Brasil
        </p>
      </footer>
    </div>
  )
}
