import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

const mockMode = vi.hoisted(() => ({ value: 'shop' as 'shop' | 'club' }))
const CANONICAL = { shop: 'https://shop.geekpoptoys.com.br', club: 'https://club.geeketoys.com.br' }
vi.mock('../../lib/subdomain', () => ({
  getAppMode: () => mockMode.value,
  getCanonicalOrigin: () => CANONICAL[mockMode.value],
}))

import { SeoHead } from './SeoHead'

/**
 * SEO da SPA. Vale lembrar o alcance: crawler de link (WhatsApp, Facebook) não
 * roda JS e nunca vê nada disto — para eles quem responde é `shop.html` /
 * `index.html` e o `/__share/` do nginx. Aqui é o Google, que executa JS.
 */

function meta(attr: 'name' | 'property', key: string): string | null {
  return (
    document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
  )?.content ?? null
}

function canonical(): string | null {
  return (document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href ?? null
}

const originalTitle = document.title

beforeEach(() => {
  document.title = ''
  document.head.querySelectorAll('meta, link[rel="canonical"]').forEach((el) => el.remove())
  mockMode.value = 'shop'
})

afterEach(() => {
  cleanup()
  document.title = originalTitle
})

describe('SeoHead — título e canonical', () => {
  it('completa o título com o nome do site quando falta a marca', () => {
    render(<SeoHead title="Carrinho" path="/carrinho" />)
    expect(document.title).toBe('Carrinho | Loja GeekPop & Toys')
  })

  it('respeita o título que já traz a marca', () => {
    render(<SeoHead title="Loja GeekPop & Toys | K-pop" />)
    expect(document.title).toBe('Loja GeekPop & Toys | K-pop')
  })

  it('usa o nome do clube quando o modo é club', () => {
    mockMode.value = 'club'
    render(<SeoHead title="Assinar" />)
    expect(meta('property', 'og:site_name')).toBe('Clube GeekPop & Toys')
  })

  it('aponta o canonical para a própria origem e caminho', () => {
    render(<SeoHead title="Produto" path="/produto/x" />)
    expect(canonical()).toBe('https://shop.geekpoptoys.com.br/produto/x')
  })

  it('aceita caminho sem barra inicial', () => {
    render(<SeoHead title="X" path="carrinho" />)
    expect(canonical()).toBe('https://shop.geekpoptoys.com.br/carrinho')
  })
})

describe('SeoHead — imagem', () => {
  // Regressão: o default vinha de um ternário com os dois lados idênticos, e a
  // foto do produto chegava relativa, sumindo do preview.
  it('torna caminho relativo absoluto', () => {
    render(<SeoHead title="Produto" image="/uploads/a.jpg" />)
    expect(meta('property', 'og:image')).toBe('https://shop.geekpoptoys.com.br/uploads/a.jpg')
  })

  it('preserva URL já absoluta', () => {
    render(<SeoHead title="Produto" image="https://api.geeketoys.com.br/uploads/a.jpg" />)
    expect(meta('property', 'og:image')).toBe('https://api.geeketoys.com.br/uploads/a.jpg')
  })

  it('cai no og-image padrão quando não há foto', () => {
    render(<SeoHead title="Carrinho" />)
    expect(meta('property', 'og:image')).toBe('https://shop.geekpoptoys.com.br/og-image.png')
  })

  it('mantém twitter:image e og:image iguais', () => {
    render(<SeoHead title="P" image="/uploads/a.jpg" />)
    expect(meta('name', 'twitter:image')).toBe(meta('property', 'og:image'))
  })
})

describe('SeoHead — indexação', () => {
  it('libera indexação por padrão', () => {
    render(<SeoHead title="Vitrine" />)
    expect(meta('name', 'robots')).toBe('index, follow, max-image-preview:large')
  })

  it('bloqueia quando noIndex', () => {
    render(<SeoHead title="Checkout" noIndex />)
    expect(meta('name', 'robots')).toBe('noindex, nofollow')
  })

  it('marca og:type product na página de produto', () => {
    render(<SeoHead title="P" type="product" />)
    expect(meta('property', 'og:type')).toBe('product')
  })
})

describe('SeoHead — meta obsoleta entre navegações', () => {
  // O bug: valor vazio saía cedo da função e a tag anterior ficava no head.
  // Indo de um produto para o carrinho, a description continuava a do produto.
  it('apaga a description quando a nova página não tem uma', () => {
    const { unmount } = render(<SeoHead title="Produto" description="Photocard raro" />)
    expect(meta('name', 'description')).toBe('Photocard raro')
    unmount()

    render(<SeoHead title="Carrinho" />)
    expect(meta('name', 'description')).toBeNull()
    expect(meta('property', 'og:description')).toBeNull()
  })

  it('substitui a description ao trocar de página', () => {
    const { unmount } = render(<SeoHead title="A" description="primeira" />)
    unmount()
    render(<SeoHead title="B" description="segunda" />)

    expect(meta('name', 'description')).toBe('segunda')
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1)
  })

  it('não duplica tags ao re-renderizar', () => {
    const { rerender } = render(<SeoHead title="A" description="x" />)
    rerender(<SeoHead title="A" description="y" />)

    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1)
    expect(meta('property', 'og:description')).toBe('y')
  })
})

describe('SeoHead — domínio canônico', () => {
  // Regressão: o canonical saía de window.location.origin, então cada domínio
  // espelho se declarava canônico de si mesmo. Para o Google isso é conteúdo
  // duplicado, e a autoridade de busca se divide em vez de somar.
  it('usa o canônico da loja, não o domínio acessado', () => {
    render(<SeoHead title="Vitrine" path="/" />)

    expect(canonical()).toBe('https://shop.geekpoptoys.com.br/')
    expect(meta('property', 'og:url')).toBe('https://shop.geekpoptoys.com.br/')
  })

  it('usa o canônico do clube no modo club', () => {
    mockMode.value = 'club'
    render(<SeoHead title="Assinar" path="/assinar" />)

    expect(canonical()).toBe('https://club.geeketoys.com.br/assinar')
  })

  it('não deixa o canonical variar com o host da janela', () => {
    // O jsdom serve em localhost; se o canonical o refletisse, sairia daqui.
    render(<SeoHead title="X" path="/" />)
    expect(canonical()).not.toContain(window.location.hostname)
  })
})
