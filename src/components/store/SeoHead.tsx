import { useEffect } from 'react'
import { getAppMode, getCanonicalOrigin } from '../../lib/subdomain'

export interface SeoHeadProps {
  title: string
  description?: string
  path?: string
  image?: string
  type?: 'website' | 'product'
  noIndex?: boolean
}

/**
 * Client-side SEO tags for shop/club SPAs.
 * Updates document title + meta/OG. Absolute URLs use the current host
 * so shop.geeketoys.com.br previews don't inherit club meta after JS runs.
 * (Crawlers that don't execute JS still need host-aware static HTML/nginx — see plan.)
 */
export function SeoHead({
  title,
  description,
  path = '/',
  image,
  type = 'website',
  noIndex = false,
}: SeoHeadProps) {
  useEffect(() => {
    // Origem **canônica**, não a acessada. Com dois domínios espelho servindo o
    // mesmo conteúdo, derivar de window.location.origin fazia cada um se
    // declarar canônico de si — o Google via conteúdo duplicado e dividia a
    // autoridade. As imagens seguem a mesma origem para não gerar mais uma URL
    // do mesmo arquivo.
    const origin = getCanonicalOrigin()
    const mode = getAppMode()
    const siteName = mode === 'shop' ? 'Loja GeekPop & Toys' : 'Clube GeekPop & Toys'
    // OG exige URL absoluta: foto de produto chega como caminho relativo em
    // parte dos casos, e um "/uploads/x.jpg" cru some do preview.
    const ogImage = absolute(image, origin) ?? `${origin}/og-image.png`
    const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`
    const fullTitle = title.includes('GeekPop') ? title : `${title} | ${siteName}`

    document.title = fullTitle

    setMeta('name', 'description', description)
    setMeta('name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large')
    setLink('canonical', url)

    setMeta('property', 'og:type', type === 'product' ? 'product' : 'website')
    setMeta('property', 'og:url', url)
    setMeta('property', 'og:title', fullTitle)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:image', ogImage)
    setMeta('property', 'og:image:alt', title)
    setMeta('property', 'og:site_name', siteName)
    setMeta('property', 'og:locale', 'pt_BR')

    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', fullTitle)
    setMeta('name', 'twitter:description', description)
    setMeta('name', 'twitter:image', ogImage)
  }, [title, description, path, image, type, noIndex])

  return null
}

/** Resolve caminho relativo contra a origem; devolve undefined se não houver. */
function absolute(src: string | undefined, origin: string): string | undefined {
  if (!src) return undefined
  if (/^https?:\/\//i.test(src)) return src
  return `${origin}${src.startsWith('/') ? src : `/${src}`}`
}

/**
 * Escreve — ou **apaga** — a tag.
 *
 * Apagar importa: antes um valor vazio saía pela porta dos fundos e a tag da
 * página anterior continuava no head. Navegando de um produto para o carrinho,
 * a description seguia sendo a do produto.
 */
function setMeta(attr: 'name' | 'property', key: string, content: string | undefined) {
  const el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
  if (!content) {
    el?.remove()
    return
  }
  if (el) {
    el.content = content
    return
  }
  const created = document.createElement('meta')
  created.setAttribute(attr, key)
  created.content = content
  document.head.appendChild(created)
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
}

/** Default shop landing SEO — call on ShopHome without filters. */
export const SHOP_DEFAULT_SEO = {
  title: 'Loja GeekPop & Toys | K-pop, Photocards e Colecionáveis no RJ',
  description:
    'Loja de K-pop no Rio de Janeiro. Photocards, merch e colecionáveis com envio pelos Correios. Membros do Clube ganham 15% de desconto. PIX e cartão.',
} as const
