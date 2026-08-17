import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Melhor Envio integration health.
 *
 * A rejected credential breaks nothing visibly: quotes fall to the internal
 * table and the customer sees a plausible but wrong price until the difference
 * shows up at the till. These tests pin the signal that makes it visible.
 */

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../config/database.js', () => ({ query: queryMock, getClient: vi.fn() }));
vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    MELHOR_ENVIO_TOKEN: 'token-de-teste',
    MELHOR_ENVIO_SANDBOX: false,
    SHIPPING_ORIGIN_CEP: '22011001',
    HMAC_SECRET: 'x'.repeat(32),
  },
}));

const { quoteShipping, getMelhorEnvioHealth } = await import('./shipping.service.js');

const PRODUCT_ROW = {
  id: 'p1',
  name: 'Photocard BTS',
  weight_g: 300,
  height_cm: 4,
  width_cm: 12,
  length_cm: 17,
  active: true,
  stock: 10,
};

/** A response with one usable option: the happy path of a real quote. */
const LIVE_OPTION = [
  {
    id: 1,
    name: 'PAC',
    company: { name: 'Correios' },
    price: '24.90',
    delivery_time: 8,
  },
];

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  queryMock.mockResolvedValue({ rows: [PRODUCT_ROW] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('quoteShipping — quote source', () => {
  it('uses the real quote when Melhor Envio responds', async () => {
    vi.stubGlobal('fetch', mockFetch(200, LIVE_OPTION));

    const result = await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);

    expect(result.source).toBe('melhor_envio');
    expect(result.options[0].price).toBe(24.9);
    expect(getMelhorEnvioHealth().lastSuccessAt).toBeTruthy();
  });

  // The rejected-credential case.
  it('falls back to the internal table when the credential is refused', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { message: 'Unauthenticated.' }));

    const result = await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);

    // The customer still gets a price, which is exactly what hides the failure.
    expect(result.source).toBe('fallback');
    expect(result.options.length).toBeGreaterThan(0);
  });

  it('treats a 200 with an empty list as fallback, not success', async () => {
    // lastSuccessAt is process state by design (a health signal, not a
    // per-request value), so the assertion is relative: it must not advance.
    const before = getMelhorEnvioHealth().lastSuccessAt;
    vi.stubGlobal('fetch', mockFetch(200, []));

    const result = await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);

    expect(result.source).toBe('fallback');
    expect(getMelhorEnvioHealth().lastSuccessAt).toBe(before);
  });
});

describe('getMelhorEnvioHealth — o sinal que faltava', () => {
  it('flags credentialRejected on 401', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { message: 'Unauthenticated.' }));
    await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);

    const health = getMelhorEnvioHealth();
    expect(health.lastFailure?.kind).toBe('auth');
    expect(health.lastFailure?.status).toBe(401);
  });

  it('flags credentialRejected on 403', async () => {
    vi.stubGlobal('fetch', mockFetch(403, 'Forbidden'));
    await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);

    expect(getMelhorEnvioHealth().lastFailure?.kind).toBe('auth');
  });

  // Upstream flakiness and a wrong credential need different responses: one
  // resolves by waiting, the other does not.
  it('separates upstream flakiness (500) from a refused credential', async () => {
    vi.stubGlobal('fetch', mockFetch(500, 'Internal Server Error'));
    await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);

    const health = getMelhorEnvioHealth();
    expect(health.lastFailure?.kind).toBe('other');
    expect(health.lastFailure?.status).toBe(500);
  });

  it('logs loudly when the credential is refused', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', mockFetch(401, { message: 'Unauthenticated.' }));

    await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('CREDENCIAL DO MELHOR ENVIO RECUSADA')
    );
    // The message has to say what is happening to the money.
    expect(error).toHaveBeenCalledWith(expect.stringContaining('TABELA DE FALLBACK'));
    error.mockRestore();
  });

  it('clears the failure once a real quote succeeds again', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { message: 'Unauthenticated.' }));
    await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);
    expect(getMelhorEnvioHealth().lastFailure).not.toBeNull();

    vi.stubGlobal('fetch', mockFetch(200, LIVE_OPTION));
    await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);

    expect(getMelhorEnvioHealth().lastFailure).toBeNull();
  });

  it('reporta o ambiente configurado junto do estado', () => {
    const health = getMelhorEnvioHealth();
    expect(health.configured).toBe(true);
    expect(health.sandbox).toBe(false);
  });
});
