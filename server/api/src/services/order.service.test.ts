import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Shop checkout — the path that decides **what the customer pays** and **how
 * much stock leaves**. What these tests protect, ordered by how much a
 * regression would cost:
 *
 *  1. Price comes from the database, never from the client.
 *  2. Member and wholesale discounts do **not** stack.
 *  3. Shipping never enters the discount base.
 *  4. Repeated lines of the same SKU are summed before the stock check,
 *     otherwise 2x"3 units" slips past a stock of 5.
 *  5. Store credit cannot drive the total negative.
 *  6. A product with variants requires a SKU, and a SKU from another product
 *     is rejected.
 *  7. Stock already held by other pending orders is not sold twice, and a sale
 *     that somehow goes uncovered leaves a trail instead of clamping silently.
 */

const { queryMock, clientQueryMock, releaseMock, pickOptionMock, redeemMock, memberIdMock, approvedAccountMock, stripeMock, auditMock, sendEmailMock, restoreCreditMock, recordOrderMovementsMock, recordMovementMock } =
  vi.hoisted(() => ({
    queryMock: vi.fn(),
    clientQueryMock: vi.fn(),
    releaseMock: vi.fn(),
    pickOptionMock: vi.fn(),
    redeemMock: vi.fn(),
    memberIdMock: vi.fn(),
    approvedAccountMock: vi.fn(),
    stripeMock: vi.fn(),
    auditMock: vi.fn(),
    sendEmailMock: vi.fn(),
    restoreCreditMock: vi.fn(),
    recordOrderMovementsMock: vi.fn(async () => {}),
    recordMovementMock: vi.fn(async () => {}),
  }));

vi.mock('../config/database.js', () => ({
  query: queryMock,
  getClient: async () => ({ query: clientQueryMock, release: releaseMock }),
}));

vi.mock('../config/env.js', () => ({
  env: {
    PIX_KEY: '574a10c6-9aa6-4bbb-a698-000000000000',
    PIX_MERCHANT_NAME: 'GEEK E TOYS',
    PIX_MERCHANT_CITY: 'RIO DE JANEIRO',
    NODE_ENV: 'test',
    ADMIN_EMAIL: 'geeketoys@gmail.com',
    FRONTEND_URL: 'https://club.geeketoys.com.br',
    STOCK_RESERVATION_TTL_HOURS: 24,
  },
}));

vi.mock('./shipping.service.js', () => ({
  normalizeCep: (v: string) => String(v).replace(/\D/g, ''),
  pickOptionFromQuote: pickOptionMock,
  trackingUrlForCode: (c: string) => `https://rastreio/${c}`,
  PICKUP_SERVICE_ID: 'pickup',
  PICKUP_SERVICE_LABEL: 'Retirada na loja',
  STORE_PICKUP_LOCATION: {
    name: 'GeekPop & Toys',
    street: 'Rua Barata Ribeiro',
    number: '181',
    complement: 'Loja J',
    neighborhood: 'Copacabana',
    city: 'Rio de Janeiro',
    state: 'RJ',
    cep: '22011001',
    hours: 'Segunda a sábado, 10h às 19h',
  },
  buildPickupAddress: (recipientName: string) => ({
    cep: '22011001',
    street: 'Rua Barata Ribeiro',
    number: '181',
    complement: 'Loja J',
    neighborhood: 'Copacabana',
    city: 'Rio de Janeiro',
    state: 'RJ',
    recipientName,
  }),
}));

vi.mock('./store-credit.service.js', () => ({
  redeemForOrder: redeemMock,
  restoreCreditForOrder: restoreCreditMock,
}));

vi.mock('./wholesale.service.js', () => ({ getApprovedAccountByUserId: approvedAccountMock }));
vi.mock('../middleware/ownership.js', () => ({ getMemberIdForUser: memberIdMock }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));
vi.mock('./stock.service.js', () => ({
  recordOrderMovements: recordOrderMovementsMock,
  recordMovement: recordMovementMock,
}));
vi.mock('./email.service.js', () => ({ sendTemplateEmail: sendEmailMock }));
vi.mock('../utils/stripe.js', () => ({ getStripe: stripeMock }));

import {
  createOrder,
  cancelMyOrder,
  decrementStockForOrder,
  claimGuestOrders,
  listMyOrders,
  setOrderTracking,
} from './order.service.js';
import { AppError } from '../middleware/error-handler.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ADDRESS = {
  cep: '22041-001',
  street: 'Av. Atlântica',
  number: '1702',
  neighborhood: 'Copacabana',
  city: 'Rio de Janeiro',
  state: 'RJ',
};

function baseInput(over: Record<string, unknown> = {}) {
  return {
    items: [{ productId: 'p1', quantity: 1 }],
    customer: { name: 'Laura', email: 'laura@example.com' },
    shippingAddress: ADDRESS,
    shipping: { quoteToken: 'tok', serviceId: 'pac' },
    paymentMethod: 'pix' as const,
    ...over,
  };
}

function product(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Photocard BTS',
    slug: 'photocard-bts',
    price: '100.00',
    stock: 10,
    active: true,
    images: ['/uploads/a.jpg'],
    wholesale_enabled: false,
    wholesale_min_qty: 1,
    has_variants: false,
    ...over,
  };
}

/** Captures the `orders` INSERT so the written values can be asserted. */
function insertedOrderValues(): unknown[] {
  const call = clientQueryMock.mock.calls.find(
    (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO orders')
  );
  if (!call) throw new Error('nenhum INSERT INTO orders foi emitido');
  return call[1] as unknown[];
}

/** Parameter indexes of the `orders` INSERT; see order.service.ts. */
const COL = {
  customerName: 2,
  customerEmail: 3,
  shippingAddress: 5,
  customerNote: 19,
  subtotal: 6,
  discount: 7,
  discountReason: 8,
  shippingCost: 9,
  shippingService: 10,
  shippingServiceId: 11,
  shippingDays: 12,
  total: 14,
  deliveryMethod: 20,
};

/** Wires the transaction client: BEGIN, product and variant SELECTs, order and item INSERTs, COMMIT. */
function setupTx(opts: {
  products?: Record<string, unknown>[];
  variants?: Record<string, unknown>[];
}) {
  const products = opts.products ?? [product()];
  const variants = opts.variants ?? [];
  // Both statements use RETURNING *, so the mock keeps the inserted row and the
  // UPDATE returns it with changed fields on top. Otherwise the UPDATE would
  // "lose" columns the real database returns, and a store-credit test would
  // pass while reading undefined.
  let inserted: Record<string, unknown> = {};
  clientQueryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (/^BEGIN|^COMMIT|^ROLLBACK/.test(sql.trim())) return { rows: [] };
    if (sql.includes('FROM products')) return { rows: products };
    if (sql.includes('FROM product_variants')) return { rows: variants };
    if (sql.includes('INSERT INTO orders')) {
      const p = params as unknown[];
      inserted = {
        id: 'o1',
        order_number: 1001,
        customer_name: p[COL.customerName],
        customer_email: p[COL.customerEmail],
        subtotal: p[COL.subtotal],
        discount: p[COL.discount],
        discount_reason: p[COL.discountReason],
        shipping_cost: p[COL.shippingCost],
        store_credit_applied: 0,
        total: p[COL.total],
        status: 'pending',
        payment_method: 'pix',
        items: [],
      };
      return { rows: [inserted] };
    }
    if (sql.includes('UPDATE orders')) {
      const p = params as unknown[];
      return {
        rows: [
          {
            ...inserted,
            discount: p[0],
            discount_reason: p[1],
            store_credit_applied: p[2],
            total: p[3],
          },
        ],
      };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  queryMock.mockResolvedValue({ rows: [] });
  redeemMock.mockResolvedValue(0);
  memberIdMock.mockResolvedValue(null);
  auditMock.mockResolvedValue(undefined);
  sendEmailMock.mockResolvedValue(undefined);
  restoreCreditMock.mockResolvedValue(0);
  pickOptionMock.mockReturnValue({
    id: 'pac',
    name: 'PAC',
    service: 'PAC',
    price: 24,
    days: 8,
  });
});

// ─── Pricing and discounts ───────────────────────────────────────────────────

describe('createOrder — dinheiro', () => {
  it('uses the database price, ignoring anything the client sends', async () => {
    setupTx({ products: [product({ price: '100.00' })] });

    // The client sends a price on the line; the service takes only productId + quantity.
    await createOrder(baseInput({ items: [{ productId: 'p1', quantity: 2, price: 1 }] }));

    const v = insertedOrderValues();
    expect(v[COL.subtotal]).toBe(200);
    expect(v[COL.total]).toBe(224); // 200 + 24 de frete
  });

  it('applies the 10% member discount to goods, never to shipping', async () => {
    setupTx({ products: [product({ price: '100.00' })] });
    memberIdMock.mockResolvedValue('m1');
    queryMock.mockResolvedValue({ rows: [{ id: 'm1' }] }); // membership ativa

    await createOrder(baseInput(), { userId: 'u1' } as never);

    const v = insertedOrderValues();
    expect(v[COL.discount]).toBe(10);
    expect(v[COL.discountReason]).toBe('member_10');
    // 100 - 10 + 24 = 114. Had shipping entered the discount base it would be 102.60.
    expect(v[COL.total]).toBe(114);
    expect(v[COL.shippingCost]).toBe(24);
  });

  it('gives no member discount on an expired subscription', async () => {
    setupTx({});
    memberIdMock.mockResolvedValue('m1');
    queryMock.mockResolvedValue({ rows: [] }); // o filtro de expiry_date não devolveu nada

    await createOrder(baseInput(), { userId: 'u1' } as never);

    const v = insertedOrderValues();
    expect(v[COL.discount]).toBe(0);
    expect(v[COL.discountReason]).toBeNull();
  });

  it('wholesale uses 25% and does NOT stack with the member 10%', async () => {
    setupTx({ products: [product({ price: '100.00', wholesale_enabled: true })] });
    approvedAccountMock.mockResolvedValue({ id: 'w1', cnpj: '11222333000181' });
    memberIdMock.mockResolvedValue('m1'); // é membro também — não pode somar

    await createOrder(
      baseInput({ channel: 'wholesale', cnpj: '11.222.333/0001-81' }),
      { userId: 'u1' } as never
    );

    const v = insertedOrderValues();
    expect(v[COL.discount]).toBe(25);
    expect(v[COL.discountReason]).toBe('wholesale_25');
    // 25 + 15 empilhados dariam 60 de desconto e total 64.
    expect(v[COL.total]).toBe(99);
  });

  it('store credit applies after the channel discount and never drives the total negative', async () => {
    setupTx({ products: [product({ price: '100.00' })] });
    // The redeem cap is the post-discount goods value, not the order total.
    redeemMock.mockImplementation(async (_c: unknown, _u: string, cap: number) => cap);

    const res = await createOrder(baseInput({ applyStoreCredit: true }), { userId: 'u1' } as never);

    expect(redeemMock).toHaveBeenCalledWith(expect.anything(), 'u1', 100, 'o1');
    // Credit covers the goods; shipping is still payable.
    expect(res.order.total).toBe(24);
    expect(res.order.total).toBeGreaterThanOrEqual(0);
  });

  it('does not attempt store credit for a signed-out visitor', async () => {
    setupTx({});
    await createOrder(baseInput({ applyStoreCredit: true }));
    expect(redeemMock).not.toHaveBeenCalled();
  });
});

// ─── Stock ───────────────────────────────────────────────────────────────

describe('createOrder — estoque', () => {
  it('sums repeated lines of the same SKU before checking stock', async () => {
    // Stock of 5, cart sends 3 + 3 on separate lines.
    setupTx({ products: [product({ stock: 5 })] });

    await expect(
      createOrder(
        baseInput({
          items: [
            { productId: 'p1', quantity: 3 },
            { productId: 'p1', quantity: 3 },
          ],
        })
      )
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });

  it('refuses a zero or negative quantity', async () => {
    setupTx({});
    await expect(
      createOrder(baseInput({ items: [{ productId: 'p1', quantity: 0 }] }))
    ).rejects.toMatchObject({ code: 'INVALID_QUANTITY' });
    await expect(
      createOrder(baseInput({ items: [{ productId: 'p1', quantity: -5 }] }))
    ).rejects.toMatchObject({ code: 'INVALID_QUANTITY' });
  });

  it('refuses an inactive product even when the id exists', async () => {
    setupTx({ products: [product({ active: false })] });
    await expect(createOrder(baseInput())).rejects.toMatchObject({
      code: 'PRODUCT_UNAVAILABLE',
    });
  });

  it('rolls the transaction back when a line fails', async () => {
    setupTx({ products: [product({ stock: 0 })] });
    await expect(createOrder(baseInput())).rejects.toThrow(AppError);
    const sqls = clientQueryMock.mock.calls.map((c) => String(c[0]).trim());
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
    expect(releaseMock).toHaveBeenCalled();
  });
});

// ─── Stock reservation ───────────────────────────────────────────────────────

/**
 * The window between create and paid.
 *
 * PIX is confirmed by hand, so that window lasts hours. Before the hold, stock
 * only left on confirmation, which kept the last unit on offer the whole time
 * and let two customers pay for the same piece.
 */
describe('createOrder — reserva de estoque', () => {
  it('não vende o que outro pedido pendente já segura', async () => {
    // One unit on the shelf, one already held: nothing available.
    setupTx({ products: [product({ stock: 1, reserved: 1 })] });

    await expect(createOrder(baseInput())).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
    });
  });

  it('conta só o livre, não o físico, ao dizer quanto resta', async () => {
    setupTx({ products: [product({ stock: 5, reserved: 3 })] });

    await expect(
      createOrder(baseInput({ items: [{ productId: 'p1', quantity: 3 }] }))
    ).rejects.toThrow(/Só restam 2/);
  });

  it('segura as unidades na mesma transação do pedido', async () => {
    setupTx({ products: [product({ stock: 10 })] });

    await createOrder(baseInput());

    const sqls = clientQueryMock.mock.calls.map((c) => String(c[0]));
    // The hold adds to `reserved` and flags the order; without the flag there
    // is no way to tell later whether it was consumed or already given back.
    expect(sqls.some((q) => /UPDATE products.*reserved = p\.reserved \+ oi\.quantity/s.test(q))).toBe(true);
    expect(sqls.some((q) => /UPDATE orders[\s\S]*stock_reserved = TRUE/.test(q))).toBe(true);
    expect(sqls).toContain('COMMIT');
  });

  it('não segura nada quando a linha é recusada', async () => {
    setupTx({ products: [product({ stock: 1, reserved: 1 })] });

    await expect(createOrder(baseInput())).rejects.toThrow(AppError);

    const sqls = clientQueryMock.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((q) => q.includes('reserved = p.reserved + oi.quantity'))).toBe(false);
    expect(sqls.map((q) => q.trim())).toContain('ROLLBACK');
  });
});

// ─── Overselling ─────────────────────────────────────────────────────────────

/**
 * `stock` has `CHECK (stock >= 0)`, so the decrement is forced to clamp at zero.
 * The clamp was never the problem — its silence was: the second order confirmed
 * without an error, stock stopped at 0 and the difference vanished.
 */
describe('decrementStockForOrder — descoberto', () => {
  function txClient(shortfallRows: Record<string, unknown>[]) {
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.includes('oi.quantity > COALESCE')) return { rows: shortfallRows };
      if (sql.includes('stock_reserved = FALSE')) return { rows: [{ id: 'o1' }] };
      return { rows: [] };
    });
    return { client: { query } as never, calls, query };
  }

  it('não registra nada quando o estoque cobre o pedido', async () => {
    const { client } = txClient([]);

    await decrementStockForOrder(client, 'o1');

    expect(recordMovementMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalledWith('order.oversold', null, expect.anything());
  });

  it('deixa rastro no histórico quando faltou estoque', async () => {
    const { client } = txClient([
      { product_id: 'p1', variant_id: null, product_name: 'Photocard BTS', quantity: 3, on_hand: 1 },
    ]);

    await decrementStockForOrder(client, 'o1');

    expect(recordMovementMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        productId: 'p1',
        kind: 'adjustment',
        quantity: -2,
        note: expect.stringContaining('descoberto'),
      })
    );
    expect(auditMock).toHaveBeenCalledWith(
      'order.oversold',
      null,
      expect.objectContaining({
        orderId: 'o1',
        lines: [expect.objectContaining({ ordered: 3, onHand: 1 })],
      })
    );
  });

  it('consome a reserva antes de baixar, para não descontar duas vezes', async () => {
    const { client, calls } = txClient([]);

    await decrementStockForOrder(client, 'o1');

    const releaseAt = calls.findIndex((q) => q.includes('stock_reserved = FALSE'));
    const decrementAt = calls.findIndex((q) => q.includes('GREATEST(0, p.stock - oi.quantity)'));
    expect(releaseAt).toBeGreaterThanOrEqual(0);
    expect(decrementAt).toBeGreaterThan(releaseAt);
  });
});

// ─── Variants ────────────────────────────────────────────────────────────────

describe('createOrder — variants', () => {
  const parent = product({ has_variants: true, price: '100.00', stock: 0 });
  const variant = {
    id: 'v1',
    product_id: 'p1',
    name: 'Rosa / M',
    price: '80.00',
    stock: 4,
    active: true,
    images: ['/uploads/rosa.jpg'],
  };

  it('charges the SKU price, not that of the parent product', async () => {
    setupTx({ products: [parent], variants: [variant] });

    await createOrder(baseInput({ items: [{ productId: 'p1', quantity: 2, variantId: 'v1' }] }));

    const v = insertedOrderValues();
    expect(v[COL.subtotal]).toBe(160); // 2 × 80, não 2 × 100
  });

  it('requires the SKU when the product has variants', async () => {
    setupTx({ products: [parent], variants: [] });
    await expect(createOrder(baseInput())).rejects.toMatchObject({ code: 'VARIANT_REQUIRED' });
  });

  it('refuses a SKU belonging to another product', async () => {
    setupTx({
      products: [parent],
      variants: [{ ...variant, product_id: 'OUTRO' }],
    });
    await expect(
      createOrder(baseInput({ items: [{ productId: 'p1', quantity: 1, variantId: 'v1' }] }))
    ).rejects.toMatchObject({ code: 'VARIANT_UNAVAILABLE' });
  });

  it('refuses a SKU on a product without variants', async () => {
    setupTx({ products: [product()], variants: [variant] });
    await expect(
      createOrder(baseInput({ items: [{ productId: 'p1', quantity: 1, variantId: 'v1' }] }))
    ).rejects.toMatchObject({ code: 'VARIANT_NOT_ALLOWED' });
  });

  it('checks the SKU stock, not that of the parent', async () => {
    setupTx({ products: [parent], variants: [{ ...variant, stock: 1 }] });
    await expect(
      createOrder(baseInput({ items: [{ productId: 'p1', quantity: 2, variantId: 'v1' }] }))
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });
});

// ─── Atacado ─────────────────────────────────────────────────────────────────

describe('createOrder — atacado', () => {
  it('exige login', async () => {
    setupTx({});
    await expect(
      createOrder(baseInput({ channel: 'wholesale', cnpj: '11222333000181' }))
    ).rejects.toMatchObject({ code: 'WHOLESALE_AUTH_REQUIRED' });
  });

  it('refuses an unapproved account', async () => {
    setupTx({});
    approvedAccountMock.mockResolvedValue(null);
    await expect(
      createOrder(
        baseInput({ channel: 'wholesale', cnpj: '11222333000181' }),
        { userId: 'u1' } as never
      )
    ).rejects.toMatchObject({ code: 'WHOLESALE_NOT_APPROVED' });
  });

  it('refuses a CNPJ that does not match the approved account', async () => {
    setupTx({});
    approvedAccountMock.mockResolvedValue({ id: 'w1', cnpj: '11444777000161' });
    await expect(
      createOrder(
        baseInput({ channel: 'wholesale', cnpj: '11222333000181' }),
        { userId: 'u1' } as never
      )
    ).rejects.toMatchObject({ code: 'CNPJ_MISMATCH' });
  });

  it('refuses a product not enabled for wholesale', async () => {
    setupTx({ products: [product({ wholesale_enabled: false })] });
    approvedAccountMock.mockResolvedValue({ id: 'w1', cnpj: '11222333000181' });
    await expect(
      createOrder(
        baseInput({ channel: 'wholesale', cnpj: '11222333000181' }),
        { userId: 'u1' } as never
      )
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_WHOLESALE' });
  });

  it('enforces the per-product minimum quantity', async () => {
    setupTx({ products: [product({ wholesale_enabled: true, wholesale_min_qty: 6 })] });
    approvedAccountMock.mockResolvedValue({ id: 'w1', cnpj: '11222333000181' });
    await expect(
      createOrder(
        baseInput({
          channel: 'wholesale',
          cnpj: '11222333000181',
          items: [{ productId: 'p1', quantity: 2 }],
        }),
        { userId: 'u1' } as never
      )
    ).rejects.toMatchObject({ code: 'WHOLESALE_MIN_QTY' });
  });
});

// ─── Entrada / frete ─────────────────────────────────────────────────────────

describe('createOrder — input validation', () => {
  it('refuses an empty cart', async () => {
    await expect(createOrder(baseInput({ items: [] }))).rejects.toMatchObject({
      code: 'EMPTY_CART',
    });
  });

  it('refuses an incomplete address', async () => {
    await expect(
      createOrder(baseInput({ shippingAddress: { ...ADDRESS, city: '' } }))
    ).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
  });

  it('refuses a CEP that is not 8 digits', async () => {
    await expect(
      createOrder(baseInput({ shippingAddress: { ...ADDRESS, cep: '2204' } }))
    ).rejects.toMatchObject({ code: 'INVALID_CEP' });
  });

  it('requires a chosen shipping option', async () => {
    await expect(
      createOrder(baseInput({ shipping: { quoteToken: '', serviceId: '' } }))
    ).rejects.toMatchObject({ code: 'SHIPPING_REQUIRED' });
  });

  it('revalidates shipping through the signed token: the price never comes from the client', async () => {
    setupTx({});
    pickOptionMock.mockReturnValue({ id: 'pac', name: 'PAC', service: 'PAC', price: 41.9, days: 12 });

    await createOrder(baseInput());

    expect(pickOptionMock).toHaveBeenCalledWith('tok', 'pac', expect.any(Array), '22041001');
    const v = insertedOrderValues();
    expect(v[COL.shippingCost]).toBe(41.9);
    expect(v[COL.total]).toBe(141.9);
  });
});

// ─── Aviso de PIX pendente ───────────────────────────────────────────────────

/**
 * Shop PIX has no webhook: the order is born `pending` and leaves that state
 * only when an admin checks the bank statement and confirms. Without a
 * notification the customer pays and the store never finds out.
 */
describe('createOrder — aviso de PIX pendente', () => {
  function pixEmail() {
    return sendEmailMock.mock.calls.find(
      (c) => (c[0] as { template?: string })?.template === 'admin-pix-order-pending'
    )?.[0] as { to: string; variables: Record<string, string> } | undefined;
  }

  it('notifies the admin with order, customer, amount and TX ID', async () => {
    setupTx({ products: [product({ price: '100.00' })] });

    await createOrder(baseInput());

    const email = pixEmail();
    expect(email).toBeDefined();
    expect(email!.to).toBe('geeketoys@gmail.com');
    expect(email!.variables).toMatchObject({
      order_number: '1001',
      customer_name: 'Laura',
      customer_email: 'laura@example.com',
    });
    // The TX ID is what ties the bank statement to the order.
    expect(email!.variables.tx_id).toMatch(/^CGT[A-Z0-9]+$/);
    expect(email!.variables.total).toMatch(/^\d+,\d{2}$/);
  });

  it('aponta o CTA para a aba de pedidos do painel admin', async () => {
    setupTx({});

    await createOrder(baseInput());

    expect(pixEmail()!.variables.admin_url).toBe(
      'https://admin.geeketoys.com.br/admin?tab=orders'
    );
  });

  it('does not notify when the payment is by card', async () => {
    setupTx({});
    stripeMock.mockReturnValue({
      paymentIntents: { create: async () => ({ id: 'pi_1', client_secret: 'cs_1' }) },
    });

    await createOrder(baseInput({ paymentMethod: 'credit_card' }));

    expect(pixEmail()).toBeUndefined();
  });

  // The notification is raised inside the checkout try, whose catch cancels the
  // order and restores credit. A failed email must not drop a real purchase.
  it('completes the order even if sending the email throws', async () => {
    setupTx({ products: [product({ price: '100.00' })] });
    sendEmailMock.mockImplementation(() => {
      throw new Error('Resend fora do ar');
    });

    const result = await createOrder(baseInput());

    expect(result.order.status).toBe('pending');
    expect(result.pixData?.emvCode).toContain('br.gov.bcb.pix');
    // nada de UPDATE ... status = 'cancelled'
    expect(
      queryMock.mock.calls.some(
        (c) => typeof c[0] === 'string' && c[0].includes("status = 'cancelled'")
      )
    ).toBe(false);
  });

  it('completes the order even if the email rejects its promise', async () => {
    setupTx({});
    sendEmailMock.mockRejectedValue(new Error('429 rate limited'));

    const result = await createOrder(baseInput());

    expect(result.order.status).toBe('pending');
  });
});

// ─── Customer cancellation ───────────────────────────────────────────────────

/**
 * Until 17/08/2026 every order mutation was admin-only: a customer could not
 * cancel even an unpaid order. Cancellation is limited to `pending` because
 * that is the only state where nothing has to be undone outside our database.
 */
describe('cancelMyOrder', () => {
  function orderRow(over: Record<string, unknown> = {}) {
    return {
      id: 'o1',
      order_number: 1001,
      user_id: 'u1',
      customer_name: 'Laura',
      customer_email: 'laura@example.com',
      status: 'pending',
      payment_method: 'pix',
      subtotal: '100.00',
      discount: '0',
      shipping_cost: '24.00',
      store_credit_applied: '0',
      total: '124.00',
      ...over,
    };
  }

  it('cancels an own pending order', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [orderRow()] })
      .mockResolvedValueOnce({ rows: [orderRow({ status: 'cancelled' })] });

    const order = await cancelMyOrder('u1', 'o1');

    expect(order.status).toBe('cancelled');
    expect(auditMock).toHaveBeenCalledWith(
      'order.cancelled_by_customer',
      'u1',
      expect.objectContaining({ orderId: 'o1' })
    );
  });

  // A pending order never had a decrement, but it has held units since
  // checkout. Without giving them back, cancelling would remove the piece from
  // the storefront for good.
  it('devolve a reserva ao cancelar', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [orderRow()] })
      .mockResolvedValueOnce({ rows: [orderRow({ status: 'cancelled' })] });
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('stock_reserved = FALSE')) return { rows: [{ id: 'o1' }] };
      return { rows: [] };
    });

    await cancelMyOrder('u1', 'o1');

    const sqls = clientQueryMock.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((q) => /UPDATE orders SET stock_reserved = FALSE/.test(q))).toBe(true);
    expect(sqls.some((q) => /reserved = GREATEST\(0, p\.reserved - oi\.quantity\)/.test(q))).toBe(true);
  });

  // Ownership lives in the WHERE clause, so a guessed id finds nothing.
  it('does not find an order belonging to someone else', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(cancelMyOrder('u1', 'alheio')).rejects.toBeInstanceOf(AppError);
  });

  it('refuses an already paid order: a refund is an admin action', async () => {
    queryMock.mockResolvedValue({ rows: [orderRow({ status: 'paid' })] });

    await expect(cancelMyOrder('u1', 'o1')).rejects.toThrow(/não pode ser cancelado/i);
    expect(
      queryMock.mock.calls.some(
        (c) => typeof c[0] === 'string' && c[0].includes("status = 'cancelled'")
      )
    ).toBe(false);
  });

  it.each(['shipped', 'delivered', 'refunded'])('recusa pedido %s', async (status) => {
    queryMock.mockResolvedValue({ rows: [orderRow({ status })] });
    await expect(cancelMyOrder('u1', 'o1')).rejects.toBeInstanceOf(AppError);
  });

  it('is idempotent: cancelling again returns the order without rewriting', async () => {
    queryMock.mockResolvedValue({ rows: [orderRow({ status: 'cancelled' })] });

    const order = await cancelMyOrder('u1', 'o1');

    expect(order.status).toBe('cancelled');
    expect(
      queryMock.mock.calls.some(
        (c) => typeof c[0] === 'string' && c[0].includes('UPDATE orders SET status')
      )
    ).toBe(false);
  });

  // The UPDATE is conditioned on status so a double click, or a race with an
  // admin, cannot cancel twice and restore credit twice.
  it('detects a race when the status changes between the read and the UPDATE', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [orderRow()] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(cancelMyOrder('u1', 'o1')).rejects.toThrow(/mudou de status/i);
  });

  it('restores the store credit spent on the order', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [orderRow({ store_credit_applied: '30.00' })] })
      .mockResolvedValueOnce({
        rows: [orderRow({ status: 'cancelled', store_credit_applied: '30.00' })],
      });

    await cancelMyOrder('u1', 'o1');

    expect(restoreCreditMock).toHaveBeenCalledWith('o1', expect.any(Object));
  });

  it('notifies the admin without letting an email failure drop the cancellation', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [orderRow()] })
      .mockResolvedValueOnce({ rows: [orderRow({ status: 'cancelled' })] });
    sendEmailMock.mockImplementation(() => {
      throw new Error('Resend fora do ar');
    });

    const order = await cancelMyOrder('u1', 'o1');

    expect(order.status).toBe('cancelled');
  });
});

/**
 * Guest checkout leaves `user_id = NULL`, and "Minhas compras" only reads by
 * `user_id`/`member_id` — so without adoption the purchase is invisible to the
 * account created afterwards with the same e-mail. The rules being pinned:
 * the ownership proof (`email_verified`) is enforced in SQL, the match ignores
 * case, and the reading path heals itself.
 */
describe('claimGuestOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memberIdMock.mockResolvedValue(null);
  });

  it('adopts orders only for an account that proved it owns the e-mail', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 2, rows: [] });

    const claimed = await claimGuestOrders('u1');

    expect(claimed).toBe(2);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/UPDATE orders/);
    expect(sql).toMatch(/email_verified\s*=\s*TRUE/);
    expect(sql).toMatch(/o\.user_id IS NULL/);
    // Case-insensitive: users.email is normalized on signup, customer_email is
    // whatever the customer typed at checkout.
    expect(sql).toMatch(/lower\(o\.customer_email\) = lower\(u\.email\)/);
    expect(params).toEqual(['u1']);
  });

  it('reports nothing adopted when no guest order matches', async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(claimGuestOrders('u1')).resolves.toBe(0);
  });

  it('heals older accounts by adopting before reading the list', async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // claim
      .mockResolvedValueOnce({ rows: [] })              // page
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })  // count
      .mockResolvedValueOnce({ rows: [{ total: 0 }] }); // unclaimed

    await listMyOrders('u1');

    expect(queryMock.mock.calls[0][0]).toMatch(/UPDATE orders/);
  });

  it('tells a still-unverified account how many purchases are waiting', async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const result = await listMyOrders('u1');

    expect(result.unclaimedGuestOrders).toBe(1);
    expect(queryMock.mock.calls[3][0]).toMatch(/email_verified = FALSE/);
  });
});

/**
 * The note the customer writes at checkout ("manda mais photocards do mesmo
 * cantor"). It decides what goes in the box, so what is pinned is that it
 * reaches the row intact — trimmed, capped, and never invented.
 */
describe('mensagem do cliente no checkout', () => {

  it('stores the note with the order', async () => {
    setupTx({ products: [product()] });

    await createOrder(baseInput({ customerNote: '  se tiver do Jungkook manda junto  ' }));

    expect(insertedOrderValues()[COL.customerNote]).toBe('se tiver do Jungkook manda junto');
  });

  it('writes NULL when the customer left it blank', async () => {
    setupTx({ products: [product()] });

    await createOrder(baseInput({ customerNote: '   ' }));

    expect(insertedOrderValues()[COL.customerNote]).toBeNull();
  });

  it('caps the note instead of letting it hit the column constraint', async () => {
    setupTx({ products: [product()] });

    await createOrder(baseInput({ customerNote: 'a'.repeat(900) }));

    expect(String(insertedOrderValues()[COL.customerNote])).toHaveLength(500);
  });
});

// ─── Retirada na loja ────────────────────────────────────────────────────────

/**
 * Pickup is the one checkout path where the customer is never asked for an
 * address and never sees a frete. What these guard, in order of what a
 * regression costs:
 *
 *  1. A pickup order is free of shipping — priced here, never from a token the
 *     client could swap to zero a real delivery.
 *  2. The quote is not consulted at all, so an expired or missing one cannot
 *     block a counter sale.
 *  3. The counter address is snapshotted onto the order, so the picking list
 *     and the LGPD export still read one field.
 */
describe('createOrder — retirada na loja', () => {
  function pickupInput(over: Record<string, unknown> = {}) {
    return {
      items: [{ productId: 'p1', quantity: 1 }],
      customer: { name: 'Laura', email: 'laura@example.com' },
      deliveryMethod: 'pickup' as const,
      paymentMethod: 'pix' as const,
      ...over,
    };
  }

  it('charges no shipping and never touches the quote', async () => {
    setupTx({ products: [product({ price: '100.00' })] });

    await createOrder(pickupInput());

    const v = insertedOrderValues();
    expect(v[COL.deliveryMethod]).toBe('pickup');
    expect(v[COL.shippingCost]).toBe(0);
    expect(v[COL.shippingService]).toBe('Retirada na loja');
    expect(v[COL.shippingServiceId]).toBe('pickup');
    expect(v[COL.shippingDays]).toBeNull();
    expect(v[COL.total]).toBe(100);
    // The whole point: no token is read, so nothing about the quote can fail.
    expect(pickOptionMock).not.toHaveBeenCalled();
  });

  it('accepts a pickup order with neither address nor quote', async () => {
    setupTx({ products: [product({ price: '50.00' })] });

    await expect(createOrder(pickupInput())).resolves.toBeTruthy();
  });

  it('ignores a shipping quote sent alongside pickup', async () => {
    setupTx({ products: [product({ price: '100.00' })] });
    // A stale cart could still carry these; pickup must not be priced from them.
    await createOrder(
      pickupInput({ shippingAddress: ADDRESS, shipping: { quoteToken: 'tok', serviceId: 'pac' } })
    );

    const v = insertedOrderValues();
    expect(v[COL.shippingCost]).toBe(0);
    expect(v[COL.total]).toBe(100);
    expect(pickOptionMock).not.toHaveBeenCalled();
  });

  it('snapshots the counter address with the buyer as recipient', async () => {
    setupTx({ products: [product({ price: '100.00' })] });

    await createOrder(pickupInput());

    const addr = JSON.parse(insertedOrderValues()[COL.shippingAddress] as string);
    expect(addr).toMatchObject({
      street: 'Rua Barata Ribeiro',
      number: '181',
      city: 'Rio de Janeiro',
      cep: '22011001',
      recipientName: 'Laura',
    });
  });

  it('still applies the member discount to goods', async () => {
    setupTx({ products: [product({ price: '100.00' })] });
    memberIdMock.mockResolvedValue('m1');
    queryMock.mockResolvedValue({ rows: [{ id: 'm1' }] });

    await createOrder(pickupInput(), { userId: 'u1' } as never);

    const v = insertedOrderValues();
    expect(v[COL.discount]).toBe(10);
    expect(v[COL.total]).toBe(90); // sem frete somado
  });

  it('keeps requiring address and quote on the shipping path', async () => {
    setupTx({ products: [product()] });

    await expect(
      createOrder({
        items: [{ productId: 'p1', quantity: 1 }],
        customer: { name: 'Laura', email: 'laura@example.com' },
        paymentMethod: 'pix',
      } as never)
    ).rejects.toThrow(AppError);
  });
});

// ─── Rastreio × retirada ─────────────────────────────────────────────────────

describe('setOrderTracking — retirada não tem postagem', () => {
  function orderRow(over: Record<string, unknown> = {}) {
    return {
      id: 'o1',
      order_number: 1001,
      customer_name: 'Laura',
      customer_email: 'laura@example.com',
      subtotal: '100',
      discount: '0',
      shipping_cost: '0',
      total: '100',
      status: 'paid',
      delivery_method: 'shipping',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...over,
    };
  }

  it('refuses a Correios code on a pickup order', async () => {
    queryMock.mockResolvedValue({ rows: [orderRow({ delivery_method: 'pickup' })] });

    // Sem a trava o cliente que vai buscar no balcão recebe um e-mail com link
    // de rastreio de uma postagem que não existe.
    await expect(setOrderTracking('o1', 'BR123456789BR', 'admin-1')).rejects.toThrow(
      /retirada na loja/i
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('still accepts a code on a shipped order', async () => {
    queryMock.mockResolvedValue({ rows: [orderRow({ tracking_code: 'BR123456789BR' })] });

    await expect(setOrderTracking('o1', 'BR123456789BR', 'admin-1')).resolves.toBeTruthy();
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'order-shipped' })
    );
  });
});
