import { api, apiRequest } from './api-client'
import type { Product, Category } from '../types'

export interface ProductListResult {
  products: Product[]
  total: number
  page: number
  limit: number
}

export interface ProductListParams {
  category?: string
  search?: string
  featured?: boolean
  page?: number
  limit?: number
}

/** Public: list active products with optional filters. */
export async function listProducts(params: ProductListParams = {}): Promise<ProductListResult> {
  const qs = new URLSearchParams()
  if (params.category) qs.set('category', params.category)
  if (params.search) qs.set('search', params.search)
  if (params.featured) qs.set('featured', 'true')
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  const query = qs.toString()
  const result = await api.get<ProductListResult>(`/products${query ? `?${query}` : ''}`, { skipAuth: true })
  return result.data ?? { products: [], total: 0, page: 1, limit: 24 }
}

/** Public: single product by slug. */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  const result = await api.get<Product>(`/products/${slug}`, { skipAuth: true })
  return result.data ?? null
}

/** Public: active categories. */
export async function listCategories(): Promise<Category[]> {
  const result = await api.get<Category[]>('/products/categories', { skipAuth: true })
  return result.data ?? []
}

// ─── Admin ─────────────────────────────────────────────────────────────────

export interface ProductInput {
  name: string
  description?: string | null
  price: number
  compareAtPrice?: number | null
  categoryId?: string | null
  images?: string[]
  stock?: number
  sku?: string | null
  active?: boolean
  featured?: boolean
}

export async function adminListProducts(params: ProductListParams = {}): Promise<ProductListResult> {
  // Admins reuse the public list endpoint but see the same catalog; inactive management
  // is handled per-product. For a full admin listing we pass a high limit.
  return listProducts({ limit: 100, ...params })
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

/** Upload product images (multipart). Returns the updated product. */
export async function uploadProductImages(id: string, files: File[]): Promise<Product | null> {
  const form = new FormData()
  for (const f of files) form.append('images', f)
  // FormData body — apiRequest leaves the Content-Type unset so the browser adds the
  // multipart boundary, and still attaches the Authorization header.
  const result = await apiRequest<Product>(`/products/${id}/images`, {
    method: 'POST',
    body: form,
  })
  return result.data ?? null
}

export interface CategoryInput {
  name: string
  description?: string | null
  active?: boolean
  sortOrder?: number
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
