import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Club payments — PIX and card for the R$ 12,50 monthly plan.
 *
 * What these protect, ordered by what a regression costs:
 *
 *  1. The amount is never the client's to choose: it is checked against
 *     `CLUB_PLAN_PRICE` on both PIX and card.
 *  2. Confirming a PIX claims the row first. Two clicks in the panel used to
 *     pass the `status === 'paid'` read-guard together and hand the member
 *     `payment_count + 1` twice and **two months** for one payment.
 *  3. A member only ever sees their own payment (`userOwnsPayment`).
 *  4. A refund marks the row only after Stripe accepted it, and never twice.
 *  5. Proration credits the unused days instead of charging the full plan.
 */

const { queryMock, auditMock, sendEmailMock, stripeMock, customerMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  auditMock: vi.fn(async () => {}),
  sendEmailMock: vi.fn(async () => ({})),
  stripeMock: vi.fn(),
  customerMock: vi.fn(async () => 'cus_1'),
}));

vi.mock('../config/database.js', () => ({ query: queryMock }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));
vi.mock('./email.service.js', () => ({ sendTemplateEmail: sendEmailMock }));
vi.mock('../utils/stripe.js', () => ({
  getStripe: stripeMock,
  getOrCreateCustomer: customerMock,
  mapStripePaymentStatus: (s: string) => (s === 'succeeded' ? 'paid' : 'pending'),
}));
vi.mock('../config/env.js', () => ({
  env: {
    PIX_KEY: 'geekpopee@gmail.com',
    PIX_MERCHANT_NAME: 'GEEKPOP E TOYS',
    PIX_MERCHANT_CITY: 'RIO DE JANEIRO',
    ADMIN_EMAIL: 'geeketoys@gmail.com',
    FRONTEND_URL: 'https://club.geeketoys.com.br',
  },
  // Fiel ao real; o `email-contract.test.ts` exercita a função sem mock.
  adminUrl: (path = '/admin') => `https://adm.geeketoys.com.br${path}`,
}));

import {
  createPixPayment,
  confirmPixPayment,
  createCardPayment,
  userOwnsPayment,
  refundPayment,
  calculateUpgradeCharge,
  findRecentPayment,
} from './payment.service.js';

const PLAN_PRICE = 12.5;

type Reply = { rows?: Record<string, unknown>[]; rowCount?: number };
let routes: [string, Reply][] = [];
const sqlLog: string[] = [];

const sqlOf = (a: unknown) => (typeof a === 'string' ? a.replace(/\s+/g, ' ').trim() : '');
const ran = (...f: string[]) => sqlLog.some((s) => f.every((x) => s.includes(x)));
const paramsOf = (...f: string[]) =>
  queryMock.mock.calls.find((c) => f.every((x) => sqlOf(c[0]).includes(x)))?.[1] as
    | unknown[]
    | undefined;
const route = (fragment: string, reply: Reply) => routes.push([fragment, reply]);

beforeEach(() => {
  vi.clearAllMocks();
  sqlLog.length = 0;
  routes = [];
  queryMock.mockImplementation(async (text: unknown) => {
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

const memberRow = {
  id: 'member-1',
  email: 'ana@example.com',
  full_name: 'Ana Souza',
  plan: 'basic',
  stripe_customer_id: null,
};

// ─── Amount ──────────────────────────────────────────────────────────────────

describe('valor cobrado', () => {
  /** The request carries an amount; the plan price is what decides. */
  it.each([
    ['abaixo do plano', 1],
    ['acima do plano', 99],
    ['dez centavos a mais', 12.6],
  ])('recusa PIX com valor %s', async (_label, amount) => {
    route('FROM members WHERE id', { rows: [memberRow] });

    await expect(
      createPixPayment({
        amount: amount as number,
        description: 'Plano',
        payerEmail: 'ana@example.com',
        memberId: 'member-1',
      })
    ).rejects.toThrow();

    expect(ran('INSERT INTO payments')).toBe(false);
  });

  it('recusa cartão com valor divergente do plano', async () => {
    await expect(
      createCardPayment({
        amount: 1,
        description: 'Plano',
        payerEmail: 'ana@example.com',
        payerName: 'Ana',
        memberId: 'member-1',
      })
    ).rejects.toThrow();

    expect(stripeMock).not.toHaveBeenCalled();
  });

  /**
   * The guard is `Math.abs(CLUB_PLAN_PRICE - amount) < 0.01`, and in IEEE-754
   * `12.51 - 12.50` is 0.00999…, so one cent over slips through. Pinned here so
   * the tolerance is a decision on the record rather than an accident — a cent
   * is not worth chasing, but widening it would be.
   */
  it('tolera até um centavo de diferença, e não mais', async () => {
    route('FROM members WHERE id', { rows: [memberRow] });

    await expect(
      createPixPayment({
        amount: 12.51,
        description: 'Plano',
        payerEmail: 'ana@example.com',
        memberId: 'member-1',
      })
    ).resolves.toBeDefined();

    await expect(
      createPixPayment({
        amount: 12.52,
        description: 'Plano',
        payerEmail: 'ana@example.com',
        memberId: 'member-1',
      })
    ).rejects.toThrow();
  });

  it('aceita exatamente o preço do plano', async () => {
    route('FROM members WHERE id', { rows: [memberRow] });

    const result = await createPixPayment({
      amount: PLAN_PRICE,
      description: 'Plano',
      payerEmail: 'ana@example.com',
      memberId: 'member-1',
    });

    expect(result.pixData.amount).toBe(PLAN_PRICE);
    // The EMV must carry the same figure the row does.
    expect(result.pixData.emvCode).toContain('540512.50');
    expect(paramsOf('INSERT INTO payments')?.[2]).toBe(PLAN_PRICE);
  });
});

// ─── PIX creation ────────────────────────────────────────────────────────────

describe('createPixPayment', () => {
  it('recusa quando o membro não existe', async () => {
    route('FROM members WHERE id', { rows: [] });

    await expect(
      createPixPayment({
        amount: PLAN_PRICE,
        description: 'Plano',
        payerEmail: 'ana@example.com',
        memberId: 'ghost',
      })
    ).rejects.toThrow('Membro não encontrado.');
  });

  it('avisa a admin, que é quem confirma o PIX à mão', async () => {
    route('FROM members WHERE id', { rows: [memberRow] });

    await createPixPayment({
      amount: PLAN_PRICE,
      description: 'Plano',
      payerEmail: 'ana@example.com',
      memberId: 'member-1',
    });

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'admin-pix-pending', to: 'geeketoys@gmail.com' })
    );
  });

  it('grava o txid como provider_id, que é o que liga o extrato ao pagamento', async () => {
    route('FROM members WHERE id', { rows: [memberRow] });

    const result = await createPixPayment({
      amount: PLAN_PRICE,
      description: 'Plano',
      payerEmail: 'ana@example.com',
      memberId: 'member-1',
    });

    const params = paramsOf('INSERT INTO payments');
    expect(params?.[3]).toBe(result.pixData.txId);
    expect(result.pixData.emvCode).toContain(result.pixData.txId);
  });
});

// ─── PIX confirmation ────────────────────────────────────────────────────────

describe('confirmPixPayment', () => {
  const pendingPix = {
    id: 'pay-1',
    member_id: 'member-1',
    amount: '12.50',
    method: 'pix',
    status: 'pending',
    provider_id: 'CGT1',
  };

  /**
   * The read-guard above the claim is a hint, not a lock. Two admins (or two
   * clicks) both read `pending`, both passed, and the expiry was computed from
   * the row each had already read — one payment, two months.
   */
  it('só o writer que virou a linha segue em frente', async () => {
    route('FROM payments p', { rows: [pendingPix] });
    route("UPDATE payments SET status = 'paid'", { rows: [] }); // lost the race

    const result = await confirmPixPayment({ paymentId: 'pay-1', adminUserId: 'admin-1' });

    expect(result).toEqual({ success: true });
    // The whole point: the loser must not touch the member.
    expect(ran('UPDATE members')).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('a claim exige que a linha ainda não esteja paga', async () => {
    route('FROM payments p', { rows: [pendingPix] });
    route("UPDATE payments SET status = 'paid'", { rows: [{ id: 'pay-1' }] });
    route('FROM members WHERE id', { rows: [{ ...memberRow, payment_type: 'monthly', status: 'pending', expiry_date: null }] });

    await confirmPixPayment({ paymentId: 'pay-1', adminUserId: 'admin-1' });

    expect(ran("UPDATE payments SET status = 'paid'", "status <> 'paid'")).toBe(true);
  });

  it('ativa o membro e avisa por e-mail quando a claim é ganha', async () => {
    route('FROM payments p', { rows: [pendingPix] });
    route("UPDATE payments SET status = 'paid'", { rows: [{ id: 'pay-1' }] });
    route('SELECT id, payment_type, status, expiry_date FROM members', {
      rows: [{ id: 'member-1', payment_type: 'monthly', status: 'pending', expiry_date: null }],
    });
    route('SELECT full_name, email, plan FROM members', { rows: [memberRow] });

    await confirmPixPayment({ paymentId: 'pay-1', adminUserId: 'admin-1' });

    expect(ran('UPDATE members', "status = 'active'")).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'payment-confirmed', to: 'ana@example.com' })
    );
  });

  it('é idempotente para uma linha já paga', async () => {
    route('FROM payments p', { rows: [{ ...pendingPix, status: 'paid' }] });

    const result = await confirmPixPayment({ paymentId: 'pay-1', adminUserId: 'admin-1' });

    expect(result).toEqual({ success: true });
    expect(ran("UPDATE payments SET status = 'paid'")).toBe(false);
  });

  it('recusa confirmar à mão um pagamento que não é PIX', async () => {
    route('FROM payments p', { rows: [{ ...pendingPix, method: 'credit_card' }] });

    await expect(
      confirmPixPayment({ paymentId: 'pay-1', adminUserId: 'admin-1' })
    ).rejects.toThrow('Apenas pagamentos PIX');
  });

  it('recusa um id inexistente', async () => {
    route('FROM payments p', { rows: [] });

    await expect(
      confirmPixPayment({ paymentId: 'ghost', adminUserId: 'admin-1' })
    ).rejects.toThrow('Pagamento não encontrado');
  });
});

// ─── Ownership ───────────────────────────────────────────────────────────────

describe('userOwnsPayment', () => {
  /** The status route used to answer for anyone's payment. */
  it('casa por provider_id quando o id é um PaymentIntent', async () => {
    route('FROM payments p', { rows: [{ '?column?': 1 }] });

    await expect(userOwnsPayment('user-1', 'pi_abc')).resolves.toBe(true);
    expect(ran('p.provider_id = $1')).toBe(true);
  });

  it('casa pelo id local quando não é um PaymentIntent', async () => {
    route('FROM payments p', { rows: [{ '?column?': 1 }] });

    await userOwnsPayment('user-1', 'a3f1e0c2-0000-4000-8000-000000000000');
    expect(ran('p.id::text = $1')).toBe(true);
  });

  it('exige que o pagamento seja do próprio usuário', async () => {
    route('FROM payments p', { rows: [] });

    await expect(userOwnsPayment('user-2', 'pi_abc')).resolves.toBe(false);
    expect(ran('m.user_id = $2')).toBe(true);
  });
});

// ─── Refund ──────────────────────────────────────────────────────────────────

describe('refundPayment', () => {
  const paidRow = {
    id: 'pay-1',
    member_id: 'member-1',
    amount: '12.50',
    method: 'credit_card',
    status: 'paid',
    provider_id: 'pi_abc',
  };

  it('só marca no banco depois que o Stripe aceitou', async () => {
    route('FROM payments p', { rows: [paidRow] });
    const refundsCreate = vi.fn(async () => ({ id: 're_1' }));
    stripeMock.mockReturnValue({ refunds: { create: refundsCreate } });

    await refundPayment({ paymentId: 'pay-1', adminUserId: 'admin-1', reason: 'duplicate' });

    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_abc', reason: 'duplicate' })
    );
    expect(ran("UPDATE payments SET status = 'refunded'")).toBe(true);
  });

  it('não marca nada quando o Stripe recusa', async () => {
    route('FROM payments p', { rows: [paidRow] });
    stripeMock.mockReturnValue({
      refunds: {
        create: vi.fn(async () => {
          throw new Error('charge_already_refunded');
        }),
      },
    });

    await expect(
      refundPayment({ paymentId: 'pay-1', adminUserId: 'admin-1' })
    ).rejects.toThrow('Falha ao solicitar reembolso');

    expect(ran("UPDATE payments SET status = 'refunded'")).toBe(false);
  });

  it('não estorna duas vezes', async () => {
    route('FROM payments p', { rows: [{ ...paidRow, status: 'refunded' }] });

    const result = await refundPayment({ paymentId: 'pay-1', adminUserId: 'admin-1' });

    expect(result).toMatchObject({ alreadyRefunded: true });
    expect(stripeMock).not.toHaveBeenCalled();
  });

  it('recusa estornar um pagamento que nunca foi pago', async () => {
    route('FROM payments p', { rows: [{ ...paidRow, status: 'pending' }] });

    await expect(
      refundPayment({ paymentId: 'pay-1', adminUserId: 'admin-1' })
    ).rejects.toThrow('Apenas pagamentos pagos');
  });

  it('recusa estornar sem referência do provedor', async () => {
    route('FROM payments p', { rows: [{ ...paidRow, provider_id: null }] });

    await expect(
      refundPayment({ paymentId: 'pay-1', adminUserId: 'admin-1' })
    ).rejects.toThrow('sem referência de provedor');
  });
});

// ─── Card ────────────────────────────────────────────────────────────────────

describe('createCardPayment', () => {
  it('cobra em centavos e guarda a linha pendente', async () => {
    route('FROM members WHERE id', { rows: [memberRow] });
    const create = vi.fn(async () => ({
      id: 'pi_new',
      status: 'requires_payment_method',
      client_secret: 'cs_1',
    }));
    stripeMock.mockReturnValue({ paymentIntents: { create } });

    const out = await createCardPayment({
      amount: PLAN_PRICE,
      description: 'Plano',
      payerEmail: 'ana@example.com',
      payerName: 'Ana',
      memberId: 'member-1',
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ amount: 1250, currency: 'brl' }));
    expect(out.clientSecret).toBe('cs_1');
    expect(paramsOf('INSERT INTO payments')?.[2]).toBe('pi_new');
  });

  it('recusa quando o membro não existe', async () => {
    route('FROM members WHERE id', { rows: [] });

    await expect(
      createCardPayment({
        amount: PLAN_PRICE,
        description: 'Plano',
        payerEmail: 'ana@example.com',
        payerName: 'Ana',
        memberId: 'ghost',
      })
    ).rejects.toThrow('Membro não encontrado.');
  });
});

// ─── Proration ───────────────────────────────────────────────────────────────

describe('calculateUpgradeCharge', () => {
  const now = new Date('2026-08-24T00:00:00Z');

  it('credita os dias não usados do plano atual', () => {
    const out = calculateUpgradeCharge({
      currentPlanPrice: 30,
      newPlanPrice: 60,
      expiryDate: new Date('2026-09-08T00:00:00Z'), // 15 days left of 30
      paymentType: 'monthly',
      now,
    });

    expect(out.daysRemaining).toBe(15);
    expect(out.credit).toBe(15);
    expect(out.charge).toBe(45);
  });

  it('nunca gera cobrança negativa', () => {
    const out = calculateUpgradeCharge({
      currentPlanPrice: 100,
      newPlanPrice: 10,
      expiryDate: new Date('2026-09-23T00:00:00Z'),
      paymentType: 'monthly',
      now,
    });

    expect(out.charge).toBe(0);
  });

  it('não credita mais do que o plano custou', () => {
    const out = calculateUpgradeCharge({
      currentPlanPrice: 30,
      newPlanPrice: 60,
      expiryDate: new Date('2027-08-24T00:00:00Z'), // absurdly far
      paymentType: 'monthly',
      now,
    });

    expect(out.credit).toBe(30);
  });

  it('uma vigência já vencida não gera crédito', () => {
    const out = calculateUpgradeCharge({
      currentPlanPrice: 30,
      newPlanPrice: 60,
      expiryDate: new Date('2026-07-01T00:00:00Z'),
      paymentType: 'monthly',
      now,
    });

    expect(out.daysRemaining).toBe(0);
    expect(out.credit).toBe(0);
    expect(out.charge).toBe(60);
  });

  it('usa 365 dias para plano anual', () => {
    const out = calculateUpgradeCharge({
      currentPlanPrice: 365,
      newPlanPrice: 400,
      expiryDate: new Date('2026-09-23T00:00:00Z'), // 30 days
      paymentType: 'annual',
      now,
    });

    expect(out.periodDays).toBe(365);
    expect(out.credit).toBe(30);
  });
});

// ─── Duplicate guard ─────────────────────────────────────────────────────────

describe('findRecentPayment', () => {
  it('procura só pagamento PAGO dentro da janela', async () => {
    route('FROM payments', { rows: [{ id: 'pay-1' }] });

    await findRecentPayment('member-1', 7);

    expect(ran("status = 'paid'", "created_at > NOW() - ($2::int * INTERVAL '1 day')")).toBe(true);
    expect(paramsOf('FROM payments')?.[1]).toBe(7);
  });

  it('devolve null quando não há nada recente', async () => {
    route('FROM payments', { rows: [] });
    await expect(findRecentPayment('member-1')).resolves.toBeNull();
  });
});
