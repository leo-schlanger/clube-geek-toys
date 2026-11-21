/**
 * schema.org blocks of the club's sales page (/assinar). They used to sit in
 * index.html, so every club route (terms, privacy, login) and the admin panel
 * declared the plan and an FAQ they do not show.
 */
import { CLUB_PLAN, MEMBER_DISCOUNT_PERCENT } from '../types'
import { COMPANY, STORE_LOCATION } from './company'
import { MEMBER_TICKET_DISCOUNT_PERCENT } from './club-value'

const PITCH = `${MEMBER_DISCOUNT_PERCENT}% de desconto em qualquer produto (loja física e online), ${MEMBER_TICKET_DISCOUNT_PERCENT}% nos ingressos dos eventos e brinde na primeira compra`

export function clubOrganizationJsonLd(origin: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Clube GeekPop & Toys',
    legalName: COMPANY.legalName,
    taxID: COMPANY.cnpj,
    alternateName: COMPANY.brand,
    description: `Clube de vantagens com ${PITCH}. Produtos de K-pop, colecionáveis, Funkos e muito mais.`,
    url: `${origin}/assinar`,
    logo: `${origin}/logo-vip.png`,
    image: `${origin}/og-image.png`,
    sameAs: [...STORE_LOCATION.sameAs],
    address: {
      '@type': 'PostalAddress',
      streetAddress: COMPANY.street,
      addressLocality: COMPANY.city,
      addressRegion: COMPANY.state,
      postalCode: STORE_LOCATION.postalCode,
      addressCountry: 'BR',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      email: COMPANY.email,
      contactType: 'customer service',
      availableLanguage: 'Portuguese',
    },
  }
}

export function clubPlanJsonLd(origin: string): Record<string, unknown> {
  const price = CLUB_PLAN.price.toFixed(2)
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Clube GeekPop & Toys',
    description: `Clube de vantagens com ${PITCH}. Carteirinha digital para fãs de cultura geek e K-pop.`,
    brand: { '@type': 'Brand', name: COMPANY.brand },
    image: `${origin}/logo-vip.png`,
    offers: {
      '@type': 'Offer',
      name: 'Plano anual do Clube',
      priceCurrency: 'BRL',
      price,
      availability: 'https://schema.org/InStock',
      url: `${origin}/assinar`,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price,
        priceCurrency: 'BRL',
        billingDuration: 1,
        billingIncrement: 1,
        unitCode: 'ANN',
        referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'ANN' },
      },
    },
  }
}

/** FAQPage from the questions the page actually shows. */
export function faqJsonLd(faq: { q: string; a: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}
