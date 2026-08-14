import { useState, useEffect } from 'react'
import { logger } from '../../lib/logger'
import { Button, buttonVariants } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Loading } from '../ui/loading'
import type { Product, Category, VariantAxis } from '../../types'
import {
  createProduct,
  updateProduct,
  uploadProductImages,
  createCategory,
  deleteCategory,
  replaceProductVariants,
  type ProductInput,
  type VariantInput,
} from '../../lib/products'
import {
  prepareProductImages,
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_ACCEPT_LABEL,
} from '../../lib/product-image'
import { ImageCropDialog } from './ImageCropDialog'
import { cn, formatCurrency } from '../../lib/utils'
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

/** Preço em BRL: 0 … 999999.99 (XXXXXX.XX) — admin pode precificar livremente. */
const MAX_PRODUCT_PRICE = 999_999.99

interface ProductModalProps {
  mode: 'create' | 'edit'
  product?: Product | null
  categories: Category[]
  onClose: () => void
  onSuccess: () => void
  /** Called after a category is created/removed so the parent can refetch. */
  onCategoriesChange?: () => void
  /** Immediate upload in edit mode — keep the list thumbnail in sync without remounting the modal. */
  onImagesChange?: (productId: string, images: string[]) => void
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
  weightG: string
  heightCm: string
  widthCm: string
  lengthCm: string
  wholesaleEnabled: boolean
  wholesaleMinQty: string
}

/** Draft de um eixo de variação no formulário admin. */
interface AxisDraft {
  name: string
  optionsText: string
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
    weightG: product?.weightG != null ? String(product.weightG) : '',
    heightCm: product?.heightCm != null ? String(product.heightCm) : '',
    widthCm: product?.widthCm != null ? String(product.widthCm) : '',
    lengthCm: product?.lengthCm != null ? String(product.lengthCm) : '',
    wholesaleEnabled: product?.wholesaleEnabled ?? false,
    wholesaleMinQty: product?.wholesaleMinQty != null ? String(product.wholesaleMinQty) : '1',
  }
}

export function ProductModal({
  mode,
  product,
  categories,
  onClose,
  onSuccess,
  onCategoriesChange,
  onImagesChange,
}: ProductModalProps) {
  const isEditMode = mode === 'edit'

  const [form, setForm] = useState<FormState>(() => toFormState(product))
  const [loading, setLoading] = useState(false)
  const [uploadingImages, setUploadingImages] = useState(false)
  const [uploadPhase, setUploadPhase] = useState<'prepare' | 'upload'>('prepare')

  // Variações: eixos + opções ilimitados (1 tipo "Cor" com N opções = N SKUs)
  function axesToDrafts(axes?: VariantAxis[] | null): AxisDraft[] {
    if (!axes?.length) return [{ name: 'Cor', optionsText: '' }]
    return axes.map((a) => ({ name: a.name, optionsText: a.options.join(', ') }))
  }
  function variantsToRows(variants?: Product['variants']): VariantInput[] {
    return (variants ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      options: v.options,
      sku: v.sku,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      stock: v.stock,
      images: v.images,
      active: v.active,
      sortOrder: v.sortOrder,
    }))
  }

  const [hasVariants, setHasVariants] = useState(() => product?.hasVariants ?? false)
  const [axisDrafts, setAxisDrafts] = useState<AxisDraft[]>(() => axesToDrafts(product?.variantAxes))
  const [variantRows, setVariantRows] = useState<VariantInput[]>(() => variantsToRows(product?.variants))
  const [newOptionByAxis, setNewOptionByAxis] = useState<Record<number, string>>({})

  /** Parse opções: vírgula, ponto-e-vírgula ou quebra de linha. */
  function parseOptionsText(text: string): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const part of text.split(/[,;\n]+/)) {
      const o = part.trim()
      if (!o) continue
      const key = o.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(o)
    }
    return out
  }

  function buildAxes(): VariantAxis[] {
    const axes: VariantAxis[] = []
    for (const draft of axisDrafts) {
      const options = parseOptionsText(draft.optionsText)
      if (draft.name.trim() && options.length) {
        axes.push({ name: draft.name.trim(), options })
      }
    }
    return axes
  }

  function addAxisDraft() {
    setAxisDrafts((prev) => [...prev, { name: '', optionsText: '' }])
  }

  function removeAxisDraft(index: number) {
    setAxisDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  function updateAxisDraft(index: number, patch: Partial<AxisDraft>) {
    setAxisDrafts((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)))
  }

  function addOptionChip(axisIndex: number) {
    const raw = (newOptionByAxis[axisIndex] ?? '').trim()
    if (!raw) return
    const current = parseOptionsText(axisDrafts[axisIndex]?.optionsText ?? '')
    if (current.some((o) => o.toLowerCase() === raw.toLowerCase())) {
      toast.error('Opção já existe neste tipo')
      return
    }
    updateAxisDraft(axisIndex, { optionsText: [...current, raw].join(', ') })
    setNewOptionByAxis((prev) => ({ ...prev, [axisIndex]: '' }))
  }

  function removeOptionChip(axisIndex: number, option: string) {
    const current = parseOptionsText(axisDrafts[axisIndex]?.optionsText ?? '')
    updateAxisDraft(axisIndex, {
      optionsText: current.filter((o) => o !== option).join(', '),
    })
  }

  /** Gera matriz de combinações a partir dos eixos. */
  function generateVariantMatrix() {
    const axes = buildAxes()
    if (!axes.length) {
      toast.error(
        'Informe o tipo (ex.: Cor) e as opções (ex.: Rosa, Preto, Azul). Use o botão + para adicionar cada cor.'
      )
      return
    }
    let total = 1
    for (const a of axes) total *= a.options.length
    if (total > 500) {
      toast.error(`Combinações demais (${total}). Reduza opções ou tipos (máx. 500 SKUs).`)
      return
    }
    const combos: Record<string, string>[] = [{}]
    for (const axis of axes) {
      const next: Record<string, string>[] = []
      for (const c of combos) {
        for (const opt of axis.options) {
          next.push({ ...c, [axis.name]: opt })
        }
      }
      combos.splice(0, combos.length, ...next)
    }
    const basePrice = Number(form.price) || 0
    const baseStock = Number(form.stock) || 0
    const existingByName = new Map(variantRows.map((r) => [r.name, r]))
    const rows: VariantInput[] = combos.map((options, idx) => {
      const name = axes.map((a) => options[a.name]).join(' / ')
      const prev = existingByName.get(name)
      return {
        id: prev?.id,
        name,
        options,
        sku: prev?.sku ?? '',
        price: prev?.price ?? basePrice,
        compareAtPrice: prev?.compareAtPrice ?? null,
        stock: prev?.stock ?? baseStock,
        images: prev?.images ?? [],
        active: prev?.active ?? true,
        sortOrder: idx,
      }
    })
    setVariantRows(rows)
    setHasVariants(true)
    toast.success(`${rows.length} variação(ões) gerada(s) — confira preço/estoque e salve`)
  }

  // Image management. `images` holds URLs already saved / added by URL.
  // `pendingFiles` holds newly picked files that must be uploaded after the
  // product exists (upload requires a productId).
  const [images, setImages] = useState<string[]>(product?.images ?? [])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [imageUrl, setImageUrl] = useState('')
  const [cropSession, setCropSession] = useState<
    { files: File[]; kind: 'listing' } | { files: File[]; kind: 'variant'; variantIndex: number } | null
  >(null)

  // Foto por variação (estilo Shopee): arquivo pendente por índice da linha.
  const [pendingVariantFiles, setPendingVariantFiles] = useState<Record<number, File>>({})
  const [pendingVariantPreviews, setPendingVariantPreviews] = useState<Record<number, string>>({})
  const [variantUrlDraft, setVariantUrlDraft] = useState<Record<number, string>>({})

  // Inline category creation
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)

  useEffect(() => {
    setForm(toFormState(product))
    setImages(product?.images ?? [])
    setPendingFiles([])
    setHasVariants(product?.hasVariants ?? false)
    setAxisDrafts(axesToDrafts(product?.variantAxes))
    setVariantRows(variantsToRows(product?.variants))
    setNewOptionByAxis({})
    setPendingVariantFiles({})
    setPendingVariantPreviews((prev) => {
      for (const url of Object.values(prev)) URL.revokeObjectURL(url)
      return {}
    })
    setVariantUrlDraft({})
    // Reset only when switching products — a new `product` object with the same
    // id (parent list refresh) must not wipe photos just uploaded.
  }, [product?.id])

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

  async function commitListingImages(picked: File[]) {
    setUploadingImages(true)
    setUploadPhase('prepare')
    try {
      const { files, errors, compressedCount } = await prepareProductImages(picked)
      for (const msg of errors) toast.error(msg)
      if (files.length === 0) return

      // Edição: envia na hora (botão "Enviar imagens" = upload imediato).
      if (isEditMode && product?.id) {
        setUploadPhase('upload')
        const result = await uploadProductImages(product.id, files)
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        setImages(result.product.images)
        onImagesChange?.(product.id, result.product.images)
        toast.success(
          files.length === 1
            ? 'Imagem enviada'
            : `${files.length} imagens enviadas${compressedCount ? ' (compactadas)' : ''}`
        )
        return
      }

      // Criação: guarda e sobe no save (precisa de productId).
      setPendingFiles((prev) => [...prev, ...files])
      if (compressedCount > 0) {
        toast.message(
          compressedCount === 1
            ? 'Foto redimensionada automaticamente'
            : `${compressedCount} fotos redimensionadas automaticamente`
        )
      }
    } catch (error) {
      logger.error('Error preparing product images:', error)
      toast.error('Erro ao processar as imagens selecionadas')
    } finally {
      setUploadingImages(false)
    }
  }

  function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    // Allow re-picking the same file later.
    e.target.value = ''
    if (picked.length === 0) return
    setCropSession({ files: picked, kind: 'listing' })
  }

  function removeExistingImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function setVariantImages(idx: number, nextImages: string[]) {
    setVariantRows((rows) => rows.map((r, i) => (i === idx ? { ...r, images: nextImages } : r)))
  }

  function revokePendingPreview(idx: number) {
    setPendingVariantPreviews((prev) => {
      const url = prev[idx]
      if (url) URL.revokeObjectURL(url)
      const next = { ...prev }
      delete next[idx]
      return next
    })
  }

  function clearVariantImage(idx: number) {
    setVariantImages(idx, [])
    setPendingVariantFiles((prev) => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
    revokePendingPreview(idx)
  }

  function assignGalleryImageToVariant(idx: number, url: string) {
    setVariantImages(idx, [url])
    setPendingVariantFiles((prev) => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
    revokePendingPreview(idx)
  }

  async function commitVariantImage(raw: File, idx: number) {
    const prepared = await prepareProductImages([raw])
    for (const msg of prepared.errors) toast.error(msg)
    const file = prepared.files[0]
    if (!file) return

    // Produto já existe: upload imediato e anexa URL na variação.
    const productId = product?.id
    if (productId) {
      try {
        const before = new Set(images)
        const result = await uploadProductImages(productId, [file])
        if (!result.ok || !result.product.images?.length) {
          toast.error(result.ok ? 'Falha no upload da foto da variação' : result.error)
          return
        }
        const updated = result.product
        const added = updated.images.filter((u) => !before.has(u))
        const url = added[0] ?? updated.images[updated.images.length - 1]
        setImages(updated.images)
        onImagesChange?.(productId, updated.images)
        setVariantImages(idx, [url])
        setPendingVariantFiles((prev) => {
          const next = { ...prev }
          delete next[idx]
          return next
        })
        revokePendingPreview(idx)
        toast.success(`Foto da variação "${variantRows[idx]?.name ?? ''}" enviada`)
      } catch (error) {
        logger.error('Error uploading variant image:', error)
        toast.error('Erro ao enviar foto da variação')
      }
      return
    }

    // Criação: guarda arquivo e mostra preview; sobe no save.
    setPendingVariantFiles((prev) => ({ ...prev, [idx]: file }))
    setPendingVariantPreviews((prev) => {
      if (prev[idx]) URL.revokeObjectURL(prev[idx])
      return { ...prev, [idx]: URL.createObjectURL(file) }
    })
    setVariantImages(idx, []) // URL real vem no save; preview usa blob
  }

  function handleVariantFilePick(e: React.ChangeEvent<HTMLInputElement>, idx: number) {
    const raw = e.target.files?.[0]
    e.target.value = ''
    if (!raw) return
    setCropSession({ files: [raw], kind: 'variant', variantIndex: idx })
  }

  function handleCropComplete(cropped: File[]) {
    const session = cropSession
    setCropSession(null)
    if (!session || cropped.length === 0) return
    if (session.kind === 'variant') {
      const file = cropped[0]
      if (file) void commitVariantImage(file, session.variantIndex)
      return
    }
    void commitListingImages(cropped)
  }

  function applyVariantImageUrl(idx: number) {
    const url = (variantUrlDraft[idx] ?? '').trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      toast.error('URL da variação inválida (use http/https)')
      return
    }
    setVariantImages(idx, [url])
    setPendingVariantFiles((prev) => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
    revokePendingPreview(idx)
    setVariantUrlDraft((prev) => ({ ...prev, [idx]: '' }))
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
    if (!Number.isFinite(price) || price < 0 || price > MAX_PRODUCT_PRICE) {
      toast.error(`Preço inválido (use 0 a ${MAX_PRODUCT_PRICE.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`)
      return
    }

    const compareAtPrice = form.compareAtPrice.trim() ? Number(form.compareAtPrice) : null
    if (
      compareAtPrice != null &&
      (!Number.isFinite(compareAtPrice) || compareAtPrice < 0 || compareAtPrice > MAX_PRODUCT_PRICE)
    ) {
      toast.error(`Preço "de" inválido (use 0 a ${MAX_PRODUCT_PRICE.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`)
      return
    }

    const stock = form.stock.trim() ? Number(form.stock) : 0
    if (!Number.isInteger(stock) || stock < 0) {
      toast.error('Estoque inválido')
      return
    }

    const weightG = form.weightG.trim() ? Number(form.weightG) : null
    const heightCm = form.heightCm.trim() ? Number(form.heightCm) : null
    const widthCm = form.widthCm.trim() ? Number(form.widthCm) : null
    const lengthCm = form.lengthCm.trim() ? Number(form.lengthCm) : null
    if (weightG != null && (!Number.isInteger(weightG) || weightG <= 0)) {
      toast.error('Peso (g) inválido')
      return
    }

    const wholesaleMinQty = form.wholesaleMinQty.trim()
      ? Math.max(1, Number(form.wholesaleMinQty))
      : 1
    if (!Number.isInteger(wholesaleMinQty) || wholesaleMinQty < 1) {
      toast.error('Qtd. mínima atacado inválida')
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
      weightG,
      heightCm,
      widthCm,
      lengthCm,
      wholesaleEnabled: form.wholesaleEnabled,
      wholesaleMinQty,
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

      // Upload de imagens do listing + fotos de variação pendentes (precisa de productId).
      let catalogImages = [...images]
      if (pendingFiles.length > 0) {
        const withImages = await uploadProductImages(saved.id, pendingFiles)
        if (!withImages.ok) {
          toast.error(`Produto salvo, mas falhou o upload das imagens: ${withImages.error}`)
        } else {
          catalogImages = withImages.product.images
          saved = withImages.product
        }
      }

      // Resolve fotos de variação que ainda são File (modo criar)
      const rowsWithImages = variantRows.map((r, i) => ({
        ...r,
        price: Number(r.price),
        stock: Number(r.stock) || 0,
        images: Array.isArray(r.images) ? [...r.images] : [],
        sortOrder: i,
      }))
      const pendingEntries = Object.entries(pendingVariantFiles)
      if (pendingEntries.length > 0) {
        let known = new Set(catalogImages)
        for (const [idxStr, file] of pendingEntries) {
          const idx = Number(idxStr)
          const updated = await uploadProductImages(saved.id, [file])
          if (!updated.ok || !updated.product.images?.length) continue
          const added = updated.product.images.filter((u) => !known.has(u))
          const url = added[0] ?? updated.product.images[updated.product.images.length - 1]
          known = new Set(updated.product.images)
          catalogImages = updated.product.images
          saved = updated.product
          if (rowsWithImages[idx]) {
            rowsWithImages[idx].images = [url]
          }
        }
      }

      // Variações: salva eixos + SKUs com fotos (ou limpa)
      if (hasVariants && rowsWithImages.length > 0) {
        const axes = buildAxes()
        if (!axes.length) {
          toast.error(
            'Produto salvo, mas as variações precisam de tipo + opções (ex.: Cor → Rosa, Preto). Clique em Gerar combinações.'
          )
          setLoading(false)
          onSuccess()
          return
        }
        const badVariant = rowsWithImages.find((r) => {
          const p = Number(r.price)
          return !Number.isFinite(p) || p < 0 || p > MAX_PRODUCT_PRICE
        })
        if (badVariant) {
          toast.error(
            `Preço inválido na variação "${badVariant.name}" (use 0 a ${MAX_PRODUCT_PRICE.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
          )
          setLoading(false)
          return
        }
        const withVariants = await replaceProductVariants(saved.id, axes, rowsWithImages)
        if (!withVariants) {
          toast.error('Produto salvo, mas falhou ao gravar as variações. Tente de novo.')
          setLoading(false)
          onSuccess()
          return
        }
        saved = withVariants
      } else if (isEditMode && product?.hasVariants && !hasVariants) {
        await replaceProductVariants(saved.id, [], [])
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
    <>
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
                  max={MAX_PRODUCT_PRICE}
                  inputMode="decimal"
                  placeholder="Ex.: 7500 ou 149.90"
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
                  max={MAX_PRODUCT_PRICE}
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

            {/* Embalagem / frete Correios */}
            <div className="space-y-2">
              <Label>Embalagem (frete Correios)</Label>
              <p className="text-xs text-muted-foreground">
                Usado no cálculo de frete. Se vazio, usa padrão 300g · 16×11×6 cm (photocard/caixa pequena).
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="product-weight" className="text-xs text-muted-foreground">
                    Peso (g)
                  </Label>
                  <Input
                    id="product-weight"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="300"
                    value={form.weightG}
                    onChange={(e) => update('weightG', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="product-len" className="text-xs text-muted-foreground">
                    Comp. (cm)
                  </Label>
                  <Input
                    id="product-len"
                    type="number"
                    min="0.1"
                    step="0.1"
                    placeholder="16"
                    value={form.lengthCm}
                    onChange={(e) => update('lengthCm', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="product-width" className="text-xs text-muted-foreground">
                    Larg. (cm)
                  </Label>
                  <Input
                    id="product-width"
                    type="number"
                    min="0.1"
                    step="0.1"
                    placeholder="11"
                    value={form.widthCm}
                    onChange={(e) => update('widthCm', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="product-height" className="text-xs text-muted-foreground">
                    Alt. (cm)
                  </Label>
                  <Input
                    id="product-height"
                    type="number"
                    min="0.1"
                    step="0.1"
                    placeholder="6"
                    value={form.heightCm}
                    onChange={(e) => update('heightCm', e.target.value)}
                  />
                </div>
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

              {/* Upload de arquivos — <label> + overlay input (iOS Safari bloqueia click() em input hidden). */}
              <div>
                <label
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'relative cursor-pointer overflow-hidden',
                    (uploadingImages || loading) && 'pointer-events-none opacity-50'
                  )}
                >
                  <input
                    type="file"
                    accept={PRODUCT_IMAGE_ACCEPT}
                    multiple
                    onChange={handlePickFiles}
                    disabled={uploadingImages || loading}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label="Enviar imagens"
                  />
                  {uploadingImages ? <Loading size="sm" /> : <Upload className="h-4 w-4" />}
                  {uploadingImages
                    ? uploadPhase === 'prepare'
                      ? 'Preparando…'
                      : 'Enviando…'
                    : 'Enviar imagens'}
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  {PRODUCT_IMAGE_ACCEPT_LABEL}
                  {isEditMode
                    ? ' · envio imediato ao selecionar'
                    : pendingFiles.length > 0
                      ? ' · serão enviadas ao salvar o produto'
                      : ' · no produto novo, sobem ao salvar'}
                </p>
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
              <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:border-primary/50 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.wholesaleEnabled}
                  onChange={(e) => update('wholesaleEnabled', e.target.checked)}
                  className="h-4 w-4"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">Disponível no atacado</p>
                  <p className="text-xs text-muted-foreground">
                    Aparece em /atacado (desconto 25% para CNPJ aprovado). Deixe desligado até a
                    importação se ainda não for vender no atacado.
                  </p>
                </div>
              </label>
              {form.wholesaleEnabled && (
                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor="wholesaleMinQty">Qtd. mínima no atacado</Label>
                  <Input
                    id="wholesaleMinQty"
                    type="number"
                    min={1}
                    value={form.wholesaleMinQty}
                    onChange={(e) => update('wholesaleMinQty', e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Variações: 1 tipo "Cor" + N opções = N SKUs (ilimitado) */}
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Variações</p>
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Tipo</strong> = o que muda (ex. Cor).{' '}
                    <strong className="text-foreground">Opções</strong> = cada valor (Rosa, Preto,
                    Azul…) — <strong className="text-foreground">sem limite</strong>. Depois clique
                    em Gerar combinações.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={hasVariants}
                    onChange={(e) => setHasVariants(e.target.checked)}
                  />
                  Ativar
                </label>
              </div>

              {hasVariants && (
                <div className="space-y-3">
                  <div className="space-y-3">
                    {axisDrafts.map((draft, idx) => {
                      const options = parseOptionsText(draft.optionsText)
                      return (
                        <div key={idx} className="space-y-2 rounded-md border border-border/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label>
                              Tipo {idx + 1}
                              {idx === 0 ? ' (ex.: Cor)' : idx === 1 ? ' (ex.: Tamanho)' : ''}
                            </Label>
                            {axisDrafts.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-muted-foreground"
                                onClick={() => removeAxisDraft(idx)}
                                aria-label={`Remover tipo ${idx + 1}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <Input
                            value={draft.name}
                            onChange={(e) => updateAxisDraft(idx, { name: e.target.value })}
                            placeholder={idx === 0 ? 'Cor' : idx === 1 ? 'Tamanho' : 'Nome do tipo'}
                          />
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                              Opções ({options.length}) — digite e adicione uma a uma
                            </Label>
                            <div className="flex flex-wrap gap-1.5">
                              {options.map((opt) => (
                                <span
                                  key={opt}
                                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                                >
                                  {opt}
                                  <button
                                    type="button"
                                    className="rounded-full p-0.5 hover:bg-primary/20"
                                    onClick={() => removeOptionChip(idx, opt)}
                                    aria-label={`Remover ${opt}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <Input
                                className="h-8"
                                placeholder="Ex.: Rosa"
                                value={newOptionByAxis[idx] ?? ''}
                                onChange={(e) =>
                                  setNewOptionByAxis((prev) => ({ ...prev, [idx]: e.target.value }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    addOptionChip(idx)
                                  }
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 shrink-0"
                                onClick={() => addOptionChip(idx)}
                              >
                                <Plus className="h-4 w-4" />
                                Opção
                              </Button>
                            </div>
                            <Input
                              className="h-8 text-xs"
                              placeholder="Ou cole várias: Rosa, Preto, Azul"
                              value={draft.optionsText}
                              onChange={(e) => updateAxisDraft(idx, { optionsText: e.target.value })}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={addAxisDraft}>
                      <Plus className="h-4 w-4" />
                      Outro tipo (ex. Tamanho)
                    </Button>
                    <Button type="button" size="sm" onClick={generateVariantMatrix}>
                      <Plus className="h-4 w-4" />
                      Gerar combinações
                    </Button>
                  </div>

                  {variantRows.length > 0 && (
                    <div className="max-h-96 space-y-3 overflow-y-auto rounded border p-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        {variantRows.length} SKU(s) — foto própria, preço, estoque e SKU (como na
                        Shopee)
                      </p>
                      {variantRows.map((row, idx) => {
                        const pendingFile = pendingVariantFiles[idx]
                        const thumbUrl = row.images?.[0] || pendingVariantPreviews[idx] || null
                        return (
                          <div
                            key={row.name + idx}
                            className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-2"
                          >
                            <div className="grid grid-cols-12 items-center gap-2 text-sm">
                              {/* Foto da variação */}
                              <div className="col-span-2 sm:col-span-1">
                                <label
                                  className="relative flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-primary/40 bg-background hover:border-primary"
                                  title={`Foto de ${row.name}`}
                                  aria-label={`Enviar foto da variação ${row.name}`}
                                >
                                  <input
                                    id={`variant-photo-${idx}`}
                                    type="file"
                                    accept={PRODUCT_IMAGE_ACCEPT}
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    onChange={(e) => void handleVariantFilePick(e, idx)}
                                  />
                                  {thumbUrl ? (
                                    <img
                                      src={thumbUrl}
                                      alt=""
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <Upload className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </label>
                              </div>
                              <span
                                className="col-span-4 truncate font-medium sm:col-span-3"
                                title={row.name}
                              >
                                {row.name}
                              </span>
                              <Input
                                className="col-span-3 h-8 sm:col-span-3"
                                type="number"
                                step="0.01"
                                min="0"
                                max={MAX_PRODUCT_PRICE}
                                value={row.price}
                                onChange={(e) => {
                                  const price = Number(e.target.value)
                                  setVariantRows((rows) =>
                                    rows.map((r, i) => (i === idx ? { ...r, price } : r))
                                  )
                                }}
                                aria-label={`Preço ${row.name}`}
                              />
                              <Input
                                className="col-span-2 h-8"
                                type="number"
                                value={row.stock ?? 0}
                                onChange={(e) => {
                                  const stock = Number(e.target.value)
                                  setVariantRows((rows) =>
                                    rows.map((r, i) => (i === idx ? { ...r, stock } : r))
                                  )
                                }}
                                aria-label={`Estoque ${row.name}`}
                              />
                              <Input
                                className="col-span-12 h-8 sm:col-span-3"
                                placeholder="SKU"
                                value={row.sku ?? ''}
                                onChange={(e) => {
                                  const sku = e.target.value
                                  setVariantRows((rows) =>
                                    rows.map((r, i) => (i === idx ? { ...r, sku } : r))
                                  )
                                }}
                                aria-label={`SKU ${row.name}`}
                              />
                            </div>

                            {/* Controles de foto da variação */}
                            <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-14">
                              <label
                                htmlFor={`variant-photo-${idx}`}
                                className={cn(
                                  buttonVariants({ variant: 'outline', size: 'sm' }),
                                  'h-7 cursor-pointer text-xs'
                                )}
                              >
                                <Upload className="h-3 w-3" />
                                {thumbUrl ? 'Trocar foto' : 'Foto'}
                              </label>
                              {(thumbUrl || pendingFile) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-muted-foreground"
                                  onClick={() => clearVariantImage(idx)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Remover
                                </Button>
                              )}
                              <div className="flex min-w-0 flex-1 gap-1">
                                <Input
                                  className="h-7 text-xs"
                                  placeholder="Ou cole URL da foto desta variação"
                                  value={variantUrlDraft[idx] ?? ''}
                                  onChange={(e) =>
                                    setVariantUrlDraft((prev) => ({
                                      ...prev,
                                      [idx]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      applyVariantImageUrl(idx)
                                    }
                                  }}
                                  aria-label={`URL da foto ${row.name}`}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 shrink-0 text-xs"
                                  onClick={() => applyVariantImageUrl(idx)}
                                >
                                  OK
                                </Button>
                              </div>
                            </div>

                            {/* Atalho: escolher imagem já do produto */}
                            {images.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 pl-0 sm:pl-14">
                                <span className="text-[10px] text-muted-foreground">
                                  Da galeria:
                                </span>
                                {images.slice(0, 8).map((url) => (
                                  <button
                                    key={url}
                                    type="button"
                                    onClick={() => assignGalleryImageToVariant(idx, url)}
                                    className={`h-8 w-8 overflow-hidden rounded border transition-colors ${
                                      row.images?.[0] === url
                                        ? 'border-primary ring-1 ring-primary'
                                        : 'border-border hover:border-primary/60'
                                    }`}
                                    title="Usar esta imagem na variação"
                                  >
                                    <img src={url} alt="" className="h-full w-full object-cover" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
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
    {cropSession && (
      <ImageCropDialog
        files={cropSession.files}
        onCancel={() => setCropSession(null)}
        onComplete={handleCropComplete}
      />
    )}
    </>
  )
}
