/**
 * Shipping labels — buying and printing through Melhor Envio.
 *
 * Until now the panel only recorded a tracking code somebody had typed: the
 * shop bought the label on melhorenvio.com.br and pasted the number back. This
 * closes that loop.
 *
 * Melhor Envio's flow is four calls, and each one is a separate state the order
 * can be left in — which is why every step is stored as it completes rather
 * than at the end:
 *
 *   1. `POST /me/cart`               → an item in the cart      (`cart_id`)
 *   2. `POST /me/shipment/checkout`  → **money leaves**, label bought
 *   3. `POST /me/shipment/generate`  → the label becomes printable
 *   4. `POST /me/shipment/print`     → a PDF URL
 *
 * The dangerous one is step 2. If the process died after checkout without us
 * recording the id, the shop would have paid for a label it could never find —
 * so `melhor_envio_order_id` is written the moment the cart item exists, before
 * anything is bought, and every later step is resumable from it.
 */

import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import { auditLog } from '../utils/audit.js';
import { getAccessToken, melhorEnvioBaseUrl } from './melhor-envio-oauth.service.js';
import {
  STORE_PICKUP_LOCATION,
  buildPackageFromItems,
  normalizeCep,
  trackingUrlForCode,
} from './shipping.service.js';
import { getOrderById } from './order.service.js';
import type { Order } from '../types/index.js';

const USER_AGENT = 'GeekPopToys Loja (contato@geeketoys.com.br)';
const TIMEOUT_MS = 20_000;

export interface LabelState {
  /** Melhor Envio order id — exists from the moment the cart item is created. */
  melhorEnvioOrderId: string | null;
  /** Set once the label has been paid for. */
  purchased: boolean;
  /** Set once it is generated and therefore printable. */
  generated: boolean;
  trackingCode: string | null;
  /** Short-lived URL to the PDF; fetched on demand, never stored. */
  printUrl?: string;
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

/**
 * A call to Melhor Envio, with the token and the error shape in one place.
 *
 * The 401/403 case is worth its own message: it almost always means the token
 * was authorised for quoting only (`shipping-calculate`), which is how this
 * integration started. Telling the shop "sem permissão" and pointing at the
 * re-authorisation is far more useful than surfacing a raw 403.
 */
async function meRequest<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new AppError(
      503,
      'Melhor Envio não está conectado. Autorize a integração em Configurações.',
      'MELHOR_ENVIO_NOT_CONNECTED',
    );
  }

  let res: Response;
  try {
    res = await fetch(`${melhorEnvioBaseUrl()}/api/v2${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': USER_AGENT,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new AppError(
      504,
      'Não conseguimos falar com o Melhor Envio. Tente novamente em instantes.',
      'MELHOR_ENVIO_UNREACHABLE',
      { cause: (err as Error).message } as Record<string, unknown>,
    );
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }

  if (!res.ok) {
    console.error(`[LABEL] ${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);

    if (res.status === 401 || res.status === 403) {
      throw new AppError(
        403,
        'O token do Melhor Envio não tem permissão para comprar e imprimir etiqueta. ' +
          'Reautorize a integração em Configurações — é um clique, na conta da loja.',
        'MELHOR_ENVIO_SCOPE_MISSING',
      );
    }

    const message =
      (parsed as { message?: string } | null)?.message ??
      (parsed as { error?: string } | null)?.error ??
      `HTTP ${res.status}`;
    throw new AppError(
      502,
      `Melhor Envio recusou: ${message}`,
      'MELHOR_ENVIO_ERROR',
      parsed as Record<string, unknown> | undefined,
    );
  }

  return parsed as T;
}

// ─── Payload ─────────────────────────────────────────────────────────────────

/** Split "Rua X, 123" style data the way Melhor Envio wants it. */
function addressOf(order: Order) {
  const addr = (order.shippingAddress ?? {}) as Record<string, string>;
  return {
    name: (addr.recipientName || order.customerName || '').slice(0, 60),
    phone: order.customerPhone ?? '',
    email: order.customerEmail,
    document: order.customerDocument ?? '',
    address: addr.street ?? '',
    complement: addr.complement ?? '',
    number: addr.number ?? '',
    district: addr.neighborhood ?? '',
    city: addr.city ?? '',
    state_abbr: (addr.state ?? '').toUpperCase().slice(0, 2),
    country_id: 'BR',
    postal_code: normalizeCep(addr.cep ?? ''),
  };
}

/**
 * The shop, as the sender.
 *
 * `SHIPPING_ORIGIN_CEP` is what the quote used, so the label has to leave from
 * the same place — a label bought from a different origin is priced wrong and
 * the Correios refuse it at the counter.
 */
function senderPayload() {
  return {
    name: STORE_PICKUP_LOCATION.name,
    phone: '',
    email: env.FROM_EMAIL.replace(/.*<|>.*/g, '') || 'contato@geeketoys.com.br',
    document: '',
    address: STORE_PICKUP_LOCATION.street,
    complement: STORE_PICKUP_LOCATION.complement,
    number: STORE_PICKUP_LOCATION.number,
    district: STORE_PICKUP_LOCATION.neighborhood,
    city: STORE_PICKUP_LOCATION.city,
    state_abbr: STORE_PICKUP_LOCATION.state,
    country_id: 'BR',
    postal_code: env.SHIPPING_ORIGIN_CEP || STORE_PICKUP_LOCATION.cep,
  };
}

/**
 * What is in the box, declared for insurance and for the customs-style form.
 *
 * The declared value is the **goods**, not the order total: insuring the
 * shipping cost back to ourselves makes no sense, and a discounted order should
 * not be insured for the undiscounted price.
 */
function productsPayload(order: Order) {
  return (order.items ?? []).map((it) => ({
    name: it.productName.slice(0, 60),
    quantity: it.quantity,
    unitary_value: it.unitPrice,
  }));
}

function declaredValue(order: Order): number {
  const goods = (order.items ?? []).reduce((sum, it) => sum + it.lineTotal, 0);
  return Math.max(1, Math.round(goods * 100) / 100);
}

// ─── Guards ──────────────────────────────────────────────────────────────────

/**
 * An order fit to be shipped.
 *
 * Buying a label for an unpaid order spends real money on a sale that may never
 * happen, and pickup orders have no journey to buy — the customer collects.
 */
async function loadShippableOrder(orderId: string): Promise<Order> {
  const order = await getOrderById(orderId, true);
  if (!order) throw new AppError(404, 'Pedido não encontrado.', 'ORDER_NOT_FOUND');

  if (order.deliveryMethod === 'pickup') {
    throw new AppError(
      400,
      'Pedido de retirada na loja não tem etiqueta — o cliente busca no balcão.',
      'ORDER_IS_PICKUP',
    );
  }
  if (!['paid', 'processing', 'shipped'].includes(order.status)) {
    throw new AppError(
      409,
      `Só um pedido pago gera etiqueta (status atual: ${order.status}).`,
      'ORDER_NOT_PAID',
    );
  }
  if (!order.shippingServiceId) {
    throw new AppError(
      400,
      'Pedido sem serviço de frete escolhido — não dá para saber qual etiqueta comprar.',
      'ORDER_NO_SERVICE',
    );
  }
  const addr = (order.shippingAddress ?? {}) as Record<string, string>;
  if (normalizeCep(addr.cep ?? '').length !== 8) {
    throw new AppError(400, 'Pedido sem CEP de entrega válido.', 'ORDER_NO_CEP');
  }
  return order;
}

// ─── Steps ───────────────────────────────────────────────────────────────────

/**
 * Put the shipment in the cart, and remember it before spending anything.
 *
 * The id is written first on purpose: everything after this costs money, and a
 * crash between paying and recording would leave the shop with a label it
 * cannot find. Reused when it already exists, so a retry never buys twice.
 */
async function ensureCartItem(order: Order): Promise<string> {
  if (order.melhorEnvioOrderId) return order.melhorEnvioOrderId;

  // A line whose product was deleted keeps its name and price on the order but
  // has no `product_id`, so there is nothing to weigh. Refusing is the honest
  // answer: guessing a parcel size buys a label the Correios may reject at the
  // counter, and quietly dropping the line understates the box.
  const lines = order.items ?? [];
  const weighable = lines.filter((it) => it.productId);
  if (weighable.length !== lines.length) {
    throw new AppError(
      409,
      'Um item deste pedido não existe mais no catálogo, então não dá para calcular o pacote. ' +
        'Compre a etiqueta pelo site do Melhor Envio e cole o rastreio aqui.',
      'ORDER_ITEM_MISSING_PRODUCT',
    );
  }
  const pkg = await buildPackageFromItems(
    weighable.map((it) => ({ productId: it.productId as string, quantity: it.quantity })),
  );

  const created = await meRequest<{ id: string }>('/me/cart', {
    service: Number(order.shippingServiceId),
    from: senderPayload(),
    to: addressOf(order),
    products: productsPayload(order),
    volumes: [
      {
        height: pkg.heightCm,
        width: pkg.widthCm,
        length: pkg.lengthCm,
        weight: Math.max(0.1, pkg.weightG / 1000),
      },
    ],
    options: {
      insurance_value: declaredValue(order),
      receipt: false,
      own_hand: false,
      reverse: false,
      non_commercial: true,
      invoice: { number: String(order.orderNumber) },
    },
  });

  if (!created?.id) {
    throw new AppError(502, 'Melhor Envio não devolveu o id do envio.', 'MELHOR_ENVIO_NO_ID');
  }

  await query(`UPDATE orders SET melhor_envio_order_id = $1 WHERE id = $2`, [created.id, order.id]);
  order.melhorEnvioOrderId = created.id;

  await auditLog('order.label_cart_created', null, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    melhorEnvioOrderId: created.id,
  });

  return created.id;
}

/** Read one shipment back, to know which steps are already done. */
async function fetchShipment(meOrderId: string) {
  return meRequest<{
    id: string;
    status?: string;
    tracking?: string | null;
    self_tracking?: string | null;
    protocol?: string | null;
    generated_at?: string | null;
    paid_at?: string | null;
  }>(`/me/orders/${meOrderId}`, undefined, 'GET');
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Where the label for this order stands, asked of Melhor Envio.
 *
 * Read-only and cheap, so the panel can show the real state rather than
 * guessing from our own columns — which only say whether we ever started.
 */
export async function getLabelState(orderId: string): Promise<LabelState> {
  const order = await getOrderById(orderId, false);
  if (!order) throw new AppError(404, 'Pedido não encontrado.', 'ORDER_NOT_FOUND');

  if (!order.melhorEnvioOrderId) {
    return {
      melhorEnvioOrderId: null,
      purchased: false,
      generated: false,
      trackingCode: order.trackingCode ?? null,
    };
  }

  try {
    const shipment = await fetchShipment(order.melhorEnvioOrderId);
    return {
      melhorEnvioOrderId: order.melhorEnvioOrderId,
      purchased: Boolean(shipment.paid_at),
      generated: Boolean(shipment.generated_at),
      trackingCode: shipment.tracking ?? order.trackingCode ?? null,
    };
  } catch (err) {
    // The panel must still render if Melhor Envio is having a bad minute.
    console.error('[LABEL] status lookup failed:', err);
    return {
      melhorEnvioOrderId: order.melhorEnvioOrderId,
      purchased: false,
      generated: false,
      trackingCode: order.trackingCode ?? null,
    };
  }
}

/**
 * Buy, generate and print the label for an order, in one action.
 *
 * Deliberately one button rather than four: the shop wants a PDF, not a
 * four-step workflow in which any step can be forgotten halfway. Each step is
 * skipped when Melhor Envio says it is already done, so pressing it twice is
 * safe and a partial failure is resumable.
 *
 * Records the tracking code on the order when it appears, which is what marks
 * the order `shipped` and e-mails the customer — the same path a manually typed
 * code takes.
 */
export async function buyAndPrintLabel(
  orderId: string,
  actorUserId: string,
): Promise<LabelState> {
  const order = await loadShippableOrder(orderId);

  // Claim the order first. Without it, two clicks a second apart both read
  // `melhor_envio_order_id` as null, both create a cart item and both reach
  // checkout — two labels, two debits from the shop's Melhor Envio balance.
  // The claim expires so a process that dies mid-purchase does not lock the
  // order forever; three minutes covers the four calls comfortably.
  const claim = await query(
    `UPDATE orders
        SET label_purchase_started_at = NOW()
      WHERE id = $1
        AND (label_purchase_started_at IS NULL
             OR label_purchase_started_at < NOW() - INTERVAL '3 minutes')
      RETURNING id`,
    [order.id],
  );
  if (claim.rows.length === 0) {
    throw new AppError(
      409,
      'Já existe uma compra de etiqueta em andamento para este pedido. Aguarde alguns segundos.',
      'LABEL_PURCHASE_IN_FLIGHT',
    );
  }

  try {
    return await runLabelPurchase(order, actorUserId);
  } catch (err) {
    // Release on failure so the shop can correct and retry immediately —
    // except when the money may already have left, where the claim expiring on
    // its own is the safer default.
    const code = (err as { code?: string }).code;
    if (code !== 'MELHOR_ENVIO_UNREACHABLE') {
      await query(`UPDATE orders SET label_purchase_started_at = NULL WHERE id = $1`, [
        order.id,
      ]).catch(() => {});
    }
    throw err;
  }
}

async function runLabelPurchase(order: Order, actorUserId: string): Promise<LabelState> {
  const meOrderId = await ensureCartItem(order);

  let shipment = await fetchShipment(meOrderId);

  // 2. Checkout — this is the step that spends money.
  if (!shipment.paid_at) {
    await meRequest('/me/shipment/checkout', { orders: [meOrderId] });
    await auditLog('order.label_purchased', actorUserId, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      melhorEnvioOrderId: meOrderId,
    });
    shipment = await fetchShipment(meOrderId);
  }

  // 3. Generate — turns the paid shipment into a printable label.
  if (!shipment.generated_at) {
    await meRequest('/me/shipment/generate', { orders: [meOrderId] });
    shipment = await fetchShipment(meOrderId);
  }

  // 4. Print — a short-lived URL, never stored.
  const printed = await meRequest<{ url?: string }>('/me/shipment/print', {
    mode: 'private',
    orders: [meOrderId],
  });

  const tracking = shipment.tracking ?? null;
  if (tracking && tracking !== order.trackingCode) {
    // Same write the manual field does, so the customer gets the same e-mail
    // and the order moves to `shipped` exactly as before.
    await query(
      `UPDATE orders
          SET tracking_code = $1, tracking_url = $2,
              status = CASE WHEN status IN ('paid','processing') THEN 'shipped' ELSE status END
        WHERE id = $3`,
      [tracking, trackingUrlForCode(tracking), order.id],
    );
    await auditLog('order.tracking_set', actorUserId, {
      orderId: order.id,
      trackingCode: tracking,
      source: 'melhor_envio',
    });
  }

  return {
    melhorEnvioOrderId: meOrderId,
    purchased: true,
    generated: true,
    trackingCode: tracking,
    printUrl: printed?.url,
  };
}

/**
 * The print URL for a label that was already bought and generated.
 *
 * Separate from buying because the URL expires: the shop reprints a lost label
 * without touching money.
 */
export async function reprintLabel(orderId: string): Promise<{ printUrl: string }> {
  const order = await getOrderById(orderId, false);
  if (!order?.melhorEnvioOrderId) {
    throw new AppError(
      404,
      'Este pedido ainda não tem etiqueta comprada.',
      'LABEL_NOT_PURCHASED',
    );
  }

  const printed = await meRequest<{ url?: string }>('/me/shipment/print', {
    mode: 'private',
    orders: [order.melhorEnvioOrderId],
  });

  if (!printed?.url) {
    throw new AppError(502, 'Melhor Envio não devolveu o PDF da etiqueta.', 'LABEL_NO_URL');
  }
  return { printUrl: printed.url };
}
