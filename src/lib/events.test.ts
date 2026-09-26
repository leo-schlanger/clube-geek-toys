import { describe, it, expect, vi } from 'vitest'

vi.mock('./api-client', () => ({ api: {} }))

import { linksToPayload, normalizeLinkUrl } from './events'

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
