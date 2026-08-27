import { describe, it, expect, vi, beforeEach } from 'vitest'

// Only the transport is faked. `unwrapApi` and `ApiError` stay real: they are
// what turns a failed call into a message the panel can show, and mocking them
// away would test the opposite of the thing that broke.
vi.mock('./api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api-client')>()
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
    apiRequest: vi.fn(),
  }
})

import { api, apiRequest, ApiError } from './api-client'
import {
  listProducts,
  adminListProducts,
  getProductBySlug,
  listCategories,
  listRelatedProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImages,
} from './products'

const mockedApi = vi.mocked(api)
const mockedRequest = vi.mocked(apiRequest)

const product = {
  id: 'p1',
  name: 'Card',
  slug: 'card',
  description: null,
  price: 10,
  compareAtPrice: null,
  categoryId: null,
  images: [],
  stock: 5,
  sku: null,
  active: true,
  featured: false,
  wholesaleEnabled: true,
  wholesaleMinQty: 2,
  createdAt: '',
  updatedAt: '',
}

describe('products API client', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listProducts with wholesale flag', async () => {
    mockedApi.get.mockResolvedValue({
      data: { products: [product], total: 1, page: 1, limit: 24 },
      status: 200,
    })
    const res = await listProducts({ wholesale: true, search: 'card', limit: 10, sort: 'name' })
    expect(mockedApi.get).toHaveBeenCalledWith(
      expect.stringMatching(/wholesale=true/),
      { skipAuth: true }
    )
    expect(mockedApi.get.mock.calls[0][0]).toMatch(/sort=name/)
    expect(res.products).toHaveLength(1)
  })

  it('listProducts sends page and stats for SQL pagination', async () => {
    mockedApi.get.mockResolvedValue({
      data: { products: [product], total: 40, page: 2, limit: 24, missingPhotoCount: 3 },
      status: 200,
    })
    const res = await listProducts({ page: 2, limit: 24, sort: 'price_asc', stats: true })
    expect(mockedApi.get.mock.calls[0][0]).toMatch(/page=2/)
    expect(mockedApi.get.mock.calls[0][0]).toMatch(/limit=24/)
    expect(mockedApi.get.mock.calls[0][0]).toMatch(/sort=price_asc/)
    expect(mockedApi.get.mock.calls[0][0]).toMatch(/stats=true/)
    expect(res.page).toBe(2)
    expect(res.missingPhotoCount).toBe(3)
  })

  it('listProducts defaults empty', async () => {
    mockedApi.get.mockResolvedValue({ data: null, status: 200 })
    const res = await listProducts()
    expect(res.products).toEqual([])
  })

  it('getProductBySlug', async () => {
    mockedApi.get.mockResolvedValue({ data: product, status: 200 })
    expect(await getProductBySlug('card')).toEqual(product)
  })

  it('getProductBySlug null', async () => {
    mockedApi.get.mockResolvedValue({ data: null, status: 404 })
    expect(await getProductBySlug('x')).toBeNull()
  })

  it('listCategories', async () => {
    mockedApi.get.mockResolvedValue({ data: [{ id: '1', name: 'Música' }], status: 200 })
    const cats = await listCategories()
    expect(cats[0].name).toBe('Música')
  })

  it('listRelatedProducts', async () => {
    mockedApi.get.mockResolvedValue({ data: { products: [product] }, status: 200 })
    expect(await listRelatedProducts('card')).toHaveLength(1)
  })

  it('createProduct / updateProduct / deleteProduct', async () => {
    mockedApi.post.mockResolvedValue({ data: product, status: 201 })
    mockedApi.patch.mockResolvedValue({ data: { ...product, name: 'Novo' }, status: 200 })
    mockedApi.delete.mockResolvedValue({ status: 204 })
    expect(await createProduct({ name: 'Card', price: 10 })).toEqual(product)
    expect(await updateProduct('p1', { name: 'Novo' })).toMatchObject({ name: 'Novo' })
    await expect(deleteProduct('p1')).resolves.toBeUndefined()
  })

  // The whole point of the change: the panel showed "Erro ao criar produto" for
  // a 400 that named the offending field, for an expired session and for a 500
  // alike, so nobody could tell them apart.
  it('createProduct surfaces the backend message instead of a bare null', async () => {
    mockedApi.post.mockResolvedValue({
      error: 'Dados inválidos',
      code: 'VALIDATION',
      status: 400,
    })
    await expect(createProduct({ name: 'Card', price: 10 })).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Dados inválidos',
      status: 400,
      code: 'VALIDATION',
    })
  })

  it('deleteProduct rejects with the backend message', async () => {
    mockedApi.delete.mockResolvedValue({ error: 'Sessão expirada', status: 401 })
    await expect(deleteProduct('p1')).rejects.toBeInstanceOf(ApiError)
  })

  // A 5xx used to be retried three times with no idempotency key, so an insert
  // that succeeded but answered 502 left duplicates behind the error toast.
  it('product writes are sent once, with room to finish', async () => {
    mockedApi.post.mockResolvedValue({ data: product, status: 201 })
    await createProduct({ name: 'Card', price: 10 })
    expect(mockedApi.post).toHaveBeenCalledWith(
      '/products',
      expect.anything(),
      expect.objectContaining({ noRetry: true, timeoutMs: 60_000 })
    )
  })

  // The panel read the public list, which is pinned to active = TRUE: a product
  // saved inactive disappeared from the screen that had just created it.
  it('adminListProducts asks the admin route, with auth', async () => {
    mockedApi.get.mockResolvedValue({
      data: { products: [product], total: 1, page: 1, limit: 25 },
      status: 200,
    })
    await adminListProducts({ page: 2 })
    const [path, opts] = mockedApi.get.mock.calls[0]
    expect(path).toMatch(/^\/products\/admin\/catalog\?/)
    expect(path).toMatch(/page=2/)
    expect(opts).toBeUndefined()
  })

  it('uploadProductImages uses FormData request', async () => {
    mockedRequest.mockResolvedValue({ data: product, status: 200 })
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    const res = await uploadProductImages('p1', [file])
    expect(mockedRequest).toHaveBeenCalledWith(
      '/products/p1/images',
      expect.objectContaining({ method: 'POST', noRetry: true, timeoutMs: 120_000 })
    )
    // skippedOverLimit reports how many photos did not fit under the cap.
    expect(res).toEqual({ ok: true, product, skippedOverLimit: 0 })
  })

  it('uploadProductImages surfaces API error', async () => {
    mockedRequest.mockResolvedValue({ error: 'Imagem muito grande', status: 400 })
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    const res = await uploadProductImages('p1', [file])
    expect(res).toEqual({ ok: false, error: 'Imagem muito grande' })
  })
})
