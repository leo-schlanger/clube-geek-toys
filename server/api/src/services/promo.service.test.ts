import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryMock, getSettingMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  getSettingMock: vi.fn(),
}));

// `promo.service` reaches `AppError`, and `error-handler` imports the env
// schema, which calls process.exit(1) outside a configured container.
vi.mock('../config/env.js', () => ({
  env: { API_URL: 'https://api.test', NODE_ENV: 'test' },
}));
vi.mock('../config/database.js', () => ({ query: queryMock }));
vi.mock('./settings.service.js', () => ({ getSetting: getSettingMock }));

const {
  getShopPromo,
  pickBestDiscount,
  retailDiscountCandidates,
  checkCoupon,
  claimCoupon,
  couponReason,
  normalizeCouponCode,
  MAX_COUPON_CODE_LENGTH,
} = await import('./promo.service.js');

const OFF = { enabled: false, percent: 0, bannerEnabled: false, bannerText: '' };

function settings(over: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'shop.online_discount_enabled': true,
    'shop.online_discount_percent': 5,
    'shop.online_discount_banner_enabled': true,
    'shop.online_discount_banner_text': 'No site é 5% mais barato',
    ...over,
  };
  getSettingMock.mockImplementation(async (key: string) => values[key]);
}

function couponRow(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    code: 'VERAO20',
    description: null,
    percent: '20.00',
    active: true,
    starts_at: null,
    ends_at: null,
    max_uses: null,
    used_count: 0,
    max_uses_per_customer: null,
    min_subtotal: null,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  queryMock.mockResolvedValue({ rows: [] });
});

describe('getShopPromo', () => {
  it('reads the promotion from the settings catalogue', async () => {
    settings();
    await expect(getShopPromo()).resolves.toEqual({
      enabled: true,
      percent: 5,
      bannerEnabled: true,
      bannerText: 'No site é 5% mais barato',
    });
  });

  it('is off when switched off, whatever the percentage says', async () => {
    settings({ 'shop.online_discount_enabled': false });
    await expect(getShopPromo()).resolves.toMatchObject({ enabled: false });
  });

  // A promotion of nothing would still write `online` as the reason for a
  // discount of R$ 0,00, which reads in the panel as if something was given.
  it('treats 0% as off', async () => {
    settings({ 'shop.online_discount_percent': 0 });
    await expect(getShopPromo()).resolves.toMatchObject({ enabled: false, percent: 0 });
  });

  /**
   * `config` is free-form JSONB and can be written by hand. Without this the
   * bad value would reach `subtotal * percent` and price real orders.
   */
  it.each([
    ['a string', 'cinco', 0],
    ['negative', -10, 0],
    ['not a number', null, 0],
    ['above the cap', 500, 90],
  ])('refuses to let %s poison the money math', async (_label, stored, expected) => {
    settings({ 'shop.online_discount_percent': stored });
    const promo = await getShopPromo();
    expect(promo.percent).toBe(expected);
    if (expected === 0) expect(promo.enabled).toBe(false);
  });
});

describe('pickBestDiscount', () => {
  it('takes the largest', () => {
    expect(
      pickBestDiscount([
        { reason: 'member_10', percent: 10 },
        { reason: 'online', percent: 5 },
        { reason: 'coupon_X', percent: 20 },
      ])
    ).toEqual({ reason: 'coupon_X', percent: 20 });
  });

  // The member keeps the credit on a tie: it is the one they would lose by
  // cancelling the plan, so it is the one the order should name.
  it('keeps the first on a tie', () => {
    expect(
      pickBestDiscount([
        { reason: 'member_10', percent: 10 },
        { reason: 'online', percent: 10 },
      ])
    ).toEqual({ reason: 'member_10', percent: 10 });
  });

  it('ignores worthless candidates', () => {
    expect(pickBestDiscount([{ reason: 'online', percent: 0 }])).toBeNull();
    expect(pickBestDiscount([])).toBeNull();
  });
});

describe('retailDiscountCandidates', () => {
  it('offers the member discount and the promotion, member first', () => {
    const candidates = retailDiscountCandidates({
      isMember: true,
      promo: { ...OFF, enabled: true, percent: 5 },
    });
    expect(candidates).toEqual([
      { reason: 'member_10', percent: 10 },
      { reason: 'online', percent: 5 },
    ]);
  });

  it('leaves the promotion out when it is off', () => {
    expect(retailDiscountCandidates({ isMember: false, promo: OFF })).toEqual([]);
  });

  it('names the coupon by its code', () => {
    expect(
      retailDiscountCandidates({
        isMember: false,
        promo: OFF,
        couponCode: 'verao20',
        couponPercent: 20,
      })
    ).toEqual([{ reason: 'coupon_VERAO20', percent: 20 }]);
  });

  /**
   * `orders.discount_reason` is VARCHAR(40) and the longest string this can
   * write is `coupon_<CODE>+store_credit`. A code past the cap would be
   * truncated by Postgres and the order would stop naming the coupon that paid
   * for it — which is why the column caps codes at 20.
   */
  it('the longest reason it can write still fits the column', () => {
    const code = 'A'.repeat(MAX_COUPON_CODE_LENGTH);
    expect(`${couponReason(code)}+store_credit`.length).toBeLessThanOrEqual(40);
  });
});

describe('checkCoupon', () => {
  it('normalises the typed code before looking it up', async () => {
    queryMock.mockResolvedValue({ rows: [couponRow()] });
    const result = await checkCoupon('  verao20 ', { subtotal: 100 });
    expect(result.ok).toBe(true);
    expect(queryMock.mock.calls[0][1]).toEqual(['VERAO20']);
    expect(normalizeCouponCode(' verao20 ')).toBe('VERAO20');
  });

  it.each([
    ['unknown', [], 'COUPON_NOT_FOUND'],
    ['switched off', [couponRow({ active: false })], 'COUPON_INACTIVE'],
    [
      'not started',
      [couponRow({ starts_at: new Date(Date.now() + 86_400_000).toISOString() })],
      'COUPON_NOT_STARTED',
    ],
    [
      'expired',
      [couponRow({ ends_at: new Date(Date.now() - 86_400_000).toISOString() })],
      'COUPON_EXPIRED',
    ],
    ['out of uses', [couponRow({ max_uses: 5, used_count: 5 })], 'COUPON_EXHAUSTED'],
  ])('rejects a coupon that is %s', async (_label, rows, expected) => {
    queryMock.mockResolvedValue({ rows });
    const result = await checkCoupon('VERAO20', { subtotal: 100 });
    expect(result).toMatchObject({ ok: false, code: expected });
  });

  it('rejects a basket below the minimum, and says the minimum', async () => {
    queryMock.mockResolvedValue({ rows: [couponRow({ min_subtotal: '150.00' })] });
    const result = await checkCoupon('VERAO20', { subtotal: 100 });
    expect(result).toMatchObject({ ok: false, code: 'COUPON_MIN_SUBTOTAL' });
    if (!result.ok) expect(result.message).toContain('150,00');
  });

  /**
   * The shop takes guest orders, so a per-customer limit that only counted
   * logged-in redemptions would be bypassed by not logging in.
   */
  it('counts a guest by e-mail against the per-customer limit', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [couponRow({ max_uses_per_customer: 1 })] })
      .mockResolvedValueOnce({ rows: [{ n: 1 }] });

    const result = await checkCoupon('VERAO20', {
      subtotal: 100,
      customerEmail: 'Laura@Example.com',
    });

    expect(result).toMatchObject({ ok: false, code: 'COUPON_ALREADY_USED' });
    const [sql, params] = queryMock.mock.calls[1];
    expect(sql).toContain('lower(customer_email)');
    expect(params).toContain('laura@example.com');
  });

  it('accepts a coupon that is within every limit', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [couponRow({ max_uses: 10, used_count: 3, max_uses_per_customer: 2 })] })
      .mockResolvedValueOnce({ rows: [{ n: 1 }] });

    const result = await checkCoupon('VERAO20', { subtotal: 100, userId: 'u1' });
    expect(result.ok).toBe(true);
  });
});

describe('claimCoupon', () => {
  /**
   * The guard is in the WHERE clause on purpose: a `SELECT used_count` followed
   * by an `UPDATE` would let two concurrent checkouts both see the last use and
   * both take it.
   */
  it('takes the use and checks the cap in the same statement', async () => {
    const clientQuery = vi.fn().mockResolvedValue({ rows: [{ id: 'c1' }] });
    const client = { query: clientQuery } as never;

    await expect(claimCoupon(client, 'c1')).resolves.toBe(true);

    const sql = String(clientQuery.mock.calls[0][0]);
    expect(sql).toMatch(/used_count\s*=\s*used_count\s*\+\s*1/);
    expect(sql).toMatch(/max_uses IS NULL OR used_count < max_uses/);
    expect(sql).toMatch(/active = TRUE/);
  });

  it('reports failure when there was nothing left to take', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) } as never;
    await expect(claimCoupon(client, 'c1')).resolves.toBe(false);
  });
});
