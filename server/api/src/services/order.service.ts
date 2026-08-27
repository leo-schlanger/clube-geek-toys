import pg from 'pg';
import { query, getClient } from '../config/database.js';
import { env, adminUrl } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import { getStripe } from '../utils/stripe.js';
import { generatePixEMV, generatePixTxId, type PixQRData } from '../utils/pix.js';
import { getMemberIdForUser } from '../middleware/ownership.js';
import { auditLog } from '../utils/audit.js';
import { recordMovement, recordOrderMovements } from './stock.service.js';
import {
  WHOLESALE_SHOP_DISCOUNT,
  type DeliveryMethod,
  type Order,
  type OrderItem,
  type ShopChannel,
} from '../types/index.js';
import type { JwtPayload } from '../middleware/auth.js';
import {
  buildPickupAddress,
  normalizeCep,
  pickOptionFromQuote,
  trackingUrlForCode,
  PICKUP_SERVICE_ID,
  PICKUP_SERVICE_LABEL,
  STORE_PICKUP_LOCATION,
  type ShippingAddressInput,
} from './shipping.service.js';
import { redeemForOrder, restoreCreditForOrder } from './store-credit.service.js';
import { sendTemplateEmail } from './email.service.js';
import { getApprovedAccountByUserId, isWholesaleSalesOpen } from './wholesale.service.js';
import { isValidCnpj, normalizeCnpj } from '../utils/cnpj.js';
import {
  checkCoupon,
  claimCoupon,
  couponReason,
  getShopPromo,
  pickBestDiscount,
  recordRedemption,
  releaseCoupon,
  retailDiscountCandidates,
} from './promo.service.js';

const PIX_KEY = env.PIX_KEY || '';
const PIX_MERCHANT_NAME = env.PIX_MERCHANT_NAME || 'GEEK E TOYS';
const PIX_MERCHANT_CITY = env.PIX_MERCHANT_CITY || 'RIO DE JANEIRO';

// How long a pending order holds its stock. Deliberately generous: PIX is
// confirmed by hand, and a short TTL would free the piece before the person who
// ordered it manages to pay.
const STOCK_RESERVATION_TTL_HOURS = env.STOCK_RESERVATION_TTL_HOURS;

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
    customerNote: row.customer_note ?? null,
    deliveryMethod: (row.delivery_method as DeliveryMethod) || 'shipping',
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

/**
 * Tells the admin a shop PIX is awaiting confirmation.
 *
 * Nothing confirms PIX on its own: with no webhook the order stays `pending`
 * until someone checks the statement. Without this notice a customer pays and
 * the store never finds out.
 *
 * Wrapped in try/catch **deliberately**: it is called from inside the checkout
 * `try`, whose `catch` cancels the order and restores credit. A failure while
 * building variables or reaching Resend must not drop a legitimate order.
 */
function notifyAdminOfPendingPix(order: Order, txId: string): void {
  try {
    void sendTemplateEmail({
      template: 'admin-pix-order-pending',
      to: env.ADMIN_EMAIL,
      variables: {
        order_number: String(order.orderNumber),
        customer_name: order.customerName,
        customer_email: order.customerEmail,
        total: order.total.toFixed(2).replace('.', ','),
        tx_id: txId,
        customer_note: order.customerNote ?? '',
        admin_url: adminUrl('/admin?tab=orders'),
      },
    }).catch((err) => console.error('[PIX] admin-pix-order-pending failed', err));
  } catch (err) {
    console.error('[PIX] admin-pix-order-pending skipped', err);
  }
}

/**
 * Sends the customer their own copy of the PIX code.
 *
 * The EMV lived only in the checkout component's state, and there is no public
 * route that returns it: closing the tab — or just tapping "Acompanhar pedido",
 * which unmounts the component — left a guest with no way to pay. Same reason
 * the ticket reservation has always mailed its code.
 *
 * Never throws: it runs inside the checkout `try`, whose `catch` cancels the
 * order and restores credit.
 */
function notifyCustomerOfPendingPix(order: Order, pix: PixQRData): void {
  try {
    void sendTemplateEmail({
      template: 'order-pending-pix',
      to: order.customerEmail,
      variables: {
        name: order.customerName,
        order_number: String(order.orderNumber),
        order_id: order.id,
        total: order.total.toFixed(2).replace('.', ','),
        pix_code: pix.emvCode,
        pix_key: pix.pixKey,
      },
    }).catch((err) => console.error('[PIX] order-pending-pix failed', err));
  } catch (err) {
    console.error('[PIX] order-pending-pix skipped', err);
  }
}

// ─── Create order (checkout) ─────────────────────────────────────────────────

export interface CreateOrderInput {
  items: { productId: string; quantity: number; variantId?: string }[];
  customer: { name: string; email: string; phone?: string };
  /** Free-text note the customer writes for the shop at checkout. */
  customerNote?: string;
  /**
   * 'shipping' (default) posts through Correios; 'pickup' has the customer
   * collect at the counter — no address, no quote, no shipping cost.
   */
  deliveryMethod?: DeliveryMethod;
  /** Required when deliveryMethod is 'shipping'. */
  shippingAddress?: ShippingAddressInput;
  /** Required when deliveryMethod is 'shipping'. */
  shipping?: {
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
  /** Optional coupon code. Competes with the member and online discounts; the largest wins. */
  couponCode?: string;
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
 * - retail: optional member_10 when active member
 * - wholesale: only with `wholesale.sales_open` on; requires auth + approved CNPJ account;
 *   wholesale_25; only wholesale_enabled products
 */
export async function createOrder(input: CreateOrderInput, user?: JwtPayload): Promise<CreateOrderResult> {
  if (!input.items?.length) {
    throw new AppError(400, 'O carrinho está vazio.', 'EMPTY_CART');
  }

  const channel: ShopChannel = input.channel === 'wholesale' ? 'wholesale' : 'retail';
  const isWholesale = channel === 'wholesale';

  const deliveryMethod: DeliveryMethod = input.deliveryMethod === 'pickup' ? 'pickup' : 'shipping';
  const isPickup = deliveryMethod === 'pickup';

  // Pickup carries no destination: validating an address the customer was never
  // asked for would reject every counter order.
  let cep = '';
  const addr = input.shippingAddress;
  if (!isPickup) {
    if (!addr?.cep || !addr.street || !addr.number || !addr.neighborhood || !addr.city || !addr.state) {
      throw new AppError(400, 'Endereço de entrega incompleto.', 'INVALID_ADDRESS');
    }
    cep = normalizeCep(addr.cep);
    if (cep.length !== 8) {
      throw new AppError(400, 'CEP inválido.', 'INVALID_CEP');
    }
    if (!input.shipping?.quoteToken || !input.shipping?.serviceId) {
      throw new AppError(400, 'Selecione uma opção de frete.', 'SHIPPING_REQUIRED');
    }
  }

  // Wholesale: must be logged in with approved CNPJ account matching the provided CNPJ.
  let wholesaleAccountId: string | null = null;
  let customerCnpj: string | null = null;
  if (isWholesale) {
    // Signup stays open with the channel closed — what it must not do is become an order.
    if (!(await isWholesaleSalesOpen())) {
      throw new AppError(
        403,
        'Ainda não estamos vendendo no atacado. Seu cadastro fica guardado e avisamos assim que abrirmos.',
        'WHOLESALE_CLOSED'
      );
    }
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

  // Revalidate shipping server-side (never trust client price). Pickup is priced
  // here, not quoted: a token the client could swap must never be what decides
  // that a counter order costs nothing.
  let shippingCost: number;
  let shippingService: string;
  let shippingServiceId: string;
  let shippingDays: number | null;
  let shippingAddress: ShippingAddressInput;

  if (isPickup) {
    shippingCost = 0;
    shippingService = PICKUP_SERVICE_LABEL;
    shippingServiceId = PICKUP_SERVICE_ID;
    shippingDays = null;
    shippingAddress = buildPickupAddress(input.customer.name.trim());
  } else {
    const shipOpt = pickOptionFromQuote(
      input.shipping!.quoteToken,
      input.shipping!.serviceId,
      input.items,
      cep
    );
    shippingCost = round2(shipOpt.price);
    shippingService = shipOpt.service || shipOpt.name;
    shippingServiceId = shipOpt.id;
    shippingDays = shipOpt.days;
    shippingAddress = {
      cep,
      street: addr!.street.trim(),
      number: addr!.number.trim(),
      complement: addr!.complement?.trim() || undefined,
      neighborhood: addr!.neighborhood.trim(),
      city: addr!.city.trim(),
      state: addr!.state.trim().toUpperCase().slice(0, 2),
      recipientName: addr!.recipientName?.trim() || input.customer.name,
    };
  }

  // Resolve active membership (for the 10% discount) — never trust the client.
  // Wholesale channel does NOT stack member discount (uses wholesale_25 only).
  // Always persist user_id when authenticated so the customer's order history
  // works even without an active plan.
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
  // Note: shipping quote token was validated against the client cart lines above (input.items).

  // Read outside the transaction: it is a cached settings lookup, and holding
  // a transaction open across it would only lengthen the lock on the products.
  const shopPromo = await getShopPromo();

  const client = await getClient();
  let orderId: string;
  let order: Order;
  /** Set only when a coupon actually paid for this order, so the charge-failure
   *  path knows whether there is a use to hand back. */
  let couponClaimedId: string | null = null;
  let couponDiscountAmount = 0;
  let appliedCoupon: { id: string; code: string; percent: number } | null = null;
  try {
    await client.query('BEGIN');

    // Lock products and validate availability (aggregated qty)
    const ids = [...new Set(aggregatedItems.map((it) => it.productId))];
    const productsResult = await client.query(
      `SELECT id, name, slug, price, cost_price, stock, reserved, active, images,
              wholesale_enabled, wholesale_min_qty,
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
      unitCost: number | null;
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
      let reserved = Number(p.reserved) || 0;
      // Snapshot of the cost at the moment of sale — see migration 022.
      let unitCost: number | null = p.cost_price != null ? parseFloat(p.cost_price) : null;
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
        reserved = Number(v.reserved) || 0;
        // A variant without its own cost inherits the parent's, which is the
        // common case: same piece, different colours, one supplier invoice.
        if (v.cost_price != null) unitCost = parseFloat(v.cost_price);
        variantLabel = v.name;
        variantId = v.id;
        displayName = `${p.name} — ${v.name}`;
        if (Array.isArray(v.images) && v.images.length) image = v.images[0];
      } else if (it.variantId) {
        throw new AppError(400, `Produto "${p.name}" não possui variações.`, 'VARIANT_NOT_ALLOWED');
      }

      const qty = it.quantity;
      // What is free, not what exists: `reserved` is what other pending orders
      // already hold. Selling against raw `stock` is what kept the last unit on
      // offer during the hours it takes to confirm a PIX by hand.
      const available = stock - reserved;
      if (available < qty) {
        throw new AppError(
          409,
          available > 0
            ? `Só restam ${available} de "${displayName}".`
            : `"${displayName}" está sem estoque.`,
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
        unitCost,
      });
    }
    subtotal = round2(subtotal);

    // Judged here and not earlier: `min_subtotal` needs the basket to exist.
    // The read runs on the pool rather than this transaction on purpose — it is
    // advisory. `claimCoupon` below is the binding check.
    const rawCoupon = input.couponCode?.trim();
    if (rawCoupon && !isWholesale) {
      const check = await checkCoupon(rawCoupon, {
        subtotal,
        customerEmail: input.customer.email,
        userId: user?.userId ?? null,
      });
      if (!check.ok) {
        throw new AppError(400, check.message, check.code);
      }
      appliedCoupon = {
        id: check.coupon.id,
        code: check.coupon.code,
        percent: check.coupon.percent,
      };
    }

    // Discounts. Exactly one is applied, ever.
    //
    // Wholesale replaces the whole set with its own 25%; that channel never
    // sees a coupon or the online promotion. On retail, the member discount,
    // the online promotion and the coupon are candidates and the **largest
    // one wins** — the customer pays the best price on offer and the order
    // still explains itself with one short `discount_reason`.
    let baseDiscount: number;
    let baseReason: string | null;

    if (isWholesale) {
      baseDiscount = round2(subtotal * WHOLESALE_SHOP_DISCOUNT);
      baseReason = baseDiscount > 0 ? 'wholesale_25' : null;
    } else {
      const best = pickBestDiscount(
        retailDiscountCandidates({
          isMember: memberId != null,
          promo: shopPromo,
          couponPercent: appliedCoupon?.percent ?? null,
          couponCode: appliedCoupon?.code ?? null,
        })
      );
      baseDiscount = best ? round2(subtotal * (best.percent / 100)) : 0;
      baseReason = best && baseDiscount > 0 ? best.reason : null;

      // The coupon only gets taken when it is the one that actually paid.
      // Burning a use for a code that lost to the member discount would spend
      // a single-use coupon on nothing.
      if (appliedCoupon && baseReason === couponReason(appliedCoupon.code)) {
        const claimed = await claimCoupon(client, appliedCoupon.id);
        if (!claimed) {
          throw new AppError(
            409,
            'Este cupom acabou de esgotar. Remova o cupom e tente de novo.',
            'COUPON_EXHAUSTED'
          );
        }
        couponClaimedId = appliedCoupon.id;
        couponDiscountAmount = baseDiscount;
      }
    }
    const goodsAfterDiscount = round2(subtotal - baseDiscount);
    // Provisional total without store credit (shipping never discounted).
    let discount = baseDiscount;
    let discountReason: string | null = baseReason;
    let storeCreditApplied = 0;
    let total = round2(subtotal - discount + shippingCost);

    const orderResult = await client.query(
      `INSERT INTO orders (
         member_id, user_id, customer_name, customer_email, customer_phone, shipping_address,
         subtotal, discount, discount_reason, shipping_cost, shipping_service, shipping_service_id,
         shipping_days, store_credit_applied, total, status, payment_method,
         channel, customer_cnpj, wholesale_account_id, customer_note, delivery_method
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending', $16,
               $17, $18, $19, $20, $21)
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
        input.customerNote?.trim() ? input.customerNote.trim().slice(0, 500) : null,
        deliveryMethod,
      ]
    );
    order = mapOrder(orderResult.rows[0]);
    orderId = order.id;

    // The use was already taken above; this is the row that says who took it,
    // and it is what a per-customer limit counts.
    if (couponClaimedId) {
      await recordRedemption(client, {
        couponId: couponClaimedId,
        orderId,
        userId: user?.userId ?? null,
        customerEmail: input.customer.email,
        discountAmount: couponDiscountAmount,
      });
    }

    for (const it of itemRows) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_slug, unit_price, quantity, line_total, image_url, variant_id, variant_label, unit_cost)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
          it.unitCost,
        ]
      );
    }

    // Hold the stock now that the lines exist. Same transaction as the INSERT:
    // the order and its hold are born together, or neither is born.
    await reserveStockForOrder(client, orderId);

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
    // A zero total has two very different causes, and only one is a sale.
    //
    // Store credit caps at the goods, so credit + pickup can legitimately leave
    // nothing to charge. That order is already settled: a QR for R$ 0,00 is
    // unpayable and `buildOrderPix` refuses to rebuild it, so it used to sit
    // `pending` forever with the credit already spent.
    //
    // Zero with no credit means the goods themselves are priced at R$ 0,00 —
    // a cataloguing mistake, not a giveaway. Seven such products were live on
    // 23/08/2026 with 47 units in stock. Settling those would hand them out for
    // free; refuse instead, and the compensation below restores everything.
    if (order.total <= 0) {
      if ((order.storeCreditApplied ?? 0) > 0) {
        // Credit requires an account, so there is always an actor here.
        const paid = await confirmPixOrder(orderId, orderUserId ?? '');
        await auditLog('order.created', orderUserId, {
          orderId,
          orderNumber: paid.orderNumber,
          total: paid.total,
          storeCreditApplied: paid.storeCreditApplied,
          paymentMethod: 'store_credit',
        });
        return { order: paid };
      }
      throw new AppError(
        400,
        'Este pedido ficou com total R$ 0,00. Um dos itens está sem preço — fale com a loja antes de finalizar.',
        'ZERO_TOTAL_NO_CREDIT'
      );
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

    notifyAdminOfPendingPix(order, txId);
    notifyCustomerOfPendingPix(order, pixData);

    return { order, pixData };
  } catch (err) {
    // Compensate: cancel pending order and restore any store credit.
    await query(
      `UPDATE orders SET status = 'cancelled' WHERE id = $1 AND status = 'pending'`,
      [orderId]
    ).catch(() => {});
    // The hold was committed with the order; the charge failed afterwards.
    // Without this, stock would stay locked until the TTL over a sale that
    // never existed.
    await releaseReservationById(orderId).catch((e) =>
      console.error('[order] release reservation after charge fail', e)
    );
    await restoreCreditForOrder(orderId, {
      note: 'Crédito devolvido (falha ao criar cobrança)',
    }).catch((e) => console.error('[order] credit restore after charge fail', e));
    // The use was taken inside the committed transaction, so a charge that
    // never came into being would otherwise burn a single-use coupon on an
    // order the customer never got to pay.
    if (couponClaimedId) {
      await releaseCoupon(couponClaimedId).catch((e) =>
        console.error('[order] coupon release after charge fail', e)
      );
    }
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

/** EMV rebuilt from the stored `pix_txid`: same code as checkout, same statement line. */
export function buildOrderPix(order: Order): PixQRData | null {
  if (!PIX_KEY) return null;
  if (order.status !== 'pending') return null;
  if (order.paymentMethod && order.paymentMethod !== 'pix') return null;
  if (!order.pixTxid) return null;
  if (order.total <= 0) return null;
  return generatePixEMV({
    pixKey: PIX_KEY,
    amount: order.total,
    merchantName: PIX_MERCHANT_NAME,
    merchantCity: PIX_MERCHANT_CITY,
    txId: order.pixTxid,
  });
}

/**
 * The pending PIX for an order, by its id — public, like the status lookup.
 *
 * The order id is an unguessable UUID and is already the key to the public
 * order page; what comes back is only the payment code (no customer data).
 * Without this the EMV existed nowhere a guest could reach it again.
 */
export async function getPublicOrderPix(
  id: string
): Promise<{ orderNumber: number; total: number; pix: PixQRData } | null> {
  const order = await getOrderById(id, false);
  if (!order) return null;
  const pix = buildOrderPix(order);
  if (!pix) return null;
  return { orderNumber: order.orderNumber, total: order.total, pix };
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

/**
 * Adopts guest orders left by the same person before they had an account.
 *
 * Guest checkout is allowed (`optionalAuth` on POST /orders), so those orders
 * are stored with `user_id = NULL` and the customer's e-mail as the only link
 * back to a human. `listMyOrders` filters by `user_id`/`member_id`, so without
 * this step the purchase stays invisible forever — the customer pays, gets the
 * confirmation e-mail, registers with the same address and finds nothing.
 *
 * Matching by e-mail alone is not enough to hand over the data: an order
 * carries the shipping address and phone number, so claiming it for whoever
 * happens to type that e-mail into the signup form would leak someone else's
 * personal data. The account therefore has to have proven it owns the address
 * — `email_verified` — which is why the ownership test lives inside the SQL
 * instead of in the caller.
 *
 * Idempotent, and safe to call on every login: once an order is adopted it no
 * longer matches `user_id IS NULL`. It does bump `orders.updated_at` — the
 * table's BEFORE UPDATE trigger fires on any write and cannot be opted out of
 * — which is why the admin dashboard ages its queues by `status_changed_at`
 * (migration 025) instead: adopting an order is not the order moving.
 *
 * @returns how many orders were adopted.
 */
export async function claimGuestOrders(userId: string): Promise<number> {
  const result = await query(
    `UPDATE orders o
        SET user_id = u.id
       FROM users u
      WHERE u.id = $1
        AND u.email_verified = TRUE
        AND o.user_id IS NULL
        AND lower(o.customer_email) = lower(u.email)`,
    [userId]
  );
  const claimed = result.rowCount ?? 0;
  if (claimed > 0) {
    console.log(`[ORDERS] ${claimed} pedido(s) de convidado vinculados ao usuário ${userId}`);
  }
  return claimed;
}

/**
 * Guest orders waiting on e-mail verification to be adopted.
 *
 * Feeds the notice on the customer's order list: they can see that the purchase
 * was found and what unlocks it, instead of an empty list that reads like the
 * order was lost.
 */
export async function countUnclaimedGuestOrders(userId: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int AS total
       FROM orders o
       JOIN users u ON u.id = $1
      WHERE u.email_verified = FALSE
        AND o.user_id IS NULL
        AND lower(o.customer_email) = lower(u.email)`,
    [userId]
  );
  return (result.rows[0]?.total as number) ?? 0;
}

/** Customer order history — by user_id (preferred) or legacy member_id. */
export async function listMyOrders(
  userId: string,
  opts: { statuses?: string[]; page?: number; limit?: number } = {}
) {
  // Adopt any guest order this account is entitled to before reading the list,
  // so a purchase made before signing up shows up on the first visit — and so
  // accounts verified before this shipped are healed without a manual UPDATE.
  // Never fatal: an order that stays orphaned is a support ticket, but an
  // exception here would take the whole order history down with it.
  await claimGuestOrders(userId).catch((err) =>
    console.error('[ORDERS] claimGuestOrders falhou em listMyOrders:', err)
  );

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

  const unclaimedGuestOrders = await countUnclaimedGuestOrders(userId);

  return { orders, total: count.rows[0].total as number, page, limit, unclaimedGuestOrders };
}

/** Statuses a customer may cancel without an admin or a refund. */
const CUSTOMER_CANCELLABLE = ['pending'];

/**
 * Customer-initiated cancellation of their own order.
 *
 * Restricted to `pending` because that is the only state where nothing has to
 * be undone outside our database: no payment was captured and stock is only
 * decremented on confirmation. Anything already paid needs a real refund
 * through Stripe, which stays an admin action.
 *
 * Ownership is enforced in the WHERE clause rather than by reading the order
 * first, so a guessed id cannot cancel someone else's purchase.
 */
export async function cancelMyOrder(userId: string, orderId: string): Promise<Order> {
  const memberId = await getMemberIdForUser(userId);
  const existing = await query(
    `SELECT * FROM orders
     WHERE id = $1 AND (user_id = $2 OR ($3::uuid IS NOT NULL AND member_id = $3))`,
    [orderId, userId, memberId]
  );
  if (existing.rows.length === 0) {
    throw new AppError(404, 'Pedido não encontrado.', 'ORDER_NOT_FOUND');
  }

  const current = mapOrder(existing.rows[0]);
  if (current.status === 'cancelled') return current;

  if (!CUSTOMER_CANCELLABLE.includes(current.status)) {
    throw new AppError(
      409,
      'Este pedido já foi pago e não pode ser cancelado por aqui. Fale com a gente para pedir o reembolso.',
      'ORDER_NOT_CANCELLABLE'
    );
  }

  // Conditioned on the status so two clicks, or a race with an admin, cannot
  // cancel twice and restore credit twice.
  const result = await query(
    `UPDATE orders SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [orderId]
  );
  if (result.rows.length === 0) {
    throw new AppError(409, 'O pedido mudou de status. Recarregue a página.', 'ORDER_NOT_CANCELLABLE');
  }

  const order = mapOrder(result.rows[0]);

  // Give the units back to the storefront. Only pending orders reach this
  // point, so the hold never became a decrement: there is no stock to restore,
  // there is a hold to release.
  await releaseReservationById(orderId).catch((err) =>
    console.error('[order] release reservation after customer cancel', err)
  );

  if ((order.storeCreditApplied ?? 0) > 0) {
    const restored = await restoreCreditForOrder(orderId, {
      note: 'Crédito devolvido (pedido cancelado pelo cliente)',
    });
    if (restored > 0) {
      await auditLog('order.credit_restored', userId, { orderId, amount: restored, status: 'cancelled' });
    }
  }

  await auditLog('order.cancelled_by_customer', userId, {
    orderId,
    orderNumber: order.orderNumber,
    total: order.total,
  });

  notifyAdminOfCustomerCancellation(order);
  return order;
}

/** Non-blocking, for the same reason as the pending-PIX notice. */
function notifyAdminOfCustomerCancellation(order: Order): void {
  try {
    void sendTemplateEmail({
      template: 'admin-order-cancelled',
      to: env.ADMIN_EMAIL,
      variables: {
        order_number: String(order.orderNumber),
        customer_name: order.customerName,
        customer_email: order.customerEmail,
        total: order.total.toFixed(2).replace('.', ','),
        admin_url: adminUrl('/admin?tab=orders'),
      },
    }).catch((err) => console.error('[order] admin-order-cancelled failed', err));
  } catch (err) {
    console.error('[order] admin-order-cancelled skipped', err);
  }
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
  order.pixData = buildOrderPix(order) ?? undefined;
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
  // A pickup order has no shipment to track. Letting a code through here would
  // e-mail the customer a Correios link for a package sitting on the counter.
  const existing = await getOrderById(id, false);
  if (!existing) throw new AppError(404, 'Pedido não encontrado.', 'ORDER_NOT_FOUND');
  if (existing.deliveryMethod === 'pickup') {
    throw new AppError(
      400,
      'Pedido de retirada na loja não tem rastreio. Marque como "pronto para retirada".',
      'PICKUP_HAS_NO_TRACKING'
    );
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

  // Compare-and-swap on the status we just read. Without it, two clicks in the
  // panel both saw `prev.status = 'paid'`, both computed `closing &&
  // hadStockDecremented`, and both restocked — `restoreStockForOrder` is the
  // one stock operation with no idempotency guard of its own (credit has a
  // unique index, the hold has the `stock_reserved` flag). Losing the race is
  // not an error: the other writer already did the work.
  const result = await query(
    `UPDATE orders SET status = $1 WHERE id = $2 AND status = $3 RETURNING *`,
    [status, id, prev.status]
  );
  if (result.rows.length === 0) {
    const current = await getOrderById(id, false);
    if (!current) throw new AppError(404, 'Pedido não encontrado.', 'ORDER_NOT_FOUND');
    if (current.status === status) return current;
    throw new AppError(
      409,
      `O pedido mudou para "${current.status}" enquanto você editava. Recarregue e tente de novo.`,
      'ORDER_STATUS_CONFLICT'
    );
  }
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

  // An unpaid order has no stock to restore, it has a hold to release; a paid
  // one has no hold (it became a decrement on confirmation). Calling this
  // unconditionally is safe: the `stock_reserved` flag decides which case it is.
  if (closing) {
    await releaseReservationById(id).catch((err) =>
      console.error('[order] release reservation on status change', err)
    );
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

  // For pickup, "shipped" is the panel's way of saying the order is bagged and
  // waiting at the counter — the customer has no tracking to watch, so this
  // e-mail is the only thing that tells them they can come get it.
  if (order.deliveryMethod === 'pickup' && status === 'shipped' && prev.status !== 'shipped') {
    notifyPickupReady(order);
  }

  await auditLog('order.status_changed', actorUserId, {
    orderId: id,
    from: prev.status,
    status,
  });
  return order;
}

/** Non-blocking "your order is waiting at the counter" notice. */
function notifyPickupReady(order: Order): void {
  sendTemplateEmail({
    template: 'order-ready-for-pickup',
    to: order.customerEmail,
    variables: {
      name: order.customerName,
      order_number: String(order.orderNumber),
      order_id: order.id,
      store_address: formatPickupAddress(),
      store_hours: STORE_PICKUP_LOCATION.hours,
    },
  }).catch((err) => console.error('[email] order-ready-for-pickup failed', err));
}

export function formatPickupAddress(): string {
  const l = STORE_PICKUP_LOCATION;
  return `${l.street}, ${l.number}, ${l.complement} — ${l.neighborhood}, ${l.city}/${l.state}`;
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
        order_id: order.id,
        delivery_method: order.deliveryMethod,
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
  const hadStock = ['paid', 'processing', 'shipped', 'delivered'].includes(order.status);

  // Claim the order BEFORE calling Stripe. The other order lost money quietly:
  // if the UPDATE failed after `refunds.create` succeeded, the cash was gone and
  // the order stayed `paid` — still counted as revenue — while a retry hit
  // `charge_already_refunded` and 500'd forever.
  const result = await query(
    `UPDATE orders SET status = 'refunded' WHERE id = $1 AND status <> 'refunded' RETURNING *`,
    [id]
  );
  if (result.rows.length === 0) {
    throw new AppError(409, 'Pedido já reembolsado.', 'ORDER_ALREADY_REFUNDED');
  }

  const stripe = getStripe();
  try {
    // Same key for the same order: a retry after a network blip reuses the
    // original refund instead of issuing a second one.
    await stripe.refunds.create(
      { payment_intent: order.stripePaymentIntentId },
      { idempotencyKey: `refund_${id}` }
    );
  } catch (err) {
    // Put the order back the way it was, so the panel still shows the truth.
    await query(`UPDATE orders SET status = $1 WHERE id = $2 AND status = 'refunded'`, [
      order.status,
      id,
    ]).catch((e) => console.error('[order] failed to revert status after refund error', e));
    await auditLog('order.refund_failed', actorUserId, {
      orderId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
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

/**
 * Hold the units of a freshly created order.
 *
 * Called inside the create transaction, after the items exist and while the
 * product/variant rows are still locked `FOR UPDATE` — so the availability that
 * was just validated is the availability being consumed.
 *
 * The TTL exists because the hold has to expire on its own: PIX has no webhook,
 * so an order nobody ever pays would otherwise sit on the last unit forever.
 */
export async function reserveStockForOrder(client: pg.PoolClient, orderId: string): Promise<void> {
  await client.query(
    `UPDATE products p SET reserved = p.reserved + oi.quantity
     FROM order_items oi
     WHERE oi.order_id = $1 AND oi.product_id = p.id AND oi.variant_id IS NULL`,
    [orderId]
  );
  await client.query(
    `UPDATE product_variants v SET reserved = v.reserved + oi.quantity
     FROM order_items oi
     WHERE oi.order_id = $1 AND oi.variant_id = v.id`,
    [orderId]
  );
  await syncParentReservedFromVariants(client, orderId);
  await client.query(
    `UPDATE orders
     SET stock_reserved = TRUE,
         reservation_expires_at = NOW() + ($2::int * INTERVAL '1 hour')
     WHERE id = $1`,
    [orderId, STOCK_RESERVATION_TTL_HOURS]
  );
}

/**
 * Give the held units back.
 *
 * Guarded by `orders.stock_reserved`, flipped in the same statement that claims
 * it: a double cancel, or a cancel racing the TTL sweep, releases once. Without
 * that guard the second release would subtract from `reserved` units that
 * belong to somebody else's pending order.
 *
 * Returns whether this call was the one that released it.
 */
export async function releaseReservation(client: pg.PoolClient, orderId: string): Promise<boolean> {
  const claimed = await client.query(
    `UPDATE orders SET stock_reserved = FALSE, reservation_expires_at = NULL
     WHERE id = $1 AND stock_reserved = TRUE
     RETURNING id`,
    [orderId]
  );
  if (claimed.rows.length === 0) return false;

  // The clamp here is honest, unlike the one on `stock`: nothing is being
  // hidden, the flag above already guarantees a single release, and `reserved`
  // has its own `>= 0` constraint to respect.
  await client.query(
    `UPDATE products p SET reserved = GREATEST(0, p.reserved - oi.quantity)
     FROM order_items oi
     WHERE oi.order_id = $1 AND oi.product_id = p.id AND oi.variant_id IS NULL`,
    [orderId]
  );
  await client.query(
    `UPDATE product_variants v SET reserved = GREATEST(0, v.reserved - oi.quantity)
     FROM order_items oi
     WHERE oi.order_id = $1 AND oi.variant_id = v.id`,
    [orderId]
  );
  await syncParentReservedFromVariants(client, orderId);
  return true;
}

/** Same release, for callers that are not already inside a transaction. */
export async function releaseReservationById(orderId: string): Promise<boolean> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const released = await releaseReservation(client, orderId);
    await client.query('COMMIT');
    return released;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Decrement product/variant stock for every item in an order. Shared by webhook + PIX confirm. */
export async function decrementStockForOrder(client: pg.PoolClient, orderId: string): Promise<void> {
  // Turn the hold into a real decrement. Releasing first is what keeps the two
  // counters from double-counting the same units: they stop being reserved at
  // the same moment they stop being in stock.
  await releaseReservation(client, orderId);

  // Measured before the UPDATE, because the UPDATE cannot tell us. `stock` has
  // a `>= 0` constraint, so the decrement has to clamp or the whole webhook
  // transaction dies — but clamping quietly is exactly what hid every oversale
  // until now. With reservations in place this should return nothing; when it
  // does return something, that is a real oversale and it gets a paper trail.
  const shortfall = await client.query(
    `SELECT oi.product_id, oi.variant_id, oi.product_name, oi.quantity,
            COALESCE(v.stock, p.stock) AS on_hand
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN product_variants v ON v.id = oi.variant_id
     WHERE oi.order_id = $1
       AND oi.product_id IS NOT NULL
       AND oi.quantity > COALESCE(v.stock, p.stock)`,
    [orderId]
  );

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
  // Admin history: same transaction, so it rolls back with the decrement.
  await recordOrderMovements(client, orderId, -1);

  for (const row of shortfall.rows) {
    const missing = Number(row.quantity) - Number(row.on_hand);
    // Lands in the same stock history the admin already reads, next to the
    // sale it belongs to — an oversale that only existed in the difference
    // between two numbers is now a line someone can see.
    await recordMovement(client, {
      productId: row.product_id,
      variantId: row.variant_id ?? null,
      orderId,
      kind: 'adjustment',
      quantity: -missing,
      stockAfter: 0,
      note: `Venda a descoberto: ${missing} unidade(s) vendida(s) sem estoque`,
    });
    console.error(
      `[stock] oversold order=${orderId} product="${row.product_name}" missing=${missing}`
    );
  }
  if (shortfall.rows.length > 0) {
    await auditLog('order.oversold', null, {
      orderId,
      lines: shortfall.rows.map((r) => ({
        productId: r.product_id,
        variantId: r.variant_id ?? null,
        productName: r.product_name,
        ordered: Number(r.quantity),
        onHand: Number(r.on_hand),
      })),
    });
  }
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

/** Parent `reserved` mirrors the sum of its variants, exactly as `stock` does. */
async function syncParentReservedFromVariants(client: pg.PoolClient, orderId: string): Promise<void> {
  await client.query(
    `UPDATE products p SET reserved = COALESCE((
       SELECT SUM(v.reserved)::int FROM product_variants v
       WHERE v.product_id = p.id AND v.active = TRUE
     ), p.reserved)
     WHERE p.has_variants = TRUE
       AND p.id IN (SELECT product_id FROM order_items WHERE order_id = $1 AND product_id IS NOT NULL)`,
    [orderId]
  );
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
