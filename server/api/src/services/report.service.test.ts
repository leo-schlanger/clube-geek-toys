import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Action items — the admin worklist behind the "Painel do dia".
 *
 * What these tests protect, ordered by how much a regression would cost:
 *
 *  1. A queue whose table is missing degrades to zero instead of blanking the
 *     whole panel (the panel sits on the dashboard everyone opens first).
 *  2. `oldestDays` is null on an empty queue, so the UI never claims something
 *     has been "waiting 0 days" when nothing is waiting.
 *  3. The stock counts use the same predicate the stock tab lists by, so a card
 *     and the tab it links to never disagree.
 *  4. `totalPending` is the sum of the queues — it drives whether the daily
 *     digest e-mail goes out at all.
 */

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../config/database.js', () => ({ query: queryMock }));

const { getActionItems } = await import('./report.service.js');

/** Route each queue's response by matching a fragment of its SQL. */
function respondBy(matchers: Array<[RegExp, { count: number; oldest_days: number | null }]>) {
  queryMock.mockImplementation(async (sql: string) => {
    for (const [pattern, row] of matchers) {
      if (pattern.test(sql)) return { rows: [row], rowCount: 1 };
    }
    return { rows: [{ count: 0, oldest_days: null }], rowCount: 1 };
  });
}

function itemFor(report: Awaited<ReturnType<typeof getActionItems>>, key: string) {
  return report.items.find((i) => i.key === key);
}

describe('getActionItems', () => {
  beforeEach(() => {
    queryMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns every queue even when all are empty', async () => {
    respondBy([]);
    const report = await getActionItems();

    expect(report.items).toHaveLength(11);
    expect(report.totalPending).toBe(0);
    expect(report.items.every((i) => i.count === 0 && i.oldestDays === null)).toBe(true);
  });

  it('counts pending PIX orders and how long the oldest has waited', async () => {
    respondBy([[/payment_method = 'pix'/, { count: 3, oldest_days: 4 }]]);
    const report = await getActionItems();

    expect(itemFor(report, 'pix_pending')).toEqual({ key: 'pix_pending', count: 3, oldestDays: 4 });
    expect(report.totalPending).toBe(3);
  });

  it('reports no age for an empty queue even if the row carries one', async () => {
    // COUNT(*) with no rows still returns a row; MIN() over nothing is NULL,
    // but a stray value must not become "waiting 9 days" on an empty card.
    respondBy([[/payment_method = 'pix'/, { count: 0, oldest_days: 9 }]]);
    const report = await getActionItems();

    expect(itemFor(report, 'pix_pending')).toEqual({ key: 'pix_pending', count: 0, oldestDays: null });
  });

  it('keeps the other queues when one of them throws', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/product_questions/.test(sql)) throw new Error('relation "product_questions" does not exist');
      if (/status = 'paid'/.test(sql)) return { rows: [{ count: 2, oldest_days: 1 }], rowCount: 1 };
      return { rows: [{ count: 0, oldest_days: null }], rowCount: 1 };
    });

    const report = await getActionItems();

    expect(itemFor(report, 'questions_unanswered')).toEqual({
      key: 'questions_unanswered',
      count: 0,
      oldestDays: null,
    });
    expect(itemFor(report, 'to_separate')?.count).toBe(2);
    expect(report.items).toHaveLength(11);
  });

  it('excludes inactive and seed rows from the stock counts, like the stock tab', async () => {
    const stockSqls: string[] = [];
    queryMock.mockImplementation(async (sql: string) => {
      if (/product_variants/.test(sql)) stockSqls.push(sql);
      return { rows: [{ count: 0, oldest_days: null }], rowCount: 1 };
    });

    await getActionItems();

    expect(stockSqls).toHaveLength(2);
    for (const sql of stockSqls) {
      expect(sql).toContain("s.active = TRUE");
      expect(sql).toContain("s.product_name NOT ILIKE 'checkup%'");
      // Variants replace their parent, so a product with variants is not
      // double-counted against its own (unused) stock column.
      expect(sql).toContain('p.has_variants = FALSE');
    }
  });

  it('never asks the database for a stock age — a SKU is not waiting since a date', async () => {
    const stockSqls: string[] = [];
    queryMock.mockImplementation(async (sql: string) => {
      if (/product_variants/.test(sql)) stockSqls.push(sql);
      return { rows: [{ count: 5, oldest_days: null }], rowCount: 1 };
    });

    await getActionItems();

    expect(stockSqls).toHaveLength(2);
    for (const sql of stockSqls) {
      expect(sql).toContain('NULL::int AS oldest_days');
    }
  });

  it('sums every queue into totalPending', async () => {
    queryMock.mockImplementation(async () => ({ rows: [{ count: 2, oldest_days: 1 }], rowCount: 1 }));
    const report = await getActionItems();

    expect(report.totalPending).toBe(22);
  });

  it('measures shipped orders that have gone quiet, not all shipped orders', async () => {
    const sqls: string[] = [];
    queryMock.mockImplementation(async (sql: string) => {
      sqls.push(sql);
      return { rows: [{ count: 0, oldest_days: null }], rowCount: 1 };
    });

    await getActionItems();

    const stale = sqls.find((s) => /status = 'shipped'/.test(s));
    expect(stale).toBeDefined();
    expect(stale).toContain("INTERVAL '10 days'");
  });

  it('reads members_expiring forward in time, not as a waiting age', async () => {
    const sqls: string[] = [];
    queryMock.mockImplementation(async (sql: string) => {
      sqls.push(sql);
      return { rows: [{ count: 1, oldest_days: 3 }], rowCount: 1 };
    });

    await getActionItems();

    const expiring = sqls.find((s) => /expiry_date BETWEEN/.test(s));
    expect(expiring).toBeDefined();
    // MIN(expiry_date) - NOW(): days until the soonest lapse.
    expect(expiring).toContain('MIN(expiry_date)');
    expect(expiring).toContain("INTERVAL '7 days'");
  });
});
