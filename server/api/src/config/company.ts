/**
 * Public legal identity, mirrored from src/lib/company.ts.
 * The API package cannot import the SPA module.
 * Keep the two in step when the registry data changes.
 */

export const COMPANY = {
  legalName: 'LNA GEEK POP COMERCIO DE ARTIGOS EM GERAL LTDA',
  tradeName: 'GEEKPOP',
  brand: 'GeekPop & Toys',
  cnpj: '69.629.548/0001-00',
  ie: '16.772.08-9',
  addressLine: 'R. Barata Ribeiro, 181 - loja J, Copacabana, Rio de Janeiro - RJ',
} as const
