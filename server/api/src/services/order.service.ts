import pg from 'pg';
import { query, getClient } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import { getStripe } from '../utils/stripe.js';
import { generatePixEMV, generatePixTxId, type PixQRData } from '../utils/pix.js';
import { getMemberIdForUser } from '../middleware/ownership.js';
import { auditLog } from '../utils/audit.js';
import { recordOrderMovements } from './stock.service.js';
import {
  MEMBER_SHOP_DISCOUNT,
  WHOLESALE_SHOP_DISCOUNT,
  type Order,
  type OrderItem,
  type ShopChannel,
} from '../types/index.js';
import type { JwtPayload } from '../middleware/auth.js';
import {
  normalizeCep,
  pickOptionFromQuote,
  trackingUrlForCode,
  type ShippingAddressInput,
} from './shipping.service.js';
import { redeemForOrder, restoreCreditForOrder } from './store-credit.service.js';
import { sendTemplateEmail } from './email.service.js';
import { getApprovedAccountByUserId } from './wholesale.service.js';
import { isValidCnpj, normalizeCnpj } from '../utils/cnpj.js';

const PIX_KEY = env.PIX_KEY || '';
const PIX_MERCHANT_NAME = env.PIX_MERCHANT_NAME || 'GEEK E TOYS';
const PIX_MERCHANT_CITY = env.PIX_MERCHANT_CITY || 'RIO DE JANEIRO';

// ─── Row mappers ─────────────────────────────────────────────────────────────

function mapOrder(row: pg.QueryResultRow): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    memberId: row.member_id,
    userId: row.user_id ?? null,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    shippingAddress: row.shipping_address,
    subtotal: parseFloat(row.subtotal),
    discount: parseFloat(row.discount),
    discountReason: row.discount_reason,
    shippingCost: parseFloat(row.shipping_cost),
    shippingService: row.shipping_service ?? null,
    shippingServiceId: row.shipping_service_id ?? null,
    shippingDays: row.shipping_days != null ? Number(row.shipping_days) : null,
    trackingCode: row.tracking_code ?? null,
    trackingUrl: row.tracking_url ?? null,
    storeCreditApplied: row.store_credit_applied != null ? parseFloat(row.store_credit_applied) : 0,
    channel: (row.channel as ShopChannel) || 'retail',
    customerCnpj: row.customer_cnpj ?? null,
    wholesaleAccountId: row.wholesale_account_id ?? null,
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
    variantId: row.variant_id ?? null,
    variantLabel: row.variant_label ?? null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Create order (checkout) ─────────────────────────────────────────────────

export interface CreateOrderInput {
  items: { productId: string; quantity: number; variantId?: string }[];
  customer: { name: string; email: string; phone?: string };
  shippingAddress: ShippingAddressInput;
  shipping: {
    quoteToken: string;
    serviceId: string;
  };
  paymentMethod: 'pix' | 'credit_card';
  /** When true and user is authenticated, apply available store credit (capped at goods total after member discount). */
  applyStoreCredit?: boolean;
  /** retail (default) | wholesale — wholesale requires approved CNPJ account + enabled products. */
  channel?: ShopChannel;
  /** Required on wholesale channel; must match the approved account CNPJ. */
  cnpj?: string;
}

export interface CreateOrderResult {
  order: Order;
  clientSecret?: string;   // card (Stripe)
  pixData?: PixQRData;     // pix
}

/**
 * Create a shop order. Prices and discounts are ALWAYS recomputed server-side
 * from the DB — the client only sends productId + quantity. Stock is validated but only
 * decremented on payment confirmation (webhook / admin PIX confirm).
 *
 * Channels:
 * - retail: optional member_15 when active member
 * - wholesale: requires auth + approved CNPJ account; wholesale_25; only wholesale_enabled products
 */
export async function createOrder(input: CreateOrderInput, user?: JwtPayload): Promise<CreateOrderResult> {
  if (!input.items?.length) {
    throw new AppError(400, 'O carrinho está vazio.', 'EMPTY_CART');
  }

  const channel: ShopChannel = input.channel === 'wholesale' ? 'wholesale' : 'retail';
  const isWholesale = channel === 'wholesale';

  const addr = input.shippingAddress;
  if (!addr?.cep || !addr.street || !addr.number || !addr.neighborhood || !addr.city || !addr.state) {
    throw new AppError(400, 'Endereço de entrega incompleto.', 'INVALID_ADDRESS');
  }
  const cep = normalizeCep(addr.cep);
  if (cep.length !== 8) {
    throw new AppError(400, 'CEP inválido.', 'INVALID_CEP');
  }
  if (!input.shipping?.quoteToken || !input.shipping?.serviceId) {
    throw new AppError(400, 'Selecione uma opção de frete.', 'SHIPPING_REQUIRED');
  }

  // Wholesale: must be logged in with approved CNPJ account matching the provided CNPJ.
  let wholesaleAccountId: string | null = null;
  let customerCnpj: string | null = null;
  if (isWholesale) {
    if (!user?.userId) {
      throw new AppError(401, 'Faça login no atacado com CNPJ para comprar.', 'WHOLESALE_AUTH_REQUIRED');
    }
    const cnpj = normalizeCnpj(input.cnpj || '');
    if (!isValidCnpj(cnpj)) {
      throw new AppError(400, 'CNPJ inválido.', 'INVALID_CNPJ');
    }
    const acc = await getApprovedAccountByUserId(user.userId);
    if (!acc) {
      throw new AppError(
        403,
        'Cadastro de atacado pendente de aprovação ou inexistente. Só vendemos atacado a CNPJ aprovado e alinhado ao objeto da compra.',
        'WHOLESALE_NOT_APPROVED'
      );
    }
    if (acc.cnpj !== cnpj) {
      throw new AppError(403, 'CNPJ não confere com o cadastro de atacado.', 'CNPJ_MISMATCH');
    }
    wholesaleAccountId = acc.id;
    customerCnpj = cnpj;
  }

  // Revalidate frete server-side (never trust client price).
  const shipOpt = pickOptionFromQuote(
    input.shipping.quoteToken,
    input.shipping.serviceId,
    input.items,
    cep
  );
  const shippingCost = round2(shipOpt.price);
  const shippingService = shipOpt.service || shipOpt.name;
  const shippingServiceId = shipOpt.id;
  const shippingDays = shipOpt.days;

  const shippingAddress = {
    cep,
    street: addr.street.trim(),
    number: addr.number.trim(),
    complement: addr.complement?.trim() || undefined,
    neighborhood: addr.neighborhood.trim(),
    city: addr.city.trim(),
    state: addr.state.trim().toUpperCase().slice(0, 2),
    recipientName: addr.recipientName?.trim() || input.customer.name,
  };

  // Resolve active membership (for the 15% discount) — never trust the client.
  // Wholesale channel does NOT stack member discount (uses wholesale_25 only).
  // Always persist user_id when authenticated so "Minhas compras" works even without active plan.
  let memberId: string | null = null;
  const orderUserId = user?.userId ?? null;
  if (user && !isWholesale) {
    const mid = await getMemberIdForUser(user.userId);
    if (mid) {
      const m = await query(
        `SELECT id FROM members WHERE id = $1 AND status = 'active' AND expiry_date >= CURRENT_DATE`,
        [mid]
      );
      if (m.rows.length > 0) memberId = mid;
    }
  }

  // Aggregate by productId + variantId (prevents double-line stock bypass).
  const qtyByKey = new Map<string, { productId: string; variantId: string | null; quantity: number }>();
  for (const it of input.items) {
    const qty = Math.floor(it.quantity);
    if (qty <= 0) throw new AppError(400, 'Quantidade inválida.', 'INVALID_QUANTITY');
    const variantId = it.variantId || null;
    const key = `${it.productId}::${variantId || ''}`;
    const prev = qtyByKey.get(key);
    qtyByKey.set(key, {
      productId: it.productId,
      variantId,
      quantity: (prev?.quantity || 0) + qty,
    });
  }
  const aggregatedItems = [...qtyByKey.values()];
  // Note: frete quote token was validated against the client cart lines above (input.items).

  const client = await getClient();
  let orderId: string;
  let order: Order;
  try {
    await client.query('BEGIN');

    // Lock products and validate availability (aggregated qty)
    const ids = [...new Set(aggregatedItems.map((it) => it.productId))];
    const productsResult = await client.query(
      `SELECT id, name, slug, price, stock, active, images, wholesale_enabled, wholesale_min_qty,
              COALESCE(has_variants, FALSE) AS has_variants
       FROM products WHERE id = ANY($1::uuid[]) FOR UPDATE`,
      [ids]
    );
    const byId = new Map(productsResult.rows.map((r) => [r.id, r]));

    // Lock variants used
    const variantIds = aggregatedItems.map((i) => i.variantId).filter(Boolean) as string[];
    const variantsById = new Map<string, pg.QueryResultRow>();
    if (variantIds.length) {
      const vr = await client.query(
        `SELECT * FROM product_variants WHERE id = ANY($1::uuid[]) FOR UPDATE`,
        [variantIds]
      );
      for (const r of vr.rows) variantsById.set(r.id, r);
    }

    const itemRows: {
      productId: string;
      name: string;
      slug: string;
      unitPrice: number;
      quantity: number;
      lineTotal: number;
      image: string | null;
      variantId: string | null;
      variantLabel: string | null;
    }[] = [];
    let subtotal = 0;
    for (const it of aggregatedItems) {
      const p = byId.get(it.productId);
      if (!p || !p.active) {
        throw new AppError(400, `Produto indisponível no carrinho.`, 'PRODUCT_UNAVAILABLE');
      }
      if (isWholesale) {
        if (!p.wholesale_enabled) {
          throw new AppError(
            400,
            `"${p.name}" não está disponível no atacado no momento.`,
            'PRODUCT_NOT_WHOLESALE'
          );
        }
        const minQty = Math.max(1, Number(p.wholesale_min_qty) || 1);
        if (it.quantity < minQty) {
          throw new AppError(
            400,
            `"${p.name}" exige quantidade mínima de ${minQty} no atacado.`,
            'WHOLESALE_MIN_QTY'
          );
        }
      }

      const hasVariants = p.has_variants === true;
      let unitPrice = parseFloat(p.price);
      let stock = Number(p.stock);
      let image: string | null =
        Array.isArray(p.images) && p.images.length ? p.images[0] : null;
      let displayName = p.name as string;
      let variantLabel: string | null = null;
      let variantId: string | null = null;

      if (hasVariants) {
        if (!it.variantId) {
          throw new AppError(
            400,
            `Selecione a variação de "${p.name}" (cor/tamanho).`,
            'VARIANT_REQUIRED'
          );
        }
        const v = variantsById.get(it.variantId);
        if (!v || v.product_id !== p.id || !v.active) {
          throw new AppError(400, `Variação indisponível para "${p.name}".`, 'VARIANT_UNAVAILABLE');
        }
        unitPrice = parseFloat(v.price);
        stock = Number(v.stock);
        variantLabel = v.name;
        variantId = v.id;
        displayName = `${p.name} — ${v.name}`;
        if (Array.isArray(v.images) && v.images.length) image = v.images[0];
      } else if (it.variantId) {
        throw new AppError(400, `Produto "${p.name}" não possui variações.`, 'VARIANT_NOT_ALLOWED');
      }

      const qty = it.quantity;
      if (stock < qty) {
        throw new AppError(
          409,
          `Estoque insuficiente para "${displayName}".`,
          'INSUFFICIENT_STOCK'
        );
      }
      const lineTotal = round2(unitPrice * qty);
      subtotal += lineTotal;
      itemRows.push({
        productId: p.id,
        name: displayName,
        slug: p.slug,
        unitPrice,
        quantity: qty,
        lineTotal,
        image,
        variantId,
        variantLabel,
      });
    }
    subtotal = round2(subtotal);

    // Discounts: wholesale_25 XOR member_15 (never both).
    const wholesaleDiscount = isWholesale ? round2(subtotal * WHOLESALE_SHOP_DISCOUNT) : 0;
    const memberDiscount = !isWholesale && memberId ? round2(subtotal * MEMBER_SHOP_DISCOUNT) : 0;
    const baseDiscount = isWholesale ? wholesaleDiscount : memberDiscount;
    const baseReason: string | null = isWholesale
      ? wholesaleDiscount > 0
        ? 'wholesale_25'
        : null
      : memberDiscount > 0
        ? 'member_15'
        : null;
    const goodsAfterDiscount = round2(subtotal - baseDiscount);
    // Provisional total without store credit (frete never discounted).
    let discount = baseDiscount;
    let discountReason: string | null = baseReason;
    let storeCreditApplied = 0;
    let total = round2(subtotal - discount + shippingCost);

    const orderResult = await client.query(
      `INSERT INTO orders (
         member_id, user_id, customer_name, customer_email, customer_phone, shipping_address,
         subtotal, discount, discount_reason, shipping_cost, shipping_service, shipping_service_id,
         shipping_days, store_credit_applied, total, status, payment_method,
         channel, customer_cnpj, wholesale_account_id
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending', $16,
               $17, $18, $19)
       RETURNING *`,
      [
        memberId,
        orderUserId,
        input.customer.name,
        input.customer.email,
        input.customer.phone ?? null,
        JSON.stringify(shippingAddress),
        subtotal,
        discount,
        discountReason,
        shippingCost,
        shippingService,
        shippingServiceId,
        shippingDays,
        0,
        total,
        input.paymentMethod,
        channel,
        customerCnpj,
        wholesaleAccountId,
      ]
    );
    order = mapOrder(orderResult.rows[0]);
    orderId = order.id;

    for (const it of itemRows) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_slug, unit_price, quantity, line_total, image_url, variant_id, variant_label)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          orderId,
          it.productId,
          it.name,
          it.slug,
          it.unitPrice,
          it.quantity,
          it.lineTotal,
          it.image,
          it.variantId,
          it.variantLabel,
        ]
      );
    }

    // Store credit after order exists (ledger needs order_id). Caps at goods after channel discount.
    // Available on both channels when authenticated.
    if (input.applyStoreCredit && user?.userId && goodsAfterDiscount > 0) {
      storeCreditApplied = await redeemForOrder(client, user.userId, goodsAfterDiscount, orderId);
      if (storeCreditApplied > 0) {
        discount = round2(baseDiscount + storeCreditApplied);
        discountReason = baseReason
          ? `${baseReason}+store_credit`
          : 'store_credit';
        total = round2(subtotal - discount + shippingCost);
        if (total < 0) {
          throw new AppError(400, 'Total do pedido inválido.', 'INVALID_TOTAL');
        }
        const updated = await client.query(
          `UPDATE orders
           SET discount = $1, discount_reason = $2, store_credit_applied = $3, total = $4
           WHERE id = $5
           RETURNING *`,
          [discount, discountReason, storeCreditApplied, total, orderId]
        );
        order = mapOrder(updated.rows[0]);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Create the charge outside the DB transaction. On failure, cancel + restore credit.
  try {
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
          userId: orderUserId ?? '',
        },
      });
      await query(`UPDATE orders SET stripe_payment_intent_id = $1 WHERE id = $2`, [pi.id, orderId]);
      order.stripePaymentIntentId = pi.id;
      await auditLog('order.created', orderUserId, {
        orderId,
        orderNumber: order.orderNumber,
        total: order.total,
        storeCreditApplied: order.storeCreditApplied,
        paymentMethod: 'credit_card',
      });
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
    await auditLog('order.created', orderUserId, {
      orderId,
      orderNumber: order.orderNumber,
      total: order.total,
      storeCreditApplied: order.storeCreditApplied,
      paymentMethod: 'pix',
    });
    return { order, pixData };
  } catch (err) {
    // Compensate: cancel pending order and restore any store credit.
    await query(
      `UPDATE orders SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`,
      [orderId]
    ).catch(() => {});
    await restoreCreditForOrder(orderId, {
      note: 'Crédito devolvido (falha ao criar cobrança)',
    }).catch((e) => console.error('[order] credit restore after charge fail', e));
    await auditLog('order.create_failed', orderUserId, {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
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

/** Customer order history — by user_id (preferred) or legacy member_id. */
export async function listMyOrders(
  userId: string,
  opts: { statuses?: string[]; page?: number; limit?: number } = {}
) {
  const memberId = await getMemberIdForUser(userId);
  const conditions: string[] = ['(user_id = $1 OR ($2::uuid IS NOT NULL AND member_id = $2))'];
  const params: unknown[] = [userId, memberId];
  let i = 3;
  if (opts.statuses?.length) {
    conditions.push(`status = ANY($${i++}::text[])`);
    params.push(opts.statuses);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const limit = Math.max(1, Math.min(opts.limit || 20, 50));
  const page = Math.max(1, opts.page || 1);
  const offset = (page - 1) * limit;

  const [data, count] = await Promise.all([
    query(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*)::int as total FROM orders ${where}`, params),
  ]);

  const orders = data.rows.map(mapOrder);
  // Attach first-line items for list cards
  if (orders.length) {
    const ids = orders.map((o) => o.id);
    const items = await query(
      `SELECT * FROM order_items WHERE order_id = ANY($1::uuid[]) ORDER BY id`,
      [ids]
    );
    const byOrder = new Map<string, OrderItem[]>();
    for (const row of items.rows) {
      const mapped = mapItem(row);
      const list = byOrder.get(mapped.orderId) || [];
      list.push(mapped);
      byOrder.set(mapped.orderId, list);
    }
    for (const o of orders) {
      o.items = byOrder.get(o.id) || [];
    }
  }

  return { orders, total: count.rows[0].total as number, page, limit };
}

export async function getMyOrderById(userId: string, orderId: string): Promise<Order | null> {
  const memberId = await getMemberIdForUser(userId);
  const result = await query(
    `SELECT * FROM orders
     WHERE id = $1 AND (user_id = $2 OR ($3::uuid IS NOT NULL AND member_id = $3))`,
    [orderId, userId, memberId]
  );
  if (result.rows.length === 0) return null;
  const order = mapOrder(result.rows[0]);
  const items = await query(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`, [orderId]);
  order.items = items.rows.map(mapItem);
  return order;
}

/** Admin: set tracking code and move to shipped (or keep status if already beyond). */
export async function setOrderTracking(
  id: string,
  trackingCode: string,
  actorUserId: string,
  trackingUrl?: string
): Promise<Order> {
  const code = trackingCode.trim();
  if (!code || code.length > 64) {
    throw new AppError(400, 'Código de rastreio inválido.', 'INVALID_TRACKING');
  }
  const url = trackingUrl?.trim() || trackingUrlForCode(code);
  const result = await query(
    `UPDATE orders
     SET tracking_code = $1,
         tracking_url = $2,
         status = CASE
           WHEN status IN ('paid', 'processing') THEN 'shipped'
           ELSE status
         END
     WHERE id = $3
     RETURNING *`,
    [code, url, id]
  );
  if (result.rows.length === 0) throw new AppError(404, 'Pedido não encontrado.', 'ORDER_NOT_FOUND');
  await auditLog('order.tracking_set', actorUserId, { orderId: id, trackingCode: code });
  const order = mapOrder(result.rows[0]);
  // Non-blocking ship notification
  sendTemplateEmail({
    template: 'order-shipped',
    to: order.customerEmail,
    variables: {
      name: order.customerName,
      order_number: String(order.orderNumber),
      tracking_code: code,
      tracking_url: url,
      shipping_service: order.shippingService || '',
    },
  }).catch((err) => console.error('[email] order-shipped failed', err));
  return order;
}

// ─── Admin mutations ─────────────────────────────────────────────────────────

const VALID_STATUS = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

export async function updateOrderStatus(id: string, status: string, actorUserId: string): Promise<Order> {
  if (!VALID_STATUS.includes(status)) {
    throw new AppError(400, 'Status inválido.', 'INVALID_STATUS');
  }
  const prev = await getOrderById(id, false);
  if (!prev) throw new AppError(404, 'Pedido não encontrado.', 'ORDER_NOT_FOUND');

  const result = await query(`UPDATE orders SET status = $1 WHERE id = $2 RETURNING *`, [status, id]);
  if (result.rows.length === 0) throw new AppError(404, 'Pedido não encontrado.', 'ORDER_NOT_FOUND');
  const order = mapOrder(result.rows[0]);

  const closing =
    (status === 'cancelled' || status === 'refunded') &&
    prev.status !== 'cancelled' &&
    prev.status !== 'refunded';
  const hadStockDecremented = ['paid', 'processing', 'shipped', 'delivered'].includes(prev.status);

  // Restore store credit when cancelling/refunding a pending or paid order that spent credit.
  if (closing && (order.storeCreditApplied ?? 0) > 0) {
    const restored = await restoreCreditForOrder(id, {
      note: `Crédito devolvido (status → ${status})`,
    });
    if (restored > 0) {
      await auditLog('order.credit_restored', actorUserId, { orderId: id, amount: restored, status });
    }
  }

  // Restock when undoing a paid (or later) order.
  if (closing && hadStockDecremented) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await restoreStockForOrder(client, id);
      await client.query('COMMIT');
      await auditLog('order.stock_restored', actorUserId, { orderId: id, status });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  await auditLog('order.status_changed', actorUserId, {
    orderId: id,
    from: prev.status,
    status,
  });
  return order;
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
    const order = mapOrder(updated.rows[0]);
    sendTemplateEmail({
      template: 'order-confirmed',
      to: order.customerEmail,
      variables: {
        name: order.customerName,
        order_number: String(order.orderNumber),
        total: order.total.toFixed(2).replace('.', ','),
      },
    }).catch((err) => console.error('[email] order-confirmed (pix) failed', err));
    return order;
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
  if (order.status === 'refunded' || order.status === 'cancelled') {
    throw new AppError(409, 'Pedido já cancelado/reembolsado.', 'ORDER_ALREADY_CLOSED');
  }
  if (!order.stripePaymentIntentId) {
    throw new AppError(400, 'Pedido sem cobrança no Stripe (ex.: PIX) — reembolse manualmente.', 'NO_STRIPE_CHARGE');
  }
  const stripe = getStripe();
  await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId });
  const hadStock = ['paid', 'processing', 'shipped', 'delivered'].includes(order.status);
  const result = await query(
    `UPDATE orders SET status = 'refunded' WHERE id = $1 AND status <> 'refunded' RETURNING *`,
    [id]
  );
  if (result.rows.length === 0) {
    throw new AppError(409, 'Pedido já reembolsado.', 'ORDER_ALREADY_REFUNDED');
  }
  const restored = await restoreCreditForOrder(id, {
    note: 'Crédito devolvido (reembolso Stripe)',
  });
  if (hadStock) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await restoreStockForOrder(client, id);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
  await auditLog('order.refunded', actorUserId, {
    orderId: id,
    paymentIntent: order.stripePaymentIntentId,
    creditRestored: restored,
    stockRestored: hadStock,
  });
  return mapOrder(result.rows[0]);
}

/** Decrement product/variant stock for every item in an order. Shared by webhook + PIX confirm. */
export async function decrementStockForOrder(client: pg.PoolClient, orderId: string): Promise<void> {
  // Simple products (no variant)
  await client.query(
    `UPDATE products p SET stock = GREATEST(0, p.stock - oi.quantity)
     FROM order_items oi
     WHERE oi.order_id = $1 AND oi.product_id = p.id AND oi.variant_id IS NULL`,
    [orderId]
  );
  // Variant SKUs (Shopee model)
  await client.query(
    `UPDATE product_variants v SET stock = GREATEST(0, v.stock - oi.quantity)
     FROM order_items oi
     WHERE oi.order_id = $1 AND oi.variant_id = v.id`,
    [orderId]
  );
  await syncParentStockFromVariants(client, orderId);
  // Histórico do painel — mesma transação, some junto no rollback.
  await recordOrderMovements(client, orderId, -1);
}

/** Reverse of decrement — used on cancel/refund after stock was taken. */
export async function restoreStockForOrder(client: pg.PoolClient, orderId: string): Promise<void> {
  await client.query(
    `UPDATE products p SET stock = p.stock + oi.quantity
     FROM order_items oi
     WHERE oi.order_id = $1 AND oi.product_id = p.id AND oi.variant_id IS NULL`,
    [orderId]
  );
  await client.query(
    `UPDATE product_variants v SET stock = v.stock + oi.quantity
     FROM order_items oi
     WHERE oi.order_id = $1 AND oi.variant_id = v.id`,
    [orderId]
  );
  await syncParentStockFromVariants(client, orderId);
  await recordOrderMovements(client, orderId, 1);
}

async function syncParentStockFromVariants(client: pg.PoolClient, orderId: string): Promise<void> {
  await client.query(
    `UPDATE products p SET stock = COALESCE((
       SELECT SUM(v.stock)::int FROM product_variants v
       WHERE v.product_id = p.id AND v.active = TRUE
     ), p.stock)
     WHERE p.has_variants = TRUE
       AND p.id IN (SELECT product_id FROM order_items WHERE order_id = $1 AND product_id IS NOT NULL)`,
    [orderId]
  );
}
