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

const { queryMock, clientQueryMock, releaseMock, pickOptionMock, redeemMock, memberIdMock, approvedAccountMock, salesOpenMock, stripeMock, auditMock, sendEmailMock, restoreCreditMock, recordOrderMovementsMock, recordMovementMock, shopPromoMock, checkCouponMock, claimCouponMock, recordRedemptionMock, releaseCouponMock, notifyAdminsMock, pagarmeCreateOrderMock, pagarmeRefundMock, pagarmeGetChargeMock, pagarmeCreateCustomerMock, pagarmeCreateCardMock } =
  vi.hoisted(() => ({
    queryMock: vi.fn(),
    clientQueryMock: vi.fn(),
    releaseMock: vi.fn(),
    pickOptionMock: vi.fn(),
    redeemMock: vi.fn(),
    memberIdMock: vi.fn(),
    approvedAccountMock: vi.fn(),
    salesOpenMock: vi.fn(),
    stripeMock: vi.fn(),
    auditMock: vi.fn(),
    sendEmailMock: vi.fn(),
    restoreCreditMock: vi.fn(),
    recordOrderMovementsMock: vi.fn(async () => {}),
    recordMovementMock: vi.fn(async () => {}),
    shopPromoMock: vi.fn(),
    checkCouponMock: vi.fn(),
    claimCouponMock: vi.fn(),
    recordRedemptionMock: vi.fn(async () => {}),
    releaseCouponMock: vi.fn(async () => {}),
    notifyAdminsMock: vi.fn(),
    pagarmeCreateOrderMock: vi.fn(),
    pagarmeRefundMock: vi.fn(async () => ({ id: 'ch_1', status: 'canceled' })),
    pagarmeGetChargeMock: vi.fn(),
    pagarmeCreateCustomerMock: vi.fn(async () => ({ id: 'cus_1' })),
    pagarmeCreateCardMock: vi.fn(async () => ({
      id: 'card_1',
      brand: 'visa',
      last_four_digits: '4242',
    })),
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
    PAGARME_SECRET_KEY: 'sk_test_x',
    PAGARME_API_URL: 'https://api.pagar.me/core/v5',
    PAGARME_STATEMENT_DESCRIPTOR: 'GEEKPOPTOYS',
    PAGARME_MAX_INSTALLMENTS: 6,
    PAGARME_MIN_INSTALLMENT_AMOUNT: 20,
    PAGARME_PIX_EXPIRES_IN: 3600,
  },
  // Fiel ao real; o `email-contract.test.ts` exercita a função sem mock.
  adminUrl: (path = '/admin') => `https://adm.geeketoys.com.br${path}`,
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

vi.mock('./wholesale.service.js', () => ({
  getApprovedAccountByUserId: approvedAccountMock,
  isWholesaleSalesOpen: salesOpenMock,
}));
vi.mock('../middleware/ownership.js', () => ({ getMemberIdForUser: memberIdMock }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));
vi.mock('./stock.service.js', () => ({
  recordOrderMovements: recordOrderMovementsMock,
  recordMovement: recordMovementMock,
}));
vi.mock('./email.service.js', () => ({ sendTemplateEmail: sendEmailMock }));
vi.mock('./admin-notification.service.js', () => ({
  notifyAdminsOfPaymentAsync: notifyAdminsMock,
  notifyAdminsOfPayment: notifyAdminsMock,
}));
vi.mock('../utils/stripe.js', () => ({ getStripe: stripeMock }));
// Only the network calls are stubbed; the money maths in `utils/pagarme`
// (reais to centavos, status mapping, the instalment ceiling) stays real.
vi.mock('../utils/pagarme.js', async () => {
  const actual = await vi.importActual<typeof import('../utils/pagarme.js')>('../utils/pagarme.js');
  return {
    ...actual,
    createOrder: pagarmeCreateOrderMock,
    refundCharge: pagarmeRefundMock,
    getCharge: pagarmeGetChargeMock,
    // The throttled variant calls `getCharge` through the module's own closure,
    // which an export override does not reach — so it is stubbed too.
    getChargeThrottled: pagarmeGetChargeMock,
    // PSP bills a saved card, so a card order first creates a customer and a
    // card from the browser token.
    createCustomer: pagarmeCreateCustomerMock,
    createCardForCustomer: pagarmeCreateCardMock,
  };
});

/**
 * Only the database-touching half is faked. `pickBestDiscount` and
 * `retailDiscountCandidates` stay real — they *are* the rule these tests are
 * here to protect, and stubbing them would leave the money decision untested.
 */
vi.mock('./promo.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./promo.service.js')>();
  return {
    ...actual,
    getShopPromo: shopPromoMock,
    checkCoupon: checkCouponMock,
    claimCoupon: claimCouponMock,
    recordRedemption: recordRedemptionMock,
    releaseCoupon: releaseCouponMock,
  };
});

import {
  createOrder,
  cancelMyOrder,
  decrementStockForOrder,
  claimGuestOrders,
  listMyOrders,
  setOrderTracking,
  updateOrderStatus,
  refundOrder,
  payOrderWithCard,
  buildOrderPix,
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
    // The acquirer refuses an order with no buyer document, so the checkout
    // now collects a CPF and the service verifies its check digits.
    customer: { name: 'Laura', email: 'laura@example.com', document: '52998224725' },
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
  customerDocument: 21,
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
  salesOpenMock.mockResolvedValue(true);
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
  // Off by default: the tests below this line predate the online promotion and
  // are about shipping, membership and store credit. The promotion has its own
  // block at the bottom, where it is switched on deliberately.
  shopPromoMock.mockResolvedValue({
    enabled: false,
    percent: 0,
    bannerEnabled: false,
    bannerText: '',
  });
  claimCouponMock.mockResolvedValue(true);
  // Default: Pagar.me accepts the order and returns a payable PIX code.
  pagarmeCreateOrderMock.mockResolvedValue({
    id: 'or_1',
    status: 'pending',
    charges: [
      {
        id: 'ch_1',
        status: 'pending',
        amount: 12400,
        payment_method: 'pix',
        last_transaction: {
          qr_code: '00020101br.gov.bcb.pix-GEEKPOP',
          qr_code_url: 'https://api.pagar.me/qr/ch_1.png',
          expires_at: '2026-09-01T23:00:00Z',
        },
      },
    ],
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
    expect(v[COL.total]).toBe(224); // 200 + 24 shipping
  });

  it('applies the 10% member discount to goods, never to shipping', async () => {
    setupTx({ products: [product({ price: '100.00' })] });
    memberIdMock.mockResolvedValue('m1');
    queryMock.mockResolvedValue({ rows: [{ id: 'm1' }] }); // active membership

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
    queryMock.mockResolvedValue({ rows: [] }); // expiry_date filter returned nothing

    await createOrder(baseInput(), { userId: 'u1' } as never);

    const v = insertedOrderValues();
    expect(v[COL.discount]).toBe(0);
    expect(v[COL.discountReason]).toBeNull();
  });

  it('wholesale uses 25% and does NOT stack with the member 10%', async () => {
    setupTx({ products: [product({ price: '100.00', wholesale_enabled: true })] });
    approvedAccountMock.mockResolvedValue({ id: 'w1', cnpj: '11222333000181' });
    memberIdMock.mockResolvedValue('m1'); // also a member — must not stack

    await createOrder(
      baseInput({ channel: 'wholesale', cnpj: '11.222.333/0001-81' }),
      { userId: 'u1' } as never
    );

    const v = insertedOrderValues();
    expect(v[COL.discount]).toBe(25);
    expect(v[COL.discountReason]).toBe('wholesale_25');
    // 25 + 15 stacked would be 60 off and a total of 64.
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
    expect(v[COL.subtotal]).toBe(160); // 2 × 80, not 2 × 100
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

// ─── Wholesale ───────────────────────────────────────────────────────────────

describe('createOrder — atacado', () => {
  it('recusa pedido com o canal fechado, mesmo com CNPJ aprovado', async () => {
    setupTx({ products: [product({ wholesale_enabled: true })] });
    salesOpenMock.mockResolvedValue(false);
    approvedAccountMock.mockResolvedValue({ id: 'w1', cnpj: '11222333000181' });
    await expect(
      createOrder(
        baseInput({ channel: 'wholesale', cnpj: '11222333000181' }),
        { userId: 'u1' } as never
      )
    ).rejects.toMatchObject({ code: 'WHOLESALE_CLOSED' });
  });

  it('não bloqueia o varejo quando o atacado está fechado', async () => {
    setupTx({ products: [product({ price: '100.00' })] });
    salesOpenMock.mockResolvedValue(false);
    const order = await createOrder(baseInput());
    expect(order).toBeTruthy();
  });

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

// ─── Input / shipping ────────────────────────────────────────────────────────

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

// ─── Pending PIX notice ──────────────────────────────────────────────────────

/**
 * Shop PIX has no webhook: the order is born `pending` and leaves that state
 * only when an admin checks the bank statement and confirms. Without a
 * notification the customer pays and the store never finds out.
 */
describe('createOrder — PIX pela Pagar.me', () => {
  function pixEmail() {
    return sendEmailMock.mock.calls.find(
      (c) => (c[0] as { template?: string })?.template === 'admin-pix-order-pending'
    )?.[0] as { to: string; variables: Record<string, string> } | undefined;
  }

  /**
   * The QR is the provider's, not ours. It cannot be rebuilt from an amount and
   * a key the way the old static BR Code could, so it is stored on the order —
   * losing the string means losing the only payable code.
   */
  it('guarda o QR emitido pela Pagar.me na linha do pedido', async () => {
    setupTx({ products: [product({ price: '100.00' })] });

    const result = await createOrder(baseInput());

    expect(result.pixData?.emvCode).toBe('00020101br.gov.bcb.pix-GEEKPOP');
    expect(result.pixData?.provider).toBe('pagarme');
    expect(result.pixData?.txId).toBe('ch_1');

    const stored = queryMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('pix_qr_code')
    );
    expect(stored, 'o QR tem de ser gravado').toBeDefined();
    // The charge id is bound twice (TEXT vs VARCHAR columns cannot share a
    // placeholder), so the QR is the fourth parameter, not the third.
    expect(stored![1] as unknown[]).toContain('00020101br.gov.bcb.pix-GEEKPOP');
  });

  /** Centavos at the provider, reais in our rows. A factor of 100 here is a 100x charge. */
  it('cobra o total em centavos', async () => {
    setupTx({ products: [product({ price: '100.00' })] });

    await createOrder(baseInput()); // 100 + 24 shipping

    expect(pagarmeCreateOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ items: [expect.objectContaining({ amount: 12400 })] }),
      expect.anything()
    );
  });

  it('notifies the admin with order, customer, amount and charge id', async () => {
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
    // The charge id is what ties the provider's dashboard to the order.
    expect(email!.variables.tx_id).toBe('ch_1');
    expect(email!.variables.total).toMatch(/^\d+,\d{2}$/);
  });

  // `adm` é o host canônico. `admin.*` também responde, mas só através de um
  // 301 — e o link de e-mail é o único caminho que a admin tem para chegar ali.
  it('aponta o CTA para a aba de pedidos do painel admin', async () => {
    setupTx({});

    await createOrder(baseInput());

    expect(pixEmail()!.variables.admin_url).toBe(
      'https://adm.geeketoys.com.br/admin?tab=orders'
    );
  });

  /**
   * The card is charged in a second step now: Pagar.me authorises from a token
   * synchronously, so there is nothing to prepare while the order is created.
   * `payOrderWithCard` runs the charge, which is what makes a decline a retry
   * on the same order rather than a lost one.
   */
  it('cartão nasce sem cobrança, esperando o token', async () => {
    setupTx({});

    const result = await createOrder(baseInput({ paymentMethod: 'credit_card' }));

    expect(result.requiresCard).toBe(true);
    expect(result.pixData).toBeUndefined();
    expect(pagarmeCreateOrderMock).not.toHaveBeenCalled();
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
    // no UPDATE ... status = 'cancelled'
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

  /**
   * An order the provider accepted but returned no `qr_code` for is unpayable.
   * Failing compensates — the order is cancelled and the hold released — which
   * beats leaving the customer with an empty QR box and stock locked up.
   */
  it('cancela e libera a reserva quando a Pagar.me não devolve QR', async () => {
    setupTx({});
    pagarmeCreateOrderMock.mockResolvedValueOnce({
      id: 'or_2',
      status: 'pending',
      charges: [{ id: 'ch_2', status: 'pending', amount: 12400, last_transaction: {} }],
    });

    await expect(createOrder(baseInput())).rejects.toThrow('QR Code');

    expect(
      queryMock.mock.calls.some(
        (c) => typeof c[0] === 'string' && c[0].includes("status = 'cancelled'")
      )
    ).toBe(true);
  });
});

// ─── Buyer document ──────────────────────────────────────────────────────────

/**
 * The CPF is checked before the transaction opens, so a typo costs the customer
 * a corrected field — not a cancelled order, a released reservation and a
 * coupon burned on a purchase that never existed.
 */
describe('createOrder — CPF do comprador', () => {
  it.each([
    ['vazio', ''],
    ['curto', '123'],
    ['com dígito verificador errado', '52998224726'],
    ['de dígitos repetidos', '11111111111'],
  ])('recusa um CPF %s antes de abrir a transação', async (_label, document) => {
    setupTx({});

    await expect(
      createOrder(baseInput({ customer: { name: 'Laura', email: 'l@e.com', document } }))
    ).rejects.toThrow('CPF ou CNPJ inválido');

    expect(clientQueryMock).not.toHaveBeenCalled();
    expect(pagarmeCreateOrderMock).not.toHaveBeenCalled();
  });

  it('aceita CNPJ, que é o documento do atacado', async () => {
    setupTx({});

    await expect(
      createOrder(
        baseInput({ customer: { name: 'Loja', email: 'l@e.com', document: '11.222.333/0001-81' } })
      )
    ).resolves.toBeDefined();
  });

  it('grava o documento só com dígitos', async () => {
    setupTx({});

    await createOrder(
      baseInput({ customer: { name: 'Laura', email: 'l@e.com', document: '529.982.247-25' } })
    );

    expect(insertedOrderValues()[COL.customerDocument]).toBe('52998224725');
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

// ─── Store pickup ────────────────────────────────────────────────────────────

/**
 * Pickup is the one checkout path where the customer is never asked for an
 * address and never sees a shipping quote. What these guard, in order of what a
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
      customer: { name: 'Laura', email: 'laura@example.com', document: '52998224725' },
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
    expect(v[COL.total]).toBe(90); // goods only, no shipping
  });

  it('keeps requiring address and quote on the shipping path', async () => {
    setupTx({ products: [product()] });

    await expect(
      createOrder({
        items: [{ productId: 'p1', quantity: 1 }],
        customer: { name: 'Laura', email: 'laura@example.com', document: '52998224725' },
        paymentMethod: 'pix',
      } as never)
    ).rejects.toThrow(AppError);
  });
});

// ─── Tracking vs pickup ──────────────────────────────────────────────────────

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

    // Without the guard, a customer collecting at the counter gets an
    // email with a tracking link for a shipment that does not exist.
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

// ─── Online promotion and coupons ────────────────────────────────────────────

/**
 * The rule, in one line: **exactly one discount is applied, and it is the
 * largest on offer.**
 *
 * `orders` carries a single `discount` and a single `discount_reason`, and
 * wholesale already behaved as "25% instead of, never on top of, member 10%".
 * The online promotion and coupons join that same contest rather than opening
 * a second discount slot, so the customer always pays the best price and any
 * order can still explain its price with one short string.
 */
describe('createOrder — promoção da loja online', () => {
  function promoOn(percent = 5) {
    shopPromoMock.mockResolvedValue({
      enabled: true,
      percent,
      bannerEnabled: true,
      bannerText: 'No site é mais barato',
    });
  }

  /** An active member, which is what earns the 10%. */
  function asMember() {
    memberIdMock.mockResolvedValue('m1');
    queryMock.mockResolvedValue({ rows: [{ id: 'm1' }] });
    return { userId: 'u1', role: 'member' } as never;
  }

  it('gives a non-member the online discount', async () => {
    promoOn(5);
    setupTx({ products: [product({ price: '100.00' })] });

    await createOrder(baseInput());

    const v = insertedOrderValues();
    expect(v[COL.subtotal]).toBe(100);
    expect(v[COL.discount]).toBe(5);
    expect(v[COL.discountReason]).toBe('online');
    expect(v[COL.total]).toBe(119); // 100 - 5 + 24 de frete
  });

  // The decision taken with the client: the site discount is a floor for people
  // who are not members, not a bonus on top of the club.
  it('does not stack with the member discount — the larger one wins', async () => {
    promoOn(5);
    setupTx({ products: [product({ price: '100.00' })] });

    await createOrder(baseInput(), asMember());

    const v = insertedOrderValues();
    expect(v[COL.discount]).toBe(10);
    expect(v[COL.discountReason]).toBe('member_10');
  });

  // Same rule seen from the other side: when the promotion is the better offer
  // it beats the membership, so a member is never worse off than a stranger.
  it('beats the member discount when the promotion is larger', async () => {
    promoOn(20);
    setupTx({ products: [product({ price: '100.00' })] });

    await createOrder(baseInput(), asMember());

    const v = insertedOrderValues();
    expect(v[COL.discount]).toBe(20);
    expect(v[COL.discountReason]).toBe('online');
  });

  it('never reaches the wholesale channel', async () => {
    promoOn(30);
    approvedAccountMock.mockResolvedValue({ id: 'w1', cnpj: '19131243000197' });
    setupTx({ products: [product({ price: '100.00', wholesale_enabled: true })] });

    await createOrder(
      baseInput({ channel: 'wholesale', cnpj: '19.131.243/0001-97' }),
      { userId: 'u1', role: 'member' } as never
    );

    const v = insertedOrderValues();
    expect(v[COL.discount]).toBe(25);
    expect(v[COL.discountReason]).toBe('wholesale_25');
  });

  it('is off when the percentage is zero, instead of writing a discount of nothing', async () => {
    shopPromoMock.mockResolvedValue({
      enabled: true,
      percent: 0,
      bannerEnabled: false,
      bannerText: '',
    });
    setupTx({ products: [product({ price: '100.00' })] });

    await createOrder(baseInput());

    const v = insertedOrderValues();
    expect(v[COL.discount]).toBe(0);
    expect(v[COL.discountReason]).toBeNull();
  });
});

describe('createOrder — cupons', () => {
  function couponFound(over: Record<string, unknown> = {}) {
    checkCouponMock.mockResolvedValue({
      ok: true,
      coupon: {
        id: 'c1',
        code: 'VERAO20',
        percent: 20,
        description: null,
        active: true,
        startsAt: null,
        endsAt: null,
        maxUses: null,
        usedCount: 0,
        maxUsesPerCustomer: null,
        minSubtotal: null,
        createdAt: '',
        updatedAt: '',
        ...over,
      },
    });
  }

  it('applies the coupon and names it on the order', async () => {
    couponFound();
    setupTx({ products: [product({ price: '100.00' })] });

    await createOrder(baseInput({ couponCode: 'verao20' }));

    const v = insertedOrderValues();
    expect(v[COL.discount]).toBe(20);
    expect(v[COL.discountReason]).toBe('coupon_VERAO20');
    expect(claimCouponMock).toHaveBeenCalledWith(expect.anything(), 'c1');
    expect(recordRedemptionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ couponId: 'c1', orderId: 'o1', discountAmount: 20 })
    );
  });

  // A single-use code spent on an order it did not pay for would be gone for
  // nothing — the customer had a better discount all along.
  it('does not spend a use when the coupon loses to the member discount', async () => {
    couponFound({ code: 'MINI3', percent: 3 });
    memberIdMock.mockResolvedValue('m1');
    queryMock.mockResolvedValue({ rows: [{ id: 'm1' }] });
    setupTx({ products: [product({ price: '100.00' })] });

    await createOrder(baseInput({ couponCode: 'MINI3' }), { userId: 'u1', role: 'member' } as never);

    const v = insertedOrderValues();
    expect(v[COL.discount]).toBe(10);
    expect(v[COL.discountReason]).toBe('member_10');
    expect(claimCouponMock).not.toHaveBeenCalled();
    expect(recordRedemptionMock).not.toHaveBeenCalled();
  });

  it('refuses the order when the coupon does not apply', async () => {
    checkCouponMock.mockResolvedValue({
      ok: false,
      code: 'COUPON_EXPIRED',
      message: 'Este cupom expirou.',
    });
    setupTx({ products: [product({ price: '100.00' })] });

    await expect(createOrder(baseInput({ couponCode: 'VELHO' }))).rejects.toMatchObject({
      statusCode: 400,
      code: 'COUPON_EXPIRED',
    });
  });

  // The advisory check and the binding claim are different moments; two people
  // spending the last use at once both pass the first and only one passes here.
  it('refuses when the last use is taken between the check and the claim', async () => {
    couponFound();
    claimCouponMock.mockResolvedValue(false);
    setupTx({ products: [product({ price: '100.00' })] });

    await expect(createOrder(baseInput({ couponCode: 'VERAO20' }))).rejects.toMatchObject({
      statusCode: 409,
      code: 'COUPON_EXHAUSTED',
    });
  });

  it('ignores a coupon sent on the wholesale channel', async () => {
    couponFound({ percent: 80 });
    approvedAccountMock.mockResolvedValue({ id: 'w1', cnpj: '19131243000197' });
    setupTx({ products: [product({ price: '100.00', wholesale_enabled: true })] });

    await createOrder(
      baseInput({ channel: 'wholesale', cnpj: '19.131.243/0001-97', couponCode: 'VERAO20' }),
      { userId: 'u1', role: 'member' } as never
    );

    const v = insertedOrderValues();
    expect(v[COL.discountReason]).toBe('wholesale_25');
    expect(checkCouponMock).not.toHaveBeenCalled();
    expect(claimCouponMock).not.toHaveBeenCalled();
  });
});

// ─── Closing a charged order ─────────────────────────────────────────────────

/**
 * There are two ways to reach the word "refunded" in the panel: the status
 * dropdown and the Refund action. Only one of them gives the money back.
 *
 * `updateOrderStatus` restocks and returns store credit, but it never talks to
 * the acquirer — so an admin picking "Reembolsado" from the list would close
 * the order believing the customer was paid back, with the charge still taken.
 * That is the failure these pin: the manual transition is refused, and the
 * refund path is the one that reaches the provider.
 */
describe('fechar um pedido que tem cobrança', () => {
  /** Local, because this file matches SQL inline everywhere else. */
  const sqlOf = (a: unknown) => (typeof a === 'string' ? a.replace(/\s+/g, ' ').trim() : '');

  function chargedOrder(over: Record<string, unknown> = {}) {
    return {
      id: 'o1',
      order_number: 1001,
      user_id: 'u1',
      customer_name: 'Laura',
      customer_email: 'laura@example.com',
      status: 'paid',
      payment_method: 'credit_card',
      pagarme_charge_id: 'ch_1',
      payment_provider: 'pagarme',
      subtotal: '100.00',
      discount: '0',
      shipping_cost: '24.00',
      store_credit_applied: '0',
      total: '124.00',
      ...over,
    };
  }

  it.each([['refunded'], ['cancelled']])(
    'recusa marcar %s à mão, e não mexe em nada',
    async (status) => {
      queryMock.mockResolvedValue({ rows: [chargedOrder()] });

      await expect(updateOrderStatus('o1', status as string, 'admin-1')).rejects.toThrow(
        'use "Reembolsar"'
      );

      // Nothing may move: no status write, no restock, no credit return.
      expect(
        queryMock.mock.calls.some((c) => sqlOf(c[0]).includes('UPDATE orders SET status'))
      ).toBe(false);
      expect(restoreCreditMock).not.toHaveBeenCalled();
    }
  );

  /** An order settled at the counter or paid entirely with credit has no charge. */
  it('deixa cancelar um pedido sem cobrança na operadora', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sqlOf(sql).includes('UPDATE orders SET status')) {
        return { rows: [chargedOrder({ status: 'cancelled', pagarme_charge_id: null })] };
      }
      return { rows: [chargedOrder({ pagarme_charge_id: null })] };
    });

    await expect(updateOrderStatus('o1', 'cancelled', 'admin-1')).resolves.toBeDefined();
  });

  /** A pending order was never charged, so closing it by hand is fine. */
  it('deixa cancelar um pedido ainda pendente', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sqlOf(sql).includes('UPDATE orders SET status')) {
        return { rows: [chargedOrder({ status: 'cancelled' })] };
      }
      return { rows: [chargedOrder({ status: 'pending' })] };
    });

    await expect(updateOrderStatus('o1', 'cancelled', 'admin-1')).resolves.toBeDefined();
  });

  /**
   * The buyer is the party whose money moved, and was the only one not being
   * told. A refund nobody explains is a support message at best, a chargeback
   * at worst.
   */
  it('o estorno avisa o cliente e devolve o dinheiro na operadora', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sqlOf(sql).includes("UPDATE orders SET status = 'refunded'")) {
        return { rows: [chargedOrder({ status: 'refunded' })] };
      }
      return { rows: [chargedOrder()] };
    });

    await refundOrder('o1', 'admin-1');

    expect(pagarmeRefundMock).toHaveBeenCalledWith('ch_1');
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'order-refunded', to: 'laura@example.com' })
    );
  });
});

// ─── Cobrar o cartão de um pedido ────────────────────────────────────────────

/**
 * The shop's card path, and the one rule that is easy to get wrong.
 *
 * This account is **PSP**, and the docs are explicit: "Apenas clientes Gateway
 * estão aptos a utilizar o `card_token` na Criação do Pedido, caso seja cliente
 * PSP, recomendamos usar o `card_id`". Network tokenization only happens if the
 * card is created on the customer first. Charging straight from the browser
 * token is the Gateway shape — it was this integration's first draft, and it
 * would have failed on the first real card.
 */
describe('payOrderWithCard', () => {
  const sqlOf2 = (a: unknown) => (typeof a === 'string' ? a.replace(/\s+/g, ' ').trim() : '');

  function pendingCardOrder(over: Record<string, unknown> = {}) {
    return {
      id: 'o1',
      order_number: 1001,
      user_id: 'u1',
      customer_name: 'Laura',
      customer_email: 'laura@example.com',
      customer_phone: '21999998888',
      customer_document: '52998224725',
      shipping_address: {
        cep: '22041001',
        street: 'Av. Atlântica',
        number: '1702',
        neighborhood: 'Copacabana',
        city: 'Rio de Janeiro',
        state: 'RJ',
      },
      status: 'pending',
      payment_method: 'credit_card',
      subtotal: '100.00',
      discount: '0',
      shipping_cost: '24.00',
      store_credit_applied: '0',
      total: '124.00',
      ...over,
    };
  }

  function approvedCharge() {
    pagarmeCreateOrderMock.mockResolvedValueOnce({
      id: 'or_1',
      status: 'paid',
      charges: [
        {
          id: 'ch_1',
          status: 'paid',
          amount: 12400,
          payment_method: 'credit_card',
          last_transaction: { card: { brand: 'visa', last_four_digits: '4242' } },
        },
      ],
    });
  }

  beforeEach(() => {
    queryMock.mockResolvedValue({ rows: [pendingCardOrder()] });
  });

  it('troca o token por um cartão salvo e cobra o card_id, nunca o token', async () => {
    approvedCharge();

    await payOrderWithCard('o1', { cardToken: 'token_abc', installments: 3 }, 'u1');

    expect(pagarmeCreateCustomerMock).toHaveBeenCalled();
    expect(pagarmeCreateCardMock).toHaveBeenCalledWith(
      'cus_1',
      'token_abc',
      expect.objectContaining({ zip_code: '22041001', city: 'Rio de Janeiro' })
    );

    const [payload] = pagarmeCreateOrderMock.mock.calls[0] as [Record<string, unknown>];
    expect(payload.customer_id).toBe('cus_1');
    expect(payload.payments).toEqual([
      expect.objectContaining({
        payment_method: 'credit_card',
        credit_card: expect.objectContaining({ card_id: 'card_1', installments: 3 }),
      }),
    ]);
    expect(JSON.stringify(payload)).not.toContain('card_token');
  });

  /** Retrying with another card must not litter the dashboard with customers. */
  it('reaproveita o cliente já criado numa segunda tentativa', async () => {
    queryMock.mockResolvedValue({ rows: [pendingCardOrder({ pagarme_customer_id: 'cus_ja' })] });
    approvedCharge();

    await payOrderWithCard('o1', { cardToken: 'token_2' }, 'u1');

    expect(pagarmeCreateCustomerMock).not.toHaveBeenCalled();
    expect(pagarmeCreateCardMock).toHaveBeenCalledWith('cus_ja', 'token_2', expect.anything());
  });

  /**
   * A decline is a 402 with the bank's reason translated, and the order stays
   * `pending` — it keeps its stock hold for the next card.
   */
  it('recusa com o motivo do banco e não fecha o pedido', async () => {
    pagarmeCreateOrderMock.mockResolvedValueOnce({
      id: 'or_x',
      status: 'failed',
      charges: [
        {
          id: 'ch_x',
          status: 'not_authorized',
          amount: 12400,
          payment_method: 'credit_card',
          last_transaction: { acquirer_return_code: '51' },
        },
      ],
    });

    await expect(
      payOrderWithCard('o1', { cardToken: 'token_abc' }, 'u1')
    ).rejects.toThrow('saldo ou limite insuficiente');

    expect(
      queryMock.mock.calls.some((c) => sqlOf2(c[0]).includes("status = 'cancelled'"))
    ).toBe(false);
  });

  it('é idempotente para um pedido já pago', async () => {
    queryMock.mockResolvedValue({
      rows: [pendingCardOrder({ status: 'paid', pagarme_charge_id: 'ch_1' })],
    });

    const out = await payOrderWithCard('o1', { cardToken: 'token_abc' }, 'u1');

    expect(out.status).toBe('paid');
    expect(pagarmeCreateOrderMock).not.toHaveBeenCalled();
  });

  it('recusa um pedido que não está mais aguardando pagamento', async () => {
    queryMock.mockResolvedValue({ rows: [pendingCardOrder({ status: 'cancelled' })] });

    await expect(payOrderWithCard('o1', { cardToken: 'token_abc' }, 'u1')).rejects.toThrow(
      'não está mais aguardando pagamento'
    );
  });

  /** The acquirer refuses an order with no buyer document. */
  it('recusa um pedido sem CPF gravado', async () => {
    queryMock.mockResolvedValue({ rows: [pendingCardOrder({ customer_document: null })] });

    await expect(payOrderWithCard('o1', { cardToken: 'token_abc' }, 'u1')).rejects.toThrow(
      'sem CPF/CNPJ'
    );
    expect(pagarmeCreateOrderMock).not.toHaveBeenCalled();
  });
});

// ─── Recuperar o PIX de um pedido ────────────────────────────────────────────

/**
 * The endpoint the order page and the e-mail link both use.
 *
 * There are two kinds of pending PIX in the database and they behave
 * differently. A Pagar.me code is dynamic and carries the provider's txid, so
 * it is read back verbatim. A pre-migration order has only a `pix_txid` and a
 * static BR Code built from the shop's key — and returning null for those took
 * away the only way one real R$ 2.054 order had to be paid, because the
 * checkout tab was long gone.
 */
describe('buildOrderPix', () => {
  function order(over: Record<string, unknown> = {}) {
    return {
      id: 'o1',
      status: 'pending',
      paymentMethod: 'pix',
      total: 124,
      pixTxid: null,
      pagarmeChargeId: null,
      ...over,
    } as never;
  }

  it('devolve o código da Pagar.me exatamente como foi gravado', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          pix_qr_code: '00020101-PAGARME',
          pix_qr_code_url: 'https://api.pagar.me/qr.png',
          pix_expires_at: '2026-09-02T16:00:00Z',
        },
      ],
    });

    const pix = await buildOrderPix(order({ pagarmeChargeId: 'ch_1' }));

    expect(pix?.emvCode).toBe('00020101-PAGARME');
    expect(pix?.qrCodeUrl).toBe('https://api.pagar.me/qr.png');
    expect(pix?.provider).toBe('pagarme');
  });

  /** The regression: a legacy order must still be payable. */
  it('reconstrói o BR Code estático de um pedido anterior à migração', async () => {
    queryMock.mockResolvedValue({ rows: [{ pix_qr_code: null }] });

    const pix = await buildOrderPix(order({ pixTxid: 'CGT123' }));

    expect(pix, 'pedido antigo tem de continuar pagável').not.toBeNull();
    expect(pix!.emvCode).toContain('br.gov.bcb.pix');
    expect(pix!.emvCode).toContain('CGT123');
    // The amount has to be in the code, or the customer pays the wrong figure.
    expect(pix!.emvCode).toContain('124.00');
  });

  it('devolve null quando não há código nem txid', async () => {
    queryMock.mockResolvedValue({ rows: [{ pix_qr_code: null }] });

    await expect(buildOrderPix(order())).resolves.toBeNull();
  });

  it.each([['paid'], ['cancelled'], ['refunded'], ['shipped']])(
    'não devolve PIX de um pedido %s',
    async (status) => {
      queryMock.mockResolvedValue({ rows: [{ pix_qr_code: '00020101-PAGARME' }] });

      await expect(buildOrderPix(order({ status }))).resolves.toBeNull();
    }
  );

  it('não devolve PIX de um pedido de cartão', async () => {
    queryMock.mockResolvedValue({ rows: [{ pix_qr_code: '00020101-PAGARME' }] });

    await expect(buildOrderPix(order({ paymentMethod: 'credit_card' }))).resolves.toBeNull();
  });

  /** A R$ 0,00 QR is unpayable; offering one is worse than offering nothing. */
  it('não devolve PIX de um pedido sem valor', async () => {
    queryMock.mockResolvedValue({ rows: [{ pix_qr_code: '00020101-PAGARME' }] });

    await expect(buildOrderPix(order({ total: 0 }))).resolves.toBeNull();
  });
});
