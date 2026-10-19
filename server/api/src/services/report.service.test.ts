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
vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);
vi.mock('../services/log.service.js', () => ({ createErrorLog: vi.fn(async () => {}) }));

const { getActionItems, getOverviewReport, getMonthlyReport, getChurnReport, getRealtimeStats, parseRange } = await import(
  './report.service.js'
);

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

    expect(report.items).toHaveLength(13);
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

  it('keeps pickup orders out of the posting queue and in their own', async () => {
    respondBy([
      [/status = 'processing' AND delivery_method <> 'pickup'/, { count: 1, oldest_days: 0 }],
      [/status = 'processing' AND delivery_method = 'pickup'/, { count: 1, oldest_days: 8 }],
    ]);
    const report = await getActionItems();

    expect(itemFor(report, 'to_ship')).toEqual({ key: 'to_ship', count: 1, oldestDays: 0 });
    expect(itemFor(report, 'to_release_pickup')).toEqual({ key: 'to_release_pickup', count: 1, oldestDays: 8 });
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
    expect(report.items).toHaveLength(13);
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

    expect(report.totalPending).toBe(26);
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
    // MIN(expiry_date) - today: days until the soonest lapse, on Rio's calendar
    // (CURRENT_DATE is UTC, already tomorrow after 21h).
    expect(expiring).toContain("(MIN(expiry_date) - (NOW() AT TIME ZONE 'America/Sao_Paulo')::date)");
    expect(expiring).toContain("+ 7");
    expect(expiring).not.toContain('CURRENT_DATE');
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
  it('uses today in Rio when no reference date is given', async () => {
    mockQueries(() => [{}]);
    await getOverviewReport('day');

    const [sql, params] = queryMock.mock.calls[0];
    expect(params).toEqual(['day', null]);
    expect(sql).toContain("NOW() AT TIME ZONE 'America/Sao_Paulo'");
  });

  // Swapping it for today answered a question nobody asked, under its label.
  it('refuses a date that is not a calendar date, without asking Postgres', async () => {
    mockQueries(() => [{}]);
    for (const bad of ['ontem', '2026-02-31', '2026-13-01']) {
      await expect(getOverviewReport('month', bad)).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(queryMock).not.toHaveBeenCalled();
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
        if (!/AS reservations/.test(sql)) return { rows: [], rowCount: 0 };
        return { rows: [{ revenue: current ? 200 : 440, reservations: current ? 6 : 9, tickets: current ? 11 : 0 }], rowCount: 1 };
      }
      return { rows: [{}], rowCount: 1 };
    });

    const report = await getOverviewReport('month', '2026-08-18');

    expect(ticketWindows).toEqual(
      expect.arrayContaining([[bounds.start_at, bounds.end_at], [bounds.prev_start_at, bounds.start_at]])
    );
    expect(report.tickets).toEqual({ revenue: 200, reservations: 6, tickets: 11 });
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
    // Earned states, or a sale refunded only after the window ended.
    const counted =
      "(o.status IN ('paid','processing','shipped','delivered') OR (o.status = 'refunded' AND o.refunded_at >= $2))";
    expect(salesSql).toContain(`SUM(o.total) FILTER (WHERE ${counted}), 0)::float AS revenue`);
    // pending/cancelled get their own value columns, never summed into revenue.
    expect(salesSql).toContain('AS pending_orders');
    expect(salesSql).toContain("SUM(o.total) FILTER (WHERE o.status = 'cancelled'), 0)::float AS cancelled_value");
  });

  // An order paid in September and refunded in October stays in September —
  // a closed month does not change — and comes off October's revenue.
  it('dates a refund when it happened and takes earlier sales off this period', async () => {
    const sqls: string[] = [];
    mockQueries((sql) => {
      sqls.push(sql);
      if (/AS retail_revenue/.test(sql)) return [{ orders: 3, revenue: 936 }];
      if (/AS shop_prior_value/.test(sql)) {
        return [{ shop_count: 2, shop_value: 1192.5, shop_prior_count: 1, shop_prior_value: 100, club_count: 1, club_value: 159.9, club_prior_count: 1, club_prior_value: 159.9 }];
      }
      if (/AS signups_paid/.test(sql)) return [{ revenue: 159.9, payments: 1 }];
      return [{}];
    });

    const report = await getOverviewReport('month', '2026-10-09');

    expect(report.sales).toMatchObject({ grossRevenue: 936, priorRefunds: 100, revenue: 836, refundedOrders: 2, refundedRevenue: 1192.5 });
    expect(report.sales.averageTicket).toBe(312);
    expect(report.club).toMatchObject({ grossRevenue: 159.9, priorRefunds: 159.9, revenue: 0, refundedPayments: 1 });
    const refundSql = sqls.find((s) => /AS shop_prior_value/.test(s))!;
    expect(refundSql).toContain('refunded_at >= $1 AND refunded_at < $2');
    // The series and the payment methods carry the same negative rows.
    const series = sqls.find((s) => /generate_series/.test(s))!;
    expect(series).toContain("'refund'");
    expect(series).toContain('-total');
  });

  it('counts cancelled attempts apart from the customers behind them', async () => {
    mockQueries((sql) => {
      if (/AS retail_revenue/.test(sql)) return [{ cancelled_orders: 20, cancelled_value: 16872.64 }];
      if (/AS carts_value/.test(sql)) return [{ customers: 11, carts_value: 4200 }];
      return [{}];
    });
    const report = await getOverviewReport('month', '2026-10-09');
    expect(report.sales).toMatchObject({
      cancelledOrders: 20,
      cancelledRevenue: 16872.64,
      cancelledCustomers: 11,
      cancelledCartsValue: 4200,
    });
    const sql = queryMock.mock.calls.map((c) => String(c[0])).find((s) => /AS carts_value/.test(s))!;
    expect(sql).toContain('GROUP BY COALESCE(LOWER(o.customer_email), o.id::text)');
  });

  it('separates the products ticket from the order ticket, and compares shipping with the label', async () => {
    mockQueries((sql) =>
      /AS retail_revenue/.test(sql)
        ? [{ orders: 4, revenue: 500, subtotal: 480, discount: 40, shipping: 60, shipped_orders: 3, label_cost: 41.5, shipping_with_label: 45, labels_with_cost: 2 }]
        : [{}]
    );
    const report = await getOverviewReport('month', '2026-10-09');
    expect(report.sales).toMatchObject({
      averageTicket: 125,
      averageProductTicket: 110,
      shipping: 60,
      shippedOrders: 3,
      labelCost: 41.5,
      shippingWithLabel: 45,
      labelsWithCost: 2,
    });
  });

  it('reports sign-up conversion and guards against no sign-ups', async () => {
    mockQueries((sql) => (/AS signups_paid/.test(sql) ? [{ signups: 4, signups_paid: 1 }] : [{}]));
    const report = await getOverviewReport('month', '2026-10-09');
    expect(report.club).toMatchObject({ signups: 4, signupsPaid: 1, conversionPct: 25 });

    mockQueries(() => [{}]);
    expect((await getOverviewReport('month', '2026-10-09')).club.conversionPct).toBe(0);
  });

  it('lists paid tickets per event with how many went through the door', async () => {
    const calls: string[] = [];
    mockQueries((sql) => {
      calls.push(sql);
      return /AS checked_in/.test(sql)
        ? [{ event_id: 'halloween', title: 'Halloween K-pop', starts_at: '2026-10-31T22:00:00Z', reservations: 3, tickets: 7, checked_in: 0, revenue: 175 }]
        : [{}];
    });
    const report = await getOverviewReport('month', '2026-10-09');
    expect(report.ticketsByEvent).toEqual([
      { eventId: 'halloween', title: 'Halloween K-pop', startsAt: '2026-10-31T22:00:00.000Z', reservations: 3, tickets: 7, checkedIn: 0, revenue: 175 },
    ]);
    expect(calls.find((s) => /AS checked_in/.test(s))).toContain("er.status = 'confirmed' AND er.total_cents > 0");
  });

  it('lists products with stock that stopped selling, as of now', async () => {
    const calls: string[] = [];
    mockQueries((sql) => {
      calls.push(sql);
      return /AS listed_at/.test(sql)
        ? [
            { name: 'Mochila', stock: 3, price: 100, last_sold_at: null, listed_at: '2026-07-01T12:00:00Z' },
            { name: 'Chaveiro', stock: 10, price: 5, last_sold_at: '2026-08-01T12:00:00Z', listed_at: '2026-06-01T12:00:00Z' },
          ]
        : [{}];
    });
    const report = await getOverviewReport('month', '2026-10-09');
    expect(report.stale).toMatchObject({ days: 60, count: 2, units: 13, shelfValue: 350 });
    expect(report.stale.items[0]).toEqual({ name: 'Mochila', stock: 3, price: 100, lastSoldAt: null, listedAt: '2026-07-01T12:00:00.000Z' });
    const sql = calls.find((s) => /AS listed_at/.test(s))!;
    expect(sql).toContain("INTERVAL '60 days'");
    expect(sql).not.toContain('$1');
  });

  // A renamed product is still one product in the ranking.
  it('groups products by id, not by the name printed on the order', async () => {
    const sqls: string[] = [];
    mockQueries((sql) => {
      sqls.push(sql);
      return [{}];
    });
    await getOverviewReport('month', '2026-10-09');
    for (const s of sqls.filter((q) => /LIMIT 10\b|LIMIT 500/.test(q))) {
      expect(s).toContain("GROUP BY COALESCE(oi.product_id::text, 'name:' || oi.product_name)");
    }
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

  // A failed block used to become zeros that read as a period without sales —
  // in the panel, the PDF and the spreadsheet alike.
  it('fails the whole report when one block fails, instead of showing zeros', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/date_trunc/.test(sql) && /prev_start_at/.test(sql)) return { rows: [bounds], rowCount: 1 };
      if (/order_items/.test(sql)) throw new Error('relation "order_items" does not exist');
      if (/AS retail_revenue/.test(sql)) return { rows: [{ orders: 2, revenue: 100 }], rowCount: 1 };
      return { rows: [{}], rowCount: 1 };
    });

    await expect(getOverviewReport('day')).rejects.toThrow('order_items');
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


describe('relatório financeiro por intervalo', () => {
  const rangeBounds = {
    start_at: '2026-09-10T03:00:00.000Z',
    end_at: '2026-10-17T03:00:00.000Z',
    prev_start_at: '2026-08-04T03:00:00.000Z',
    days: 37,
  };

  beforeEach(() => queryMock.mockReset());

  function route(rowsFor: (sql: string, params: unknown[]) => Record<string, unknown>[] | undefined) {
    const calls: { sql: string; params: unknown[] }[] = [];
    queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/prev_start_at/.test(sql)) return { rows: [rangeBounds], rowCount: 1 };
      return { rows: rowsFor(sql, params) ?? [{}], rowCount: 1 };
    });
    return calls;
  }

  it('corta o intervalo no calendário do Rio, com o dia final incluído', async () => {
    const calls = route(() => undefined);
    const report = await getOverviewReport('range', undefined, { start: '2026-09-10', end: '2026-10-16' });

    expect(calls[0].params).toEqual(['2026-09-10', '2026-10-16']);
    expect(calls[0].sql).toContain('($2::date + 1)::timestamp');
    expect(calls[0].sql).toContain("AT TIME ZONE 'America/Sao_Paulo'");
    // Compared with the same number of days right before it.
    expect(calls[0].sql).toContain('($1::date - ($2::date - $1::date + 1))');
    expect(report.period).toMatchObject({ type: 'range', days: 37, previousStart: rangeBounds.prev_start_at });
  });

  it('agrupa a série por dia em janela curta e por mês em janela longa', async () => {
    let calls = route(() => undefined);
    await getOverviewReport('range', undefined, { start: '2026-09-10', end: '2026-10-16' });
    expect(calls.find((c) => /generate_series/.test(c.sql))?.params[2]).toBe('day');

    calls = [];
    queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/prev_start_at/.test(sql)) return { rows: [{ ...rangeBounds, days: 365 }], rowCount: 1 };
      return { rows: [{}], rowCount: 1 };
    });
    const year = await getOverviewReport('year', '2026-05-01');
    expect(calls.find((c) => /generate_series/.test(c.sql))?.params[2]).toBe('month');
    expect(year.series.bucket).toBe('month');
  });

  it('soma as três fontes em cada ponto da série', async () => {
    route((sql) =>
      /generate_series/.test(sql) ? [{ date: '2026-10-04', shop: 626.62, club: 0, tickets: 20, orders: 1 }] : undefined
    );
    const report = await getOverviewReport('range', undefined, { start: '2026-10-01', end: '2026-10-16' });
    expect(report.series.points).toEqual([
      { date: '2026-10-04', shop: 626.62, club: 0, tickets: 20, total: 646.62, orders: 1 },
    ]);
  });

  it('separa a receita por forma de pagamento, com ingresso como PIX', async () => {
    const calls = route((sql) =>
      /GROUP BY method/.test(sql)
        ? [
            { method: 'pix', count: 34, revenue: 1805.79 },
            { method: 'weird', count: 1, revenue: 5 },
          ]
        : undefined
    );
    const report = await getOverviewReport('month', '2026-10-09');
    const methodSql = calls.find((c) => /GROUP BY method/.test(c.sql))!.sql;

    expect(methodSql).toContain('FROM event_reservations');
    expect(methodSql).toContain("'tickets', 'pix'");
    expect(report.byMethod).toEqual([
      { method: 'pix', count: 34, revenue: 1805.79 },
      { method: 'other', count: 1, revenue: 5 },
    ]);
  });

  it('mantém pendente, cancelado e estornado fora da receita, mas com valor', async () => {
    route((sql) =>
      /AS retail_revenue/.test(sql)
        ? [{ orders: 2, revenue: 300, pending_orders: 3, pending_value: 450, cancelled_orders: 1, cancelled_value: 90 }]
        : /AS shop_prior_value/.test(sql)
          ? [{ shop_count: 1, shop_value: 60 }]
          : undefined
    );
    const report = await getOverviewReport('month', '2026-10-09');
    expect(report.sales).toMatchObject({
      revenue: 300,
      pendingRevenue: 450,
      cancelledRevenue: 90,
      refundedRevenue: 60,
    });
  });

  it('lista cada venda no razão e avisa quando corta a lista', async () => {
    const row = {
      kind: 'shop', id: 'o1', reference: '#48', at: '2026-10-13T19:59:35.000Z', customer: 'Larissa',
      description: '1x Pepero', method: 'pix', channel: 'retail', installments: null, status: 'delivered',
      subtotal: 20, discount: 1, shipping: 0, total: 19, counted: true,
    };
    const calls = route((sql) => (/\) ledger/.test(sql) ? Array.from({ length: 2001 }, () => row) : undefined));
    const report = await getOverviewReport('month', '2026-10-09');
    const ledgerSql = calls.find((c) => /\) ledger/.test(c.sql))!.sql;

    expect(ledgerSql).toContain('LIMIT 2001');
    // Only paid or refunded club payments: a failed card attempt is not a sale.
    expect(ledgerSql).toContain("p.status IN ('paid', 'refunded')");
    expect(report.ledger.truncated).toBe(true);
    expect(report.ledger.entries).toHaveLength(2000);
    expect(report.ledger.entries[0]).toEqual({ ...row, at: '2026-10-13T19:59:35.000Z' });
  });

  it('deixa o custo do produto vazio quando falta em alguma linha', async () => {
    const calls = route((sql) =>
      /LIMIT 500/.test(sql) ? [{ name: 'Mochila', quantity: 3, revenue: 256.2, cost: null }, { name: 'Bolsa', quantity: 1, revenue: 142.5, cost: 70 }] : undefined
    );
    const report = await getOverviewReport('month', '2026-10-09');
    expect(calls.find((c) => /LIMIT 500/.test(c.sql))!.sql).toContain('bool_and(oi.unit_cost IS NOT NULL)');
    expect(report.products.ranking).toEqual([
      { name: 'Mochila', quantity: 3, revenue: 256.2, cost: null },
      { name: 'Bolsa', quantity: 1, revenue: 142.5, cost: 70 },
    ]);
  });
});

describe('parseRange', () => {
  it('aceita datas válidas, com início igual ao fim', () => {
    expect(parseRange('2026-10-16', '2026-10-16')).toEqual({ start: '2026-10-16', end: '2026-10-16' });
  });

  it('recusa data inexistente, invertida, malformada ou longa demais', () => {
    expect(parseRange('2026-02-31', '2026-03-05')).toHaveProperty('error');
    expect(parseRange('2026-10-16', '2026-10-01')).toEqual({ error: 'A data inicial é depois da final.' });
    expect(parseRange('16/10/2026', '2026-10-20')).toHaveProperty('error');
    expect(parseRange(undefined, '2026-10-20')).toHaveProperty('error');
    expect(parseRange('2020-01-01', '2026-10-16')).toHaveProperty('error');
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

describe('novos membros', () => {
  // A signup whose card was refused counted as a new member, and the staff read
  // it as a sale. New means activated, i.e. paid.
  it('conta pela ativação, nunca pelo cadastro', async () => {
    const sqls: string[] = [];
    queryMock.mockReset();
    queryMock.mockImplementation(async (sql: string) => {
      sqls.push(sql);
      return { rows: [{}], rowCount: 1 };
    });

    await getMonthlyReport(6).catch(() => undefined);
    await getOverviewReport('month', '2026-10-09').catch(() => undefined);
    await getRealtimeStats().catch(() => undefined);

    await getChurnReport(6).catch(() => undefined);
    const churn = sqls.find((q) => /churn_rate/.test(q));
    // Someone who signed up and paid a month later was not in the club before.
    expect(churn).toContain('COALESCE(activated_at, created_at) AS joined_at');

    const memberCounts = sqls.filter((q) => /new_members|new_today|new_this_week/.test(q));
    expect(memberCounts.length).toBeGreaterThanOrEqual(3);
    for (const q of memberCounts) {
      expect(q).toContain('activated_at');
      expect(q).not.toMatch(/new_members[\s\S]*WHERE created_at|created_at >= \$1 AND created_at < \$2\)::int AS new_members/);
    }
  });
});

