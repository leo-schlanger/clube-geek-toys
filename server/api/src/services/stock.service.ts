import pg from 'pg';
import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { auditLog } from '../utils/audit.js';

/**
 * Controle de estoque do painel.
 *
 * O número em si vive em `products.stock` / `product_variants.stock`; esta
 * camada existe para registrar **por que** ele mudou: toda alteração grava uma
 * linha em `stock_movements` — venda, cancelamento ou ajuste manual.
 */

export type StockMovementKind = 'sale' | 'restock' | 'adjustment' | 'manual_in' | 'manual_out';

export interface StockMovement {
  id: string;
  productId: string | null;
  variantId: string | null;
  orderId: string | null;
  kind: StockMovementKind;
  /** Assinado: negativo = saída. */
  quantity: number;
  stockAfter: number | null;
  note: string | null;
  actorUserId: string | null;
  createdAt: string;
  productName?: string | null;
  variantName?: string | null;
  orderNumber?: number | null;
}

/** Linha da tela de estoque: um produto simples ou uma variação. */
export interface StockRow {
  productId: string;
  productName: string;
  productSlug: string;
  variantId: string | null;
  variantName: string | null;
  sku: string | null;
  stock: number;
  lowStockThreshold: number;
  active: boolean;
  imageUrl: string | null;
  status: 'out' | 'low' | 'ok';
}

function mapMovement(row: pg.QueryResultRow): StockMovement {
  return {
    id: row.id,
    productId: row.product_id ?? null,
    variantId: row.variant_id ?? null,
    orderId: row.order_id ?? null,
    kind: row.kind,
    quantity: Number(row.quantity),
    stockAfter: row.stock_after != null ? Number(row.stock_after) : null,
    note: row.note ?? null,
    actorUserId: row.actor_user_id ?? null,
    createdAt: row.created_at,
    productName: row.product_name ?? null,
    variantName: row.variant_name ?? null,
    orderNumber: row.order_number != null ? Number(row.order_number) : null,
  };
}

function stockStatus(stock: number, threshold: number): StockRow['status'] {
  if (stock <= 0) return 'out';
  if (stock <= threshold) return 'low';
  return 'ok';
}

function mapStockRow(row: pg.QueryResultRow): StockRow {
  const stock = Number(row.stock) || 0;
  const threshold = Number(row.low_stock_threshold) || 0;
  const images = Array.isArray(row.image_source) ? (row.image_source as string[]) : [];
  return {
    productId: row.product_id,
    productName: row.product_name,
    productSlug: row.product_slug,
    variantId: row.variant_id ?? null,
    variantName: row.variant_name ?? null,
    sku: row.sku ?? null,
    stock,
    lowStockThreshold: threshold,
    active: row.active !== false,
    imageUrl: images[0] ?? null,
    status: stockStatus(stock, threshold),
  };
}

/**
 * Grava o movimento. Recebe o client quando roda dentro da transação do pedido,
 * para o histórico nascer junto com a baixa (ou sumir junto no rollback).
 */
export async function recordMovement(
  client: pg.PoolClient | null,
  input: {
    productId: string | null;
    variantId?: string | null;
    orderId?: string | null;
    kind: StockMovementKind;
    quantity: number;
    stockAfter?: number | null;
    note?: string | null;
    actorUserId?: string | null;
  }
): Promise<void> {
  const run = client
    ? (sql: string, params: unknown[]) => client.query(sql, params)
    : (sql: string, params: unknown[]) => query(sql, params);

  await run(
    `INSERT INTO stock_movements
       (product_id, variant_id, order_id, kind, quantity, stock_after, note, actor_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      input.productId,
      input.variantId ?? null,
      input.orderId ?? null,
      input.kind,
      input.quantity,
      input.stockAfter ?? null,
      input.note ?? null,
      input.actorUserId ?? null,
    ]
  );
}

/**
 * Registra os movimentos de um pedido a partir dos itens dele. Chamado pelo
 * order.service logo depois do UPDATE de estoque, dentro da mesma transação.
 * `direction` -1 = venda, +1 = devolução ao estoque.
 */
export async function recordOrderMovements(
  client: pg.PoolClient,
  orderId: string,
  direction: -1 | 1,
  actorUserId?: string | null
): Promise<void> {
  const items = await client.query(
    `SELECT oi.product_id, oi.variant_id, oi.quantity,
            COALESCE(v.stock, p.stock) AS stock_after
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN product_variants v ON v.id = oi.variant_id
     WHERE oi.order_id = $1 AND oi.product_id IS NOT NULL`,
    [orderId]
  );

  for (const item of items.rows) {
    await recordMovement(client, {
      productId: item.product_id,
      variantId: item.variant_id ?? null,
      orderId,
      kind: direction === -1 ? 'sale' : 'restock',
      quantity: direction * Number(item.quantity),
      stockAfter: item.stock_after != null ? Number(item.stock_after) : null,
      note: direction === -1 ? 'Baixa por pedido pago' : 'Devolução por cancelamento/estorno',
      actorUserId: actorUserId ?? null,
    });
  }
}

export interface ListStockOptions {
  search?: string;
  /** 'all' (padrão), 'low' (acabando ou esgotado) ou 'out' (só esgotado). */
  filter?: 'all' | 'low' | 'out';
  includeInactive?: boolean;
  page?: number;
  limit?: number;
}

/**
 * Uma linha por SKU vendável: produtos sem variação entram direto, produtos com
 * variação entram pelas variações (é nelas que a baixa acontece).
 */
export async function listStock(opts: ListStockOptions = {}): Promise<{
  rows: StockRow[];
  total: number;
  page: number;
  limit: number;
  summary: { out: number; low: number; ok: number };
}> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (!opts.includeInactive) {
    conditions.push(`s.active = TRUE`);
  }
  conditions.push(`s.product_name NOT ILIKE 'checkup%'`);

  if (opts.search?.trim()) {
    conditions.push(
      `(s.product_name ILIKE $${i} OR COALESCE(s.variant_name, '') ILIKE $${i} OR COALESCE(s.sku, '') ILIKE $${i})`
    );
    params.push(`%${opts.search.trim()}%`);
    i++;
  }
  if (opts.filter === 'low') {
    conditions.push(`s.stock <= s.low_stock_threshold`);
  } else if (opts.filter === 'out') {
    conditions.push(`s.stock <= 0`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(opts.limit || 50, 200));
  const page = Math.max(1, opts.page || 1);
  const offset = (page - 1) * limit;

  // Produto simples e variação viram a mesma forma de linha.
  const base = `
    SELECT p.id AS product_id, p.name AS product_name, p.slug AS product_slug,
           NULL::uuid AS variant_id, NULL::varchar AS variant_name,
           p.sku, p.stock, p.low_stock_threshold, p.active, p.images AS image_source
    FROM products p
    WHERE p.has_variants = FALSE
    UNION ALL
    SELECT p.id, p.name, p.slug,
           v.id, v.name,
           v.sku, v.stock, p.low_stock_threshold, (p.active AND v.active),
           CASE WHEN jsonb_array_length(v.images) > 0 THEN v.images ELSE p.images END
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
  `;

  const [data, count, summary] = await Promise.all([
    query(
      `SELECT * FROM (${base}) s
       ${where}
       ORDER BY (s.stock <= 0) DESC, (s.stock <= s.low_stock_threshold) DESC,
                s.stock ASC, LOWER(s.product_name) ASC, s.variant_id NULLS FIRST
       LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*)::int AS total FROM (${base}) s ${where}`, params),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE s.stock <= 0)::int AS out,
         COUNT(*) FILTER (WHERE s.stock > 0 AND s.stock <= s.low_stock_threshold)::int AS low,
         COUNT(*) FILTER (WHERE s.stock > s.low_stock_threshold)::int AS ok
       FROM (${base}) s
       WHERE s.active = TRUE AND s.product_name NOT ILIKE 'checkup%'`
    ),
  ]);

  return {
    rows: data.rows.map(mapStockRow),
    total: count.rows[0].total as number,
    page,
    limit,
    summary: {
      out: summary.rows[0].out as number,
      low: summary.rows[0].low as number,
      ok: summary.rows[0].ok as number,
    },
  };
}

export interface AdjustStockInput {
  productId: string;
  variantId?: string | null;
  /** Novo valor absoluto do estoque. */
  stock: number;
  note?: string | null;
}

/**
 * Define o estoque de um SKU e registra a diferença como ajuste manual.
 * Quando o produto tem variações, o total do pai é recalculado como a soma
 * das ativas — a vitrine lê esse total.
 */
export async function adjustStock(
  input: AdjustStockInput,
  actorUserId: string
): Promise<StockRow> {
  const next = Math.max(0, Math.floor(Number(input.stock)));
  if (!Number.isFinite(next)) {
    throw new AppError(400, 'Estoque inválido.', 'INVALID_STOCK');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    let before: number;
    if (input.variantId) {
      const current = await client.query(
        `SELECT stock FROM product_variants WHERE id = $1 AND product_id = $2 FOR UPDATE`,
        [input.variantId, input.productId]
      );
      if (current.rows.length === 0) {
        throw new AppError(404, 'Variação não encontrada.', 'VARIANT_NOT_FOUND');
      }
      before = Number(current.rows[0].stock);
      await client.query(`UPDATE product_variants SET stock = $2 WHERE id = $1`, [
        input.variantId,
        next,
      ]);
      // Pai passa a refletir a soma das variações ativas.
      await client.query(
        `UPDATE products p SET stock = COALESCE((
           SELECT SUM(v.stock)::int FROM product_variants v
           WHERE v.product_id = p.id AND v.active = TRUE
         ), 0)
         WHERE p.id = $1 AND p.has_variants = TRUE`,
        [input.productId]
      );
    } else {
      const current = await client.query(`SELECT stock FROM products WHERE id = $1 FOR UPDATE`, [
        input.productId,
      ]);
      if (current.rows.length === 0) {
        throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
      }
      before = Number(current.rows[0].stock);
      await client.query(`UPDATE products SET stock = $2 WHERE id = $1`, [input.productId, next]);
    }

    const delta = next - before;
    if (delta !== 0) {
      await recordMovement(client, {
        productId: input.productId,
        variantId: input.variantId ?? null,
        kind: delta > 0 ? 'manual_in' : 'manual_out',
        quantity: delta,
        stockAfter: next,
        note: input.note?.trim() || 'Ajuste manual no painel',
        actorUserId,
      });
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  await auditLog('stock.adjusted', actorUserId, {
    productId: input.productId,
    variantId: input.variantId ?? null,
    stock: next,
  });

  return getStockRow(input.productId, input.variantId ?? null);
}

/** Limiar de "acabando" por produto (vale também para as variações dele). */
export async function setLowStockThreshold(
  productId: string,
  threshold: number,
  actorUserId: string
): Promise<void> {
  const value = Math.max(0, Math.floor(Number(threshold)));
  const result = await query(
    `UPDATE products SET low_stock_threshold = $2 WHERE id = $1 RETURNING id`,
    [productId, value]
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
  }
  await auditLog('stock.threshold_changed', actorUserId, { productId, threshold: value });
}

async function getStockRow(productId: string, variantId: string | null): Promise<StockRow> {
  const result = variantId
    ? await query(
        `SELECT p.id AS product_id, p.name AS product_name, p.slug AS product_slug,
                v.id AS variant_id, v.name AS variant_name, v.sku, v.stock,
                p.low_stock_threshold, (p.active AND v.active) AS active,
                CASE WHEN jsonb_array_length(v.images) > 0 THEN v.images ELSE p.images END AS image_source
         FROM product_variants v JOIN products p ON p.id = v.product_id
         WHERE v.id = $1`,
        [variantId]
      )
    : await query(
        `SELECT p.id AS product_id, p.name AS product_name, p.slug AS product_slug,
                NULL::uuid AS variant_id, NULL::varchar AS variant_name, p.sku, p.stock,
                p.low_stock_threshold, p.active, p.images AS image_source
         FROM products p WHERE p.id = $1`,
        [productId]
      );

  if (result.rows.length === 0) {
    throw new AppError(404, 'Item de estoque não encontrado.', 'STOCK_ROW_NOT_FOUND');
  }
  return mapStockRow(result.rows[0]);
}

/** Histórico de um produto (inclui os movimentos das variações dele). */
export async function listMovements(
  productId: string,
  opts: { limit?: number } = {}
): Promise<StockMovement[]> {
  const limit = Math.max(1, Math.min(opts.limit || 50, 200));
  const result = await query(
    `SELECT m.*, p.name AS product_name, v.name AS variant_name, o.order_number
     FROM stock_movements m
     LEFT JOIN products p ON p.id = m.product_id
     LEFT JOIN product_variants v ON v.id = m.variant_id
     LEFT JOIN orders o ON o.id = m.order_id
     WHERE m.product_id = $1
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [productId, limit]
  );
  return result.rows.map(mapMovement);
}
