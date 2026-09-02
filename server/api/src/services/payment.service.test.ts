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
 *  4. A refund marks the row only after the provider accepted it, and never twice.
 *  5. Proration credits the unused days instead of charging the full plan.
 *  6. The card is never charged without a token, and a decline is a 402 with a
 *     PT-BR reason — not a pending row the member waits on forever.
 *
 * Only the three network calls are mocked (`createOrder`, `getCharge`,
 * `refundCharge`); the rest of `utils/pagarme` is the real module, so the money
 * maths — reais to centavos, status mapping, instalment ceiling — is under test
 * here rather than restated by a stub.
 */

const {
  queryMock,
  auditMock,
  sendEmailMock,
  stripeMock,
  notifyAdminsMock,
  createOrderMock,
  getChargeMock,
  refundChargeMock,
  createCardMock,
  getOrCreateCustomerMock,
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  auditMock: vi.fn(async () => {}),
  sendEmailMock: vi.fn(async () => ({})),
  stripeMock: vi.fn(),
  notifyAdminsMock: vi.fn(),
  createOrderMock: vi.fn(),
  getChargeMock: vi.fn(),
  refundChargeMock: vi.fn(async () => ({ id: 'ch_1', status: 'canceled' })),
  createCardMock: vi.fn(async () => ({
    id: 'card_1',
    brand: 'visa',
    last_four_digits: '4242',
  })),
  getOrCreateCustomerMock: vi.fn(async () => 'cus_1'),
}));

vi.mock('../config/database.js', () => ({ query: queryMock }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));
vi.mock('./email.service.js', () => ({ sendTemplateEmail: sendEmailMock }));
vi.mock('./admin-notification.service.js', () => ({
  notifyAdminsOfPaymentAsync: notifyAdminsMock,
  notifyAdminsOfPayment: notifyAdminsMock,
}));
vi.mock('../utils/stripe.js', () => ({
  getStripe: stripeMock,
  mapStripePaymentStatus: (s: string) => (s === 'succeeded' ? 'paid' : 'pending'),
}));
vi.mock('../utils/pagarme.js', async () => {
  const actual = await vi.importActual<typeof import('../utils/pagarme.js')>('../utils/pagarme.js');
  return {
    ...actual,
    createOrder: createOrderMock,
    // PSP bills a saved card: the token becomes a `card_id` on the customer
    // before the charge, so both steps are stubbed.
    createCardForCustomer: createCardMock,
    getOrCreatePagarmeCustomer: getOrCreateCustomerMock,
    getCharge: getChargeMock,
    // The throttled variant calls `getCharge` through the module's own closure,
    // which an export override does not reach — so it is stubbed too, or the
    // polling path would make a real request.
    getChargeThrottled: getChargeMock,
    refundCharge: refundChargeMock,
  };
});
vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PIX_KEY: 'geekpopee@gmail.com',
    PIX_MERCHANT_NAME: 'GEEKPOP E TOYS',
    PIX_MERCHANT_CITY: 'RIO DE JANEIRO',
    ADMIN_EMAIL: 'geeketoys@gmail.com',
    FRONTEND_URL: 'https://club.geeketoys.com.br',
    PAGARME_SECRET_KEY: 'sk_test_x',
    PAGARME_API_URL: 'https://api.pagar.me/core/v5',
    PAGARME_STATEMENT_DESCRIPTOR: 'GEEKPOPTOYS',
    PAGARME_MAX_INSTALLMENTS: 6,
    PAGARME_MIN_INSTALLMENT_AMOUNT: 20,
    PAGARME_PIX_EXPIRES_IN: 3600,
  },
  // Fiel ao real; o `email-contract.test.ts` exercita a funcao sem mock.
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

  // Sensible default: an accepted PIX order carrying a QR. Tests that need a
  // different outcome override it.
  createOrderMock.mockResolvedValue({
    id: 'or_1',
    status: 'pending',
    charges: [
      {
        id: 'ch_1',
        status: 'pending',
        amount: 1250,
        payment_method: 'pix',
        last_transaction: {
          qr_code: '00020101br.gov.bcb.pix-GEEKPOP',
          qr_code_url: 'https://api.pagar.me/qr/ch_1.png',
          expires_at: '2026-09-01T23:00:00Z',
        },
      },
    ],
  });
});

const memberRow = {
  id: 'member-1',
  email: 'ana@example.com',
  full_name: 'Ana Souza',
  plan: 'basic',
  // Valid check digits: the service refuses to build a Pagar.me customer
  // without a real document, because the acquirer refuses the order without one.
  cpf: '52998224725',
  phone: '21999998888',
  pagarme_customer_id: null,
};

/** What Pagar.me returns for an approved card. */
const approvedCardOrder = {
  id: 'or_card',
  status: 'paid',
  charges: [
    {
      id: 'ch_card',
      status: 'paid',
      amount: 1250,
      payment_method: 'credit_card',
      last_transaction: { card: { brand: 'visa', last_four_digits: '4242' } },
    },
  ],
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
        cardToken: 'token_1',
      })
    ).rejects.toThrow();

    expect(createOrderMock).not.toHaveBeenCalled();
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
    // The provider is asked for centavos; the row keeps reais. Getting this
    // wrong by a factor of 100 is the classic way to charge R$ 1.250,00.
    expect(createOrderMock).toHaveBeenCalledWith(
      expect.objectContaining({ items: [expect.objectContaining({ amount: 1250 })] }),
      expect.anything(),
    );
    expect(paramsOf('INSERT INTO payments')?.[2]).toBe(PLAN_PRICE);
  });

  /**
   * A member with no usable CPF cannot be charged at all: the acquirer refuses
   * the order. Failing here, before any row is written, is what keeps a broken
   * profile from leaving a `pending` payment nobody can settle.
   */
  it('recusa quem não tem CPF válido no cadastro', async () => {
    route('FROM members WHERE id', { rows: [{ ...memberRow, cpf: '11111111111' }] });

    await expect(
      createPixPayment({
        amount: PLAN_PRICE,
        description: 'Plano',
        payerEmail: 'ana@example.com',
        memberId: 'member-1',
      })
    ).rejects.toThrow('CPF válido');

    expect(createOrderMock).not.toHaveBeenCalled();
    expect(ran('INSERT INTO payments')).toBe(false);
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

  /**
   * A PIX now settles itself: the notice to the staff says "aguardando", not
   * "confirme no extrato". The manual confirmation still exists, but it is the
   * exception — see `confirmPixPayment`.
   */
  it('avisa a equipe que há um PIX aguardando, sem pedir confirmação manual', async () => {
    route('FROM members WHERE id', { rows: [memberRow] });

    await createPixPayment({
      amount: PLAN_PRICE,
      description: 'Plano',
      payerEmail: 'ana@example.com',
      memberId: 'member-1',
    });

    expect(notifyAdminsMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payment_pending', method: 'pix', amount: PLAN_PRICE })
    );
  });

  /**
   * The QR is the provider's, not ours. A Pagar.me code is dynamic and carries
   * their txid, so it cannot be regenerated later — storing the charge id is
   * what ties the payment row to the charge the webhook will settle.
   */
  it('devolve o QR emitido pela Pagar.me e guarda a cobrança na linha', async () => {
    route('FROM members WHERE id', { rows: [memberRow] });

    const result = await createPixPayment({
      amount: PLAN_PRICE,
      description: 'Plano',
      payerEmail: 'ana@example.com',
      memberId: 'member-1',
    });

    expect(result.pixData.emvCode).toBe('00020101br.gov.bcb.pix-GEEKPOP');
    expect(result.pixData.qrCodeUrl).toBe('https://api.pagar.me/qr/ch_1.png');
    expect(result.pixData.provider).toBe('pagarme');
    expect(result.pixData.txId).toBe('ch_1');

    const params = paramsOf('INSERT INTO payments');
    // provider_id and pagarme_charge_id are both the charge; pagarme_order_id
    // is the order. Reconciliation in their dashboard starts from the charge.
    expect(params?.[3]).toBe('ch_1');
    expect(params?.[6]).toBe('or_1');
  });

  /**
   * An order accepted with no `qr_code` is unpayable. Returning it anyway once
   * meant a customer staring at an empty QR box with a `pending` row against
   * their name — better to fail loudly and let them try again.
   */
  it('recusa quando a Pagar.me aceita o pedido mas não devolve QR', async () => {
    route('FROM members WHERE id', { rows: [memberRow] });
    createOrderMock.mockResolvedValueOnce({
      id: 'or_2',
      status: 'pending',
      charges: [{ id: 'ch_2', status: 'pending', amount: 1250, last_transaction: {} }],
    });

    await expect(
      createPixPayment({
        amount: PLAN_PRICE,
        description: 'Plano',
        payerEmail: 'ana@example.com',
        memberId: 'member-1',
      })
    ).rejects.toThrow('QR Code');

    expect(ran('INSERT INTO payments')).toBe(false);
  });

  /**
   * Retrying the same payment must reuse the provider's stored response instead
   * of opening a second charge. The key is derived from the payment id and the
   * amount, so a genuinely new attempt still gets its own.
   */
  it('manda uma chave de idempotência para a cobrança', async () => {
    route('FROM members WHERE id', { rows: [memberRow] });

    await createPixPayment({
      amount: PLAN_PRICE,
      description: 'Plano',
      payerEmail: 'ana@example.com',
      memberId: 'member-1',
    });

    const [, opts] = createOrderMock.mock.calls[0] as [unknown, { idempotencyKey?: string }];
    expect(opts?.idempotencyKey).toMatch(/^[0-9a-f]{40}$/);
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
  it.each([
    ['PaymentIntent do Stripe (legado)', 'pi_abc'],
    ['cobrança da Pagar.me', 'ch_abc'],
    ['pedido da Pagar.me', 'or_abc'],
  ])('casa por provider_id quando o id é uma %s', async (_label, id) => {
    route('FROM payments p', { rows: [{ '?column?': 1 }] });

    await expect(userOwnsPayment('user-1', id as string)).resolves.toBe(true);
    expect(ran('p.provider_id = $1')).toBe(true);
  });

  it('casa pelo id local quando não é id de provedor', async () => {
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

  /**
   * The prefix on `provider_id` decides who gives the money back, not a stored
   * column: rows written before the migration have no `provider`, and refusing
   * to refund those would be worse than a slightly indirect check.
   */
  it('estorna na Pagar.me quando a cobrança é dela', async () => {
    route('FROM payments p', { rows: [{ ...paidRow, provider_id: 'ch_abc' }] });

    await refundPayment({ paymentId: 'pay-1', adminUserId: 'admin-1' });

    expect(refundChargeMock).toHaveBeenCalledWith('ch_abc');
    expect(stripeMock).not.toHaveBeenCalled();
    expect(ran("UPDATE payments SET status = 'refunded'")).toBe(true);
  });

  it('ainda estorna no Stripe uma cobrança anterior à migração', async () => {
    route('FROM payments p', { rows: [paidRow] });
    const refundsCreate = vi.fn(async () => ({ id: 're_1' }));
    stripeMock.mockReturnValue({ refunds: { create: refundsCreate } });

    await refundPayment({ paymentId: 'pay-1', adminUserId: 'admin-1', reason: 'duplicate' });

    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_abc', reason: 'duplicate' })
    );
    expect(refundChargeMock).not.toHaveBeenCalled();
    expect(ran("UPDATE payments SET status = 'refunded'")).toBe(true);
  });

  it('não marca nada quando a operadora recusa', async () => {
    route('FROM payments p', { rows: [{ ...paidRow, provider_id: 'ch_abc' }] });
    refundChargeMock.mockRejectedValueOnce(new Error('charge_already_refunded'));

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
    expect(refundChargeMock).not.toHaveBeenCalled();
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
  const cardInput = {
    amount: PLAN_PRICE,
    description: 'Plano',
    payerEmail: 'ana@example.com',
    payerName: 'Ana',
    memberId: 'member-1',
    cardToken: 'token_abc',
  };

  it('cobra em centavos com o token, e nunca com dado de cartão', async () => {
    route('FROM members WHERE id', { rows: [memberRow] });
    createOrderMock.mockResolvedValueOnce(approvedCardOrder);

    const out = await createCardPayment(cardInput);

    // The browser token is exchanged for a saved card first; the charge bills
    // the `card_id`. Sending `card_token` straight to /orders is the Gateway
    // flow, and this account is PSP.
    expect(createCardMock).toHaveBeenCalledWith('cus_1', 'token_abc');

    const [payload] = createOrderMock.mock.calls[0] as [Record<string, never>];
    expect(payload).toMatchObject({
      customer_id: 'cus_1',
      items: [expect.objectContaining({ amount: 1250 })],
      payments: [
        expect.objectContaining({
          payment_method: 'credit_card',
          credit_card: expect.objectContaining({ card_id: 'card_1', installments: 1 }),
        }),
      ],
    });
    expect(JSON.stringify(payload)).not.toContain('card_token');
    // No card credential may cross this boundary — only the token. (The
    // customer's phone legitimately has a `number`, so the check names the
    // card fields rather than matching that word.)
    expect(JSON.stringify(payload)).not.toMatch(/"cvv"|"exp_month"|"exp_year"|"holder_name"/);

    expect(out.status).toBe('paid');
    expect(out.chargeId).toBe('ch_card');
    expect(out.cardBrand).toBe('visa');
    expect(out.cardLastFour).toBe('4242');
    expect(paramsOf('INSERT INTO payments')?.[4]).toBe('ch_card');
  });

  it('exige o token do cartão', async () => {
    await expect(createCardPayment({ ...cardInput, cardToken: '' })).rejects.toThrow(
      'Cartão não informado.'
    );
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  /**
   * A decline is synchronous at Pagar.me — unlike the old Stripe flow, there is
   * no webhook worth waiting for and the member is still looking at the form.
   * It must surface as a 402 with the acquirer's reason translated, and the row
   * must be written as `failed` rather than left `pending` forever.
   */
  it('recusa na hora, com o motivo do banco em português', async () => {
    route('FROM members WHERE id', { rows: [memberRow] });
    createOrderMock.mockResolvedValueOnce({
      id: 'or_x',
      status: 'failed',
      charges: [
        {
          id: 'ch_x',
          status: 'not_authorized',
          amount: 1250,
          payment_method: 'credit_card',
          last_transaction: { acquirer_return_code: '51' },
        },
      ],
    });

    await expect(createCardPayment(cardInput)).rejects.toThrow('saldo ou limite insuficiente');

    expect(paramsOf('INSERT INTO payments')?.[3]).toBe('failed');
    expect(notifyAdminsMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payment_failed' })
    );
  });

  it('recusa quando o membro não existe', async () => {
    route('FROM members WHERE id', { rows: [] });

    await expect(createCardPayment({ ...cardInput, memberId: 'ghost' })).rejects.toThrow(
      'Membro não encontrado.'
    );
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
