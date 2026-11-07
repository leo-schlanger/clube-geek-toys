import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isSafeToReload } from './register-sw'

describe('isSafeToReload', () => {
  it.each([
    ['shop.geekpoptoys.com.br', '/'],
    ['shop.geekpoptoys.com.br', '/produto/album-bts'],
    ['shop.geeketoys.com.br', '/categoria/k-pop'],
    ['shop.geekpoptoys.com.br', '/carrinho'],
    ['club.geeketoys.com.br', '/assinar'],
    ['club.geeketoys.com.br', '/termos'],
  ])('swaps %s%s', (host, path) => {
    expect(isSafeToReload(host, path)).toBe(true)
  })

  it.each([
    ['shop.geekpoptoys.com.br', '/checkout'],
    ['shop.geekpoptoys.com.br', '/atacado/checkout'],
    ['shop.geekpoptoys.com.br', '/pedido/abc'],
    ['shop.geekpoptoys.com.br', '/evento'],
    ['shop.geekpoptoys.com.br', '/ingressos/XYZ'],
    ['shop.geekpoptoys.com.br', '/ingresso/XYZ'],
    ['shop.geekpoptoys.com.br', '/minhas-compras/1'],
    ['club.geeketoys.com.br', '/cadastro'],
    ['club.geeketoys.com.br', '/membro'],
    ['club.geeketoys.com.br', '/pagamento/pendente'],
    ['club.geeketoys.com.br', '/login'],
    ['club.geeketoys.com.br', '/pdv'],
    ['adm.geeketoys.com.br', '/'],
    ['admin.geekpoptoys.com.br', '/'],
  ])('never reloads %s%s under the user', (host, path) => {
    expect(isSafeToReload(host, path)).toBe(false)
  })
})

// The worker must take over by itself: the page never sends SKIP_WAITING.
describe('vite.config workbox', () => {
  it('skips waiting and claims open pages', () => {
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf-8')
    expect(config).toMatch(/skipWaiting:\s*true/)
    expect(config).toMatch(/clientsClaim:\s*true/)
  })
})
