import { useEffect } from 'react'
import { getAppMode } from '../../lib/subdomain'

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
    const origin = window.location.origin
    const mode = getAppMode()
    const defaultImage =
      image ||
      (mode === 'shop' ? `${origin}/og-image.png` : `${origin}/og-image.png`)
    const url = `${origin}${path.startsWith('/') ? path : `/${path}`}`
    const fullTitle = title.includes('GeekPop') ? title : `${title} | GeekPop & Toys`

    document.title = fullTitle

    setMeta('name', 'description', description ?? '')
    setMeta('name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large')
    setLink('canonical', url)

    setMeta('property', 'og:type', type === 'product' ? 'product' : 'website')
    setMeta('property', 'og:url', url)
    setMeta('property', 'og:title', fullTitle)
    setMeta('property', 'og:description', description ?? '')
    setMeta('property', 'og:image', defaultImage)
    setMeta('property', 'og:site_name', mode === 'shop' ? 'Loja GeekPop & Toys' : 'Clube GeekPop & Toys')
    setMeta('property', 'og:locale', 'pt_BR')

    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', fullTitle)
    setMeta('name', 'twitter:description', description ?? '')
    setMeta('name', 'twitter:image', defaultImage)
  }, [title, description, path, image, type, noIndex])

  return null
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  if (!content) return
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
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
