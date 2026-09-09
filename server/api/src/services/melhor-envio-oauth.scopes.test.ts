import { describe, it, expect, vi } from 'vitest';

/**
 * What a stored token may actually do.
 *
 * `authorized` only says a token exists. The one on the shop's account was
 * issued before the label scopes were added, so the panel reported the
 * integration as connected while every label attempt died with a 403 — and
 * nothing on screen explained the gap. These lock the distinction.
 */

vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    MELHOR_ENVIO_CLIENT_ID: '28418',
    MELHOR_ENVIO_CLIENT_SECRET: 'secret',
    MELHOR_ENVIO_SCOPES: 'shipping-calculate cart-write',
    MELHOR_ENVIO_SANDBOX: false,
    API_URL: 'https://api.example.com',
  },
}));
vi.mock('../config/database.js', () => ({ query: vi.fn() }));

import { scopesOf } from './melhor-envio-oauth.service.js';

/** A JWT shaped like Melhor Envio's: only the payload matters here. */
function tokenWith(scopes: unknown): string {
  const payload = Buffer.from(JSON.stringify({ aud: '28418', scopes })).toString('base64url');
  return `header.${payload}.signature`;
}

describe('scopesOf', () => {
  it('reads the granted scopes out of the token', () => {
    expect(scopesOf(tokenWith(['shipping-calculate', 'cart-write']))).toEqual([
      'shipping-calculate',
      'cart-write',
    ]);
  });

  /** The exact token the shop had: quotes freight, cannot buy a label. */
  it('reports the calculate-only token as having just that', () => {
    expect(scopesOf(tokenWith(['shipping-calculate']))).toEqual(['shipping-calculate']);
  });

  /**
   * Never throws. It runs while rendering a status panel, and a token we cannot
   * parse must degrade to "we do not know" rather than take the page down.
   */
  it.each([
    ['not a jwt', 'lalala'],
    ['empty', ''],
    ['payload is not base64', 'a.!!!.c'],
    ['payload is not json', `a.${Buffer.from('nope').toString('base64url')}.c`],
  ])('returns nothing for a token that %s', (_label, token) => {
    expect(scopesOf(token)).toEqual([]);
  });

  it('ignores a scopes claim that is not a list of strings', () => {
    expect(scopesOf(tokenWith('cart-write'))).toEqual([]);
    expect(scopesOf(tokenWith({ a: 1 }))).toEqual([]);
    expect(scopesOf(tokenWith(['cart-write', 42, null]))).toEqual(['cart-write']);
  });

  it('handles a token with no scopes claim at all', () => {
    const payload = Buffer.from(JSON.stringify({ aud: '28418' })).toString('base64url');
    expect(scopesOf(`h.${payload}.s`)).toEqual([]);
  });
});
