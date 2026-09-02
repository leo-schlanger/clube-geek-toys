import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pagar.me webhook — the only thing that turns a PIX transfer into a paid
 * order, and the reason nobody reads the bank statement any more.
 *
 * What these protect, ordered by what a regression costs:
 *
 *  1. A forged `charge.paid` settles nothing. The Basic credentials are a
 *     shared secret, not a proof of origin, so every money event is re-read
 *     from the API before it is believed.
 *  2. The idempotency claim lives in the SAME transaction as the effects. A
 *     failure rolls both back, so the redelivery can re-process — answering 200
 *     to a half-applied event is how money gets captured and never recorded.
 *  3. A decline does **not** cancel a shop order. The order keeps its stock
 *     hold for the retry; only an explicit cancel ends it.
 *  4. Stock comes down exactly once, on the first delivery that wins the claim.
 *  5. E-mails and credit restores run after COMMIT, never for rolled-back work.
 */

const {
  clientQueryMock,
  releaseMock,
  auditMock,
  sendEmailMock,
  notifyAdminsMock,
  getChargeMock,
  decrementStockMock,
  restoreStockMock,
  releaseReservationMock,
  restoreCreditMock,
} = vi.hoisted(() => ({
  clientQueryMock: vi.fn(),
  releaseMock: vi.fn(),
  auditMock: vi.fn(async () => {}),
  sendEmailMock: vi.fn(async () => ({})),
  notifyAdminsMock: vi.fn(async () => {}),
  getChargeMock: vi.fn(),
  decrementStockMock: vi.fn(async () => {}),
  restoreStockMock: vi.fn(async () => {}),
  releaseReservationMock: vi.fn(async () => {}),
  restoreCreditMock: vi.fn(async () => 0),
}));

vi.mock('../config/database.js', () => ({
  getClient: async () => ({ query: clientQueryMock, release: releaseMock }),
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
}));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));
vi.mock('./email.service.js', () => ({ sendTemplateEmail: sendEmailMock }));
vi.mock('./admin-notification.service.js', () => ({
  notifyAdminsOfPayment: notifyAdminsMock,
  notifyAdminsOfPaymentAsync: notifyAdminsMock,
}));
vi.mock('./order.service.js', () => ({
  decrementStockForOrder: decrementStockMock,
  restoreStockForOrder: restoreStockMock,
  releaseReservation: releaseReservationMock,
}));
vi.mock('./store-credit.service.js', () => ({ restoreCreditForOrder: restoreCreditMock }));
vi.mock('../utils/pagarme.js', async () => {
  const actual = await vi.importActual<typeof import('../utils/pagarme.js')>('../utils/pagarme.js');
  return { ...actual, getCharge: getChargeMock };
});

/**
 * Mutable, and hoisted alongside the other mocks so the factory can close over
 * it: a couple of tests flip `NODE_ENV` or drop the credentials to check the
 * production guard, and re-importing the module for that would be worse.
 */
const { envMock } = vi.hoisted(() => ({
  envMock: {
    NODE_ENV: 'test' as string,
    ADMIN_EMAIL: 'geeketoys@gmail.com',
    FRONTEND_URL: 'https://club.geeketoys.com.br',
    PAGARME_SECRET_KEY: 'sk_test_x',
    PAGARME_API_URL: 'https://api.pagar.me/core/v5',
    PAGARME_WEBHOOK_USER: 'hook-user' as string,
    PAGARME_WEBHOOK_PASSWORD: 'hook-pass' as string,
  },
}));
vi.mock('../config/env.js', () => ({ env: envMock }));

import {
  processPagarmeEvent,
  verifyWebhookAuth,
  webhookAuthConfigured,
  type PagarmeWebhookEvent,
} from './pagarme-webhook.service.js';

// ─── Harness ─────────────────────────────────────────────────────────────────

type Reply = { rows?: Record<string, unknown>[]; rowCount?: number };
let routes: [string, Reply][] = [];
const sqlLog: string[] = [];

const sqlOf = (a: unknown) => (typeof a === 'string' ? a.replace(/\s+/g, ' ').trim() : '');
const ran = (...f: string[]) => sqlLog.some((s) => f.every((x) => s.includes(x)));
const route = (fragment: string, reply: Reply) => routes.push([fragment, reply]);

/** The claim on `processed_webhooks`; by default this delivery wins it. */
function claimWins() {
  route('INSERT INTO processed_webhooks', { rows: [{ webhook_key: 'k' }], rowCount: 1 });
}

function basicHeader(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  sqlLog.length = 0;
  routes = [];
  envMock.NODE_ENV = 'test';

  clientQueryMock.mockImplementation(async (text: unknown) => {
    const sql = sqlOf(text);
    sqlLog.push(sql);
    for (const [fragment, reply] of routes) {
      if (sql.includes(fragment)) {
        return { rows: reply.rows ?? [], rowCount: reply.rowCount ?? (reply.rows?.length ?? 0) };
      }
    }
    return { rows: [], rowCount: 0 };
  });
});

const paidCharge = {
  id: 'ch_1',
  status: 'paid',
  amount: 12400,
  paid_amount: 12400,
  payment_method: 'pix',
  metadata: { kind: 'shop_order', orderId: 'o1', orderNumber: '1001' },
};

function chargeEvent(over: Record<string, unknown> = {}): PagarmeWebhookEvent {
  return {
    id: 'hook_1',
    type: 'charge.paid',
    data: { ...paidCharge, ...over },
  } as PagarmeWebhookEvent;
}

const orderRow = {
  id: 'o1',
  order_number: 1001,
  customer_name: 'Laura',
  customer_email: 'laura@example.com',
  total: '124.00',
  delivery_method: 'shipping',
  store_credit_applied: '0',
};

// ─── Authentication ──────────────────────────────────────────────────────────

describe('verifyWebhookAuth', () => {
  it('aceita as credenciais configuradas', () => {
    expect(verifyWebhookAuth(basicHeader('hook-user', 'hook-pass'))).toBe(true);
  });

  it.each([
    ['senha errada', basicHeader('hook-user', 'errada')],
    ['usuário errado', basicHeader('outro', 'hook-pass')],
    ['sem separador', `Basic ${Buffer.from('semdoispontos').toString('base64')}`],
    ['esquema errado', 'Bearer hook-pass'],
    ['header ausente', undefined],
  ])('recusa %s', (_label, header) => {
    expect(verifyWebhookAuth(header as string | undefined)).toBe(false);
  });

  /**
   * A production deployment with no credentials would leave the endpoint that
   * settles payments open to anyone. The env schema refuses that combination at
   * boot; this is the second lock, in case it is ever relaxed.
   */
  it('sem credenciais, recusa tudo em produção e libera fora dela', () => {
    envMock.PAGARME_WEBHOOK_USER = '';
    envMock.PAGARME_WEBHOOK_PASSWORD = '';
    try {
      envMock.NODE_ENV = 'production';
      expect(verifyWebhookAuth(basicHeader('a', 'b'))).toBe(false);
      expect(webhookAuthConfigured()).toBe(false);

      envMock.NODE_ENV = 'development';
      expect(verifyWebhookAuth(undefined)).toBe(true);
    } finally {
      envMock.PAGARME_WEBHOOK_USER = 'hook-user';
      envMock.PAGARME_WEBHOOK_PASSWORD = 'hook-pass';
    }
  });
});

// ─── charge.paid ─────────────────────────────────────────────────────────────

describe('charge.paid — pedido da loja', () => {
  it('confirma a cobrança na API antes de baixar qualquer coisa', async () => {
    claimWins();
    route('UPDATE orders SET status = ', { rows: [orderRow] });
    getChargeMock.mockResolvedValue(paidCharge);

    await processPagarmeEvent(chargeEvent());

    expect(getChargeMock).toHaveBeenCalledWith('ch_1');
    expect(ran('UPDATE orders', "status = 'paid'")).toBe(true);
    expect(decrementStockMock).toHaveBeenCalledWith(expect.anything(), 'o1');
  });

  /**
   * The whole point of the re-read. A payload that says `paid` while the charge
   * is still pending at the provider is either a forgery or a race — either way
   * it must not settle an order, and it must not be recorded as processed.
   */
  it('não acredita num corpo que diz "paid" quando a cobrança não está paga', async () => {
    claimWins();
    getChargeMock.mockResolvedValue({ ...paidCharge, status: 'pending' });

    await expect(processPagarmeEvent(chargeEvent())).rejects.toThrow('not paid at the provider');

    expect(ran('ROLLBACK')).toBe(true);
    expect(ran('COMMIT')).toBe(false);
    expect(decrementStockMock).not.toHaveBeenCalled();
  });

  /**
   * The body is not signed. Someone who knew the webhook password could pair a
   * genuinely paid charge id with an `orderId` of their choosing and settle
   * somebody else's order — unless the metadata comes from the charge we
   * re-read, which is what we wrote when we created it.
   */
  it('ignora o metadata do corpo e usa o da cobrança relida', async () => {
    claimWins();
    route('UPDATE orders SET status = ', { rows: [orderRow] });
    getChargeMock.mockResolvedValue(paidCharge); // metadata.orderId = 'o1'

    await processPagarmeEvent(
      chargeEvent({ metadata: { kind: 'shop_order', orderId: 'outro-pedido' } })
    );

    const call = clientQueryMock.mock.calls.find(
      (c) => sqlOf(c[0]).includes('UPDATE orders SET status')
    );
    expect((call![1] as unknown[])[2]).toBe('o1');
  });

  /** A provider lookup that fails is "not confirmed", so the delivery retries. */
  it('propaga quando não consegue confirmar a cobrança', async () => {
    claimWins();
    getChargeMock.mockRejectedValue(new Error('502 bad gateway'));

    await expect(processPagarmeEvent(chargeEvent())).rejects.toThrow();
    expect(ran('ROLLBACK')).toBe(true);
  });

  /**
   * The claim and the effects share one transaction, so a redelivery finds the
   * key taken and does nothing at all.
   */
  it('uma reentrega não baixa estoque duas vezes', async () => {
    route('INSERT INTO processed_webhooks', { rows: [], rowCount: 0 });
    getChargeMock.mockResolvedValue(paidCharge);

    await processPagarmeEvent(chargeEvent());

    expect(getChargeMock).not.toHaveBeenCalled();
    expect(decrementStockMock).not.toHaveBeenCalled();
    expect(ran('ROLLBACK')).toBe(true);
  });

  /** Money already captured must land on the order even if something cancelled it. */
  it('aceita um pedido `cancelled` além de `pending`', async () => {
    claimWins();
    route('UPDATE orders SET status = ', { rows: [orderRow] });
    getChargeMock.mockResolvedValue(paidCharge);

    await processPagarmeEvent(chargeEvent());

    expect(ran("status IN ('pending', 'cancelled')")).toBe(true);
  });

  it('manda a confirmação ao cliente depois do COMMIT', async () => {
    claimWins();
    route('UPDATE orders SET status = ', { rows: [orderRow] });
    getChargeMock.mockResolvedValue(paidCharge);

    await processPagarmeEvent(chargeEvent());

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'order-confirmed', to: 'laura@example.com' })
    );
    expect(notifyAdminsMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payment_received', amount: 124 })
    );
  });

  /** Nothing may be sent for work that rolled back. */
  it('não manda e-mail quando a transação falha', async () => {
    claimWins();
    getChargeMock.mockResolvedValue(paidCharge);
    clientQueryMock.mockImplementation(async (text: unknown) => {
      const sql = sqlOf(text);
      sqlLog.push(sql);
      if (sql.includes('INSERT INTO processed_webhooks')) {
        return { rows: [{ webhook_key: 'k' }], rowCount: 1 };
      }
      if (sql.includes('UPDATE orders')) throw new Error('deadlock detected');
      return { rows: [], rowCount: 0 };
    });

    await expect(processPagarmeEvent(chargeEvent())).rejects.toThrow('deadlock');

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(notifyAdminsMock).not.toHaveBeenCalled();
    expect(releaseMock).toHaveBeenCalled();
  });

  it('não faz nada quando nenhum pedido pendente casa com a cobrança', async () => {
    claimWins();
    route('UPDATE orders SET status = ', { rows: [] });
    getChargeMock.mockResolvedValue(paidCharge);

    await processPagarmeEvent(chargeEvent());

    expect(decrementStockMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(ran('COMMIT')).toBe(true);
  });
});

// ─── charge.paid — assinatura ────────────────────────────────────────────────

describe('charge.paid — pagamento do clube', () => {
  const clubCharge = {
    id: 'ch_club',
    status: 'paid',
    amount: 1250,
    paid_amount: 1250,
    payment_method: 'pix',
    metadata: { kind: 'club_membership', memberId: 'm1' },
  };

  function clubEvent(): PagarmeWebhookEvent {
    return { id: 'hook_club', type: 'charge.paid', data: clubCharge } as PagarmeWebhookEvent;
  }

  it('ativa o membro e estende a validade', async () => {
    claimWins();
    route('UPDATE payments', { rows: [{ id: 'pay-1', member_id: 'm1' }], rowCount: 1 });
    route('FROM members WHERE id = $1 FOR UPDATE', {
      rows: [
        {
          id: 'm1',
          status: 'pending',
          expiry_date: null,
          payment_type: 'monthly',
          email: 'ana@example.com',
          full_name: 'Ana',
          plan: 'basic',
        },
      ],
    });
    getChargeMock.mockResolvedValue(clubCharge);

    await processPagarmeEvent(clubEvent());

    expect(ran('UPDATE members', "status = 'active'")).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'payment-confirmed' })
    );
    // First activation also gets the welcome.
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ template: 'welcome' }));
  });

  /**
   * The card path settles the row synchronously, so the webhook that follows
   * finds nothing to claim. Activating anyway would add a second month for one
   * payment — the same bug the manual PIX confirmation once had.
   */
  it('não ativa de novo quando a linha já estava paga', async () => {
    claimWins();
    route('UPDATE payments', { rows: [], rowCount: 0 });
    getChargeMock.mockResolvedValue({ ...clubCharge, metadata: { memberId: 'm1' } });

    await processPagarmeEvent(clubEvent());

    expect(ran('UPDATE members', "status = 'active'")).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

// ─── charge.payment_failed ───────────────────────────────────────────────────

describe('charge.payment_failed', () => {
  /**
   * A decline is the most ordinary thing in a checkout. Cancelling the order
   * here is what once made the successful retry land on a dead order: money
   * captured, stock never decremented, no e-mail — and the reservation stuck,
   * because the TTL sweep only visits `pending`.
   */
  it('não cancela o pedido da loja: a segunda tentativa é o caminho normal', async () => {
    claimWins();

    await processPagarmeEvent({
      id: 'hook_2',
      type: 'charge.payment_failed',
      data: {
        id: 'ch_2',
        status: 'not_authorized',
        amount: 12400,
        payment_method: 'credit_card',
        metadata: { kind: 'shop_order', orderId: 'o1', orderNumber: '1001' },
        last_transaction: { acquirer_return_code: '51' },
      },
    } as PagarmeWebhookEvent);

    expect(ran('UPDATE orders')).toBe(false);
    expect(releaseReservationMock).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith(
      'order.payment_failed',
      null,
      expect.objectContaining({ acquirerCode: '51' })
    );
    // The staff still hear about it, with the bank's reason in Portuguese.
    expect(notifyAdminsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'payment_failed',
        detail: expect.stringContaining('saldo ou limite insuficiente'),
      })
    );
  });

  it('marca o pagamento do clube como recusado e avisa o membro', async () => {
    claimWins();
    route('FROM members WHERE id', {
      rows: [{ id: 'm1', email: 'ana@example.com', full_name: 'Ana' }],
    });

    await processPagarmeEvent({
      id: 'hook_3',
      type: 'charge.payment_failed',
      data: {
        id: 'ch_3',
        status: 'not_authorized',
        amount: 1250,
        payment_method: 'credit_card',
        metadata: { memberId: 'm1' },
      },
    } as PagarmeWebhookEvent);

    expect(ran('UPDATE payments', "status = 'failed'")).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'payment-failed' })
    );
  });
});

// ─── order.canceled ──────────────────────────────────────────────────────────

describe('order.canceled', () => {
  /** The one event that ends a shop order — and it must free the hold. */
  it('cancela o pedido e devolve a reserva e o crédito', async () => {
    claimWins();
    route('UPDATE orders SET status = ', {
      rows: [{ id: 'o1', store_credit_applied: '10.00' }],
    });

    await processPagarmeEvent({
      id: 'hook_4',
      type: 'order.canceled',
      data: { id: 'or_1', metadata: { kind: 'shop_order', orderId: 'o1' } },
    } as PagarmeWebhookEvent);

    expect(releaseReservationMock).toHaveBeenCalledWith(expect.anything(), 'o1');
    expect(restoreCreditMock).toHaveBeenCalledWith('o1', expect.anything());
  });
});

// ─── charge.refunded ─────────────────────────────────────────────────────────

describe('charge.refunded', () => {
  /**
   * A refund made straight in the Pagar.me dashboard — which is how a shopkeeper
   * actually refunds — has to reach the database, or the order stays `paid`,
   * counts as revenue, and the stock never comes back.
   */
  it('devolve estoque e crédito de um estorno feito fora do painel', async () => {
    claimWins();
    route('UPDATE orders SET status = ', {
      rows: [{ ...orderRow, store_credit_applied: '5.00' }],
    });

    await processPagarmeEvent({
      id: 'hook_5',
      type: 'charge.refunded',
      data: { id: 'ch_1', status: 'canceled', amount: 12400, payment_method: 'pix' },
    } as PagarmeWebhookEvent);

    expect(restoreStockMock).toHaveBeenCalledWith(expect.anything(), 'o1');
    expect(restoreCreditMock).toHaveBeenCalledWith('o1', expect.anything());
    expect(notifyAdminsMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payment_refunded' })
    );
  });

  it('é idempotente: um pedido já estornado não mexe em nada', async () => {
    claimWins();
    route('UPDATE orders SET status = ', { rows: [] });
    route('UPDATE payments SET status = ', { rows: [] });

    await processPagarmeEvent({
      id: 'hook_6',
      type: 'charge.refunded',
      data: { id: 'ch_1', status: 'canceled', amount: 12400 },
    } as PagarmeWebhookEvent);

    expect(restoreStockMock).not.toHaveBeenCalled();
    expect(restoreCreditMock).not.toHaveBeenCalled();
  });
});

// ─── chargeback ──────────────────────────────────────────────────────────────

describe('chargeback', () => {
  /** Money is already gone. A person decides what to do; the code only flags it. */
  it('não muda o status do pedido, só avisa', async () => {
    claimWins();
    route('SELECT id, order_number', { rows: [orderRow] });

    await processPagarmeEvent({
      id: 'hook_7',
      type: 'chargeback.received',
      data: { id: 'ch_1', status: 'chargedback', amount: 12400, reason: 'fraud' },
    } as PagarmeWebhookEvent);

    expect(ran('UPDATE orders')).toBe(false);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'admin-order-disputed' })
    );
    expect(notifyAdminsMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payment_chargeback' })
    );
  });
});

// ─── invoice.paid ────────────────────────────────────────────────────────────

describe('invoice.paid — renovação da assinatura', () => {
  function invoiceEvent(): PagarmeWebhookEvent {
    return {
      id: 'hook_8',
      type: 'invoice.paid',
      data: {
        id: 'in_1',
        amount: 1250,
        subscription: { id: 'psub1' },
        cycle: { end_at: '2026-10-01T00:00:00Z' },
      },
    } as PagarmeWebhookEvent;
  }

  function memberFound() {
    route('JOIN subscriptions s ON m.subscription_id', {
      rows: [
        {
          id: 'm1',
          email: 'ana@example.com',
          full_name: 'Ana',
          plan: 'basic',
          payment_type: 'monthly',
        },
      ],
    });
  }

  /**
   * `payments` is the only table the reports read. Without this mirror every
   * recurring charge from the second month on is invisible to the dashboard,
   * and club revenue reads as total churn.
   */
  it('espelha a fatura em `payments`, que é o que os relatórios leem', async () => {
    claimWins();
    memberFound();

    await processPagarmeEvent(invoiceEvent());

    expect(ran('INSERT INTO payments', "'pagarme'")).toBe(true);
    expect(ran('NOT EXISTS (SELECT 1 FROM payments WHERE provider_id = $2)')).toBe(true);
  });

  /**
   * `expiry_date` is nullable and `NULL + interval` is NULL, which leaves a
   * paying member active with no expiry — and that reads as *expired* to the
   * shop discount and the digital card alike. Anchoring on today also fixes the
   * member returning after a lapse, whose stored date is months in the past.
   */
  it('ancora a validade em hoje quando a data está vazia ou vencida', async () => {
    claimWins();
    memberFound();

    await processPagarmeEvent(invoiceEvent());

    expect(ran('GREATEST(COALESCE(expiry_date, CURRENT_DATE), CURRENT_DATE)')).toBe(true);
  });

  it('zera as falhas e grava a próxima cobrança', async () => {
    claimWins();
    memberFound();

    await processPagarmeEvent(invoiceEvent());

    expect(ran('UPDATE subscriptions', 'failed_payments = 0', 'next_payment_date')).toBe(true);
  });
});

// ─── invoice.payment_failed ──────────────────────────────────────────────────

describe('invoice.payment_failed', () => {
  function failEvent(): PagarmeWebhookEvent {
    return {
      id: 'hook_9',
      type: 'invoice.payment_failed',
      data: { id: 'in_2', amount: 1250, subscription: 'psub1' },
    } as PagarmeWebhookEvent;
  }

  it('conta a falha e avisa o membro', async () => {
    claimWins();
    route('failed_payments = failed_payments + 1', {
      rows: [{ failed_payments: 1, id: 'sub_1' }],
    });
    route('FROM members WHERE subscription_id', {
      rows: [{ id: 'm1', email: 'ana@example.com', full_name: 'Ana', plan: 'basic' }],
    });

    await processPagarmeEvent(failEvent());

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'subscription-payment-failed' })
    );
    expect(ran("SET status = 'cancelled'")).toBe(false);
  });

  it('cancela na terceira falha', async () => {
    claimWins();
    route('failed_payments = failed_payments + 1', {
      rows: [{ failed_payments: 3, id: 'sub_1' }],
    });
    route('FROM members WHERE subscription_id', {
      rows: [{ id: 'm1', email: 'ana@example.com', full_name: 'Ana', plan: 'basic' }],
    });

    await processPagarmeEvent(failEvent());

    expect(ran('UPDATE subscriptions', "status = 'cancelled'")).toBe(true);
    expect(ran('UPDATE members', 'auto_renewal = FALSE')).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'subscription-cancelled' })
    );
  });
});

// ─── subscription.canceled ───────────────────────────────────────────────────

describe('subscription.canceled', () => {
  /**
   * Our own `cancelSubscription` mails the member and then calls the API, which
   * fires this event — so the guard on `subscription_status` is what stops the
   * member being told twice for one cancellation.
   */
  it('não avisa de novo quando o app já tinha cancelado', async () => {
    claimWins();
    route('UPDATE members SET subscription_status', { rows: [] });

    await processPagarmeEvent({
      id: 'hook_10',
      type: 'subscription.canceled',
      data: { id: 'psub1' },
    } as PagarmeWebhookEvent);

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('avisa quando o cancelamento veio do painel da operadora', async () => {
    claimWins();
    route('UPDATE members SET subscription_status', {
      rows: [{ id: 'm1', email: 'ana@example.com', full_name: 'Ana' }],
    });

    await processPagarmeEvent({
      id: 'hook_11',
      type: 'subscription.canceled',
      data: { id: 'psub1' },
    } as PagarmeWebhookEvent);

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'subscription-cancelled' })
    );
  });
});

// ─── Unknown events ──────────────────────────────────────────────────────────

describe('eventos desconhecidos', () => {
  /** An unhandled type is claimed and committed, so it is never redelivered. */
  it('não quebram, e não deixam a transação aberta', async () => {
    claimWins();

    await processPagarmeEvent({
      id: 'hook_12',
      type: 'card.updated',
      data: { id: 'card_1' },
    } as PagarmeWebhookEvent);

    expect(ran('COMMIT')).toBe(true);
    expect(releaseMock).toHaveBeenCalled();
  });
});
