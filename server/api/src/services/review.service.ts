import pg from 'pg';
import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { getMemberIdForUser } from '../middleware/ownership.js';
import { auditLog } from '../utils/audit.js';
import {
  creditUser,
  getBalance,
  getReviewRewardAmount,
} from './store-credit.service.js';

export interface ProductReview {
  id: string;
  productId: string;
  orderId: string;
  orderItemId: string | null;
  userId: string;
  memberId: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  status: 'pending' | 'published' | 'hidden';
  createdAt: string;
  updatedAt: string;
  authorName?: string | null;
}

function mapReview(row: pg.QueryResultRow): ProductReview {
  return {
    id: row.id,
    productId: row.product_id,
    orderId: row.order_id,
    orderItemId: row.order_item_id ?? null,
    userId: row.user_id,
    memberId: row.member_id ?? null,
    rating: Number(row.rating),
    title: row.title ?? null,
    body: row.body ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authorName: row.author_name ?? null,
  };
}

async function refreshProductRating(client: pg.PoolClient | null, productId: string): Promise<void> {
  const sql = `
    UPDATE products p SET
      rating_avg = COALESCE(sub.avg, 0),
      rating_count = COALESCE(sub.cnt, 0)
    FROM (
      SELECT product_id,
             ROUND(AVG(rating)::numeric, 2) AS avg,
             COUNT(*)::int AS cnt
      FROM product_reviews
      WHERE product_id = $1 AND status = 'published'
      GROUP BY product_id
    ) sub
    WHERE p.id = $1 AND sub.product_id = p.id
  `;
  const zeroSql = `
    UPDATE products SET rating_avg = 0, rating_count = 0
    WHERE id = $1
      AND NOT EXISTS (
        SELECT 1 FROM product_reviews WHERE product_id = $1 AND status = 'published'
      )
  `;
  if (client) {
    await client.query(sql, [productId]);
    await client.query(zeroSql, [productId]);
  } else {
    await query(sql, [productId]);
    await query(zeroSql, [productId]);
  }
}

export async function listProductReviews(
  productIdOrSlug: string,
  opts: { page?: number; limit?: number } = {}
): Promise<{ reviews: ProductReview[]; total: number; page: number; limit: number }> {
  // Resolve product id from uuid or slug
  const isUuid = /^[0-9a-f-]{36}$/i.test(productIdOrSlug);
  const prod = await query(
    isUuid
      ? `SELECT id FROM products WHERE id = $1`
      : `SELECT id FROM products WHERE slug = $1 AND active = TRUE`,
    [productIdOrSlug]
  );
  if (prod.rows.length === 0) {
    throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
  }
  const productId = prod.rows[0].id as string;

  const limit = Math.max(1, Math.min(opts.limit || 20, 50));
  const page = Math.max(1, opts.page || 1);
  const offset = (page - 1) * limit;

  const [data, count] = await Promise.all([
    query(
      `SELECT r.*,
              COALESCE(NULLIF(m.full_name, ''), 'Cliente') AS author_name
       FROM product_reviews r
       LEFT JOIN members m ON m.id = r.member_id
       WHERE r.product_id = $1 AND r.status = 'published'
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [productId, limit, offset]
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM product_reviews
       WHERE product_id = $1 AND status = 'published'`,
      [productId]
    ),
  ]);

  return {
    reviews: data.rows.map(mapReview),
    total: count.rows[0].total as number,
    page,
    limit,
  };
}

export interface CreateReviewInput {
  productId: string;
  rating: number;
  title?: string;
  body?: string;
}

/**
 * Create reviews for products in a delivered order. Awards store credit once per order.
 */
export async function createOrderReviews(
  userId: string,
  orderId: string,
  reviews: CreateReviewInput[]
): Promise<{ reviews: ProductReview[]; creditAwarded: number; newBalance: number }> {
  if (!reviews?.length) {
    throw new AppError(400, 'Envie ao menos uma avaliação.', 'EMPTY_REVIEWS');
  }

  const memberId = await getMemberIdForUser(userId);
  const orderResult = await query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  if (orderResult.rows.length === 0) {
    throw new AppError(404, 'Pedido não encontrado.', 'ORDER_NOT_FOUND');
  }
  const order = orderResult.rows[0];
  if (order.status !== 'delivered') {
    throw new AppError(400, 'Só é possível avaliar pedidos entregues.', 'ORDER_NOT_DELIVERED');
  }
  const owns =
    order.user_id === userId ||
    (memberId && order.member_id === memberId);
  if (!owns) {
    throw new AppError(403, 'Este pedido não pertence à sua conta.', 'ORDER_NOT_OWNED');
  }

  const items = await query(
    `SELECT id, product_id FROM order_items WHERE order_id = $1 AND product_id IS NOT NULL`,
    [orderId]
  );
  const itemByProduct = new Map(
    items.rows.map((r) => [r.product_id as string, r.id as string])
  );

  const created: ProductReview[] = [];
  let creditAwarded = 0;
  let newBalance = 0;
  const client = await getClient();
  try {
    await client.query('BEGIN');

    for (const rev of reviews) {
      if (!itemByProduct.has(rev.productId)) {
        throw new AppError(400, 'Produto não faz parte deste pedido.', 'PRODUCT_NOT_IN_ORDER');
      }
      const rating = Math.floor(Number(rev.rating));
      if (rating < 1 || rating > 5) {
        throw new AppError(400, 'Nota deve ser entre 1 e 5.', 'INVALID_RATING');
      }
      const title = rev.title?.trim().slice(0, 120) || null;
      const body = rev.body?.trim().slice(0, 2000) || null;
      const orderItemId = itemByProduct.get(rev.productId) ?? null;

      try {
        const ins = await client.query(
          `INSERT INTO product_reviews
             (product_id, order_id, order_item_id, user_id, member_id, rating, title, body, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'published')
           RETURNING *`,
          [rev.productId, orderId, orderItemId, userId, memberId, rating, title, body]
        );
        created.push(mapReview(ins.rows[0]));
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code === '23505') {
          throw new AppError(409, 'Você já avaliou este produto neste pedido.', 'ALREADY_REVIEWED');
        }
        throw err;
      }
    }

    const productIds = [...new Set(created.map((r) => r.productId))];
    for (const pid of productIds) {
      await refreshProductRating(client, pid);
    }

    // Award credit once per order inside the same TX (unique index enforces 1×).
    const reward = await getReviewRewardAmount();
    if (reward > 0) {
      try {
        newBalance = await creditUser(userId, reward, 'review_reward', {
          orderId,
          reviewId: created[0]?.id,
          note: 'Recompensa por avaliar pedido',
          client,
        });
        creditAwarded = reward;
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code === '23505') {
          // Concurrent review already received the reward
          creditAwarded = 0;
          newBalance = await getBalance(userId);
        } else {
          throw err;
        }
      }
    } else {
      newBalance = await getBalance(userId);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  if (creditAwarded === 0 && newBalance === 0) {
    newBalance = await getBalance(userId);
  }

  await auditLog('order.reviewed', userId, {
    orderId,
    reviewCount: created.length,
    creditAwarded,
  });

  return { reviews: created, creditAwarded, newBalance };
}

/** Reviews the user already left for this order (to show "já avaliado"). */
export async function listReviewsForOrder(userId: string, orderId: string): Promise<ProductReview[]> {
  const memberId = await getMemberIdForUser(userId);
  const order = await query(`SELECT member_id, user_id FROM orders WHERE id = $1`, [orderId]);
  if (order.rows.length === 0) return [];
  const owns =
    order.rows[0].user_id === userId ||
    (memberId && order.rows[0].member_id === memberId);
  if (!owns) {
    throw new AppError(403, 'Acesso negado.', 'FORBIDDEN');
  }
  const result = await query(
    `SELECT * FROM product_reviews WHERE order_id = $1 AND user_id = $2 ORDER BY created_at`,
    [orderId, userId]
  );
  return result.rows.map(mapReview);
}

export async function adminListReviews(opts: {
  status?: string;
  page?: number;
  limit?: number;
} = {}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (opts.status) {
    conditions.push(`r.status = $${i++}`);
    params.push(opts.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(opts.limit || 30, 100));
  const page = Math.max(1, opts.page || 1);
  const offset = (page - 1) * limit;

  const [data, count] = await Promise.all([
    query(
      `SELECT r.*, p.name AS product_name, p.slug AS product_slug,
              COALESCE(m.full_name, u.email) AS author_name
       FROM product_reviews r
       JOIN products p ON p.id = r.product_id
       JOIN users u ON u.id = r.user_id
       LEFT JOIN members m ON m.id = r.member_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM product_reviews r ${where}`,
      params
    ),
  ]);

  return {
    reviews: data.rows.map((row) => ({
      ...mapReview(row),
      productName: row.product_name as string,
      productSlug: row.product_slug as string,
    })),
    total: count.rows[0].total as number,
    page,
    limit,
  };
}

export async function adminSetReviewStatus(
  id: string,
  status: 'published' | 'hidden' | 'pending',
  actorUserId: string
): Promise<ProductReview> {
  const result = await query(
    `UPDATE product_reviews SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id]
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'Avaliação não encontrada.', 'REVIEW_NOT_FOUND');
  }
  const review = mapReview(result.rows[0]);
  await refreshProductRating(null, review.productId);
  await auditLog('review.status_changed', actorUserId, { reviewId: id, status });
  return review;
}
