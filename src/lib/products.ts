import { api, apiRequest } from './api-client'
import type { Product, Category, AdminCategory, ProductVariant, VariantAxis, ProductVideo } from '../types'
import { DEFAULT_PRODUCT_SORT, type ProductSort } from './product-sort'

export interface ProductListResult {
  products: Product[]
  total: number
  page: number
  limit: number
  /** Present when the request asked for `stats=true` (admin). */
  missingPhotoCount?: number
}

export interface ProductListParams {
  category?: string
  search?: string
  featured?: boolean
  page?: number
  limit?: number
  /** Wholesale channel: only wholesale_enabled products. */
  wholesale?: boolean
  /** Catalogue ordering; defaults to newest. */
  sort?: ProductSort
  /** Ask for the count of active products with no photo (admin). */
  stats?: boolean
}

/** Public: list active products with optional filters. */
export async function listProducts(params: ProductListParams = {}): Promise<ProductListResult> {
  const qs = new URLSearchParams()
  if (params.category) qs.set('category', params.category)
  if (params.search) qs.set('search', params.search)
  if (params.featured) qs.set('featured', 'true')
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  if (params.wholesale) qs.set('wholesale', 'true')
  if (params.sort && params.sort !== DEFAULT_PRODUCT_SORT) qs.set('sort', params.sort)
  if (params.stats) qs.set('stats', 'true')
  const query = qs.toString()
  const result = await api.get<ProductListResult>(`/products${query ? `?${query}` : ''}`, { skipAuth: true })
  return result.data ?? { products: [], total: 0, page: 1, limit: 24 }
}

/** Public: single product by slug. */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const result = await api.get<Product>(`/products/${slug}`, { skipAuth: true })
  return result.data ?? null
}

/**
 * Re-files several products in one request.
 *
 * `replace` swaps the categories of every selected product, `add` files them
 * under one more, `remove` takes them out — the three shapes the panel offers.
 */
export async function bulkSetProductCategories(
  productIds: string[],
  categoryIds: string[],
  mode: 'replace' | 'add' | 'remove' = 'replace'
): Promise<number> {
  const result = await api.patch<{ updated: number }>('/products/bulk/categories', {
    productIds,
    categoryIds,
    mode,
  })
  if (result.error) throw new Error(result.error)
  return result.data?.updated ?? 0
}

/** Public: active categories. */
export async function listCategories(): Promise<Category[]> {
  const result = await api.get<Category[]>('/products/categories', { skipAuth: true })
  return result.data ?? []
}

/**
 * What can actually be sold right now.
 *
 * `stock` is the physical count and includes units that pending orders already
 * hold (`reserved`, migration 021) — selling against it is what let two people
 * buy the same last piece while a PIX waited to be confirmed. The fallback to
 * `stock` covers older responses still cached in the browser.
 */
export function availableStock(item: { stock: number; available?: number }): number {
  return Math.max(0, item.available ?? item.stock)
}

// ─── Admin ─────────────────────────────────────────────────────────────────

export interface ProductInput {
  name: string
  description?: string | null
  price: number
  compareAtPrice?: number | null
  costPrice?: number | null
  categoryId?: string | null
  /** First entry becomes primary. Takes precedence over categoryId. */
  categoryIds?: string[]
  images?: string[]
  videos?: ProductVideo[]
  stock?: number
  sku?: string | null
  active?: boolean
  featured?: boolean
  weightG?: number | null
  heightCm?: number | null
  widthCm?: number | null
  lengthCm?: number | null
  wholesaleEnabled?: boolean
  wholesaleMinQty?: number
  hasVariants?: boolean
  variantAxes?: VariantAxis[]
}

export interface VariantInput {
  id?: string
  name: string
  options: Record<string, string>
  sku?: string | null
  price: number
  compareAtPrice?: number | null
  costPrice?: number | null
  stock?: number
  images?: string[]
  active?: boolean
  sortOrder?: number
}

/** Admin: persist axes + SKU matrix (Shopee-style). */
export async function replaceProductVariants(
  productId: string,
  axes: VariantAxis[],
  variants: VariantInput[]
): Promise<Product | null> {
  const result = await api.put<Product>(`/products/${productId}/variants`, {
    axes,
    variants,
  } as unknown as Record<string, unknown>)
  return result.data ?? null
}

export async function listProductVariants(productId: string): Promise<ProductVariant[]> {
  const result = await api.get<{ variants: ProductVariant[] }>(`/products/${productId}/variants`, {
    skipAuth: true,
  })
  return result.data?.variants ?? []
}

/** Public: related products for the "you may also like" block. */
export async function listRelatedProducts(slug: string): Promise<Product[]> {
  const result = await api.get<{ products: Product[] }>(`/products/${slug}/related`, {
    skipAuth: true,
  })
  return result.data?.products ?? []
}

/**
 * Public: products bought in the same order as this one.
 *
 * Empty is a normal answer — it means the sales data says nothing yet, and the
 * caller must hide the block rather than pad it with the related list.
 */
export async function listAlsoBoughtProducts(slug: string): Promise<Product[]> {
  const result = await api.get<{ products: Product[] }>(`/products/${slug}/also-bought`, {
    skipAuth: true,
  })
  return result.data?.products ?? []
}

export async function adminListProducts(params: ProductListParams = {}): Promise<ProductListResult> {
  // Same catalog endpoint; sort/search/page run in SQL (ORDER BY + LIMIT/OFFSET).
  return listProducts({ limit: 25, stats: true, ...params })
}

/**
 * Uses the admin route rather than the public slug detail, which hides inactive
 * products and variants: the modal opened without them and the next save wiped
 * whatever had not loaded.
 */
export async function getProductForEdit(id: string): Promise<Product | null> {
  const result = await api.get<Product>(`/products/${id}/edit`)
  return result.data ?? null
}

export async function createProduct(data: ProductInput): Promise<Product | null> {
  const result = await api.post<Product>('/products', data as unknown as Record<string, unknown>)
  return result.data ?? null
}

export async function updateProduct(id: string, data: Partial<ProductInput>): Promise<Product | null> {
  const result = await api.patch<Product>(`/products/${id}`, data as unknown as Record<string, unknown>)
  return result.data ?? null
}

export async function deleteProduct(id: string): Promise<boolean> {
  const result = await api.delete(`/products/${id}`)
  return !result.error
}

export type UploadProductVideoResult =
  | { ok: true; product: Product }
  | { ok: false; error: string }

/** Uploads an MP4 and appends it to products.videos. External links go through the PATCH. */
export async function uploadProductVideo(
  id: string,
  file: File
): Promise<UploadProductVideoResult> {
  const form = new FormData()
  form.append('video', file)
  const result = await apiRequest<Product>(`/products/${id}/video`, {
    method: 'POST',
    body: form,
    noRetry: true,
    // Video is far larger than a photo and the shop's uplink can be slow.
    timeoutMs: 300_000,
  })
  return result.data
    ? { ok: true, product: result.data }
    : { ok: false, error: result.error || 'Falha no upload do vídeo.' }
}

/** Clones the product, inactive, for bulk entry. */
export async function duplicateProduct(id: string): Promise<Product | null> {
  const result = await api.post<Product>(`/products/${id}/duplicate`, {})
  return result.data ?? null
}

/** Tetos espelhados de server/api/src/services/product.service.ts. */
export const MAX_PRODUCT_IMAGES = 30
export const MAX_VARIANT_IMAGES = 10
export const MAX_IMAGE_UPLOAD_BATCH = 20
export const MAX_PRODUCT_CATEGORIES = 5

export type UploadProductImagesResult =
  | { ok: true; product: Product; skippedOverLimit: number }
  | { ok: false; error: string }

export type UploadProductMediaResult =
  | { ok: true; urls: string[] }
  | { ok: false; error: string }

/** Splits the selection at the per-request cap multer accepts. */
function chunkFiles(files: File[]): File[][] {
  const chunks: File[][] = []
  for (let i = 0; i < files.length; i += MAX_IMAGE_UPLOAD_BATCH) {
    chunks.push(files.slice(i, i + MAX_IMAGE_UPLOAD_BATCH))
  }
  return chunks
}

function postImages<T>(path: string, files: File[]) {
  const form = new FormData()
  for (const f of files) form.append('images', f)
  // FormData body — apiRequest leaves the Content-Type unset so the browser adds the
  // multipart boundary, and still attaches the Authorization header.
  return apiRequest<T>(path, {
    method: 'POST',
    body: form,
    // Don't retry POST multipart (body may not re-send cleanly after network blip).
    noRetry: true,
    timeoutMs: 120_000,
  })
}

/**
 * Upload product images (multipart). Returns the updated product or a clear error.
 * Uses a longer timeout — phone photos can be multi-MB even after compression.
 * Selections above MAX_IMAGE_UPLOAD_BATCH become several requests.
 */
export async function uploadProductImages(
  id: string,
  files: File[]
): Promise<UploadProductImagesResult> {
  if (!files.length) {
    return { ok: false, error: 'Nenhuma imagem selecionada.' }
  }
  let product: Product | null = null
  let skippedOverLimit = 0

  for (const chunk of chunkFiles(files)) {
    const result = await postImages<Product>(`/products/${id}/images`, chunk)
    if (!result.data) {
      // A batch failed: earlier ones are already saved, so report the error
      // without discarding what was written.
      return { ok: false, error: result.error || 'Falha no upload das imagens.' }
    }
    product = result.data
    skippedOverLimit += (result.data as Product & { skippedOverLimit?: number }).skippedOverLimit ?? 0
  }

  return product
    ? { ok: true, product, skippedOverLimit }
    : { ok: false, error: 'Falha no upload das imagens.' }
}

/**
 * Uploads files and returns only the URLs, without touching the listing
 * gallery. This is the variant-photo path: those are written to
 * product_variants.images by PUT /variants and must not inflate
 * products.images.
 */
export async function uploadProductMedia(
  productId: string,
  files: File[]
): Promise<UploadProductMediaResult> {
  if (!files.length) {
    return { ok: false, error: 'Nenhuma imagem selecionada.' }
  }
  const urls: string[] = []
  for (const chunk of chunkFiles(files)) {
    const result = await postImages<{ urls: string[] }>(`/products/${productId}/media`, chunk)
    if (!result.data?.urls?.length) {
      return { ok: false, error: result.error || 'Falha no upload das imagens.' }
    }
    urls.push(...result.data.urls)
  }
  return { ok: true, urls }
}

export interface CategoryInput {
  name: string
  description?: string | null
  /** Icon key; see src/lib/category-icons.ts. */
  icon?: string | null
  active?: boolean
  sortOrder?: number
  /** Null makes it top-level. The API refuses a subcategory of a subcategory. */
  parentId?: string | null
}

/** Admin: includes inactive rows and per-category product counts. */
export async function listCategoriesForAdmin(): Promise<AdminCategory[]> {
  const result = await api.get<{ categories: AdminCategory[] }>('/products/categories/all')
  return result.data?.categories ?? []
}

export async function createCategory(data: CategoryInput): Promise<Category | null> {
  const result = await api.post<Category>('/products/categories', data as unknown as Record<string, unknown>)
  return result.data ?? null
}

export async function updateCategory(id: string, data: Partial<CategoryInput>): Promise<Category | null> {
  const result = await api.patch<Category>(`/products/categories/${id}`, data as unknown as Record<string, unknown>)
  return result.data ?? null
}

export async function deleteCategory(id: string): Promise<boolean> {
  const result = await api.delete(`/products/categories/${id}`)
  return !result.error
}
