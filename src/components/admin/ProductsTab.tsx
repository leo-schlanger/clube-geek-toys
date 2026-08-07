import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Loading } from '../ui/loading'
import { ProductModal } from './ProductModal'
import type { Product, Category } from '../../types'
import { adminListProducts, deleteProduct, listCategories } from '../../lib/products'
import { formatCurrency } from '../../lib/utils'
import { logger } from '../../lib/logger'
import { toast } from 'sonner'
import { Plus, Search, Package, Pencil, Trash2, Star, ImageOff } from 'lucide-react'

type ModalState = { mode: 'create' | 'edit'; product: Product | null } | null

export function ProductsTab() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalState>(null)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const [productsResult, cats] = await Promise.all([
        adminListProducts(),
        listCategories(),
      ])
      setProducts(productsResult.products)
      setCategories(cats)
    } catch (error) {
      logger.error('Error fetching products:', error)
      toast.error('Erro ao carregar produtos')
    }
    setLoading(false)
  }, [])

  const fetchCategories = useCallback(async () => {
    try {
      setCategories(await listCategories())
    } catch (error) {
      logger.error('Error fetching categories:', error)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/filter change
    fetchProducts()
  }, [fetchProducts])

  const handleDelete = useCallback(
    async (product: Product) => {
      if (!window.confirm(`Desativar o produto "${product.name}"?`)) return
      try {
        const ok = await deleteProduct(product.id)
        if (ok) {
          toast.success('Produto desativado')
          fetchProducts()
        } else {
          toast.error('Erro ao desativar produto')
        }
      } catch (error) {
        logger.error('Error deleting product:', error)
        toast.error('Erro ao desativar produto')
      }
    },
    [fetchProducts]
  )

  const term = search.trim().toLowerCase()
  const filtered = term
    ? products.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.sku?.toLowerCase().includes(term) ?? false) ||
          (p.categoryName?.toLowerCase().includes(term) ?? false)
      )
    : products

  // Produtos ativos sem imagem — prioridade visual para a Laura completar o catálogo
  const missingPhotoCount = products.filter(
    (p) => p.active && (!p.images || p.images.length === 0)
  ).length

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Produtos</CardTitle>
            <CardDescription>
              Gerencie o catálogo da loja
              {missingPhotoCount > 0 && (
                <span className="mt-1 block text-amber-600 dark:text-amber-400 font-medium">
                  {missingPhotoCount} produto(s) ativo(s) sem foto — edite e envie as imagens.
                </span>
              )}
            </CardDescription>
          </div>
          <Button onClick={() => setModal({ mode: 'create', product: null })}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Produto
          </Button>
        </div>

        {/* Busca */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, SKU ou categoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loading />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-3 px-4 font-medium text-sm">Produto</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Categoria</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Preço</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Estoque</th>
                  <th className="text-left py-3 px-4 font-medium text-sm">Status</th>
                  <th className="text-right py-3 px-4 font-medium text-sm">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const hasPhoto = Boolean(product.images?.[0])
                  return (
                  <tr
                    key={product.id}
                    className={`border-b hover:bg-muted/50 transition-colors ${!product.active ? 'opacity-50' : ''} ${product.active && !hasPhoto ? 'bg-amber-500/5' : ''}`}
                  >
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-12 w-12 rounded-lg overflow-hidden border bg-muted flex items-center justify-center shrink-0 ${
                            hasPhoto ? 'border-border' : 'border-amber-500/50'
                          }`}
                        >
                          {hasPhoto ? (
                            <img src={product.images[0]} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImageOff className="h-5 w-5 text-amber-600" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate flex items-center gap-1">
                            {product.featured && <Star className="h-3.5 w-3.5 text-yellow-500 shrink-0" />}
                            {product.name}
                          </p>
                          {product.sku && (
                            <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
                          )}
                          {product.active && !hasPhoto && (
                            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                              Sem foto — clique em editar para enviar
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-sm text-muted-foreground">
                      {product.categoryName || '—'}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col">
                        <span className="font-medium">{formatCurrency(product.price)}</span>
                        {product.compareAtPrice != null && product.compareAtPrice > product.price && (
                          <span className="text-xs text-muted-foreground line-through">
                            {formatCurrency(product.compareAtPrice)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <Badge variant={product.stock > 0 ? 'secondary' : 'destructive'}>
                        {product.stock > 0 ? `${product.stock} un.` : 'Esgotado'}
                      </Badge>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={product.active ? 'success' : 'outline'}>
                          {product.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                        {product.active && !hasPhoto && (
                          <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                            Sem foto
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setModal({ mode: 'edit', product })}
                          className="h-8 w-8 p-0"
                          title="Editar produto"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {product.active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(product)}
                            className="text-red-500 hover:text-red-600 hover:bg-red-500/10 h-8 w-8 p-0"
                            title="Desativar produto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="text-center py-12">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground font-medium">
                  {term ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {term
                    ? 'Tente ajustar a busca'
                    : 'Clique em "Novo Produto" para adicionar o primeiro item'}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {modal && (
        <ProductModal
          mode={modal.mode}
          product={modal.product}
          categories={categories}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setModal(null)
            fetchProducts()
          }}
          onCategoriesChange={fetchCategories}
        />
      )}
    </Card>
  )
}
