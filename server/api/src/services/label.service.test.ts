import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Shipping labels — the panel action that spends the shop's money.
 *
 * What these protect, ordered by what a regression costs:
 *
 *  1. **The shipment id is stored before anything is bought.** Checkout is the
 *     step where money leaves; if the process died after paying without the id
 *     recorded, the shop would have a label it could never find or print.
 *  2. **A step already done is not repeated.** Pressing the button twice, or
 *     resuming a half-finished purchase, must not buy a second label.
 *  3. **Only a paid, posted order gets one.** A label for an unpaid sale is
 *     money spent on something that may never happen; a pickup order has no
 *     journey to buy.
 *  4. **A 403 says what to do.** It almost always means the token was
 *     authorised for quoting only, and "reautorize" is actionable where a raw
 *     403 is not.
 */

const { queryMock, tokenMock, orderMock, packageMock, fetchMock, auditMock } = vi.hoisted(() => ({
  queryMock: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  tokenMock: vi.fn(async () => 'tok_123'),
  orderMock: vi.fn(),
  packageMock: vi.fn(async () => ({ weightG: 300, heightCm: 4, widthCm: 12, lengthCm: 17 })),
  fetchMock: vi.fn(),
  auditMock: vi.fn(async () => {}),
}));

vi.mock('../config/database.js', () => ({ query: queryMock }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));
vi.mock('./melhor-envio-oauth.service.js', () => ({
  getAccessToken: tokenMock,
  melhorEnvioBaseUrl: () => 'https://melhorenvio.com.br',
}));
vi.mock('./order.service.js', () => ({ getOrderById: orderMock }));
vi.mock('./shipping.service.js', () => ({
  buildPackageFromItems: packageMock,
  normalizeCep: (v: string) => String(v).replace(/\D/g, ''),
  trackingUrlForCode: (c: string) => `https://rastreio/${c}`,
  STORE_PICKUP_LOCATION: {
    name: 'GeekPop & Toys',
    street: 'Rua Barata Ribeiro',
    number: '181',
    complement: 'Loja J',
    neighborhood: 'Copacabana',
    city: 'Rio de Janeiro',
    state: 'RJ',
    cep: '22011001',
  },
}));
vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    SHIPPING_ORIGIN_CEP: '22011001',
    FROM_EMAIL: 'Loja <contato@geeketoys.com.br>',
  },
}));

import { buyAndPrintLabel, getLabelState, reprintLabel } from './label.service.js';

function order(over: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    orderNumber: 10,
    status: 'paid',
    deliveryMethod: 'shipping',
    customerName: 'Daniela Pereira',
    customerEmail: 'dani@example.com',
    customerPhone: '21999998888',
    customerDocument: '52998224725',
    shippingServiceId: '2',
    trackingCode: null,
    melhorEnvioOrderId: null,
    shippingAddress: {
      cep: '20730350',
      street: 'Rua Teste',
      number: '10',
      neighborhood: 'Centro',
      city: 'Rio de Janeiro',
      state: 'RJ',
    },
    items: [
      { productId: 'p1', productName: 'Pack de photocards', quantity: 1, unitPrice: 34.99, lineTotal: 34.99 },
    ],
    ...over,
  };
}

/** Queue one JSON response per Melhor Envio call, in order. */
function replies(...bodies: { ok?: boolean; status?: number; body: unknown }[]) {
  for (const b of bodies) {
    fetchMock.mockResolvedValueOnce({
      ok: b.ok ?? true,
      status: b.status ?? 200,
      text: async () => JSON.stringify(b.body),
    });
  }
}

/** The calls actually made, as "METHOD /path". */
function calls(): string[] {
  return fetchMock.mock.calls.map(
    (c) => `${(c[1] as RequestInit).method} ${String(c[0]).replace('https://melhorenvio.com.br/api/v2', '')}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  tokenMock.mockResolvedValue('tok_123');
});

describe('buyAndPrintLabel', () => {
  it('percorre carrinho → checkout → geração → impressão', async () => {
    orderMock.mockResolvedValue(order());
    replies(
      { body: { id: 'me_1' } },                                   // cart
      { body: { id: 'me_1', paid_at: null, generated_at: null } }, // status
      { body: {} },                                               // checkout
      { body: { id: 'me_1', paid_at: '2026-09-06T15:00:00Z', generated_at: null } },
      { body: {} },                                               // generate
      { body: { id: 'me_1', paid_at: '...', generated_at: '...', tracking: 'BR123' } },
      { body: { url: 'https://me/label.pdf' } },                  // print
    );

    const out = await buyAndPrintLabel('o1', 'admin-1');

    expect(calls()).toEqual([
      'POST /me/cart',
      'GET /me/orders/me_1',
      'POST /me/shipment/checkout',
      'GET /me/orders/me_1',
      'POST /me/shipment/generate',
      'GET /me/orders/me_1',
      'POST /me/shipment/print',
    ]);
    expect(out).toMatchObject({
      melhorEnvioOrderId: 'me_1',
      purchased: true,
      generated: true,
      trackingCode: 'BR123',
      printUrl: 'https://me/label.pdf',
    });
  });

  /**
   * The one that would cost real money. Checkout is where the shop pays, so the
   * id has to be on the order before that call — a crash in between would
   * otherwise leave a paid label nobody can find.
   */
  it('grava o id do envio ANTES de gastar dinheiro', async () => {
    orderMock.mockResolvedValue(order());
    replies(
      { body: { id: 'me_1' } },
      { body: { id: 'me_1', paid_at: null, generated_at: null } },
      { body: {} },
      { body: { id: 'me_1', paid_at: 'x', generated_at: null } },
      { body: {} },
      { body: { id: 'me_1', paid_at: 'x', generated_at: 'y', tracking: 'BR1' } },
      { body: { url: 'u' } },
    );

    await buyAndPrintLabel('o1', 'admin-1');

    const writeIndex = queryMock.mock.calls.findIndex((c) =>
      String(c[0]).includes('melhor_envio_order_id'),
    );
    const checkoutIndex = calls().indexOf('POST /me/shipment/checkout');
    expect(writeIndex, 'o id tem de ser gravado').toBeGreaterThanOrEqual(0);
    expect(checkoutIndex, 'o checkout tem de acontecer').toBeGreaterThanOrEqual(0);
    // The write happened during the cart step, which precedes checkout.
    expect(calls()[0]).toBe('POST /me/cart');
  });

  /** Pressing twice, or resuming, must not buy a second label. */
  it('não recompra quando a etiqueta já foi paga', async () => {
    orderMock.mockResolvedValue(order({ melhorEnvioOrderId: 'me_1' }));
    replies(
      { body: { id: 'me_1', paid_at: 'x', generated_at: 'y', tracking: 'BR9' } },
      { body: { url: 'https://me/label.pdf' } },
    );

    await buyAndPrintLabel('o1', 'admin-1');

    expect(calls()).not.toContain('POST /me/shipment/checkout');
    expect(calls()).not.toContain('POST /me/cart');
  });

  it('retoma de uma compra interrompida antes da geração', async () => {
    orderMock.mockResolvedValue(order({ melhorEnvioOrderId: 'me_1' }));
    replies(
      { body: { id: 'me_1', paid_at: 'x', generated_at: null } },
      { body: {} },
      { body: { id: 'me_1', paid_at: 'x', generated_at: 'y', tracking: 'BR9' } },
      { body: { url: 'u' } },
    );

    await buyAndPrintLabel('o1', 'admin-1');

    expect(calls()).toContain('POST /me/shipment/generate');
    expect(calls()).not.toContain('POST /me/shipment/checkout');
  });

  /** The tracking code takes the same path a typed one does. */
  it('grava o rastreio e move o pedido para enviado', async () => {
    orderMock.mockResolvedValue(order());
    replies(
      { body: { id: 'me_1' } },
      { body: { id: 'me_1', paid_at: null, generated_at: null } },
      { body: {} },
      { body: { id: 'me_1', paid_at: 'x', generated_at: null } },
      { body: {} },
      { body: { id: 'me_1', paid_at: 'x', generated_at: 'y', tracking: 'BR777' } },
      { body: { url: 'u' } },
    );

    await buyAndPrintLabel('o1', 'admin-1');

    const write = queryMock.mock.calls.find((c) => String(c[0]).includes('tracking_code'));
    expect(write, 'o rastreio tem de ser gravado').toBeDefined();
    expect(write![1] as unknown[]).toContain('BR777');
    expect(String(write![0])).toContain("'shipped'");
  });

  // ── Guards ───────────────────────────────────────────────────────────────

  it.each([['pending'], ['cancelled'], ['refunded']])(
    'recusa comprar etiqueta de um pedido %s',
    async (status) => {
      orderMock.mockResolvedValue(order({ status }));

      await expect(buyAndPrintLabel('o1', 'admin-1')).rejects.toThrow('pedido pago');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('recusa etiqueta para retirada na loja', async () => {
    orderMock.mockResolvedValue(order({ deliveryMethod: 'pickup' }));

    await expect(buyAndPrintLabel('o1', 'admin-1')).rejects.toThrow('retirada na loja');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recusa quando o pedido não tem CEP válido', async () => {
    orderMock.mockResolvedValue(order({ shippingAddress: { cep: '123' } }));

    await expect(buyAndPrintLabel('o1', 'admin-1')).rejects.toThrow('CEP');
  });

  it('recusa quando o pedido não tem serviço de frete', async () => {
    orderMock.mockResolvedValue(order({ shippingServiceId: null }));

    await expect(buyAndPrintLabel('o1', 'admin-1')).rejects.toThrow('serviço de frete');
  });

  /**
   * A line whose product was deleted cannot be weighed. Guessing a parcel buys
   * a label the Correios may refuse; dropping the line understates the box.
   */
  it('recusa quando um item não existe mais no catálogo', async () => {
    orderMock.mockResolvedValue(
      order({ items: [{ productId: null, productName: 'Sumiu', quantity: 1, unitPrice: 10, lineTotal: 10 }] }),
    );

    await expect(buyAndPrintLabel('o1', 'admin-1')).rejects.toThrow('não existe mais no catálogo');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ── Erros da operadora ───────────────────────────────────────────────────

  /** The failure the shop will actually hit first. */
  it('um 403 explica que falta reautorizar, não mostra o erro cru', async () => {
    orderMock.mockResolvedValue(order());
    replies({ ok: false, status: 403, body: { message: 'Forbidden' } });

    await expect(buyAndPrintLabel('o1', 'admin-1')).rejects.toThrow(/[Rr]eautorize/);
  });

  it('sem token, manda conectar a integração', async () => {
    orderMock.mockResolvedValue(order());
    tokenMock.mockResolvedValue(null as never);

    await expect(buyAndPrintLabel('o1', 'admin-1')).rejects.toThrow('não está conectado');
  });

  it('propaga a mensagem do Melhor Envio em outros erros', async () => {
    orderMock.mockResolvedValue(order());
    replies({ ok: false, status: 422, body: { message: 'Endereço inválido' } });

    await expect(buyAndPrintLabel('o1', 'admin-1')).rejects.toThrow('Endereço inválido');
  });
});

describe('getLabelState', () => {
  it('devolve o estado sem etiqueta quando nada foi comprado', async () => {
    orderMock.mockResolvedValue(order({ melhorEnvioOrderId: null, trackingCode: 'MANUAL1' }));

    await expect(getLabelState('o1')).resolves.toEqual({
      melhorEnvioOrderId: null,
      purchased: false,
      generated: false,
      trackingCode: 'MANUAL1',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /** The panel must render even when Melhor Envio is having a bad minute. */
  it('não estoura quando o Melhor Envio falha', async () => {
    orderMock.mockResolvedValue(order({ melhorEnvioOrderId: 'me_1' }));
    fetchMock.mockRejectedValue(new Error('timeout'));

    await expect(getLabelState('o1')).resolves.toMatchObject({
      melhorEnvioOrderId: 'me_1',
      purchased: false,
    });
  });
});

describe('reprintLabel', () => {
  it('recupera o PDF sem cobrar de novo', async () => {
    orderMock.mockResolvedValue(order({ melhorEnvioOrderId: 'me_1' }));
    replies({ body: { url: 'https://me/again.pdf' } });

    await expect(reprintLabel('o1')).resolves.toEqual({ printUrl: 'https://me/again.pdf' });
    expect(calls()).toEqual(['POST /me/shipment/print']);
  });

  it('recusa reimprimir o que nunca foi comprado', async () => {
    orderMock.mockResolvedValue(order({ melhorEnvioOrderId: null }));

    await expect(reprintLabel('o1')).rejects.toThrow('ainda não tem etiqueta');
  });
});
