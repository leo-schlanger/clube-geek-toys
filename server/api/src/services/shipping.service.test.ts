import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Saúde da integração com o Melhor Envio.
 *
 * O motivo destes testes existirem: em 16/08/2026 uma credencial foi entregue
 * como "chave da API" e o Melhor Envio devolveu 401 em produção e em sandbox.
 * Se ela tivesse sido instalada, nada quebraria visivelmente — a cotação cai na
 * tabela interna e o cliente vê um preço plausível, porém errado, até a
 * diferença aparecer no caixa. Aqui se trava o sinal que torna isso visível.
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

/** Resposta com uma opção utilizável — o caminho feliz da cotação real. */
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

describe('quoteShipping — origem da cotação', () => {
  it('usa a cotação real quando o Melhor Envio responde', async () => {
    vi.stubGlobal('fetch', mockFetch(200, LIVE_OPTION));

    const result = await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);

    expect(result.source).toBe('melhor_envio');
    expect(result.options[0].price).toBe(24.9);
    expect(getMelhorEnvioHealth().lastSuccessAt).toBeTruthy();
  });

  // O caso desta sessão: credencial recusada.
  it('cai na tabela interna quando a credencial é recusada', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { message: 'Unauthenticated.' }));

    const result = await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);

    // O cliente ainda recebe preço — é justamente o que torna a falha invisível.
    expect(result.source).toBe('fallback');
    expect(result.options.length).toBeGreaterThan(0);
  });

  it('trata 200 com lista vazia como fallback, não como sucesso', async () => {
    // lastSuccessAt é estado de processo de propósito (é sinal de saúde, não de
    // requisição), então a asserção é relativa: não pode avançar.
    const before = getMelhorEnvioHealth().lastSuccessAt;
    vi.stubGlobal('fetch', mockFetch(200, []));

    const result = await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);

    expect(result.source).toBe('fallback');
    expect(getMelhorEnvioHealth().lastSuccessAt).toBe(before);
  });
});

describe('getMelhorEnvioHealth — o sinal que faltava', () => {
  it('marca credentialRejected em 401', async () => {
    vi.stubGlobal('fetch', mockFetch(401, { message: 'Unauthenticated.' }));
    await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);

    const health = getMelhorEnvioHealth();
    expect(health.lastFailure?.kind).toBe('auth');
    expect(health.lastFailure?.status).toBe(401);
  });

  it('marca credentialRejected em 403', async () => {
    vi.stubGlobal('fetch', mockFetch(403, 'Forbidden'));
    await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);

    expect(getMelhorEnvioHealth().lastFailure?.kind).toBe('auth');
  });

  // Instabilidade da API e credencial errada pedem ações diferentes: uma se
  // resolve esperando, a outra não.
  it('separa instabilidade (500) de credencial recusada', async () => {
    vi.stubGlobal('fetch', mockFetch(500, 'Internal Server Error'));
    await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);

    const health = getMelhorEnvioHealth();
    expect(health.lastFailure?.kind).toBe('other');
    expect(health.lastFailure?.status).toBe(500);
  });

  it('grita no log quando a credencial é recusada', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', mockFetch(401, { message: 'Unauthenticated.' }));

    await quoteShipping('01001000', [{ productId: 'p1', quantity: 1 }]);

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('CREDENCIAL DO MELHOR ENVIO RECUSADA')
    );
    // A mensagem precisa dizer o que está acontecendo com o dinheiro.
    expect(error).toHaveBeenCalledWith(expect.stringContaining('TABELA DE FALLBACK'));
    error.mockRestore();
  });

  it('limpa a falha depois que uma cotação real volta a funcionar', async () => {
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
