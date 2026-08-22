import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Building2, Package, ShieldCheck, Clock, AlertCircle, Megaphone } from 'lucide-react'
import type { Product, Category } from '../../types'
import { WHOLESALE_SHOP_DISCOUNT } from '../../types'
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
import { useWholesaleAccount } from '../../components/store/useWholesaleAccount'
import { useWholesaleSalesOpen } from '../../components/store/useWholesaleSalesOpen'
import { SeoHead } from '../../components/store/SeoHead'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { formatCurrency } from '../../lib/utils'

/**
 * Wholesale catalogue. Lists only wholesale_enabled products, with the 25%
 * discount applied server-side for approved accounts. With no SKUs it renders
 * an empty state with a signup call to action.
 *
 * While `wholesale.sales_open` is off the channel is a waitlist: catalogue and
 * CNPJ signup stay up, with no cart — shops register and we notify when it opens.
 */
export default function WholesaleHome() {
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search')?.trim() || ''
  const categorySlug = searchParams.get('category')?.trim() || ''
  const sort = parseProductSort(searchParams.get('sort'))
  const page = parseCatalogPage(searchParams.get('page'))

  const { account, isApproved, isPending, loading: accLoading } = useWholesaleAccount()
  const { salesOpen, loading: salesLoading } = useWholesaleSalesOpen()

  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    listCategories()
      .then((cats) => {
        if (active) setCategories(cats)
      })
      .catch(() => {
        if (active) setCategories([])
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const res = await listProducts({
          search: search || undefined,
          category: categorySlug || undefined,
          sort,
          page,
          wholesale: true,
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
    load()
    return () => {
      active = false
    }
  }, [search, categorySlug, sort, page, searchParams, setSearchParams])

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

  const discountPct = Math.round(WHOLESALE_SHOP_DISCOUNT * 100)

  return (
    <div className="min-h-screen bg-background">
      <SeoHead
        title="Atacado | GeekPop & Toys"
        description={
          salesOpen
            ? `Compras no atacado com ${discountPct}% de desconto para empresas com CNPJ. Cadastro e aprovação necessários.`
            : 'Ainda não vendemos no atacado. Cadastre o CNPJ da sua loja e avisamos assim que o canal abrir.'
        }
        path="/atacado"
      />
      <ShopHeader isWholesale />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-6 w-6 text-primary" />
                <h1 className="font-heading text-2xl font-bold sm:text-3xl">Atacado B2B</h1>
                <Badge className="bg-primary text-primary-foreground">
                  {salesOpen ? `${discountPct}% OFF` : 'Cadastro aberto'}
                </Badge>
              </div>
              <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
                {salesOpen ? (
                  <>
                    Canal exclusivo para empresas com CNPJ. Desconto de {discountPct}% aplicado no
                    checkout após aprovação. Vendemos atacado quando houver disponibilidade e o CNPJ
                    estiver de acordo com o objeto da compra.
                  </>
                ) : (
                  <>
                    Canal exclusivo para empresas com CNPJ. O cadastro já está aberto e, quando
                    começarmos a vender no atacado, contas aprovadas compram com {discountPct}% de
                    desconto.
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!account && (
                <>
                  <Button asChild>
                    <Link to="/atacado/cadastro">Cadastrar CNPJ</Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/atacado/entrar">Entrar no atacado</Link>
                  </Button>
                </>
              )}
              {isPending && (
                <Badge variant="outline" className="gap-1 px-3 py-2 text-sm">
                  <Clock className="h-4 w-4" />
                  Aguardando aprovação
                </Badge>
              )}
              {isApproved && account && (
                <Badge className="gap-1 bg-emerald-600 px-3 py-2 text-sm text-white">
                  <ShieldCheck className="h-4 w-4" />
                  Aprovado · CNPJ {account.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}
                </Badge>
              )}
            </div>
          </div>

          {account?.status === 'rejected' && (
            <div className="mt-4 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
              <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-medium">Cadastro recusado</p>
                <p className="text-muted-foreground">
                  {account.rejectionReason || 'Fale com a loja para mais informações.'}
                </p>
              </div>
            </div>
          )}

          {isApproved && salesOpen && (
            <p className="mt-4 text-sm text-muted-foreground">
              Preço de vitrine com preview de −{discountPct}% · desconto real recalculado no servidor.
              Ex.: item de R$ 100 →{' '}
              <span className="font-medium text-foreground">
                {formatCurrency(100 * (1 - WHOLESALE_SHOP_DISCOUNT))}
              </span>
            </p>
          )}
        </div>

        {!salesLoading && !salesOpen && (
          <div className="mb-6 flex gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
            <Megaphone className="h-5 w-5 shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Ainda não estamos vendendo no atacado</p>
              <p className="text-muted-foreground">
                Mas o cadastro já está aberto: registre o CNPJ da sua loja e entramos em contato
                assim que começarmos a vender no atacado.
              </p>
              {isPending && (
                <p className="text-muted-foreground">
                  Seu cadastro já está com a gente — não precisa fazer de novo.
                </p>
              )}
            </div>
          </div>
        )}

        {salesOpen && !accLoading && !isApproved && account?.status !== 'rejected' && (
          <div className="mb-6 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            {isPending
              ? 'Seu cadastro está em análise. Assim que o CNPJ for aprovado (atividade alinhada ao que você compra), o desconto de atacado será liberado no checkout.'
              : 'Para comprar no atacado, cadastre-se com CNPJ válido. Após aprovação da loja, o desconto de 25% é liberado.'}
          </div>
        )}

        {categories.length > 0 && (
          <div className="mb-6">
            <CategoryNav
              categories={categories}
              activeSlug={categorySlug || undefined}
              basePath="/atacado"
              queryParam
            />
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed py-16 text-center">
            <Package className="h-12 w-12 text-muted-foreground" />
            <div>
              <h2 className="font-heading text-lg font-semibold">Catálogo atacado em preparação</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {salesOpen
                  ? 'Produtos entram aqui quando forem liberados para venda no atacado (antes ou após a importação de estoque).'
                  : 'Enquanto isso, deixe o CNPJ da sua loja cadastrado — avisamos assim que o atacado abrir.'}
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/">Ver loja varejo</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {total} produto{total === 1 ? '' : 's'}{' '}
                {salesOpen
                  ? `disponíve${total === 1 ? 'l' : 'is'} no atacado`
                  : `que entra${total === 1 ? '' : 'm'} no atacado quando abrirmos`}
              </p>
              <ProductSortSelect value={sort} onChange={setSort} id="wholesale-product-sort" />
            </div>
            <ProductGrid
              products={products}
              isWholesale
              isWholesaleApproved={isApproved}
              canBuy={salesOpen}
            />
            <CatalogPager
              page={page}
              total={total}
              pageSize={SHOP_CATALOG_PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </main>
    </div>
  )
}
