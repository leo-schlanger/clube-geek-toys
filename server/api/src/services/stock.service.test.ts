import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Stock control — the number the storefront sells against. What these pin:
 *
 *  1. A manual adjustment records **why** it moved: `manual_in`/`manual_out`
 *     with the signed delta, and nothing when the number did not change.
 *  2. Adjusting a variant recomputes the parent total from the active variants
 *     (that is what the storefront reads).
 *  3. Stock never goes negative, and a missing item rolls the transaction back.
 *  4. Order movements are written inside the order's transaction, signed by
 *     direction (sale −, cancellation +).
 */

const { queryMock, clientQuery, release, auditMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
  auditMock: vi.fn(async () => {}),
}));
vi.mock('../config/database.js', () => ({
  query: queryMock,
  getClient: async () => ({ query: clientQuery, release }),
}));
vi.mock('../config/env.js', () => ({ env: {} }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));

import {
  adjustStock,
  listStock,
  listMovements,
  recordMovement,
  recordOrderMovements,
  setLowStockThreshold,
} from './stock.service.js';

const stockRow = (over: Record<string, unknown> = {}) => ({
  product_id: 'p1',
  product_name: 'Holder',
  product_slug: 'holder',
  variant_id: null,
  variant_name: null,
  sku: 'H-1',
  stock: 5,
  low_stock_threshold: 3,
  active: true,
  image_source: ['https://x/a.jpg'],
  ...over,
});

function routeClient(routes: Array<[string, { rows: unknown[] } | Error]>) {
  const sql: string[] = [];
  clientQuery.mockImplementation(async (text: string) => {
    sql.push(text.replace(/\s+/g, ' ').trim());
    for (const [fragment, reply] of routes) {
      if (text.includes(fragment)) {
        if (reply instanceof Error) throw reply;
        return reply;
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
  auditMock.mockClear();
});

describe('adjustStock', () => {
  it('records a manual exit with the signed delta', async () => {
    const sql = routeClient([['SELECT stock FROM products', { rows: [{ stock: 5 }] }]]);
    queryMock.mockResolvedValue({ rows: [stockRow({ stock: 2 })] });

    const row = await adjustStock({ productId: 'p1', stock: 2 }, 'admin-1');

    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE products SET stock = $2'), ['p1', 2]);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_movements'), [
      'p1', null, null, 'manual_out', -3, 2, 'Ajuste manual no painel', 'admin-1',
    ]);
    expect(sql[0]).toBe('BEGIN');
    expect(sql.at(-1)).toBe('COMMIT');
    expect(auditMock).toHaveBeenCalledWith('stock.adjusted', 'admin-1', { productId: 'p1', variantId: null, stock: 2 });
    expect(row).toMatchObject({ stock: 2, status: 'low', imageUrl: 'https://x/a.jpg' });
  });

  it('adjusts a variant and recomputes the parent from the active variants', async () => {
    routeClient([['SELECT stock FROM product_variants', { rows: [{ stock: 1 }] }]]);
    queryMock.mockResolvedValue({ rows: [stockRow({ variant_id: 'v1', variant_name: 'Jimin', stock: 4 })] });

    await adjustStock({ productId: 'p1', variantId: 'v1', stock: 4, note: ' chegou reposição ' }, 'admin-1');

    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE product_variants SET stock = $2'), ['v1', 4]);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('SUM(v.stock)'), ['p1']);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_movements'), [
      'p1', 'v1', null, 'manual_in', 3, 4, 'chegou reposição', 'admin-1',
    ]);
  });

  it('writes no movement when the number did not change', async () => {
    routeClient([['SELECT stock FROM products', { rows: [{ stock: 5 }] }]]);
    queryMock.mockResolvedValue({ rows: [stockRow()] });
    await adjustStock({ productId: 'p1', stock: 5 }, 'admin-1');
    expect(clientQuery).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_movements'), expect.anything());
  });

  it('never stores negative stock', async () => {
    routeClient([['SELECT stock FROM products', { rows: [{ stock: 5 }] }]]);
    queryMock.mockResolvedValue({ rows: [stockRow({ stock: 0 })] });
    const row = await adjustStock({ productId: 'p1', stock: -7 }, 'admin-1');
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE products SET stock = $2'), ['p1', 0]);
    expect(row.status).toBe('out');
  });

  it('rolls back when the product or the variant does not exist', async () => {
    let sql = routeClient([['SELECT stock FROM products', { rows: [] }]]);
    await expect(adjustStock({ productId: 'nope', stock: 1 }, 'a')).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    expect(sql).toContain('ROLLBACK');

    sql = routeClient([['SELECT stock FROM product_variants', { rows: [] }]]);
    await expect(adjustStock({ productId: 'p1', variantId: 'x', stock: 1 }, 'a')).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });
    expect(sql).toContain('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(2);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('refuses a stock that is not a number', async () => {
    await expect(adjustStock({ productId: 'p1', stock: Number.NaN }, 'a')).rejects.toMatchObject({ code: 'INVALID_STOCK' });
  });

  it('fails clearly when the row vanished after the adjustment', async () => {
    routeClient([['SELECT stock FROM products', { rows: [{ stock: 1 }] }]]);
    queryMock.mockResolvedValue({ rows: [] });
    await expect(adjustStock({ productId: 'p1', stock: 2 }, 'a')).rejects.toMatchObject({ code: 'STOCK_ROW_NOT_FOUND' });
  });
});

describe('order movements', () => {
  it('writes one signed movement per item, inside the given transaction', async () => {
    clientQuery.mockImplementation(async (text: string) =>
      text.includes('FROM order_items')
        ? { rows: [{ product_id: 'p1', variant_id: 'v1', quantity: 2, stock_after: 8 }, { product_id: 'p2', variant_id: null, quantity: 1, stock_after: null }] }
        : { rows: [] }
    );
    const client = { query: clientQuery } as never;

    await recordOrderMovements(client, 'o1', -1, 'admin-1');
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_movements'), [
      'p1', 'v1', 'o1', 'sale', -2, 8, 'Baixa por pedido pago', 'admin-1',
    ]);

    await recordOrderMovements(client, 'o1', 1);
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_movements'), [
      'p2', null, 'o1', 'restock', 1, null, 'Devolução por cancelamento/estorno', null,
    ]);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('records outside a transaction through the pool', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await recordMovement(null, { productId: 'p1', kind: 'adjustment', quantity: 1 });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_movements'), [
      'p1', null, null, 'adjustment', 1, null, null, null,
    ]);
  });
});

describe('listing', () => {
  it('filters, pages and summarises', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [stockRow({ stock: 0 }), stockRow({ stock: 10, image_source: null })] })
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })
      .mockResolvedValueOnce({ rows: [{ out: 1, low: 0, ok: 1 }] });

    const result = await listStock({ search: ' bts ', filter: 'low', page: 2, limit: 500 });

    const [dataSql, dataParams] = queryMock.mock.calls[0];
    expect(dataSql).toContain('s.stock <= s.low_stock_threshold');
    expect(dataSql).toContain('s.active = TRUE');
    expect(dataParams).toEqual(['%bts%', 200, 200]);
    expect(result.rows.map((r) => r.status)).toEqual(['out', 'ok']);
    expect(result.rows[1].imageUrl).toBeNull();
    expect(result).toMatchObject({ total: 2, page: 2, limit: 200, summary: { out: 1, low: 0, ok: 1 } });
  });

  it('shows only empty items, including inactive ones when asked', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [{ out: 0, low: 0, ok: 0 }] });
    await listStock({ filter: 'out', includeInactive: true });
    const [dataSql, dataParams] = queryMock.mock.calls[0];
    expect(dataSql).toContain('s.stock <= 0');
    expect(dataSql).not.toContain('WHERE s.active = TRUE AND');
    expect(dataParams).toEqual([50, 0]);
  });

  it('lists movements with their names, capped', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 'm1', product_id: 'p1', kind: 'sale', quantity: '-2', stock_after: '3', order_number: '18', created_at: 'x', product_name: 'Holder' }],
    });
    const [m] = await listMovements('p1', { limit: 999 });
    expect(m).toMatchObject({ quantity: -2, stockAfter: 3, orderNumber: 18, productName: 'Holder', variantName: null });
    expect(queryMock.mock.calls[0][1]).toContain(200);
  });
});

describe('setLowStockThreshold', () => {
  it('stores a whole, non-negative threshold and audits it', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 'p1' }] });
    await setLowStockThreshold('p1', 2.9, 'admin-1');
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), ['p1', 2]);
    expect(auditMock).toHaveBeenCalledWith('stock.threshold_changed', 'admin-1', { productId: 'p1', threshold: 2 });

    queryMock.mockResolvedValue({ rows: [] });
    await expect(setLowStockThreshold('nope', 3, 'admin-1')).rejects.toMatchObject({ statusCode: 404 });
  });
});
