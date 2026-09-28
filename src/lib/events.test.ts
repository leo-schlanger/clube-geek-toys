import { describe, it, expect, vi } from 'vitest'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('./api-client', () => ({ api }))

import {
  createEvent,
  deleteEvent,
  duplicateEvent,
  entryPriceLines,
  findPriceMismatches,
  getActiveEvent,
  isValidWhatsappNumber,
  linksToPayload,
  parsePriceInput,
  listEvents,
  normalizeLinkUrl,
  updateEvent,
  uploadEventBanner,
  uploadEventFlyer,
} from './events'
import { FALLBACK_EVENT } from '../data/event'

describe('normalizeLinkUrl', () => {
  it('adds https to a link pasted without a scheme', () => {
    expect(normalizeLinkUrl(' forms.gle/abc ')).toBe('https://forms.gle/abc')
    expect(normalizeLinkUrl('https://forms.gle/abc')).toBe('https://forms.gle/abc')
    expect(normalizeLinkUrl('HTTP://x.com')).toBe('HTTP://x.com')
    expect(normalizeLinkUrl('')).toBe('')
  })

  it('leaves another scheme alone so validation can refuse it', () => {
    expect(normalizeLinkUrl('javascript:alert(1)')).toBe('javascript:alert(1)')
  })
})

describe('linksToPayload', () => {
  it('drops blank rows and trims', () => {
    expect(
      linksToPayload([
        { label: '  Inscrição da competição ', url: 'forms.gle/abc' },
        { label: '', url: '  ' },
      ])
    ).toEqual([{ label: 'Inscrição da competição', url: 'https://forms.gle/abc' }])
  })

  it('refuses a half-filled row instead of dropping it silently', () => {
    expect(linksToPayload([{ label: '', url: 'https://forms.gle/abc' }])).toEqual({
      error: 'Dê um texto ao botão do link.',
    })
    expect(linksToPayload([{ label: 'Inscrição', url: '' }])).toEqual({
      error: 'Falta o endereço do botão "Inscrição".',
    })
  })

  it('refuses anything that is not http(s)', () => {
    expect(linksToPayload([{ label: 'X', url: 'javascript:alert(1)' }])).toEqual({
      error: 'O link do botão "X" não é um endereço válido.',
    })
  })
})

describe('event API client', () => {
  it('keeps the campaign on a network failure but not when nothing is on the bill', async () => {
    api.get.mockResolvedValueOnce({ error: 'timeout' })
    expect(await getActiveEvent()).toBe(FALLBACK_EVENT)
    api.get.mockRejectedValueOnce(new Error('offline'))
    expect(await getActiveEvent()).toBe(FALLBACK_EVENT)
    // Archived everything: must be null, or a closed event would come back.
    api.get.mockResolvedValueOnce({ data: { event: null } })
    expect(await getActiveEvent()).toBeNull()
  })

  it('lists, creates, updates, duplicates and deletes through the admin routes', async () => {
    api.get.mockResolvedValueOnce({ data: { events: [{ id: 'e1' }] } })
    expect(await listEvents()).toEqual([{ id: 'e1' }])

    api.post.mockResolvedValueOnce({ data: { event: { id: 'e2' } } })
    expect(await createEvent({ title: 'X', startsAt: '2026-10-11T17:00:00Z' })).toEqual({ id: 'e2' })
    api.post.mockResolvedValueOnce({ error: 'Título curto' })
    await expect(createEvent({ title: 'X', startsAt: 'x' })).rejects.toThrow('Título curto')

    api.patch.mockResolvedValueOnce({ data: { event: { id: 'e/1' } } })
    await updateEvent('e/1', { title: 'Y' })
    expect(api.patch).toHaveBeenLastCalledWith('/events/admin/events/e%2F1', { title: 'Y' })
    api.patch.mockResolvedValueOnce({ error: 'Falhou' })
    await expect(updateEvent('e1', {})).rejects.toThrow('Falhou')

    api.post.mockResolvedValueOnce({ data: { event: { id: 'e3' } } })
    expect(await duplicateEvent('e1')).toEqual({ id: 'e3' })

    api.delete.mockResolvedValueOnce({})
    await expect(deleteEvent('e1')).resolves.toBeUndefined()
    api.delete.mockResolvedValueOnce({ error: 'Tem reservas' })
    await expect(deleteEvent('e1')).rejects.toThrow('Tem reservas')
  })

  it('uploads the banner and a flyer as multipart, under the right field', async () => {
    const file = new File(['x'], 'cartaz.jpg', { type: 'image/jpeg' })
    api.post.mockResolvedValue({ data: { event: { id: 'e1' }, url: 'u' } })

    await uploadEventBanner('e1', file)
    let [path, , opts] = api.post.mock.calls.at(-1)!
    expect(path).toBe('/events/admin/events/e1/banner')
    expect((opts.body as FormData).get('banner')).toBe(file)

    await uploadEventFlyer('e1', file)
    ;[path, , opts] = api.post.mock.calls.at(-1)!
    expect(path).toBe('/events/admin/events/e1/flyers')
    expect((opts.body as FormData).get('flyer')).toBe(file)

    api.post.mockResolvedValue({ error: 'Imagem acima de 8 MB.' })
    await expect(uploadEventFlyer('e1', file)).rejects.toThrow('Imagem acima de 8 MB.')
  })
})

describe('parsePriceInput', () => {
  it('lê os jeitos em que um preço é digitado', () => {
    expect(parsePriceInput('20')).toBe(2000)
    expect(parsePriceInput('20,00')).toBe(2000)
    expect(parsePriceInput('20.00')).toBe(2000)
    expect(parsePriceInput('R$ 22,50')).toBe(2250)
    expect(parsePriceInput('1.234,56')).toBe(123456)
    expect(parsePriceInput('0')).toBe(0)
  })

  it('vazio é "sem preço"; lixo é inválido, nunca gratuito', () => {
    expect(parsePriceInput('')).toBeNull()
    expect(parsePriceInput('  ')).toBeNull()
    expect(parsePriceInput('vinte')).toBe('invalid')
    expect(parsePriceInput('20,,00')).toBe('invalid')
    expect(parsePriceInput('-5')).toBe('invalid')
    expect(parsePriceInput('20,005')).toBe('invalid')
  })
})

describe('findPriceMismatches', () => {
  it('aponta o texto que fala em outro preço', () => {
    expect(
      findPriceMismatches(2000, [
        { label: 'Faixa do topo', text: 'Evento · Entrada R$ 22' },
        { label: 'Vantagem do membro', text: 'Membros: R$ 11' },
      ])
    ).toEqual(['Faixa do topo: R$ 22', 'Vantagem do membro: R$ 11'])
  })

  it('aceita inteira, meia de membro e zero', () => {
    expect(
      findPriceMismatches(2000, [
        { label: 'x', text: 'Entrada R$ 20 (membros R$ 10,00). Criança de colo: R$ 0' },
      ])
    ).toEqual([])
  })

  it('sem preço não há o que comparar', () => {
    expect(findPriceMismatches(null, [{ label: 'x', text: 'R$ 22' }])).toEqual([])
  })
})

describe('entryPriceLines', () => {
  it('pega só as linhas que falam de entrada ou ingresso', () => {
    expect(
      entryPriceLines(['Entrada R$ 20 por pessoa', 'Premiação: R$ 200', 'Ingresso nominal R$ 20'])
    ).toEqual(['Entrada R$ 20 por pessoa', 'Ingresso nominal R$ 20'])
  })
})

describe('isValidWhatsappNumber', () => {
  it('exige DDI 55 + DDD + número', () => {
    expect(isValidWhatsappNumber('5511914662881')).toBe(true)
    expect(isValidWhatsappNumber('+55 (21) 3333-4444')).toBe(true)
    expect(isValidWhatsappNumber('21999999999')).toBe(false)
    expect(isValidWhatsappNumber('')).toBe(false)
  })
})
