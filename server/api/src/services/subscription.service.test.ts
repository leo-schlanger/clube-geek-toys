import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Club subscription — the recurring R$ 12,50/month on Stripe.
 *
 * What these protect, ordered by what a regression costs:
 *
 *  1. The client never chooses the amount **or the interval**. Locking only the
 *     amount would let a request ask for `year` and buy twelve months for the
 *     price of one.
 *  2. Stripe is called before the local rows change, and the two rows —
 *     `subscriptions` and `members` — move together or not at all.
 *  3. Pause, resume and cancel keep the member's mirrored status in step; a
 *     drifted mirror is what decides the shop discount and the digital card.
 *  4. A missing subscription is a 404, never a silent no-op.
 */

const { queryMock, clientQueryMock, releaseMock, auditMock, sendEmailMock, stripeMock, customerMock } =
  vi.hoisted(() => ({
    queryMock: vi.fn(),
    clientQueryMock: vi.fn(),
    releaseMock: vi.fn(),
    auditMock: vi.fn(async () => {}),
    sendEmailMock: vi.fn(async () => ({})),
    stripeMock: vi.fn(),
    customerMock: vi.fn(async () => 'cus_1'),
  }));

vi.mock('../config/database.js', () => ({
  query: queryMock,
  getClient: async () => ({ query: clientQueryMock, release: releaseMock }),
}));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));
vi.mock('./email.service.js', () => ({ sendTemplateEmail: sendEmailMock }));
vi.mock('../utils/stripe.js', () => ({ getStripe: stripeMock, getOrCreateCustomer: customerMock }));
// Without this the real Zod env schema runs at import time and `process.exit(1)`s
// the worker, which surfaces as "no tests" rather than a failure.
vi.mock('../config/env.js', () => ({
  env: { NODE_ENV: 'test', ADMIN_EMAIL: 'geeketoys@gmail.com', FRONTEND_URL: 'https://club.geeketoys.com.br' },
}));

import {
  createSubscription,
  getSubscription,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
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

const subRow = {
  id: 'sub_stripe1',
  member_id: 'member-1',
  provider_id: 'stripe1',
  status: 'authorized',
  plan: 'basic',
  transaction_amount: '12.50',
};

const memberRow = {
  id: 'member-1',
  email: 'ana@example.com',
  full_name: 'Ana Souza',
  stripe_customer_id: null,
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

  subscriptionsCreate = vi.fn(async () => ({
    id: 'stripe1',
    status: 'incomplete',
    latest_invoice: { payment_intent: { client_secret: 'cs_live_1' } },
  }));
  subscriptionsUpdate = vi.fn(async () => ({}));
  subscriptionsCancel = vi.fn(async () => ({}));
  stripeMock.mockReturnValue({
    subscriptions: {
      create: subscriptionsCreate,
      update: subscriptionsUpdate,
      cancel: subscriptionsCancel,
    },
  });
});

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
      member_id: 'member-1',
      plan: 'basic',
      payer_email: 'ana@example.com',
      payer_name: 'Ana',
      frequency_type: 'years',
      transaction_amount: 1,
    } as never);

    const args = subscriptionsCreate.mock.calls[0][0] as Record<string, unknown>;
    const item = (args.items as Record<string, unknown>[])[0];
    const priceData = item.price_data as Record<string, unknown>;
    expect(priceData.unit_amount).toBe(1250);
    expect((priceData.recurring as Record<string, unknown>).interval).toBe('month');
    // And the row stores the server figure, not the client's.
    expect(clientParamsOf('INSERT INTO subscriptions')?.[6]).toBe(12.5);
  });

  it('recusa quando o membro não existe', async () => {
    route('FROM members WHERE id', { rows: [] });

    await expect(
      createSubscription({
        member_id: 'ghost',
        plan: 'basic',
        payer_email: 'a@b.c',
        payer_name: 'A',
      } as never)
    ).rejects.toThrow('Membro não encontrado');

    expect(subscriptionsCreate).not.toHaveBeenCalled();
  });

  it('grava assinatura e membro na mesma transação', async () => {
    happyPath();

    await createSubscription({
      member_id: 'member-1',
      plan: 'basic',
      payer_email: 'ana@example.com',
      payer_name: 'Ana',
    } as never);

    expect(ran('BEGIN')).toBe(true);
    expect(ran('INSERT INTO subscriptions')).toBe(true);
    expect(ran('UPDATE members SET subscription_id')).toBe(true);
    expect(ran('COMMIT')).toBe(true);
  });

  it('faz ROLLBACK e propaga quando a gravação falha', async () => {
    route('FROM members WHERE id', { rows: [memberRow] });
    clientQueryMock.mockImplementation(async (text: unknown) => {
      const sql = sqlOf(text);
      clientSqlLog.push(sql);
      if (sql.includes('INSERT INTO subscriptions')) throw new Error('constraint violation');
      return { rows: [], rowCount: 0 };
    });

    await expect(
      createSubscription({
        member_id: 'member-1',
        plan: 'basic',
        payer_email: 'ana@example.com',
        payer_name: 'Ana',
      } as never)
    ).rejects.toThrow('constraint violation');

    expect(ran('ROLLBACK')).toBe(true);
    expect(releaseMock).toHaveBeenCalled();
  });

  it('devolve o clientSecret da fatura para o front confirmar', async () => {
    happyPath();

    const out = await createSubscription({
      member_id: 'member-1',
      plan: 'basic',
      payer_email: 'ana@example.com',
      payer_name: 'Ana',
    } as never);

    expect(out).toMatchObject({ id: 'sub_stripe1', clientSecret: 'cs_live_1', status: 'pending' });
  });

  it('nasce `authorized` quando o Stripe já ativou na hora', async () => {
    happyPath();
    subscriptionsCreate.mockResolvedValueOnce({
      id: 'stripe1',
      status: 'active',
      latest_invoice: { payment_intent: { client_secret: 'cs_1' } },
    });

    const out = await createSubscription({
      member_id: 'member-1',
      plan: 'basic',
      payer_email: 'ana@example.com',
      payer_name: 'Ana',
    } as never);

    expect(out.status).toBe('authorized');
  });
});

// ─── pause / resume / cancel ─────────────────────────────────────────────────

describe('pause, resume e cancel', () => {
  function found(status = 'authorized') {
    route('FROM subscriptions WHERE id', { rows: [{ ...subRow, status }] });
    route('FROM members WHERE subscription_id', { rows: [memberRow] });
  }

  it('pausa no Stripe e espelha no membro', async () => {
    found();
    clientRoute("SET status = 'paused'", { rows: [{ ...subRow, status: 'paused' }] });

    await pauseSubscription('sub_stripe1');

    expect(subscriptionsUpdate).toHaveBeenCalledWith('stripe1', {
      pause_collection: { behavior: 'void' },
    });
    // The mirrored status is what the shop discount and the card read.
    expect(ran('UPDATE members', "subscription_status = 'paused'")).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'subscription-paused' })
    );
  });

  it('retoma limpando o pause no Stripe', async () => {
    found('paused');
    clientRoute("SET status = 'authorized'", { rows: [{ ...subRow, status: 'authorized' }] });

    await resumeSubscription('sub_stripe1');

    expect(subscriptionsUpdate).toHaveBeenCalledWith('stripe1', { pause_collection: '' });
    expect(ran('UPDATE members', "subscription_status = 'authorized'")).toBe(true);
  });

  it('cancelar desliga a renovação automática', async () => {
    found();
    clientRoute("SET status = 'cancelled'", { rows: [{ ...subRow, status: 'cancelled' }] });

    await cancelSubscription('sub_stripe1');

    expect(subscriptionsCancel).toHaveBeenCalledWith('stripe1');
    expect(ran('UPDATE members', "subscription_status = 'cancelled'", 'auto_renewal = FALSE')).toBe(
      true
    );
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

  /** Stripe first: a local row saying `paused` over a live subscription bills. */
  it('não toca no banco se o Stripe recusar', async () => {
    found();
    subscriptionsUpdate.mockRejectedValueOnce(new Error('stripe down'));

    await expect(pauseSubscription('sub_stripe1')).rejects.toThrow('stripe down');
    expect(ran('UPDATE subscriptions')).toBe(false);
  });

  it('uma falha de e-mail não desfaz o cancelamento', async () => {
    found();
    clientRoute("SET status = 'cancelled'", { rows: [{ ...subRow, status: 'cancelled' }] });
    sendEmailMock.mockRejectedValueOnce(new Error('resend down'));

    await expect(cancelSubscription('sub_stripe1')).resolves.toMatchObject({ status: 'cancelled' });
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
    await expect(getSubscription('sub_stripe1')).resolves.toMatchObject({ id: 'sub_stripe1' });
  });

  it('getSubscriptionPayments lê o extrato da assinatura', async () => {
    route('FROM subscription_payments', { rows: [{ id: 'sp_1' }] });

    await getSubscriptionPayments('sub_stripe1', 5);

    expect(sqlLog.some((s) => s.includes('subscription_payments'))).toBe(true);
  });
});
