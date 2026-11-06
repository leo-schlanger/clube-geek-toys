/**
 * Public legal identity of the store.
 *
 * Source: JUCERJA constitution filed 15/10/2026, CNPJ card and RJ state
 * registration of the same day. The brand customers already know stays
 * "GeekPop & Toys"; the registry trade name is GEEKPOP.
 *
 * Payment rails and the shipping-label sender stay on the previous company's
 * accounts until those providers are opened under this CNPJ. Do not "fix"
 * that by editing Pagar.me keys or STORE_SENDER here.
 */

export const COMPANY = {
  legalName: 'LNA GEEK POP COMERCIO DE ARTIGOS EM GERAL LTDA',
  tradeName: 'GEEKPOP',
  brand: 'GeekPop & Toys',
  cnpj: '69.629.548/0001-00',
  ie: '16.772.08-9',
  nire: '33.2.1525821-2',
  street: 'Rua Barata Ribeiro, 181, Loja J',
  city: 'Rio de Janeiro',
  state: 'RJ',
  cep: '22.011-001',
  email: 'contato@geeketoys.com.br',
  constitutedOnLabel: '15 de outubro de 2026',
} as const

/**
 * Storefront facts for the shop's Store JSON-LD (shop.html). A test keeps the
 * static block in step with this file.
 */
export const STORE_LOCATION = {
  neighborhood: 'Copacabana',
  postalCode: '22011-001',
  /** WhatsApp of the Rio counter, the number the shop footer shows. */
  telephone: '+55-21-98546-4666',
  // Pin of the Google Business Profile (Leo, 06/11/2026).
  geo: { latitude: -22.9652592, longitude: -43.1800191 },
  instagram: 'https://www.instagram.com/geeketoys/',
  sameAs: [
    'https://www.instagram.com/geeketoys/',
    'https://www.facebook.com/geeketoyscolection/',
    'https://www.tiktok.com/@geeketoys',
    'https://geekpoptoys.com.br',
  ],
  /**
   * Google Business Profile, Rio time (Leo, 06/11/2026). The pickup text
   * (STORE_PICKUP.hours, front and API) says the same in words.
   */
  openingHours: [
    {
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '09:00',
      closes: '19:00',
    },
    { dayOfWeek: ['Saturday'], opens: '09:00', closes: '16:00' },
  ],
} as const

export const COMPANY_ADDRESS_LINE =
  'Rua Barata Ribeiro, 181, Loja J - Copacabana, Rio de Janeiro - RJ, CEP 22.011-001'

/** Who ran the storefront before the 15/10/2026 constitution. Not dissolved here. */
export const PREVIOUS_COMPANY = {
  legalName: 'N. STANLEY SCHLANGER COMERCIO DE ARTIGOS EM GERAL LTDA',
  cnpj: '52.846.344/0001-10',
} as const
