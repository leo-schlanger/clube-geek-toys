import { useState, useEffect, useRef } from 'react'
import { logger } from '../../lib/logger'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Loading } from '../ui/loading'
import type { Product, Category } from '../../types'
import {
  createProduct,
  updateProduct,
  uploadProductImages,
  createCategory,
  deleteCategory,
  type ProductInput,
} from '../../lib/products'
import { formatCurrency } from '../../lib/utils'
import { toast } from 'sonner'
import {
  X,
  Package,
  Upload,
  Link as LinkIcon,
  Trash2,
  Plus,
  Star,
  Tag,
  ImageOff,
} from 'lucide-react'

interface ProductModalProps {
  mode: 'create' | 'edit'
  product?: Product | null
  categories: Category[]
  onClose: () => void
  onSuccess: () => void
  /** Called after a category is created/removed so the parent can refetch. */
  onCategoriesChange?: () => void
}

interface FormState {
  name: string
  description: string
  price: string
  compareAtPrice: string
  categoryId: string
  stock: string
  sku: string
  active: boolean
  featured: boolean
}

function toFormState(product?: Product | null): FormState {
  return {
    name: product?.name ?? '',
    description: product?.description ?? '',
    price: product ? String(product.price) : '',
    compareAtPrice: product?.compareAtPrice != null ? String(product.compareAtPrice) : '',
    categoryId: product?.categoryId ?? '',
    stock: product?.stock != null ? String(product.stock) : '0',
    sku: product?.sku ?? '',
    active: product?.active ?? true,
    featured: product?.featured ?? false,
  }
}

export function ProductModal({
  mode,
  product,
  categories,
  onClose,
  onSuccess,
  onCategoriesChange,
}: ProductModalProps) {
  const isEditMode = mode === 'edit'

  const [form, setForm] = useState<FormState>(() => toFormState(product))
  const [loading, setLoading] = useState(false)

  // Image management. `images` holds URLs already saved / added by URL.
  // `pendingFiles` holds newly picked files that must be uploaded after the
  // product exists (upload requires a productId).
  const [images, setImages] = useState<string[]>(product?.images ?? [])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [imageUrl, setImageUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Inline category creation
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local form when the edited product changes
    setForm(toFormState(product))
    setImages(product?.images ?? [])
    setPendingFiles([])
  }, [product])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleAddImageUrl() {
    const url = imageUrl.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      toast.error('Informe uma URL válida (http/https)')
      return
    }
    setImages((prev) => [...prev, url])
    setImageUrl('')
  }

  function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setPendingFiles((prev) => [...prev, ...files])
    // Allow re-picking the same file later.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeExistingImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleCreateCategory() {
    const name = newCategoryName.trim()
    if (!name) return
    setCreatingCategory(true)
    try {
      const created = await createCategory({ name, active: true })
      if (created) {
        toast.success('Categoria criada')
        setNewCategoryName('')
        update('categoryId', created.id)
        onCategoriesChange?.()
      } else {
        toast.error('Erro ao criar categoria')
      }
    } catch (error) {
      logger.error('Error creating category:', error)
      toast.error('Erro ao criar categoria')
    }
    setCreatingCategory(false)
  }

  async function handleDeleteCategory(id: string, name: string) {
    if (!window.confirm(`Remover a categoria "${name}"? Os produtos vinculados ficarão sem categoria.`)) return
    try {
      const ok = await deleteCategory(id)
      if (ok) {
        toast.success('Categoria removida')
        if (form.categoryId === id) update('categoryId', '')
        onCategoriesChange?.()
      } else {
        toast.error('Erro ao remover categoria')
      }
    } catch (error) {
      logger.error('Error deleting category:', error)
      toast.error('Erro ao remover categoria')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const name = form.name.trim()
    if (name.length < 2) {
      toast.error('Informe o nome do produto')
      return
    }
    const price = Number(form.price)
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Preço inválido')
      return
    }

    const compareAtPrice = form.compareAtPrice.trim() ? Number(form.compareAtPrice) : null
    if (compareAtPrice != null && (!Number.isFinite(compareAtPrice) || compareAtPrice < 0)) {
      toast.error('Preço "de" inválido')
      return
    }

    const stock = form.stock.trim() ? Number(form.stock) : 0
    if (!Number.isInteger(stock) || stock < 0) {
      toast.error('Estoque inválido')
      return
    }

    const payload: ProductInput = {
      name,
      description: form.description.trim() || null,
      price,
      compareAtPrice,
      categoryId: form.categoryId || null,
      images,
      stock,
      sku: form.sku.trim() || null,
      active: form.active,
      featured: form.featured,
    }

    setLoading(true)
    try {
      let saved: Product | null

      if (isEditMode && product) {
        saved = await updateProduct(product.id, payload)
      } else {
        saved = await createProduct(payload)
      }

      if (!saved) {
        toast.error(isEditMode ? 'Erro ao atualizar produto' : 'Erro ao criar produto')
        setLoading(false)
        return
      }

      // Upload any newly picked files now that we have a product id.
      if (pendingFiles.length > 0) {
        const withImages = await uploadProductImages(saved.id, pendingFiles)
        if (!withImages) {
          toast.error('Produto salvo, mas houve erro no upload das imagens')
        }
      }

      toast.success(isEditMode ? 'Produto atualizado!' : 'Produto criado!')
      onSuccess()
    } catch (error) {
      logger.error('Error saving product:', error)
      toast.error('Erro ao salvar produto')
    }
    setLoading(false)
  }

  const priceNum = Number(form.price)
  const compareNum = Number(form.compareAtPrice)
  const showDiscountHint =
    Number.isFinite(priceNum) && Number.isFinite(compareNum) && compareNum > priceNum && priceNum > 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {isEditMode ? 'Editar Produto' : 'Novo Produto'}
          </CardTitle>
          <CardDescription>
            {isEditMode
              ? 'Atualize as informações do produto'
              : 'Preencha os dados para cadastrar um novo produto na loja'}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="product-name">Nome do Produto</Label>
              <Input
                id="product-name"
                placeholder="Ex.: Action Figure Goku Super Saiyajin"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="product-description">Descrição</Label>
              <textarea
                id="product-description"
                rows={3}
                placeholder="Detalhes, dimensões, material..."
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            {/* Preços */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product-price">Preço (R$)</Label>
                <Input
                  id="product-price"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.price}
                  onChange={(e) => update('price', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-compare">Preço "de" (opcional)</Label>
                <Input
                  id="product-compare"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="Preço original riscado"
                  value={form.compareAtPrice}
                  onChange={(e) => update('compareAtPrice', e.target.value)}
                />
                {showDiscountHint && (
                  <p className="text-xs text-green-600">
                    Desconto de {Math.round((1 - priceNum / compareNum) * 100)}% ·{' '}
                    <span className="line-through text-muted-foreground">{formatCurrency(compareNum)}</span> →{' '}
                    {formatCurrency(priceNum)}
                  </p>
                )}
              </div>
            </div>

            {/* Estoque + SKU */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product-stock">Estoque</Label>
                <Input
                  id="product-stock"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  placeholder="0"
                  value={form.stock}
                  onChange={(e) => update('stock', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-sku">SKU (opcional)</Label>
                <Input
                  id="product-sku"
                  placeholder="Código interno"
                  value={form.sku}
                  onChange={(e) => update('sku', e.target.value)}
                />
              </div>
            </div>

            {/* Categoria */}
            <div className="space-y-2">
              <Label htmlFor="product-category">Categoria</Label>
              <select
                id="product-category"
                value={form.categoryId}
                onChange={(e) => update('categoryId', e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Sem categoria</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>

              {/* Gerenciador de categorias inline */}
              <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Gerenciar categorias</span>
                </div>
                {categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((cat) => (
                      <Badge key={cat.id} variant="secondary" className="gap-1 pr-1">
                        {cat.name}
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat.id, cat.name)}
                          className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5"
                          title="Remover categoria"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="Nova categoria"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleCreateCategory()
                      }
                    }}
                    className="h-9"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCreateCategory}
                    disabled={creatingCategory || !newCategoryName.trim()}
                  >
                    {creatingCategory ? <Loading size="sm" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* Imagens */}
            <div className="space-y-3">
              <Label>Imagens</Label>

              {/* Previews */}
              {(images.length > 0 || pendingFiles.length > 0) ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {images.map((url, i) => (
                    <div key={`img-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-border group">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeExistingImage(i)}
                        className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remover imagem"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {pendingFiles.map((file, i) => (
                    <div key={`file-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-dashed border-primary/60 group">
                      <img src={URL.createObjectURL(file)} alt="" className="h-full w-full object-cover" />
                      <span className="absolute bottom-1 left-1 text-[10px] bg-primary/80 text-primary-foreground px-1 rounded">
                        novo
                      </span>
                      <button
                        type="button"
                        onClick={() => removePendingFile(i)}
                        className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remover imagem"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 border border-dashed border-border rounded-lg text-muted-foreground">
                  <ImageOff className="h-8 w-8 mb-2" />
                  <p className="text-xs">Nenhuma imagem adicionada</p>
                </div>
              )}

              {/* Upload de arquivos */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePickFiles}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Enviar imagens
                </Button>
                {!isEditMode && pendingFiles.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    As imagens serão enviadas ao salvar o produto.
                  </p>
                )}
              </div>

              {/* Colar URL externa */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Colar URL de imagem externa"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddImageUrl()
                      }
                    }}
                    className="pl-10"
                  />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleAddImageUrl}>
                  Adicionar
                </Button>
              </div>
            </div>

            {/* Flags */}
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:border-primary/50">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => update('active', e.target.checked)}
                  className="h-4 w-4"
                />
                <div>
                  <p className="text-sm font-medium">Ativo</p>
                  <p className="text-xs text-muted-foreground">Visível na loja</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:border-primary/50">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => update('featured', e.target.checked)}
                  className="h-4 w-4"
                />
                <div>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-yellow-500" /> Destaque
                  </p>
                  <p className="text-xs text-muted-foreground">Aparece em destaque</p>
                </div>
              </label>
            </div>
          </CardContent>

          <CardFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? <Loading size="sm" /> : isEditMode ? 'Salvar Alterações' : 'Criar Produto'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
