/**
 * Thin API clients behind the admin tabs and the storefront.
 *
 * What these pin is the contract with the server — which endpoint, which
 * parameters — and what each returns when the API fails. A client that
 * throws where the screen expects an empty list takes the whole tab down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  request: vi.fn(),
}))

vi.mock('./api-client', async () => {
  const actual = await vi.importActual<typeof import('./api-client')>('./api-client')
  return {
    ...actual,
    api: { get: api.get, post: api.post, patch: api.patch, put: api.put, delete: api.delete },
    apiRequest: api.request,
  }
})

import * as stock from './stock'
import * as promo from './promo'
import * as gallery from './gallery'
import * as questions from './questions'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('stock client', () => {
  it('builds the query from the filters and skips the defaults', async () => {
    api.get.mockResolvedValue({ data: { rows: [], total: 0, page: 2, limit: 25, summary: { out: 0, low: 0, ok: 0 } } })
    await stock.listStock({ search: 'bts', filter: 'low', includeInactive: true, page: 2, limit: 25 })
    expect(api.get).toHaveBeenCalledWith('/stock?search=bts&filter=low&includeInactive=true&page=2&limit=25')

    await stock.listStock({ filter: 'all' })
    expect(api.get).toHaveBeenLastCalledWith('/stock')
  })

  it('returns an empty page instead of throwing when the API fails', async () => {
    api.get.mockResolvedValue({ error: 'down' })
    const result = await stock.listStock()
    expect(result).toEqual({ rows: [], total: 0, page: 1, limit: 50, summary: { out: 0, low: 0, ok: 0 } })
    expect(await stock.listStockMovements('p1')).toEqual([])
  })

  it('adjusts stock, sets the threshold and reads the movements', async () => {
    api.patch.mockResolvedValueOnce({ data: { productId: 'p1', stock: 7 } })
    expect(await stock.adjustStock({ productId: 'p1', stock: 7 })).toMatchObject({ stock: 7 })
    expect(api.patch).toHaveBeenCalledWith('/stock', { productId: 'p1', stock: 7 })

    api.patch.mockResolvedValueOnce({ error: 'nope' })
    expect(await stock.adjustStock({ productId: 'p1', stock: 7 })).toBeNull()

    api.patch.mockResolvedValueOnce({ data: {} })
    expect(await stock.setLowStockThreshold('p1', 3)).toBe(true)
    expect(api.patch).toHaveBeenLastCalledWith('/stock/p1/threshold', { threshold: 3 })
    api.patch.mockResolvedValueOnce({ error: 'nope' })
    expect(await stock.setLowStockThreshold('p1', 3)).toBe(false)

    api.get.mockResolvedValue({ data: { movements: [{ id: 'm1' }] } })
    expect(await stock.listStockMovements('p1')).toEqual([{ id: 'm1' }])
    expect(api.get).toHaveBeenLastCalledWith('/stock/p1/movements')
  })

  it('names every movement kind', () => {
    expect(stock.movementLabel('sale')).toBe('Venda')
    expect(stock.movementLabel('restock')).toBe('Devolução')
    expect(stock.movementLabel('manual_in')).toBe('Entrada manual')
    expect(stock.movementLabel('manual_out')).toBe('Saída manual')
    expect(stock.movementLabel('adjustment')).toBe('Ajuste')
  })
})

describe('promo client', () => {
  it('sells at list price when the promotion cannot be read', async () => {
    api.get.mockResolvedValue({ error: 'down' })
    expect(await promo.getShopPromo()).toEqual(promo.PROMO_OFF)
    api.get.mockResolvedValue({ data: { enabled: true, percent: 5, bannerEnabled: true, bannerText: 'x' } })
    expect((await promo.getShopPromo()).percent).toBe(5)
    expect(api.get).toHaveBeenLastCalledWith('/promo', { skipAuth: true })
  })

  it('checks a coupon, and says why when the network fails', async () => {
    api.post.mockResolvedValue({ data: { valid: true, code: 'VERAO20', percent: 20, description: null } })
    expect(await promo.checkCoupon('VERAO20', 100, '')).toMatchObject({ valid: true, percent: 20 })
    expect(api.post).toHaveBeenCalledWith(
      '/promo/coupon-check',
      { code: 'VERAO20', subtotal: 100, email: undefined },
      { skipAuth: true }
    )
    api.post.mockResolvedValue({ error: 'Sem conexão' })
    expect(await promo.checkCoupon('X', 10)).toEqual({ valid: false, code: 'NETWORK', message: 'Sem conexão' })
  })

  it('manages coupons and throws the server message on failure', async () => {
    api.get.mockResolvedValue({ data: { coupons: [{ id: 'c1' }] } })
    expect(await promo.listCoupons()).toEqual([{ id: 'c1' }])
    api.get.mockResolvedValue({ error: 'x' })
    expect(await promo.listCoupons()).toEqual([])

    api.post.mockResolvedValue({ data: { id: 'c2' } })
    expect(await promo.createCoupon({ code: 'A', percent: 10 })).toEqual({ id: 'c2' })
    api.post.mockResolvedValue({ error: 'Código já existe', status: 409 })
    await expect(promo.createCoupon({ code: 'A', percent: 10 })).rejects.toThrow('Código já existe')

    api.patch.mockResolvedValue({ data: { id: 'c2', percent: 15 } })
    expect(await promo.updateCoupon('c2', { percent: 15 })).toMatchObject({ percent: 15 })
    expect(api.patch).toHaveBeenCalledWith('/promo/coupons/c2', { percent: 15 }, expect.any(Object))

    api.delete.mockResolvedValue({})
    await expect(promo.deactivateCoupon('c2')).resolves.toBeUndefined()
    api.delete.mockResolvedValue({ error: 'Não pode' })
    await expect(promo.deactivateCoupon('c2')).rejects.toThrow('Não pode')
  })
})

describe('gallery client', () => {
  it('reads public albums without auth and admin albums with it', async () => {
    api.get.mockResolvedValue({ data: { albums: [{ id: 'a1' }] } })
    expect(await gallery.listAlbums()).toEqual([{ id: 'a1' }])
    expect(api.get).toHaveBeenLastCalledWith('/gallery', { skipAuth: true })
    await gallery.listAlbums(true)
    expect(api.get).toHaveBeenLastCalledWith('/gallery/admin/albums', { skipAuth: false })
    api.get.mockResolvedValue({ error: 'x' })
    expect(await gallery.listAlbums()).toEqual([])
    expect(await gallery.getAlbum('evento')).toBeNull()
  })

  it('creates, updates, deletes and reorders', async () => {
    api.post.mockResolvedValue({ data: { id: 'a1' } })
    expect(await gallery.createAlbum({ name: 'Evento' })).toEqual({ id: 'a1' })
    api.patch.mockResolvedValue({ data: { id: 'a1', name: 'Novo' } })
    expect(await gallery.updateAlbum('a1', { name: 'Novo' })).toMatchObject({ name: 'Novo' })
    api.delete.mockResolvedValue({})
    expect(await gallery.deleteAlbum('a1')).toBe(true)
    api.delete.mockResolvedValue({ error: 'x' })
    expect(await gallery.deletePhoto('a1', 'p1')).toBe(false)
    api.put.mockResolvedValue({ data: { photos: [{ id: 'p2' }, { id: 'p1' }] } })
    expect(await gallery.reorderPhotos('a1', ['p2', 'p1'])).toHaveLength(2)
    expect(api.put).toHaveBeenCalledWith('/gallery/albums/a1/photos/order', { photoIds: ['p2', 'p1'] })
  })

  it('uploads in batches of what multer takes per request, adding up the skips', async () => {
    const files = Array.from({ length: gallery.MAX_PHOTO_UPLOAD_BATCH + 5 }, (_, i) => new File(['x'], `${i}.jpg`))
    api.request
      .mockResolvedValueOnce({ data: { photos: [{ id: 'p1' }], skippedOverLimit: 1 } })
      .mockResolvedValueOnce({ data: { photos: [{ id: 'p2' }], skippedOverLimit: 2 } })
    const result = await gallery.uploadPhotos('a1', files)
    expect(api.request).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ ok: true, photos: [{ id: 'p1' }, { id: 'p2' }], skippedOverLimit: 3 })
  })

  it('stops at the first failed batch, and refuses an empty selection', async () => {
    expect(await gallery.uploadPhotos('a1', [])).toEqual({ ok: false, error: 'Nenhuma foto selecionada.' })
    api.request.mockResolvedValueOnce({ error: 'Arquivo grande demais' })
    expect(await gallery.uploadPhotos('a1', [new File(['x'], 'a.jpg')])).toEqual({
      ok: false,
      error: 'Arquivo grande demais',
    })
  })
})

describe('questions client', () => {
  it('reads a product\'s questions publicly, paged, and falls back to an empty page', async () => {
    api.get.mockResolvedValue({ data: { questions: [{ id: 'q1' }], total: 1, page: 2, limit: 5 } })
    expect((await questions.listProductQuestions('holder', { page: 2, limit: 5 })).total).toBe(1)
    expect(api.get).toHaveBeenLastCalledWith('/questions/product/holder?page=2&limit=5', { skipAuth: true })
    api.get.mockResolvedValue({ error: 'x' })
    expect(await questions.listProductQuestions('holder')).toEqual({ questions: [], total: 0, page: 1, limit: 10 })
    expect(api.get).toHaveBeenLastCalledWith('/questions/product/holder', { skipAuth: true })
    expect(await questions.listMyQuestions()).toEqual([])
  })

  it('asks, and says why when it could not', async () => {
    api.post.mockResolvedValueOnce({ data: { id: 'q1' } })
    expect(await questions.askQuestion('p1', 'Tem em estoque?')).toEqual({ ok: true, question: { id: 'q1' } })
    expect(api.post).toHaveBeenLastCalledWith('/questions', { productId: 'p1', body: 'Tem em estoque?' })
    api.post.mockResolvedValueOnce({ error: 'Faça login' })
    expect(await questions.askQuestion('p1', 'x')).toEqual({ ok: false, error: 'Faça login' })
  })

  it('moderates from the admin side', async () => {
    api.get.mockResolvedValue({ error: 'x' })
    expect(await questions.adminListQuestions({ answered: false, page: 1 })).toMatchObject({ pending: 0, questions: [] })
    expect(api.get).toHaveBeenLastCalledWith('/questions/admin?answered=false&page=1')

    api.post.mockResolvedValueOnce({ data: { id: 'q1', answer: 'Sim' } })
    expect(await questions.answerQuestion('q1', 'Sim')).toMatchObject({ answer: 'Sim' })
    api.patch.mockResolvedValueOnce({ error: 'x' })
    expect(await questions.setQuestionStatus('q1', 'hidden')).toBeNull()
    expect(api.patch).toHaveBeenLastCalledWith('/questions/q1/status', { status: 'hidden' })
  })
})
