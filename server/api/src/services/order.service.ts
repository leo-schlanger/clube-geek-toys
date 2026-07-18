import pg from 'pg';
import { query, getClient } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import { getStripe } from '../utils/stripe.js';
import { generatePixEMV, generatePixTxId, type PixQRData } from '../utils/pix.js';
import { getMemberIdForUser } from '../middleware/ownership.js';
import { auditLog } from '../utils/audit.js';
import { MEMBER_SHOP_DISCOUNT, type Order, type OrderItem } from '../types/index.js';
import type { JwtPayload } from '../middleware/auth.js';

const PIX_KEY = env.PIX_KEY || '';
const PIX_MERCHANT_NAME = env.PIX_MERCHANT_NAME || 'GEEK E TOYS';
const PIX_MERCHANT_CITY = env.PIX_MERCHANT_CITY || 'RIO DE JANEIRO';

// ─── Row mappers ─────────────────────────────────────────────────────────────

function mapOrder(row: pg.QueryResultRow): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    memberId: row.member_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    shippingAddress: row.shipping_address,
    subtotal: parseFloat(row.subtotal),
    discount: parseFloat(row.discount),
    discountReason: row.discount_reason,
    shippingCost: parseFloat(row.shipping_cost),
    total: parseFloat(row.total),
    status: row.status,
    paymentMethod: row.payment_method,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    pixTxid: row.pix_txid,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapItem(row: pg.QueryResultRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    productName: row.product_name,
    productSlug: row.product_slug,
    unitPrice: parseFloat(row.unit_price),
    quantity: row.quantity,
    lineTotal: parseFloat(row.line_total),
    imageUrl: row.image_url,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Create order (checkout) ─────────────────────────────────────────────────

export interface CreateOrderInput {
  items: { productId: string; quantity: number }[];
  customer: { name: string; email: string; phone?: string };
  shippingAddress?: Record<string, unknown>;
  paymentMethod: 'pix' | 'credit_card';
}

export interface CreateOrderResult {
  order: Order;
  clientSecret?: string;   // card (Stripe)
  pixData?: PixQRData;     // pix
}

/**
 * Create a shop order. Prices and the member discount are ALWAYS recomputed server-side
 * from the DB — the client only sends productId + quantity. Stock is validated but only
 * decremented on payment confirmation (webhook / admin PIX confirm).
 */
export async function createOrder(input: CreateOrderInput, user?: JwtPayload): Promise<CreateOrderResult> {
  if (!input.items?.length) {
    throw new AppError(400, 'O carrinho está vazio.', 'EMPTY_CART');
  }

  // Resolve active membership (for the 15% discount) — never trust the client.
  let memberId: string | null = null;
  if (user) {
    const mid = await getMemberIdForUser(user.userId);
    if (mid) {
      const m = await query(
        `SELECT id FROM members WHERE id = $1 AND status = 'active' AND expiry_date >= CURRENT_DATE`,
        [mid]
      );
      if (m.rows.length > 0) memberId = mid;
    }
  }

  const client = await getClient();
  let orderId: string;
  let order: Order;
  try {
    await client.query('BEGIN');

    // Lock the products and validate availability
    const ids = input.items.map((it) => it.productId);
    const productsResult = await client.query(
      `SELECT id, name, slug, price, stock, active, images
       FROM products WHERE id = ANY($1::uuid[]) FOR UPDATE`,
      [ids]
    );
    const byId = new Map(productsResult.rows.map((r) => [r.id, r]));

    const itemRows: { productId: string; name: string; slug: string; unitPrice: number; quantity: number; lineTotal: number; image: string | null }[] = [];
    let subtotal = 0;
    for (const it of input.items) {
      const p = byId.get(it.productId);
      if (!p || !p.active) {
        throw new AppError(400, `Produto indisponível no carrinho.`, 'PRODUCT_UNAVAILABLE');
      }
      const qty = Math.floor(it.quantity);
      if (qty <= 0) throw new AppError(400, 'Quantidade inválida.', 'INVALID_QUANTITY');
      if (p.stock < qty) {
        throw new AppError(409, `Estoque insuficiente para "${p.name}".`, 'INSUFFICIENT_STOCK');
      }
      const unitPrice = parseFloat(p.price);
      const lineTotal = round2(unitPrice * qty);
      subtotal += lineTotal;
      const image = Array.isArray(p.images) && p.images.length ? p.images[0] : null;
      itemRows.push({ productId: p.id, name: p.name, slug: p.slug, unitPrice, quantity: qty, lineTotal, image });
    }
    subtotal = round2(subtotal);

    const discount = memberId ? round2(subtotal * MEMBER_SHOP_DISCOUNT) : 0;
    const discountReason = memberId ? 'member_15' : null;
    const total = round2(subtotal - discount);

    const orderResult = await client.query(
      `INSERT INTO orders (member_id, customer_name, customer_email, customer_phone, shipping_address,
                           subtotal, discount, discount_reason, shipping_cost, total, status, payment_method)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, 0, $9, 'pending', $10)
       RETURNING *`,
      [
        memberId,
        input.customer.name,
        input.customer.email,
        input.customer.phone ?? null,
        input.shippingAddress ? JSON.stringify(input.shippingAddress) : null,
        subtotal,
        discount,
        discountReason,
        total,
        input.paymentMethod,
      ]
    );
    order = mapOrder(orderResult.rows[0]);
    orderId = order.id;

    for (const it of itemRows) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_slug, unit_price, quantity, line_total, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [orderId, it.productId, it.name, it.slug, it.unitPrice, it.quantity, it.lineTotal, it.image]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Create the charge outside the DB transaction.
  if (input.paymentMethod === 'credit_card') {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(order.total * 100),
      currency: 'brl',
      payment_method_types: ['card'],
      description: `Pedido #${order.orderNumber} - Loja GeekPop & Toys`,
      receipt_email: order.customerEmail,
      metadata: {
        kind: 'shop_order',
        orderId,
        memberId: order.memberId ?? '',
      },
    });
    await query(`UPDATE orders SET stripe_payment_intent_id = $1 WHERE id = $2`, [pi.id, orderId]);
    order.stripePaymentIntentId = pi.id;
    return { order, clientSecret: pi.client_secret ?? undefined };
  }

  // PIX — generated locally; admin confirms manually.
  if (!PIX_KEY) {
    throw new AppError(503, 'Pagamento PIX não está configurado.', 'PIX_NOT_CONFIGURED');
  }
  const txId = generatePixTxId();
  const pixData = generatePixEMV({
    pixKey: PIX_KEY,
    amount: order.total,
    merchantName: PIX_MERCHANT_NAME,
    merchantCity: PIX_MERCHANT_CITY,
    txId,
  });
  await query(`UPDATE orders SET pix_txid = $1 WHERE id = $2`, [txId, orderId]);
  order.pixTxid = txId;
  return { order, pixData };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function getOrderById(id: string, withItems = true): Promise<Order | null> {
  const result = await query('SELECT * FROM orders WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  const order = mapOrder(result.rows[0]);
  if (withItems) {
    const items = await query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [id]);
    order.items = items.rows.map(mapItem);
  }
  return order;
}

/** Lightweight status lookup for order-confirmation polling (public by order id). */
export async function getOrderStatus(id: string): Promise<{ id: string; status: string; orderNumber: number } | null> {
  const result = await query('SELECT id, status, order_number FROM orders WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  return { id: result.rows[0].id, status: result.rows[0].status, orderNumber: result.rows[0].order_number };
}

export async function listOrders(opts: { status?: string; page?: number; limit?: number }) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (opts.status) {
    conditions.push(`status = $${i++}`);
    params.push(opts.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(opts.limit || 20, 100));
  const page = Math.max(1, opts.page || 1);
  const offset = (page - 1) * limit;

  const [data, count] = await Promise.all([
    query(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*)::int as total FROM orders ${where}`, params),
  ]);
  return { orders: data.rows.map(mapOrder), total: count.rows[0].total as number, page, limit };
}

// ─── Admin mutations ─────────────────────────────────────────────────────────

const VALID_STATUS = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

export async function updateOrderStatus(id: string, status: string, actorUserId: string): Promise<Order> {
  if (!VALID_STATUS.includes(status)) {
    throw new AppError(400, 'Status inválido.', 'INVALID_STATUS');
  }
  const result = await query(`UPDATE orders SET status = $1 WHERE id = $2 RETURNING *`, [status, id]);
  if (result.rows.length === 0) throw new AppError(404, 'Pedido não encontrado.', 'ORDER_NOT_FOUND');
  await auditLog('order.status_changed', actorUserId, { orderId: id, status });
  return mapOrder(result.rows[0]);
}

/** Admin confirms a PIX order manually: mark paid + decrement stock (idempotent). */
export async function confirmPixOrder(id: string, actorUserId: string): Promise<Order> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE orders SET status = 'paid', paid_at = NOW(), payment_method = 'pix'
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [id]
    );
    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      const existing = await getOrderById(id, false);
      if (!existing) throw new AppError(404, 'Pedido não encontrado.', 'ORDER_NOT_FOUND');
      throw new AppError(409, 'Pedido não está pendente.', 'ORDER_NOT_PENDING');
    }
    await decrementStockForOrder(client, id);
    await client.query('COMMIT');
    await auditLog('order.pix_confirmed', actorUserId, { orderId: id });
    return mapOrder(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Refund a paid order via Stripe (card only). */
export async function refundOrder(id: string, actorUserId: string): Promise<Order> {
  const order = await getOrderById(id, false);
  if (!order) throw new AppError(404, 'Pedido não encontrado.', 'ORDER_NOT_FOUND');
  if (!order.stripePaymentIntentId) {
    throw new AppError(400, 'Pedido sem cobrança no Stripe (ex.: PIX) — reembolse manualmente.', 'NO_STRIPE_CHARGE');
  }
  const stripe = getStripe();
  await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId });
  const result = await query(`UPDATE orders SET status = 'refunded' WHERE id = $1 RETURNING *`, [id]);
  await auditLog('order.refunded', actorUserId, { orderId: id, paymentIntent: order.stripePaymentIntentId });
  return mapOrder(result.rows[0]);
}

/** Decrement product stock for every item in an order. Shared by webhook + PIX confirm. */
export async function decrementStockForOrder(client: pg.PoolClient, orderId: string): Promise<void> {
  await client.query(
    `UPDATE products p SET stock = GREATEST(0, p.stock - oi.quantity)
     FROM order_items oi
     WHERE oi.order_id = $1 AND oi.product_id = p.id`,
    [orderId]
  );
}
