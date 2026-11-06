/**
 * Visible SEO text of the shop: category intros and product photo alts.
 * Plain sentences built from what the admin already typed — no keyword lists.
 */
import type { Category } from '../types'
import { MEMBER_DISCOUNT_PERCENT } from '../types'

function flat(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Cuts at a word boundary, for meta descriptions. */
export function clip(text: string, max = 160): string {
  const t = flat(text)
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '')}…`
}

/**
 * Intro paragraph of a category page. The admin's description wins; without
 * one (every category in production as of 06/11/2026), a short sentence from
 * the name and the store's own facts.
 */
export function categoryIntro(category: Pick<Category, 'name' | 'description'>): string {
  const own = category.description ? flat(category.description) : ''
  if (own) return own
  return (
    `${category.name} na GeekPop & Toys, loja geek e de K-pop em Copacabana, no Rio de Janeiro. ` +
    `Envio pelos Correios para todo o Brasil ou retirada na loja, com PIX ou cartão. ` +
    `Membros do clube têm ${MEMBER_DISCOUNT_PERCENT}% de desconto.`
  )
}

/** Page title of a category; page 2+ says so, or every page shares one title. */
export function categoryTitle(name: string, page = 1): string {
  return page > 1 ? `${name} — página ${page}` : name
}

/**
 * Alt of a product photo: product name, the chosen variation and, in a
 * gallery, which photo it is ("Moletom BTS — Rosa / M — foto 2 de 5").
 */
export function productPhotoAlt(
  name: string,
  variant?: string | null,
  index?: number,
  total?: number
): string {
  const parts = [flat(name)]
  if (variant && flat(variant)) parts.push(flat(variant))
  if (index != null && total != null && total > 1) parts.push(`foto ${index + 1} de ${total}`)
  return parts.join(' — ')
}
