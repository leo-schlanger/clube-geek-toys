import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Store credit is money the customer holds with the shop. What these pin:
 *
 *  1. Redeeming never takes more than the balance, and never goes negative.
 *  2. The ledger row is written before the balance moves, inside the same
 *     transaction, and a failure rolls the whole thing back.
 *  3. Restoring credit for a cancelled order is idempotent: a second call, or
 *     a concurrent one that loses the unique-index race, restores nothing.
 *  4. Amounts are rounded to cents — no 0.1 + 0.2 drift in a balance.
 */

const { queryMock, clientQuery, release } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
}));
vi.mock('../config/database.js', () => ({
  query: queryMock,
  getClient: async () => ({ query: clientQuery, release }),
}));
vi.mock('../config/env.js', () => ({ env: {} }));

import {
  getBalance,
  getReviewRewardAmount,
  creditUser,
  redeemForOrder,
  hasReviewRewardForOrder,
  restoreCreditForOrder,
} from './store-credit.service.js';

type Reply = { rows: Record<string, unknown>[] } | Error;

/** Answers `client.query` by SQL fragment; records every statement in order. */
function routeClient(routes: Array<[string, Reply | ((params: unknown[]) => Reply)]>) {
  const sql: string[] = [];
  clientQuery.mockImplementation(async (text: string, params: unknown[] = []) => {
    sql.push(text.replace(/\s+/g, ' ').trim());
    for (const [fragment, reply] of routes) {
      if (text.includes(fragment)) {
        const r = typeof reply === 'function' ? reply(params) : reply;
        if (r instanceof Error) throw r;
        return r;
      }
    }
    return { rows: [] };
  });
  return sql;
}

beforeEach(() => {
  queryMock.mockReset();
  clientQuery.mockReset();
  release.mockReset();
});

describe('reading', () => {
  it('returns the balance, zero without a row', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ balance: '12.50' }] }).mockResolvedValueOnce({ rows: [] });
    expect(await getBalance('u1')).toBe(12.5);
    expect(await getBalance('u2')).toBe(0);
  });

  it('reads the review reward, defaulting and capping it', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await getReviewRewardAmount()).toBe(1);
    queryMock.mockResolvedValueOnce({ rows: [{ value: '2.499' }] });
    expect(await getReviewRewardAmount()).toBe(2.5);
    queryMock.mockResolvedValueOnce({ rows: [{ value: 500 }] });
    expect(await getReviewRewardAmount()).toBe(50);
    queryMock.mockResolvedValueOnce({ rows: [{ value: 'abc' }] });
    expect(await getReviewRewardAmount()).toBe(1);
    queryMock.mockResolvedValueOnce({ rows: [{ value: -3 }] });
    expect(await getReviewRewardAmount()).toBe(1);
  });

  it('knows whether an order already paid its review reward', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{}] }).mockResolvedValueOnce({ rows: [] });
    expect(await hasReviewRewardForOrder('o1')).toBe(true);
    expect(await hasReviewRewardForOrder('o2')).toBe(false);
  });
});

describe('creditUser', () => {
  it('writes the ledger before the balance, in one transaction', async () => {
    const sql = routeClient([['SELECT balance', { rows: [{ balance: '0.10' }] }]]);
    expect(await creditUser('u1', 0.2, 'review_reward', { reviewId: 'r1' })).toBe(0.3);

    const ledger = sql.findIndex((s) => s.startsWith('INSERT INTO store_credit_ledger'));
    const update = sql.findIndex((s) => s.startsWith('UPDATE store_credits'));
    expect(sql[0]).toBe('BEGIN');
    expect(ledger).toBeGreaterThan(0);
    expect(update).toBeGreaterThan(ledger);
    expect(sql.at(-1)).toBe('COMMIT');
    expect(release).toHaveBeenCalled();
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO store_credit_ledger'), [
      'u1', 0.2, 'review_reward', null, 'r1', null,
    ]);
  });

  it('rolls back when the ledger refuses (a duplicate reward)', async () => {
    const sql = routeClient([
      ['SELECT balance', { rows: [{ balance: '5' }] }],
      ['INSERT INTO store_credit_ledger', Object.assign(new Error('duplicate'), { code: '23505' })],
    ]);
    await expect(creditUser('u1', 1, 'review_reward')).rejects.toThrow('duplicate');
    expect(sql).toContain('ROLLBACK');
    expect(sql.some((s) => s.startsWith('UPDATE store_credits'))).toBe(false);
    expect(release).toHaveBeenCalled();
  });

  it('refuses zero or negative credit', async () => {
    await expect(creditUser('u1', 0, 'admin_adjust')).rejects.toMatchObject({ statusCode: 400 });
    await expect(creditUser('u1', -5, 'admin_adjust')).rejects.toMatchObject({ code: 'INVALID_CREDIT' });
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('joins a caller transaction without opening or closing its own', async () => {
    const sql = routeClient([['SELECT balance', { rows: [{ balance: '1' }] }]]);
    const client = { query: clientQuery, release } as never;
    await creditUser('u1', 2, 'order_refund_credit', { client, orderId: 'o1' });
    expect(sql).not.toContain('BEGIN');
    expect(sql).not.toContain('COMMIT');
    expect(release).not.toHaveBeenCalled();
  });
});

describe('redeemForOrder', () => {
  const client = () => ({ query: clientQuery, release }) as never;

  it('spends at most the balance', async () => {
    routeClient([['SELECT balance', { rows: [{ balance: '3.00' }] }]]);
    expect(await redeemForOrder(client(), 'u1', 10, 'o1')).toBe(3);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE store_credits'), [0, 'u1']);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("'order_redeem'"), ['u1', -3, 'o1', 'Resgate no pedido']);
  });

  it('spends only what was asked when the balance is larger', async () => {
    routeClient([['SELECT balance', { rows: [{ balance: '50' }] }]]);
    expect(await redeemForOrder(client(), 'u1', 12.345, 'o1')).toBe(12.35);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE store_credits'), [37.65, 'u1']);
  });

  it('does nothing for zero asked or zero balance', async () => {
    expect(await redeemForOrder(client(), 'u1', 0, 'o1')).toBe(0);
    expect(clientQuery).not.toHaveBeenCalled();
    routeClient([['SELECT balance', { rows: [{ balance: '0' }] }]]);
    expect(await redeemForOrder(client(), 'u1', 5, 'o1')).toBe(0);
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE store_credits'), expect.anything());
  });
});

describe('restoreCreditForOrder', () => {
  const order = (over: Record<string, unknown> = {}) => ({
    rows: [{ id: 'o1', user_id: 'u1', store_credit_applied: '4.50', status: 'cancelled', ...over }],
  });

  it('gives back what the order used', async () => {
    const sql = routeClient([
      ['FROM orders WHERE id', order()],
      ["reason = 'order_refund_credit' LIMIT 1", { rows: [] }],
      ['SELECT balance', { rows: [{ balance: '1.00' }] }],
    ]);
    expect(await restoreCreditForOrder('o1')).toBe(4.5);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE store_credits'), [5.5, 'u1']);
    expect(sql.at(-1)).toBe('COMMIT');
  });

  it('restores nothing twice', async () => {
    routeClient([
      ['FROM orders WHERE id', order()],
      ["reason = 'order_refund_credit' LIMIT 1", { rows: [{}] }],
    ]);
    expect(await restoreCreditForOrder('o1')).toBe(0);
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE store_credits'), expect.anything());
  });

  it('loses a concurrent race quietly', async () => {
    const sql = routeClient([
      ['FROM orders WHERE id', order()],
      ["reason = 'order_refund_credit' LIMIT 1", { rows: [] }],
      ['SELECT balance', { rows: [{ balance: '1.00' }] }],
      ["VALUES ($1, $2, 'order_refund_credit'", Object.assign(new Error('dup'), { code: '23505' })],
    ]);
    expect(await restoreCreditForOrder('o1')).toBe(0);
    expect(sql).toContain('ROLLBACK');
  });

  it('skips a missing order, a guest order and an order that used no credit', async () => {
    routeClient([['FROM orders WHERE id', { rows: [] }]]);
    expect(await restoreCreditForOrder('nope')).toBe(0);
    routeClient([['FROM orders WHERE id', order({ user_id: null })]]);
    expect(await restoreCreditForOrder('o1')).toBe(0);
    routeClient([['FROM orders WHERE id', order({ store_credit_applied: '0' })]]);
    expect(await restoreCreditForOrder('o1')).toBe(0);
  });

  it('rolls back and rethrows any other failure', async () => {
    const sql = routeClient([['FROM orders WHERE id', new Error('db down')]]);
    await expect(restoreCreditForOrder('o1')).rejects.toThrow('db down');
    expect(sql).toContain('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });
});
