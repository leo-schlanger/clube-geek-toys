/**
 * schema.org blocks the SPA adds per page (see `SeoHead` `jsonLd`).
 *
 * Search engines render the SPA — they are not routed to the preview HTML the
 * API serves to WhatsApp — so this is where Google reads the price, the stock
 * and the event date for rich results. Only facts the page already shows go
 * here: structured data that disagrees with the visible page is a manual-action
 * risk, not a boost.
 */
import type { Product } from '../types'
import type { EventConfig } from '../data/event'
import { eventArt } from '../data/event'
import { availableStock, hasSellablePrice } from './products'

type JsonLd = Record<string, unknown>

const IN_STOCK = 'https://schema.org/InStock'
const OUT_OF_STOCK = 'https://schema.org/OutOfStock'

/** The Store declared in shop.html; offers point at it as the seller. */
export function storeId(origin: string): string {
  return `${origin}/#store`
}

function absolute(src: string, origin: string): string {
  if (/^https?:\/\//i.test(src)) return src
  return `${origin}${src.startsWith('/') ? '' : '/'}${src}`
}

function plainText(text: string, max = 5000): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * `Product` with its offer. `null` for a product without a sellable price:
 * the shelf shows it as unavailable, and a R$ 0,00 offer is exactly what
 * Google's merchant checks reject.
 */
export function productJsonLd(product: Product, origin: string): JsonLd | null {
  const url = `${origin}/produto/${product.slug}`
  const variants = (product.variants ?? []).filter((v) => v.active && hasSellablePrice(v.price))
  const basePrice = product.priceFrom ?? product.price
  if (!variants.length && !hasSellablePrice(basePrice)) return null

  const seller = { '@id': storeId(origin) }
  const common = {
    priceCurrency: 'BRL',
    itemCondition: 'https://schema.org/NewCondition',
    url,
    seller,
  }

  let offers: JsonLd
  if (product.hasVariants && variants.length) {
    const prices = variants.map((v) => v.price)
    const anyInStock = variants.some((v) => availableStock(v) > 0)
    offers = {
      '@type': 'AggregateOffer',
      lowPrice: Math.min(...prices).toFixed(2),
      highPrice: Math.max(...prices).toFixed(2),
      offerCount: variants.length,
      availability: anyInStock ? IN_STOCK : OUT_OF_STOCK,
      ...common,
    }
  } else {
    offers = {
      '@type': 'Offer',
      price: basePrice.toFixed(2),
      availability: availableStock(product) > 0 ? IN_STOCK : OUT_OF_STOCK,
      ...common,
    }
  }

  const images = product.images.slice(0, 10).map((src) => absolute(src, origin))
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.name,
    url,
    ...(images.length ? { image: images } : {}),
    ...(product.description?.trim() ? { description: plainText(product.description) } : {}),
    sku: product.sku || product.id,
    ...(product.categoryName ? { category: product.categoryName } : {}),
    offers,
    ...(product.ratingCount && product.ratingCount > 0 && product.ratingAvg
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Number(product.ratingAvg.toFixed(1)),
            reviewCount: product.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  }
}

/** Breadcrumb trail: Loja › … › current page. Google shows it instead of the URL. */
export function breadcrumbJsonLd(
  trail: { name: string; path: string }[],
  origin: string
): JsonLd {
  const items = [{ name: 'Loja', path: '/' }, ...trail]
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${origin}${item.path}`,
    })),
  }
}

/** `Event`, the block Google reads for event results. Mirrors the API preview. */
export function eventJsonLd(event: EventConfig, origin: string): JsonLd {
  const url = `${origin}/evento`
  const images = eventArt(event)
  const price = event.priceCents
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    url,
    ...(event.description[0] ? { description: plainText(event.description.join(' ')) } : {}),
    startDate: event.startsAt,
    ...(event.endsAt ? { endDate: event.endsAt } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: images.length ? images : [`${origin}/og-image.png`],
    location: {
      '@type': 'Place',
      name: event.location.name || 'GeekPop & Toys',
      address: event.location.address || 'Rio de Janeiro — RJ',
    },
    organizer: { '@type': 'Organization', name: 'GeekPop & Toys', url: `${origin}/` },
    ...(price != null
      ? {
          offers: {
            '@type': 'Offer',
            price: (price / 100).toFixed(2),
            priceCurrency: 'BRL',
            url: `${url}#ingressos`,
            availability: event.ticketReservation.enabled ? IN_STOCK : 'https://schema.org/SoldOut',
          },
        }
      : {}),
  }
}
