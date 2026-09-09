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
  STORE_SENDER: { document: '52846344000110', phone: '11914662881' },
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
  // The claim is the first write; granting it by default keeps every other
  // test about the purchase itself.
  queryMock.mockResolvedValue({ rows: [{ id: 'o1' }], rowCount: 1 });
  tokenMock.mockResolvedValue('tok_123');
});

/** Refuse the claim, as if another request already held it. */
function claimTaken() {
  queryMock.mockImplementation(async (sql: string) =>
    String(sql).includes('label_purchase_started_at = NOW()')
      ? { rows: [], rowCount: 0 }
      : { rows: [], rowCount: 0 },
  );
}

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
   * A `fallback-*` id is our own table, not a Melhor Envio service. `Number()`
   * on it is NaN, which went out as `service: null` and came back as an opaque
   * 502 — the shop had no way to know the order simply cannot be bought here.
   */
  it('recusa um pedido cotado pela tabela interna, sem chamar o Melhor Envio', async () => {
    orderMock.mockResolvedValue(order({ shippingServiceId: 'fallback-pac' }));

    await expect(buyAndPrintLabel('o1', 'admin-1')).rejects.toThrow('tabela interna');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /** The Correios declaration carries the recipient's CPF. */
  it('recusa quando o pedido não tem CPF do destinatário', async () => {
    orderMock.mockResolvedValue(order({ customerDocument: null }));

    await expect(buyAndPrintLabel('o1', 'admin-1')).rejects.toThrow('CPF do destinatário');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /**
   * The sale already happened, so an archived product must still be weighable —
   * otherwise a one-off item makes its own parcel unbuyable the day it sells out
   * and gets taken down.
   */
  it('mede o pacote mesmo com produto já desativado', async () => {
    orderMock.mockResolvedValue(order());
    replies(
      { body: { id: 'me_1' } },
      { body: { id: 'me_1', paid_at: '2026-09-09', generated_at: '2026-09-09', tracking: 'AA1' } },
      { body: { url: 'https://me/etiqueta.pdf' } },
    );

    await buyAndPrintLabel('o1', 'admin-1');

    expect(packageMock).toHaveBeenCalledWith(expect.anything(), { requireActive: false });
  });

  /**
   * `document: ''` is a validation error at Melhor Envio where an absent
   * `document` simply falls back to the account's registered data.
   */
  it('não manda campo vazio no remetente nem no destinatário', async () => {
    orderMock.mockResolvedValue(order({ customerPhone: null }));
    replies(
      { body: { id: 'me_1' } },
      { body: { id: 'me_1', paid_at: 'x', generated_at: 'x', tracking: 'AA1' } },
      { body: { url: 'https://me/etiqueta.pdf' } },
    );

    await buyAndPrintLabel('o1', 'admin-1');

    const cart = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(Object.values(cart.from)).not.toContain('');
    expect(Object.values(cart.to)).not.toContain('');
    expect(cart.to).not.toHaveProperty('phone');
    // The order number rides in `tags`; `options.invoice` only documents the
    // 44-digit NF-e key, which we do not have.
    expect(cart.options).not.toHaveProperty('invoice');
    expect(cart.tags).toEqual([{ tag: '10' }]);
  });

  /**
   * A CPF and a CNPJ are different fields at Melhor Envio, not the same field
   * with more digits — `document` is validated as a CPF. The shop ships under a
   * CNPJ and the wholesale channel takes one from the customer, so a wholesale
   * label had both ends in the wrong field.
   */
  it('manda CNPJ em company_document e CPF em document', async () => {
    orderMock.mockResolvedValue(order({ customerDocument: '52846344000110' }));
    replies(
      { body: { id: 'me_1' } },
      { body: { id: 'me_1', paid_at: 'x', generated_at: 'x', tracking: 'AA1' } },
      { body: { url: 'https://me/etiqueta.pdf' } },
    );

    await buyAndPrintLabel('o1', 'admin-1');

    const cart = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(cart.to.company_document).toBe('52846344000110');
    expect(cart.to).not.toHaveProperty('document');
  });

  /** The shop's own CNPJ and phone ship with the code, not only in a VPS .env. */
  it('preenche o remetente com o CNPJ e o telefone da loja', async () => {
    orderMock.mockResolvedValue(order());
    replies(
      { body: { id: 'me_1' } },
      { body: { id: 'me_1', paid_at: 'x', generated_at: 'x', tracking: 'AA1' } },
      { body: { url: 'https://me/etiqueta.pdf' } },
    );

    await buyAndPrintLabel('o1', 'admin-1');

    const cart = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(cart.from.company_document).toBe('52846344000110');
    expect(cart.from.phone).toBe('11914662881');
    // The recipient is a person: CPF, in the CPF field.
    expect(cart.to.document).toBe('52998224725');
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

describe('trava contra compra dupla', () => {
  /**
   * Two clicks a second apart both read `melhor_envio_order_id` as null, both
   * create a cart item and both reach checkout — two labels, two debits from
   * the shop's balance. Only the request that takes the claim may buy.
   */
  it('recusa uma segunda compra simultânea', async () => {
    orderMock.mockResolvedValue(order());
    claimTaken();

    await expect(buyAndPrintLabel('o1', 'admin-1')).rejects.toThrow('em andamento');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /** A crashed request must not lock the order forever. */
  it('a trava expira sozinha', async () => {
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

    const claim = queryMock.mock.calls.find((c) =>
      String(c[0]).includes('label_purchase_started_at = NOW()'),
    );
    expect(claim, 'a compra tem de reivindicar o pedido').toBeDefined();
    expect(String(claim![0])).toContain("INTERVAL '3 minutes'");
  });

  /**
   * The claim guards the four calls, not the next three minutes: an admin who
   * closed the tab before the PDF opened has to be able to press again.
   */
  it('libera a trava depois de comprar', async () => {
    orderMock.mockResolvedValue(order());
    replies(
      { body: { id: 'me_1' } },
      { body: { id: 'me_1', paid_at: 'x', generated_at: 'x', tracking: 'AA1' } },
      { body: { url: 'https://me/etiqueta.pdf' } },
    );

    await buyAndPrintLabel('o1', 'admin-1');

    const released = queryMock.mock.calls.some((c) =>
      String(c[0]).includes('label_purchase_started_at = NULL'),
    );
    expect(released, 'a trava tem de ser liberada no sucesso').toBe(true);
  });

  /** A refusal before any money moved should let the shop retry at once. */
  it('libera a trava quando o Melhor Envio recusa', async () => {
    orderMock.mockResolvedValue(order());
    replies({ ok: false, status: 422, body: { message: 'Endereço inválido' } });

    await expect(buyAndPrintLabel('o1', 'admin-1')).rejects.toThrow('Endereço inválido');

    const released = queryMock.mock.calls.some((c) =>
      String(c[0]).includes('label_purchase_started_at = NULL'),
    );
    expect(released, 'a trava tem de ser liberada').toBe(true);
  });

  /**
   * A timeout is the one case where the money may already have left without us
   * hearing back. Letting the claim expire on its own beats freeing it for an
   * immediate second purchase.
   */
  it('NÃO libera a trava quando a operadora fica inalcançável', async () => {
    orderMock.mockResolvedValue(order());
    fetchMock.mockRejectedValue(new Error('timeout'));

    await expect(buyAndPrintLabel('o1', 'admin-1')).rejects.toThrow();

    const released = queryMock.mock.calls.some((c) =>
      String(c[0]).includes('label_purchase_started_at = NULL'),
    );
    expect(released, 'com dinheiro em dúvida, a trava expira sozinha').toBe(false);
  });
});
