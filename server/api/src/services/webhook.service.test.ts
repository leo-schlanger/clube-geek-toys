import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

/**
 * Stripe webhook processing — the door captured money comes through.
 *
 * What these protect, ordered by what a regression costs:
 *
 *  1. A declined card does **not** end the order. Stripe fires
 *     `payment_failed` on every refused attempt, and the checkout form reuses
 *     the same PaymentIntent — cancelling here meant the customer's second card
 *     was charged against a dead order that `handleShopOrderPaid` then skipped
 *     in silence.
 *  2. Captured money always lands on the order, even one already cancelled.
 *  3. A refund or a chargeback raised in the Stripe Dashboard reaches the
 *     database instead of leaving the order `paid` and counted as revenue.
 *  4. A recurring invoice is mirrored into `payments`, the only table the
 *     reports read, and never extends a member from a NULL or stale expiry.
 *  5. The idempotency claim shares the transaction with the effects, so a
 *     failure must ROLLBACK **and rethrow** — the route answers 500 and Stripe
 *     re-delivers. Answering 200 threw the payment away.
 *  6. E-mails and credit restores happen after COMMIT, and one failing does not
 *     take the request down.
 */

const {
  clientQueryMock,
  releaseMock,
  auditMock,
  sendEmailMock,
  decrementStockMock,
  restoreStockMock,
  releaseReservationMock,
  restoreCreditMock,
} = vi.hoisted(() => ({
  clientQueryMock: vi.fn(),
  releaseMock: vi.fn(),
  auditMock: vi.fn(async () => {}),
  sendEmailMock: vi.fn(async () => ({})),
  decrementStockMock: vi.fn(async () => {}),
  restoreStockMock: vi.fn(async () => {}),
  releaseReservationMock: vi.fn(async () => true),
  restoreCreditMock: vi.fn(async () => 0),
}));

vi.mock('../config/database.js', () => ({
  getClient: async () => ({ query: clientQueryMock, release: releaseMock }),
}));
vi.mock('./email.service.js', () => ({ sendTemplateEmail: sendEmailMock }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));
vi.mock('./order.service.js', () => ({
  decrementStockForOrder: decrementStockMock,
  restoreStockForOrder: restoreStockMock,
  releaseReservation: releaseReservationMock,
}));
vi.mock('./store-credit.service.js', () => ({ restoreCreditForOrder: restoreCreditMock }));
vi.mock('../config/env.js', () => ({
  env: { ADMIN_EMAIL: 'geeketoys@gmail.com', FRONTEND_URL: 'https://club.geeketoys.com.br' },
}));

import { processStripeEvent } from './webhook.service.js';

// ─── SQL router ──────────────────────────────────────────────────────────────

type Reply = { rows?: Record<string, unknown>[]; rowCount?: number };

/** Fragment → reply. First match wins; anything unmatched is an empty result. */
let routes: [string, Reply][] = [];

/** Every SQL string the handler sent, whitespace-collapsed for easy matching. */
const sqlLog: string[] = [];

function sqlOf(arg: unknown): string {
  return typeof arg === 'string' ? arg.replace(/\s+/g, ' ').trim() : '';
}

/** Did the handler run a statement containing all of these fragments? */
function ran(...fragments: string[]): boolean {
  return sqlLog.some((s) => fragments.every((f) => s.includes(f)));
}

/** The parameters the matching statement was called with. */
function paramsOf(...fragments: string[]): unknown[] | undefined {
  const call = clientQueryMock.mock.calls.find((c) =>
    fragments.every((f) => sqlOf(c[0]).includes(f))
  );
  return call?.[1] as unknown[] | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  sqlLog.length = 0;
  routes = [];
  clientQueryMock.mockImplementation(async (text: unknown) => {
    const sql = sqlOf(text);
    sqlLog.push(sql);
    // The claim succeeds by default; a test that wants a replay overrides it.
    if (sql.includes('INSERT INTO processed_webhooks')) {
      return { rows: [{ webhook_key: 'k' }], rowCount: 1 };
    }
    for (const [fragment, reply] of routes) {
      if (sql.includes(fragment)) {
        return { rows: reply.rows ?? [], rowCount: reply.rowCount ?? (reply.rows?.length ?? 0) };
      }
    }
    return { rows: [], rowCount: 0 };
  });
});

function route(fragment: string, reply: Reply) {
  routes.push([fragment, reply]);
}

function event(type: string, object: unknown, id = 'evt_1'): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

const shopIntent = (over: Record<string, unknown> = {}) =>
  ({
    id: 'pi_shop',
    amount: 4990,
    status: 'succeeded',
    metadata: { kind: 'shop_order', orderId: 'order-1' },
    ...over,
  }) as unknown as Stripe.PaymentIntent;

const paidOrderRow = {
  id: 'order-1',
  order_number: 7,
  customer_name: 'Ana Souza',
  customer_email: 'ana@example.com',
  total: '49.90',
  status: 'pending',
  delivery_method: 'shipping',
};

// ─── Idempotency and failure ─────────────────────────────────────────────────

describe('processStripeEvent — claim e transação', () => {
  it('não reprocessa um evento já visto', async () => {
    clientQueryMock.mockImplementation(async (text: unknown) => {
      const sql = sqlOf(text);
      sqlLog.push(sql);
      if (sql.includes('INSERT INTO processed_webhooks')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });

    await processStripeEvent(event('payment_intent.succeeded', shopIntent()));

    expect(ran('ROLLBACK')).toBe(true);
    expect(ran('COMMIT')).toBe(false);
    expect(ran('UPDATE orders')).toBe(false);
    expect(decrementStockMock).not.toHaveBeenCalled();
  });

  /**
   * The claim is INSERTed inside this transaction, so a rollback erases it and
   * the event can be re-processed. Swallowing the error here is what made the
   * route answer 200 and Stripe forget a captured payment.
   */
  it('faz ROLLBACK e propaga o erro, para o Stripe reentregar', async () => {
    route('UPDATE orders SET status = \'paid\'', { rows: [] });
    clientQueryMock.mockImplementationOnce(async () => ({ rows: [], rowCount: 0 })); // BEGIN
    clientQueryMock.mockImplementationOnce(async () => ({
      rows: [{ webhook_key: 'k' }],
      rowCount: 1,
    })); // claim
    clientQueryMock.mockImplementationOnce(async () => {
      throw new Error('deadlock detected');
    });

    await expect(
      processStripeEvent(event('payment_intent.succeeded', shopIntent()))
    ).rejects.toThrow('deadlock detected');

    expect(clientQueryMock).toHaveBeenCalledWith('ROLLBACK');
    expect(releaseMock).toHaveBeenCalled();
  });

  it('libera a conexão mesmo quando tudo dá certo', async () => {
    await processStripeEvent(event('unknown.event.type', {}));
    expect(ran('COMMIT')).toBe(true);
    expect(releaseMock).toHaveBeenCalled();
  });
});

// ─── The regression: declined card ───────────────────────────────────────────

describe('payment_intent.payment_failed', () => {
  /**
   * The bug this replaces: the handler cancelled the order on the spot. The
   * customer typed a second card into the same form, the charge went through,
   * and `handleShopOrderPaid` — which looks for a live order — found nothing
   * and returned quietly. Money in, order dead, stock never decremented.
   */
  it('NÃO cancela o pedido: recusa não é o fim da venda', async () => {
    await processStripeEvent(
      event(
        'payment_intent.payment_failed',
        shopIntent({ status: 'requires_payment_method', last_payment_error: { code: 'card_declined' } })
      )
    );

    expect(ran('UPDATE orders', "'cancelled'")).toBe(false);
    expect(restoreCreditMock).not.toHaveBeenCalled();
    expect(releaseReservationMock).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith(
      'order.payment_failed',
      null,
      expect.objectContaining({ orderId: 'order-1', lastPaymentError: 'card_declined' })
    );
  });

  it('a segunda tentativa, aprovada, ainda encontra o pedido e o paga', async () => {
    // First card refused.
    await processStripeEvent(
      event('payment_intent.payment_failed', shopIntent({ status: 'requires_payment_method' }), 'evt_fail')
    );

    // Second card approved — the order is still `pending`, so it is found.
    route("UPDATE orders SET status = 'paid'", { rows: [paidOrderRow] });
    await processStripeEvent(event('payment_intent.succeeded', shopIntent(), 'evt_ok'));

    expect(decrementStockMock).toHaveBeenCalledWith(expect.anything(), 'order-1');
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'order-confirmed', to: 'ana@example.com' })
    );
  });
});

// ─── Shop order paid ─────────────────────────────────────────────────────────

describe('payment_intent.succeeded — pedido da loja', () => {
  it('marca como pago, baixa estoque e enfileira o e-mail', async () => {
    route("UPDATE orders SET status = 'paid'", { rows: [paidOrderRow] });

    await processStripeEvent(event('payment_intent.succeeded', shopIntent()));

    expect(decrementStockMock).toHaveBeenCalledWith(expect.anything(), 'order-1');
    expect(auditMock).toHaveBeenCalledWith(
      'order.paid',
      null,
      expect.objectContaining({ orderId: 'order-1', amount: 49.9 })
    );
  });

  /** Captured money must land somewhere, even if something already cancelled. */
  it('aceita também um pedido cancelado — o dinheiro já foi capturado', async () => {
    route("UPDATE orders SET status = 'paid'", { rows: [] });

    await processStripeEvent(event('payment_intent.succeeded', shopIntent()));

    const params = paramsOf("UPDATE orders SET status = 'paid'");
    expect(params?.[0]).toBe('pi_shop');
    expect(ran("status IN ('pending', 'cancelled')")).toBe(true);
  });

  it('é idempotente: um pedido já pago não gera e-mail nem baixa de estoque', async () => {
    route("UPDATE orders SET status = 'paid'", { rows: [] });

    await processStripeEvent(event('payment_intent.succeeded', shopIntent()));

    expect(decrementStockMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

// ─── Cancel ──────────────────────────────────────────────────────────────────

describe('payment_intent.canceled', () => {
  it('encerra o pedido, solta a reserva e devolve o crédito', async () => {
    route("UPDATE orders SET status = 'cancelled'", {
      rows: [{ id: 'order-1', store_credit_applied: '15.00' }],
    });
    restoreCreditMock.mockResolvedValueOnce(15);

    await processStripeEvent(event('payment_intent.canceled', shopIntent()));

    // The TTL sweep only visits `pending`, so a cancelled order would hold its
    // units forever if the reservation were not released here.
    expect(releaseReservationMock).toHaveBeenCalledWith(expect.anything(), 'order-1');
    expect(restoreCreditMock).toHaveBeenCalledWith('order-1', expect.anything());
  });

  it('não devolve crédito quando nenhum foi usado', async () => {
    route("UPDATE orders SET status = 'cancelled'", {
      rows: [{ id: 'order-1', store_credit_applied: '0' }],
    });

    await processStripeEvent(event('payment_intent.canceled', shopIntent()));

    expect(releaseReservationMock).toHaveBeenCalled();
    expect(restoreCreditMock).not.toHaveBeenCalled();
  });
});

// ─── Refund ──────────────────────────────────────────────────────────────────

describe('charge.refunded', () => {
  const charge = (over: Record<string, unknown> = {}) =>
    ({
      id: 'ch_1',
      payment_intent: 'pi_shop',
      amount: 4990,
      amount_refunded: 4990,
      ...over,
    }) as unknown as Stripe.Charge;

  /**
   * A refund issued from the Stripe Dashboard — how a shopkeeper actually
   * refunds — used to never reach the database: the order stayed `paid`,
   * counted as revenue, with stock decremented and credit not returned.
   */
  it('marca como estornado, devolve estoque e crédito', async () => {
    route("UPDATE orders SET status = 'refunded'", {
      rows: [{ id: 'order-1', order_number: 7, status: 'refunded', store_credit_applied: '10.00' }],
    });
    restoreCreditMock.mockResolvedValueOnce(10);

    await processStripeEvent(event('charge.refunded', charge()));

    expect(restoreStockMock).toHaveBeenCalledWith(expect.anything(), 'order-1');
    expect(restoreCreditMock).toHaveBeenCalledWith('order-1', expect.anything());
    expect(auditMock).toHaveBeenCalledWith(
      'order.refunded_via_stripe',
      null,
      expect.objectContaining({ orderId: 'order-1', amountRefunded: 49.9, partial: false })
    );
  });

  it('marca estorno parcial como parcial', async () => {
    route("UPDATE orders SET status = 'refunded'", {
      rows: [{ id: 'order-1', order_number: 7, status: 'refunded', store_credit_applied: '0' }],
    });

    await processStripeEvent(event('charge.refunded', charge({ amount_refunded: 1000 })));

    expect(auditMock).toHaveBeenCalledWith(
      'order.refunded_via_stripe',
      null,
      expect.objectContaining({ partial: true })
    );
  });

  it('é idempotente: um pedido já estornado não devolve estoque de novo', async () => {
    route("UPDATE orders SET status = 'refunded'", { rows: [] });

    await processStripeEvent(event('charge.refunded', charge()));

    expect(restoreStockMock).not.toHaveBeenCalled();
    expect(ran("status <> 'refunded'")).toBe(true);
  });

  it('ignora uma cobrança sem PaymentIntent', async () => {
    await processStripeEvent(event('charge.refunded', charge({ payment_intent: null })));
    expect(ran('UPDATE orders')).toBe(false);
  });
});

// ─── Dispute ─────────────────────────────────────────────────────────────────

describe('charge.dispute.created', () => {
  const dispute = {
    id: 'dp_1',
    payment_intent: 'pi_shop',
    amount: 4990,
    reason: 'fraudulent',
    evidence_details: { due_by: 1790000000 },
  } as unknown as Stripe.Dispute;

  it('avisa a admin sem mexer no status do pedido', async () => {
    route('SELECT id, order_number, customer_name, customer_email', {
      rows: [{ id: 'order-1', order_number: 7, customer_name: 'Ana', customer_email: 'a@b.c' }],
    });

    await processStripeEvent(event('charge.dispute.created', dispute));

    // A chargeback needs a person, not an automatic status change.
    expect(ran('UPDATE orders')).toBe(false);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'admin-order-disputed',
        to: 'geeketoys@gmail.com',
        variables: expect.objectContaining({ reason: 'fraudulent', amount: '49,90' }),
      })
    );
  });

  it('registra a contestação mesmo sem achar o pedido', async () => {
    await processStripeEvent(event('charge.dispute.created', dispute));

    expect(auditMock).toHaveBeenCalledWith(
      'order.disputed',
      null,
      expect.objectContaining({ orderId: null, reason: 'fraudulent' })
    );
  });
});

// ─── Subscription invoice ────────────────────────────────────────────────────

describe('invoice.paid', () => {
  const invoice = (over: Record<string, unknown> = {}) =>
    ({
      id: 'in_1',
      amount_paid: 1250,
      subscription: 'sub_1',
      period_end: 1790000000,
      ...over,
    }) as unknown as Stripe.Invoice;

  function memberRoute(paymentType = 'monthly') {
    route('FROM members m JOIN subscriptions s', {
      rows: [
        {
          id: 'member-1',
          email: 'ana@example.com',
          full_name: 'Ana',
          plan: 'basic',
          payment_type: paymentType,
          sub_id: 'sub_1',
        },
      ],
    });
    route('SELECT expiry_date FROM members', { rows: [{ expiry_date: '2026-09-24' }] });
  }

  /**
   * `payments` is the only table the reports read; `subscription_payments` is
   * consulted in exactly one place, the member's own statement. Without this
   * mirror every recurring charge from the second month on was invisible and
   * club revenue read as zero.
   */
  it('espelha a fatura em `payments`, que é o que os relatórios leem', async () => {
    memberRoute();

    await processStripeEvent(event('invoice.paid', invoice()));

    expect(ran('INSERT INTO payments', "'credit_card', 'paid'")).toBe(true);
    const params = paramsOf('INSERT INTO payments');
    expect(params?.[0]).toBe(12.5);
    expect(params?.[1]).toBe('in_1');
  });

  it('não conta a mesma fatura duas vezes', async () => {
    memberRoute();
    await processStripeEvent(event('invoice.paid', invoice()));
    // The guard lives in SQL, so what is asserted is that it is still there.
    expect(ran('INSERT INTO payments', 'NOT EXISTS', 'WHERE provider_id = $2')).toBe(true);
  });

  /**
   * `expiry_date` is nullable and `createMember` never sets it. `NULL + interval`
   * is NULL, so a first invoice left a paying member `active` with no expiry —
   * which reads as expired to both the 10% shop discount and the digital card.
   * A member returning after a lapse hit the same wall from the other side.
   */
  it('ancora a vigência em hoje quando a data é nula ou já passou', async () => {
    memberRoute();

    await processStripeEvent(event('invoice.paid', invoice()));

    expect(
      ran('UPDATE members', 'GREATEST(COALESCE(expiry_date, CURRENT_DATE), CURRENT_DATE)')
    ).toBe(true);
    expect(paramsOf('UPDATE members', 'GREATEST')?.[1]).toBe('1 month');
  });

  it('usa o intervalo anual para quem paga por ano', async () => {
    memberRoute('annual');
    await processStripeEvent(event('invoice.paid', invoice()));
    expect(paramsOf('UPDATE members', 'GREATEST')?.[1]).toBe('1 year');
  });

  it('grava `next_payment_date` a partir do período da fatura', async () => {
    memberRoute();
    await processStripeEvent(event('invoice.paid', invoice()));

    const params = paramsOf('UPDATE subscriptions', 'next_payment_date');
    expect(params?.[1]).toBe(new Date(1790000000 * 1000).toISOString());
  });

  it('ignora fatura sem assinatura', async () => {
    await processStripeEvent(event('invoice.paid', invoice({ subscription: null })));
    expect(ran('INSERT INTO subscription_payments')).toBe(false);
  });

  it('para sem quebrar quando a assinatura não tem membro', async () => {
    route('FROM members m JOIN subscriptions s', { rows: [] });

    await processStripeEvent(event('invoice.paid', invoice()));

    expect(ran('UPDATE members', 'GREATEST')).toBe(false);
    expect(ran('COMMIT')).toBe(true);
  });
});

// ─── Post-commit side effects ────────────────────────────────────────────────

describe('efeitos pós-commit', () => {
  it('envia o e-mail só depois do COMMIT', async () => {
    route("UPDATE orders SET status = 'paid'", { rows: [paidOrderRow] });
    let committedBeforeEmail = false;
    sendEmailMock.mockImplementationOnce(async () => {
      committedBeforeEmail = ran('COMMIT');
      return {};
    });

    await processStripeEvent(event('payment_intent.succeeded', shopIntent()));

    // An e-mail sent inside the transaction would announce work a rollback
    // could still undo.
    expect(committedBeforeEmail).toBe(true);
  });

  it('uma falha de e-mail não derruba o processamento', async () => {
    route("UPDATE orders SET status = 'paid'", { rows: [paidOrderRow] });
    sendEmailMock.mockRejectedValueOnce(new Error('resend down'));

    await expect(
      processStripeEvent(event('payment_intent.succeeded', shopIntent()))
    ).resolves.toBeUndefined();
    expect(ran('COMMIT')).toBe(true);
  });

  it('uma falha na devolução de crédito não derruba o processamento', async () => {
    route("UPDATE orders SET status = 'cancelled'", {
      rows: [{ id: 'order-1', store_credit_applied: '15.00' }],
    });
    restoreCreditMock.mockRejectedValueOnce(new Error('ledger locked'));

    await expect(
      processStripeEvent(event('payment_intent.canceled', shopIntent()))
    ).resolves.toBeUndefined();
  });
});
