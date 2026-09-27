import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Shipping routes over real HTTP.
 *
 * Quoting is public (the checkout of a guest); the Melhor Envio authorization
 * is admin, except the OAuth callback, which a browser reaches carrying none of
 * our auth — the signed `state` is what authenticates it. Every callback page
 * links back to the panel, so a phone is never stranded on the API domain.
 */

vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);
vi.mock('../middleware/rate-limit.js', async () => (await import('../test-support/env.js')).rateLimitModule);
vi.mock('../services/log.service.js', () => ({ createErrorLog: vi.fn(async () => {}) }));

const { shipping, oauth } = vi.hoisted(() => ({
  shipping: { lookupCep: vi.fn(), quoteShipping: vi.fn() },
  oauth: {
    getOAuthStatus: vi.fn(),
    buildAuthorizeUrl: vi.fn(() => 'https://melhorenvio.com.br/oauth/authorize?x=1'),
    isValidState: vi.fn(),
    exchangeCodeForToken: vi.fn(),
    clearToken: vi.fn(),
  },
}));
vi.mock('../services/shipping.service.js', () => shipping);
vi.mock('../services/melhor-envio-oauth.service.js', () => oauth);

import { shippingRouter } from './shipping.routes.js';
import { routerClient } from '../test-support/http.js';

const api = routerClient('/shipping', shippingRouter);
const PRODUCT = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

beforeEach(() => vi.clearAllMocks());

describe('public', () => {
  it('looks up a CEP and quotes a cart', async () => {
    shipping.lookupCep.mockResolvedValue({ city: 'Rio de Janeiro' });
    expect((await api.get('/cep/22041001')).body).toEqual({ city: 'Rio de Janeiro' });

    shipping.quoteShipping.mockResolvedValue({ options: [] });
    await api.post('/quote', { body: { cep: '22041-001', items: [{ productId: PRODUCT, quantity: 2 }] } });
    expect(shipping.quoteShipping).toHaveBeenCalledWith('22041-001', [{ productId: PRODUCT, quantity: 2 }]);
  });

  it('refuses an empty cart, a bad CEP and an absurd quantity', async () => {
    for (const body of [
      { cep: '22041001', items: [] },
      { cep: '123', items: [{ productId: PRODUCT, quantity: 1 }] },
      { cep: '22041001', items: [{ productId: PRODUCT, quantity: 100 }] },
    ]) {
      expect((await api.post('/quote', { body })).status).toBe(400);
    }
    expect(shipping.quoteShipping).not.toHaveBeenCalled();
  });
});

describe('Melhor Envio authorization', () => {
  it('is admin-only to read, start and revoke', async () => {
    expect((await api.get('/melhor-envio/status')).status).toBe(401);
    expect((await api.get('/melhor-envio/status', { as: 'seller' })).status).toBe(403);
    oauth.getOAuthStatus.mockResolvedValue({ canBuyLabel: true });
    expect((await api.get('/melhor-envio/status', { as: 'admin' })).body).toEqual({ canBuyLabel: true });
    expect((await api.delete('/melhor-envio/token', { as: 'admin' })).status).toBe(204);
    expect(oauth.clearToken).toHaveBeenCalled();
  });

  it('returns the authorize URL, or redirects to it on request', async () => {
    expect((await api.get('/melhor-envio/authorize', { as: 'admin' })).body).toEqual({ url: 'https://melhorenvio.com.br/oauth/authorize?x=1' });
    const redirect = await api.get('/melhor-envio/authorize?redirect=1', { as: 'admin' });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe('https://melhorenvio.com.br/oauth/authorize?x=1');
  });

  it('saves the token only for a valid state and a code', async () => {
    oauth.isValidState.mockReturnValue(true);
    const ok = await api.get('/melhor-envio/callback?code=abc&state=signed');
    expect(ok.status).toBe(200);
    expect(oauth.exchangeCodeForToken).toHaveBeenCalledWith('abc');
    expect(ok.text).toContain('Melhor Envio conectado');
    expect(ok.text).toContain('https://adm.geeketoys.com.br/admin?tab=settings');

    expect((await api.get('/melhor-envio/callback?state=signed')).text).toContain('Faltou o código');
    oauth.isValidState.mockReturnValue(false);
    expect((await api.get('/melhor-envio/callback?code=abc&state=forged')).status).toBe(400);
    expect(oauth.exchangeCodeForToken).toHaveBeenCalledTimes(1);
  });

  it('escapes the provider error on the page it shows', async () => {
    const res = await api.get('/melhor-envio/callback?error=%3Cscript%3Ealert(1)%3C/script%3E');
    expect(res.status).toBe(400);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;');
  });
});
