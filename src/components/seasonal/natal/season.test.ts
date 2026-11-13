import { describe, expect, it } from 'vitest'
import { isNatalActive, isNatalDecorPath, natalBannerKey, parseSeasonOverride } from './season'

describe('isNatalActive', () => {
  it('starts on 13 Nov 2026 at 00:00 UTC', () => {
    expect(isNatalActive(new Date('2026-11-12T23:59:59.999Z'))).toBe(false)
    expect(isNatalActive(new Date('2026-11-13T00:00:00.000Z'))).toBe(true)
  })

  it('covers the whole of 26 Dec in Rio and ends at its midnight', () => {
    // 26 Dec 23:59:59 in Rio = 27 Dec 02:59:59 UTC
    expect(isNatalActive(new Date('2026-12-27T02:59:59.999Z'))).toBe(true)
    expect(isNatalActive(new Date('2026-12-27T03:00:00.000Z'))).toBe(false)
    expect(isNatalActive(new Date('2027-01-10T12:00:00Z'))).toBe(false)
  })

  it('obeys the qa override in both directions', () => {
    expect(isNatalActive(new Date('2027-03-01T00:00:00Z'), 'natal')).toBe(true)
    expect(isNatalActive(new Date('2026-12-01T00:00:00Z'), 'off')).toBe(false)
  })
})

describe('parseSeasonOverride', () => {
  it('accepts only natal and off', () => {
    expect(parseSeasonOverride('?season=natal')).toBe('natal')
    expect(parseSeasonOverride('?a=1&season=off')).toBe('off')
    expect(parseSeasonOverride('?season=halloween')).toBeNull()
    expect(parseSeasonOverride('')).toBeNull()
  })
})

describe('isNatalDecorPath', () => {
  const shop = 'shop.geeketoys.com.br'
  const club = 'club.geekpoptoys.com.br'

  it('decorates the storefront and the club pages that sell nothing on screen', () => {
    for (const path of ['/', '/categoria/kpop', '/produto/photocard-x', '/carrinho', '/carrinho/']) {
      expect(isNatalDecorPath(shop, path)).toBe(true)
    }
    expect(isNatalDecorPath(club, '/assinar')).toBe(true)
    expect(isNatalDecorPath(club, '/membro')).toBe(true)
  })

  it('never decorates payment, forms, tickets, wholesale or PDV', () => {
    for (const path of [
      '/checkout',
      '/pedido/123',
      '/pagamento/sucesso',
      '/cadastro',
      '/entrar',
      '/login',
      '/recuperar-senha',
      '/verificar/abc',
      '/evento',
      '/ingresso/X1',
      '/ingressos/X1',
      '/perfil',
      '/minhas-compras',
      '/atacado',
      '/atacado/carrinho',
      '/atacado/checkout',
      '/pdv',
      '/admin',
      '/categoria',
    ]) {
      expect(isNatalDecorPath(shop, path), path).toBe(false)
    }
  })

  it('never decorates the staff hosts', () => {
    expect(isNatalDecorPath('adm.geeketoys.com.br', '/')).toBe(false)
    expect(isNatalDecorPath('admin.geekpoptoys.com.br', '/membro')).toBe(false)
  })

  it('keys the closed strip by site', () => {
    expect(natalBannerKey('shop')).not.toBe(natalBannerKey('club'))
  })
})
