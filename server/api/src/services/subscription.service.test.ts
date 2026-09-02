import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Club subscription — the recurring R$ 12,50/month, now on Pagar.me.
 *
 * What these protect, ordered by what a regression costs:
 *
 *  1. The client never chooses the amount **or the interval**. Locking only the
 *     amount would let a request ask for `year` and buy twelve months for the
 *     price of one.
 *  2. The provider is called before the local rows change, and the two rows —
 *     `subscriptions` and `members` — move together or not at all.
 *  3. Pause, resume and cancel keep the member's mirrored status in step; a
 *     drifted mirror is what decides the shop discount and the digital card.
 *  4. A missing subscription is a 404, never a silent no-op.
 *  5. The two providers coexist: a row written before the migration is still
 *     paused and cancelled through Stripe, decided by the stored `provider` and
 *     never by guessing from the id.
 */

const {
  queryMock,
  clientQueryMock,
  releaseMock,
  auditMock,
  sendEmailMock,
  stripeMock,
  notifyAdminsMock,
  pagarmeCreateMock,
  pagarmeCancelMock,
  pagarmeCustomerMock,
  pagarmeUpdateCardMock,
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  clientQueryMock: vi.fn(),
  releaseMock: vi.fn(),
  auditMock: vi.fn(async () => {}),
  sendEmailMock: vi.fn(async () => ({})),
  stripeMock: vi.fn(),
  notifyAdminsMock: vi.fn(),
  pagarmeCreateMock: vi.fn(),
  pagarmeCancelMock: vi.fn(async () => ({ id: 'psub_1', status: 'canceled' })),
  pagarmeCustomerMock: vi.fn(async () => 'cus_pagarme_1'),
  pagarmeUpdateCardMock: vi.fn(async () => ({
    id: 'psub_1',
    status: 'active',
    card: { brand: 'mastercard', last_four_digits: '1111' },
  })),
}));

vi.mock('../config/database.js', () => ({
  query: queryMock,
  getClient: async () => ({ query: clientQueryMock, release: releaseMock }),
}));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));
vi.mock('./email.service.js', () => ({ sendTemplateEmail: sendEmailMock }));
vi.mock('./admin-notification.service.js', () => ({
  notifyAdminsOfPaymentAsync: notifyAdminsMock,
  notifyAdminsOfPayment: notifyAdminsMock,
}));
vi.mock('../utils/stripe.js', () => ({ getStripe: stripeMock }));
vi.mock('../utils/pagarme.js', async () => {
  const actual = await vi.importActual<typeof import('../utils/pagarme.js')>('../utils/pagarme.js');
  return {
    ...actual,
    createSubscription: pagarmeCreateMock,
    cancelSubscription: pagarmeCancelMock,
    getOrCreatePagarmeCustomer: pagarmeCustomerMock,
    updateSubscriptionCard: pagarmeUpdateCardMock,
  };
});
// Without this the real Zod env schema runs at import time and `process.exit(1)`s
// the worker, which surfaces as "no tests" rather than a failure.
vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    ADMIN_EMAIL: 'geeketoys@gmail.com',
    FRONTEND_URL: 'https://club.geeketoys.com.br',
    PAGARME_SECRET_KEY: 'sk_test_x',
    PAGARME_API_URL: 'https://api.pagar.me/core/v5',
    PAGARME_STATEMENT_DESCRIPTOR: 'GEEKPOPTOYS',
    PAGARME_MAX_INSTALLMENTS: 6,
    PAGARME_MIN_INSTALLMENT_AMOUNT: 20,
  },
}));

import {
  createSubscription,
  getSubscription,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  updatePaymentMethod,
  getSubscriptionPayments,
} from './subscription.service.js';

type Reply = { rows?: Record<string, unknown>[]; rowCount?: number };
let routes: [string, Reply][] = [];
let clientRoutes: [string, Reply][] = [];
const sqlLog: string[] = [];
const clientSqlLog: string[] = [];

const sqlOf = (a: unknown) => (typeof a === 'string' ? a.replace(/\s+/g, ' ').trim() : '');
const ran = (...f: string[]) => clientSqlLog.some((s) => f.every((x) => s.includes(x)));
const clientParamsOf = (...f: string[]) =>
  clientQueryMock.mock.calls.find((c) => f.every((x) => sqlOf(c[0]).includes(x)))?.[1] as
    | unknown[]
    | undefined;
const route = (fragment: string, reply: Reply) => routes.push([fragment, reply]);
const clientRoute = (fragment: string, reply: Reply) => clientRoutes.push([fragment, reply]);

/** A subscription created after the migration. */
const subRow = {
  id: 'sub_psub1',
  member_id: 'member-1',
  provider_id: 'psub1',
  provider: 'pagarme',
  status: 'authorized',
  plan: 'basic',
  transaction_amount: '12.50',
};

/** One from before it. `provider` is NULL on every such row, hence the default. */
const legacyStripeSubRow = {
  id: 'sub_stripe1',
  member_id: 'member-1',
  provider_id: 'stripe1',
  provider: null,
  status: 'authorized',
  plan: 'basic',
  transaction_amount: '12.50',
};

const memberRow = {
  id: 'member-1',
  email: 'ana@example.com',
  full_name: 'Ana Souza',
  cpf: '52998224725',
  phone: '21999998888',
  pagarme_customer_id: null,
};

let subscriptionsCreate: ReturnType<typeof vi.fn>;
let subscriptionsUpdate: ReturnType<typeof vi.fn>;
let subscriptionsCancel: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  sqlLog.length = 0;
  clientSqlLog.length = 0;
  routes = [];
  clientRoutes = [];

  queryMock.mockImplementation(async (text: unknown) => {
    const sql = sqlOf(text);
    sqlLog.push(sql);
    for (const [f, r] of routes) {
      if (sql.includes(f)) return { rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) };
    }
    return { rows: [], rowCount: 0 };
  });

  clientQueryMock.mockImplementation(async (text: unknown) => {
    const sql = sqlOf(text);
    clientSqlLog.push(sql);
    for (const [f, r] of clientRoutes) {
      if (sql.includes(f)) return { rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) };
    }
    return { rows: [], rowCount: 0 };
  });

  subscriptionsCreate = vi.fn(async () => ({ id: 'stripe1', status: 'incomplete' }));
  subscriptionsUpdate = vi.fn(async () => ({}));
  subscriptionsCancel = vi.fn(async () => ({}));
  stripeMock.mockReturnValue({
    subscriptions: {
      create: subscriptionsCreate,
      update: subscriptionsUpdate,
      cancel: subscriptionsCancel,
    },
  });

  pagarmeCreateMock.mockResolvedValue({
    id: 'psub1',
    status: 'future',
    next_billing_at: '2026-10-01T00:00:00Z',
    card: { brand: 'visa', last_four_digits: '4242' },
  });
});

/** The minimum a caller must now send: the plan, the payer and a card token. */
const CREATE_INPUT = {
  member_id: 'member-1',
  plan: 'basic',
  payer_email: 'ana@example.com',
  payer_name: 'Ana',
  card_token: 'token_abc',
};

// ─── createSubscription ──────────────────────────────────────────────────────

describe('createSubscription', () => {
  function happyPath() {
    route('FROM members WHERE id', { rows: [memberRow] });
    clientRoute('INSERT INTO subscriptions', { rows: [] });
  }

  /**
   * The client sends `transaction_amount` and `frequency_type`; both are
   * ignored. Locking only the amount would let a request ask for `year` and buy
   * twelve months for R$ 12,50.
   */
  it('ignora valor e periodicidade vindos do cliente', async () => {
    happyPath();

    await createSubscription({
      ...CREATE_INPUT,
      frequency_type: 'years',
      transaction_amount: 1,
    } as never);

    const args = pagarmeCreateMock.mock.calls[0][0] as Record<string, unknown>;
    const item = (args.items as Record<string, unknown>[])[0];
    expect((item.pricing_scheme as Record<string, unknown>).price).toBe(1250);
    expect(args.interval).toBe('month');
    expect(args.interval_count).toBe(1);
    // And the row stores the server figure, not the client's.
    expect(clientParamsOf('INSERT INTO subscriptions')?.[6]).toBe(12.5);
  });

  it('recusa quando o membro não existe', async () => {
    route('FROM members WHERE id', { rows: [] });

    await expect(
      createSubscription({ ...CREATE_INPUT, member_id: 'ghost' } as never)
    ).rejects.toThrow('Membro não encontrado');

    expect(pagarmeCreateMock).not.toHaveBeenCalled();
  });

  /** No token, no recurrence — and nothing is written before we know that. */
  it('exige o token do cartão', async () => {
    await expect(
      createSubscription({ ...CREATE_INPUT, card_token: '' } as never)
    ).rejects.toThrow('Cartão não informado.');

    expect(pagarmeCreateMock).not.toHaveBeenCalled();
    expect(clientSqlLog).toHaveLength(0);
  });

  /**
   * The acquirer refuses a recurrence without a valid document, so a member
   * whose CPF is a placeholder is stopped here rather than at a 422 three
   * steps later.
   */
  it('recusa quem não tem CPF válido no cadastro', async () => {
    route('FROM members WHERE id', { rows: [{ ...memberRow, cpf: '11111111111' }] });

    await expect(createSubscription(CREATE_INPUT as never)).rejects.toThrow('CPF válido');
    expect(pagarmeCreateMock).not.toHaveBeenCalled();
  });

  it('grava assinatura e membro na mesma transação', async () => {
    happyPath();

    await createSubscription(CREATE_INPUT as never);

    expect(ran('BEGIN')).toBe(true);
    expect(ran('INSERT INTO subscriptions')).toBe(true);
    expect(ran('UPDATE members SET subscription_id')).toBe(true);
    expect(ran('COMMIT')).toBe(true);
  });

  /** The provider is stamped on the row: it is what pause and cancel branch on. */
  it('marca a linha como Pagar.me', async () => {
    happyPath();

    await createSubscription(CREATE_INPUT as never);

    expect(ran('INSERT INTO subscriptions', "'pagarme'")).toBe(true);
  });

  it('faz ROLLBACK e propaga quando a gravação falha', async () => {
    route('FROM members WHERE id', { rows: [memberRow] });
    clientQueryMock.mockImplementation(async (text: unknown) => {
      const sql = sqlOf(text);
      clientSqlLog.push(sql);
      if (sql.includes('INSERT INTO subscriptions')) throw new Error('constraint violation');
      return { rows: [], rowCount: 0 };
    });

    await expect(createSubscription(CREATE_INPUT as never)).rejects.toThrow('constraint violation');

    expect(ran('ROLLBACK')).toBe(true);
    expect(releaseMock).toHaveBeenCalled();
  });

  /**
   * Pagar.me authorises the first charge synchronously, so there is no
   * `clientSecret` to hand back any more — the browser gets the outcome and the
   * card it billed.
   */
  it('devolve o estado da assinatura e o cartão, sem clientSecret', async () => {
    happyPath();

    const out = await createSubscription(CREATE_INPUT as never);

    expect(out).toMatchObject({
      id: 'sub_psub1',
      status: 'pending',
      provider: 'pagarme',
      cardBrand: 'visa',
      cardLastFour: '4242',
    });
    expect(out).not.toHaveProperty('clientSecret');
  });

  it('nasce `authorized` quando a Pagar.me já ativou na hora', async () => {
    happyPath();
    pagarmeCreateMock.mockResolvedValueOnce({
      id: 'psub1',
      status: 'active',
      card: { brand: 'visa', last_four_digits: '4242' },
    });

    const out = await createSubscription(CREATE_INPUT as never);

    expect(out.status).toBe('authorized');
    expect(notifyAdminsMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payment_received' })
    );
  });
});

// ─── pause / resume / cancel ─────────────────────────────────────────────────

describe('pause, resume e cancel', () => {
  function found(status = 'authorized', row: Record<string, unknown> = subRow) {
    route('FROM subscriptions WHERE id', { rows: [{ ...row, status }] });
    route('FROM members WHERE subscription_id', { rows: [memberRow] });
  }

  /**
   * Pagar.me has no pause, so pausing ends the recurrence at the provider and
   * keeps our row `paused`. That is a real difference from the Stripe era and
   * it is why `resumeSubscription` asks for a card again.
   */
  it('pausar encerra a recorrência na Pagar.me e espelha no membro', async () => {
    found();
    clientRoute("SET status = 'paused'", { rows: [{ ...subRow, status: 'paused' }] });

    await pauseSubscription('sub_psub1');

    expect(pagarmeCancelMock).toHaveBeenCalledWith('psub1');
    // The mirrored status is what the shop discount and the card read.
    expect(ran('UPDATE members', "subscription_status = 'paused'")).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'subscription-paused' })
    );
  });

  it('retomar uma assinatura Pagar.me pede o cartão de novo, em vez de falhar torto', async () => {
    found('paused');

    await expect(resumeSubscription('sub_psub1')).rejects.toThrow('informe o cartão novamente');
    // Nothing may move locally when the provider side cannot be restored.
    expect(clientSqlLog).toHaveLength(0);
  });

  it('cancelar desliga a renovação automática', async () => {
    found();
    clientRoute("SET status = 'cancelled'", { rows: [{ ...subRow, status: 'cancelled' }] });

    await cancelSubscription('sub_psub1');

    expect(pagarmeCancelMock).toHaveBeenCalledWith('psub1');
    expect(ran('UPDATE members', "subscription_status = 'cancelled'", 'auto_renewal = FALSE')).toBe(
      true
    );
  });

  // ── Legacy Stripe rows ────────────────────────────────────────────────────
  //
  // `provider` is NULL on every subscription created before the migration, and
  // those members are still being billed by Stripe. Branching on the stored
  // column — defaulting to Stripe — is what keeps them cancellable.

  it('pausa no Stripe quando a assinatura é anterior à migração', async () => {
    found('authorized', legacyStripeSubRow);
    clientRoute("SET status = 'paused'", { rows: [{ ...legacyStripeSubRow, status: 'paused' }] });

    await pauseSubscription('sub_stripe1');

    expect(subscriptionsUpdate).toHaveBeenCalledWith('stripe1', {
      pause_collection: { behavior: 'void' },
    });
    expect(pagarmeCancelMock).not.toHaveBeenCalled();
  });

  it('retoma no Stripe uma assinatura anterior à migração', async () => {
    found('paused', legacyStripeSubRow);
    clientRoute("SET status = 'authorized'", {
      rows: [{ ...legacyStripeSubRow, status: 'authorized' }],
    });

    await resumeSubscription('sub_stripe1');

    expect(subscriptionsUpdate).toHaveBeenCalledWith('stripe1', { pause_collection: '' });
    expect(ran('UPDATE members', "subscription_status = 'authorized'")).toBe(true);
  });

  it('cancela no Stripe uma assinatura anterior à migração', async () => {
    found('authorized', legacyStripeSubRow);
    clientRoute("SET status = 'cancelled'", {
      rows: [{ ...legacyStripeSubRow, status: 'cancelled' }],
    });

    await cancelSubscription('sub_stripe1');

    expect(subscriptionsCancel).toHaveBeenCalledWith('stripe1');
    expect(pagarmeCancelMock).not.toHaveBeenCalled();
  });

  it.each([
    ['pausar', pauseSubscription],
    ['retomar', resumeSubscription],
    ['cancelar', cancelSubscription],
  ])('%s uma assinatura inexistente é 404, não silêncio', async (_label, fn) => {
    route('FROM subscriptions WHERE id', { rows: [] });

    await expect(fn('ghost')).rejects.toThrow('Assinatura não encontrada');
    expect(clientSqlLog).toHaveLength(0);
  });

  /**
   * Provider first, always: a local row that says `paused` over a recurrence
   * still live at the operator keeps billing a member who thinks they stopped.
   */
  it('não toca no banco se a Pagar.me recusar', async () => {
    found();
    pagarmeCancelMock.mockRejectedValueOnce(new Error('pagarme down'));

    await expect(pauseSubscription('sub_psub1')).rejects.toThrow('pagarme down');
    expect(ran('UPDATE subscriptions')).toBe(false);
  });

  it('não toca no banco se o Stripe recusar', async () => {
    found('authorized', legacyStripeSubRow);
    subscriptionsUpdate.mockRejectedValueOnce(new Error('stripe down'));

    await expect(pauseSubscription('sub_stripe1')).rejects.toThrow('stripe down');
    expect(ran('UPDATE subscriptions')).toBe(false);
  });

  it('uma falha de e-mail não desfaz o cancelamento', async () => {
    found();
    clientRoute("SET status = 'cancelled'", { rows: [{ ...subRow, status: 'cancelled' }] });
    sendEmailMock.mockRejectedValueOnce(new Error('resend down'));

    await expect(cancelSubscription('sub_psub1')).resolves.toMatchObject({ status: 'cancelled' });
  });
});

// ─── updatePaymentMethod ─────────────────────────────────────────────────────

describe('updatePaymentMethod', () => {
  /**
   * Swapping the card must not disturb the cycle: the member keeps the days
   * they paid for and the next charge lands on the same date.
   */
  it('troca o cartão da recorrência na Pagar.me e guarda a bandeira', async () => {
    route('FROM subscriptions WHERE id', { rows: [subRow] });

    const out = await updatePaymentMethod('sub_psub1', 'token_new');

    expect(pagarmeUpdateCardMock).toHaveBeenCalledWith('psub1', 'token_new');
    expect(out).toMatchObject({ cardBrand: 'mastercard', cardLastFour: '1111' });
    expect(sqlLog.some((q) => q.includes('UPDATE subscriptions SET card_last_four'))).toBe(true);
  });

  /** The token is a card credential, single-use or not: it never reaches a log. */
  it('não registra o token no log de auditoria', async () => {
    route('FROM subscriptions WHERE id', { rows: [subRow] });

    await updatePaymentMethod('sub_psub1', 'token_secret');

    expect(JSON.stringify(auditMock.mock.calls)).not.toContain('token_secret');
  });

  it('uma assinatura anterior à migração ainda troca o cartão pelo Stripe', async () => {
    route('FROM subscriptions WHERE id', { rows: [legacyStripeSubRow] });
    const attach = vi.fn(async () => ({}));
    const retrieve = vi.fn(async () => ({ card: { last4: '9999', brand: 'amex' } }));
    stripeMock.mockReturnValue({
      subscriptions: {
        retrieve: vi.fn(async () => ({ customer: 'cus_1' })),
        update: subscriptionsUpdate,
      },
      paymentMethods: { attach, retrieve },
    });

    const out = await updatePaymentMethod('sub_stripe1', 'pm_1');

    expect(attach).toHaveBeenCalledWith('pm_1', { customer: 'cus_1' });
    expect(out).toMatchObject({ cardBrand: 'amex', cardLastFour: '9999' });
    expect(pagarmeUpdateCardMock).not.toHaveBeenCalled();
  });
});

// ─── reads ───────────────────────────────────────────────────────────────────

describe('leituras', () => {
  it('getSubscription devolve null para id desconhecido', async () => {
    route('FROM subscriptions WHERE id', { rows: [] });
    await expect(getSubscription('ghost')).resolves.toBeNull();
  });

  it('getSubscription mapeia a linha', async () => {
    route('FROM subscriptions WHERE id', { rows: [subRow] });
    await expect(getSubscription('sub_psub1')).resolves.toMatchObject({
      id: 'sub_psub1',
      provider: 'pagarme',
    });
  });

  /** A row from before the migration reads as Stripe, which is what it is. */
  it('getSubscription trata provider NULL como Stripe', async () => {
    route('FROM subscriptions WHERE id', { rows: [legacyStripeSubRow] });
    await expect(getSubscription('sub_stripe1')).resolves.toMatchObject({ provider: 'stripe' });
  });

  it('getSubscriptionPayments lê o extrato da assinatura', async () => {
    route('FROM subscription_payments', { rows: [{ id: 'sp_1' }] });

    await getSubscriptionPayments('sub_stripe1', 5);

    expect(sqlLog.some((s) => s.includes('subscription_payments'))).toBe(true);
  });
});
