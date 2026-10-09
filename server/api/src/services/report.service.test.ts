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

const { getActionItems, getOverviewReport, getMonthlyReport, getChurnReport } = await import('./report.service.js');

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

    expect(report.items).toHaveLength(12);
    expect(report.totalPending).toBe(0);
    expect(report.items.every((i) => i.count === 0 && i.oldestDays === null)).toBe(true);
  });

  it('conta reservas de ingresso aguardando confirmação', async () => {
    // A stuck reservation is money waiting and a family turned away at the door.
    respondBy([[/event_reservations/, { count: 2, oldest_days: 1 }]]);
    const report = await getActionItems();

    expect(itemFor(report, 'event_tickets_pending')).toEqual({
      key: 'event_tickets_pending',
      count: 2,
      oldestDays: 1,
    });
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
    expect(report.items).toHaveLength(12);
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

    expect(report.totalPending).toBe(24);
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

/**
 * Consolidated period report — the data behind the admin PDF.
 *
 * What these tests protect:
 *
 *  1. Period boundaries are cut by Postgres, so "today" does not depend on the
 *     API container's timezone agreeing with the database's.
 *  2. `previous` is the same window shifted back once, so growth compares
 *     February to January and not to a rolling 30 days.
 *  3. Only order states that represent earned money enter revenue.
 *  4. Units sold is the period total, not the sum of the top-10 ranking.
 */
describe('getOverviewReport', () => {
  const bounds = {
    start_at: '2026-08-01T00:00:00.000Z',
    end_at: '2026-09-01T00:00:00.000Z',
    prev_start_at: '2026-07-01T00:00:00.000Z',
  };

  beforeEach(() => {
    queryMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  /** First call is always the bounds query; the rest are routed by SQL. */
  function mockQueries(rowsFor: (sql: string) => Record<string, unknown>[]) {
    queryMock.mockImplementation(async (sql: string) => {
      if (/date_trunc/.test(sql) && /prev_start_at/.test(sql)) {
        return { rows: [bounds], rowCount: 1 };
      }
      return { rows: rowsFor(sql), rowCount: 1 };
    });
  }

  it('asks the database to cut the period, passing the period name through', async () => {
    mockQueries(() => [{}]);
    await getOverviewReport('month', '2026-08-18');

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('date_trunc');
    expect(params).toEqual(['month', '2026-08-18']);
  });

  // "Today" is Rio's, so the database picks it: the API runs in UTC, and after
  // 21h in Rio its date is already tomorrow.
  it('falls back to today in Rio when the reference date is malformed', async () => {
    mockQueries(() => [{}]);
    await getOverviewReport('day', 'ontem');

    const [sql, params] = queryMock.mock.calls[0];
    expect(params).toEqual(['day', null]);
    expect(sql).toContain("NOW() AT TIME ZONE 'America/Sao_Paulo'");
  });

  it('cuts the period on the Rio calendar, not in UTC', async () => {
    mockQueries(() => [{}]);
    await getOverviewReport('month', '2026-10-09');

    const [sql] = queryMock.mock.calls[0];
    expect(sql).toMatch(/date_trunc\(\$1, COALESCE\(\$2::date/);
    expect(sql).toContain("AT TIME ZONE 'America/Sao_Paulo'");
  });

  it('counts paid event tickets, in the period and in the one before', async () => {
    const ticketWindows: unknown[][] = [];
    queryMock.mockImplementation(async (sql: string, params: unknown[]) => {
      if (/date_trunc/.test(sql) && /prev_start_at/.test(sql)) return { rows: [bounds], rowCount: 1 };
      if (/FROM event_reservations/.test(sql)) {
        ticketWindows.push(params);
        const current = params[0] === bounds.start_at;
        return { rows: [{ revenue: current ? 200 : 440, reservations: current ? 6 : 9 }], rowCount: 1 };
      }
      return { rows: [{}], rowCount: 1 };
    });

    const report = await getOverviewReport('month', '2026-08-18');

    expect(ticketWindows).toEqual(
      expect.arrayContaining([[bounds.start_at, bounds.end_at], [bounds.prev_start_at, bounds.start_at]])
    );
    expect(report.tickets).toEqual({ revenue: 200, reservations: 6 });
    expect(report.previous.ticketRevenue).toBe(440);
  });

  // line_total is the shelf price; the 5% online promotion and the member
  // discount live on the order and must come off before a product is credited.
  it('credits products net of the order discount, in the ranking and the margin', async () => {
    const sqls: string[] = [];
    mockQueries((sql) => {
      sqls.push(sql);
      return [{}];
    });
    await getOverviewReport('month', '2026-08-18');

    const productSql = sqls.filter((q) => /FROM order_items oi/.test(q) && /revenue/.test(q));
    expect(productSql.length).toBeGreaterThanOrEqual(2);
    for (const q of productSql) expect(q).toContain('(o.subtotal - o.discount) / o.subtotal');
  });

  it('reads the previous window as the same period shifted back once', async () => {
    const windows: unknown[][] = [];
    queryMock.mockImplementation(async (sql: string, params: unknown[]) => {
      if (/date_trunc/.test(sql) && /prev_start_at/.test(sql)) return { rows: [bounds], rowCount: 1 };
      windows.push(params);
      return { rows: [{}], rowCount: 1 };
    });

    await getOverviewReport('month', '2026-08-18');

    // The comparison block is the only one reading [prev_start, start).
    expect(windows).toContainEqual([bounds.prev_start_at, bounds.start_at]);
    expect(windows).toContainEqual([bounds.start_at, bounds.end_at]);
  });

  it('counts only earned order states as revenue', async () => {
    const sqls: string[] = [];
    queryMock.mockImplementation(async (sql: string) => {
      if (/date_trunc/.test(sql) && /prev_start_at/.test(sql)) return { rows: [bounds], rowCount: 1 };
      sqls.push(sql);
      return { rows: [{}], rowCount: 1 };
    });

    await getOverviewReport('month');

    const salesSql = sqls.find((s) => /AS retail_revenue/.test(s));
    expect(salesSql).toContain("('paid','processing','shipped','delivered')");
    // pending/cancelled/refunded are reported as counts, never summed into revenue.
    expect(salesSql).toContain('AS pending_orders');
    expect(salesSql).not.toMatch(/SUM\(total\) FILTER \(WHERE status = 'cancelled'/);
  });

  it('derives the average ticket from the period, and guards against no orders', async () => {
    mockQueries((sql) => (/AS retail_revenue/.test(sql) ? [{ orders: 4, revenue: 500 }] : [{}]));
    const withOrders = await getOverviewReport('month');
    expect(withOrders.sales.averageTicket).toBe(125);

    mockQueries((sql) => (/AS retail_revenue/.test(sql) ? [{ orders: 0, revenue: 0 }] : [{}]));
    const empty = await getOverviewReport('month');
    expect(empty.sales.averageTicket).toBe(0);
  });

  it('takes units sold from the period total, not from the top-10 ranking', async () => {
    mockQueries((sql) => {
      if (/AS units_sold/.test(sql)) return [{ units_sold: 320, distinct_products: 47 }];
      if (/LIMIT 10/.test(sql)) return [{ name: 'Photocard', quantity: 12, revenue: 240 }];
      return [{}];
    });

    const report = await getOverviewReport('month');

    expect(report.products.unitsSold).toBe(320);
    expect(report.products.distinctProducts).toBe(47);
    expect(report.products.top).toHaveLength(1);
  });

  it('ranks top products by revenue', async () => {
    const sqls: string[] = [];
    queryMock.mockImplementation(async (sql: string) => {
      if (/date_trunc/.test(sql) && /prev_start_at/.test(sql)) return { rows: [bounds], rowCount: 1 };
      sqls.push(sql);
      return { rows: [{}], rowCount: 1 };
    });

    await getOverviewReport('year');

    const topSql = sqls.find((s) => /LIMIT 10/.test(s));
    expect(topSql).toContain('ORDER BY revenue DESC');
  });

  it('keeps the report usable when one block fails', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/date_trunc/.test(sql) && /prev_start_at/.test(sql)) return { rows: [bounds], rowCount: 1 };
      if (/order_items/.test(sql)) throw new Error('relation "order_items" does not exist');
      if (/AS retail_revenue/.test(sql)) return { rows: [{ orders: 2, revenue: 100 }], rowCount: 1 };
      return { rows: [{}], rowCount: 1 };
    });

    const report = await getOverviewReport('day');

    expect(report.sales.revenue).toBe(100);
    expect(report.products.top).toEqual([]);
    expect(report.products.unitsSold).toBe(0);
  });

  it('reports the catalog as of now, not as of the period', async () => {
    const sqls: string[] = [];
    queryMock.mockImplementation(async (sql: string) => {
      if (/date_trunc/.test(sql) && /prev_start_at/.test(sql)) return { rows: [bounds], rowCount: 1 };
      sqls.push(sql);
      return { rows: [{}], rowCount: 1 };
    });

    await getOverviewReport('year');

    const catalogSql = sqls.find((s) => /AS active_skus/.test(s));
    expect(catalogSql).toBeDefined();
    // No period predicate: stock is a snapshot, not an aggregate over time.
    expect(catalogSql).not.toContain('paid_at');
  });
});


describe('getMonthlyReport and getChurnReport', () => {
  beforeEach(() => queryMock.mockReset());

  it('adds paid event tickets as their own revenue line, and groups months in Rio', async () => {
    queryMock.mockResolvedValue({
      rows: [{ month: '2026-10', revenue: 0, payment_count: 0, new_members: 0, churned_members: 0,
        shop_revenue: 781.31, shop_orders: 4, ticket_revenue: 200, ticket_count: 6 }],
    });
    const [october] = await getMonthlyReport(3);
    const [sql] = queryMock.mock.calls[0];

    expect(october).toMatchObject({ shopRevenue: 781.31, ticketRevenue: 200, ticketCount: 6 });
    expect(sql).toContain('FROM event_reservations');
    expect(sql).toContain('COALESCE(paid_at, confirmed_at)');
    expect(sql).toContain("AT TIME ZONE 'America/Sao_Paulo'");
  });

  // updated_at moves on any edit: a member who expired in July and had a phone
  // fixed in October would otherwise have left "in October".
  it('dates a member\'s exit by the expiry, not by the last edit', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await getChurnReport(6);
    await getMonthlyReport(6);

    for (const [sql] of queryMock.mock.calls) {
      expect(sql).toContain("WHEN status = 'expired' AND expiry_date IS NOT NULL");
      expect(sql).not.toMatch(/TO_CHAR\(updated_at/);
    }
  });
});
