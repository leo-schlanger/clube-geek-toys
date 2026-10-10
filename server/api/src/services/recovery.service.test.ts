import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryMock, sendEmailMock, auditMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  sendEmailMock: vi.fn(async (..._args: unknown[]) => {}),
  auditMock: vi.fn(async (..._args: unknown[]) => {}),
}));

vi.mock('../config/database.js', () => ({ query: queryMock }));
vi.mock('./email.service.js', () => ({ sendTemplateEmail: sendEmailMock }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));
vi.mock('../config/env.js', () => ({ SHOP_CANONICAL_URL: 'https://shop.geekpoptoys.com.br' }));

import { firstName, sendClubSignupReminders, sendOrderRecoveryEmail } from './recovery.service.js';

// ─── SQL router ──────────────────────────────────────────────────────────────

let routes: Array<[string, { rows: unknown[] }]> = [];
function route(fragment: string, result: { rows: unknown[] }) {
  routes.push([fragment, result]);
}

beforeEach(() => {
  vi.clearAllMocks();
  routes = [];
  queryMock.mockImplementation(async (sql: string) => {
    const hit = routes.find(([fragment]) => sql.includes(fragment));
    return hit ? hit[1] : { rows: [] };
  });
});

const closedOrder = {
  id: 'o1',
  order_number: 44,
  customer_name: 'RENALY VILAR',
  customer_email: 'renaly@example.com',
  total: '1092.50',
  created_at: '2026-10-08T23:03:52Z',
  payment_error_kind: null,
  product_name: 'Armybomb V4',
  product_slug: 'armybomb-v4',
};

// ─── firstName ───────────────────────────────────────────────────────────────

describe('firstName', () => {
  it('cumprimenta pelo primeiro nome, sem caixa alta', () => {
    expect(firstName('BRUNA DE BARROS BORSARI MATOS', 'Membro')).toBe('Bruna');
    expect(firstName('  ana hellen ', 'Membro')).toBe('Ana');
  });

  it('usa o padrão quando não há nome', () => {
    expect(firstName('', 'cliente')).toBe('cliente');
    expect(firstName(null, 'cliente')).toBe('cliente');
  });
});

// ─── sendOrderRecoveryEmail ──────────────────────────────────────────────────

describe('sendOrderRecoveryEmail', () => {
  it('convida de volta ao produto, com o motivo', async () => {
    route('FROM orders o', { rows: [closedOrder] });

    expect(await sendOrderRecoveryEmail('o1', 'card_abandoned')).toBe(true);

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'order-not-completed',
        to: 'renaly@example.com',
        variables: expect.objectContaining({
          name: 'Renaly',
          order_number: '44',
          total: '1092,50',
          product_url: 'https://shop.geekpoptoys.com.br/produto/armybomb-v4',
          reason: 'card_abandoned',
        }),
      })
    );
  });

  it('só olha pedido cancelado e nunca pago', async () => {
    await sendOrderRecoveryEmail('o1', 'pix_expired');
    const [sql] = queryMock.mock.calls[0] as [string];
    expect(sql).toMatch(/o\.status = 'cancelled' AND o\.paid_at IS NULL/);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('explica a recusa por limite e aponta o PIX', async () => {
    route('FROM orders o', { rows: [{ ...closedOrder, payment_error_kind: 'funds' }] });

    await sendOrderRecoveryEmail('o1', 'card_abandoned');

    const vars = (sendEmailMock.mock.calls[0]![0] as { variables: Record<string, string> }).variables;
    expect(vars.decline_hint).toMatch(/limite/);
    expect(vars.decline_hint).toMatch(/PIX/);
  });

  /** The e-mail is for a lost sale, not for one that moved to another order. */
  it('não manda se a pessoa comprou ou tem outro pedido aberto depois', async () => {
    route('FROM orders o', { rows: [closedOrder] });
    route('lower(customer_email) = lower($1)', { rows: [{ '?column?': 1 }] });

    expect(await sendOrderRecoveryEmail('o1', 'card_abandoned')).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  /** Nine attempts in a day still mean one e-mail. */
  it('não repete para o mesmo endereço dentro de uma semana', async () => {
    route('FROM orders o', { rows: [closedOrder] });
    route('FROM email_logs', { rows: [{ '?column?': 1 }] });

    expect(await sendOrderRecoveryEmail('o1', 'card_abandoned')).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
    const call = queryMock.mock.calls.find(([sql]) => String(sql).includes('FROM email_logs'));
    expect(call?.[1]).toEqual(['order-not-completed', 'renaly@example.com', 7]);
  });

  it('nunca lança: a conciliação segue mesmo se o e-mail falhar', async () => {
    route('FROM orders o', { rows: [closedOrder] });
    sendEmailMock.mockRejectedValueOnce(new Error('resend down'));

    await expect(sendOrderRecoveryEmail('o1', 'card_abandoned')).resolves.toBe(false);
  });
});

// ─── sendClubSignupReminders ─────────────────────────────────────────────────

describe('sendClubSignupReminders', () => {
  it('lembra quem se cadastrou e não pagou', async () => {
    route('FROM members m', {
      rows: [{ id: 'm1', full_name: 'BRUNA DE BARROS', email: 'bruna@example.com' }],
    });

    expect(await sendClubSignupReminders()).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledWith({
      template: 'club-signup-reminder',
      to: 'bruna@example.com',
      variables: { name: 'Bruna' },
      member_id: 'm1',
    });
  });

  it('só pendente, entre 24 h e 7 dias, sem pagamento e sem lembrete anterior', async () => {
    await sendClubSignupReminders();
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/m\.status = 'pending'/);
    expect(sql).toMatch(/p\.status = 'paid'/);
    expect(sql).toMatch(/template = 'club-signup-reminder'/);
    expect(params).toEqual([24, 7]);
  });

  it('um e-mail que falha não impede os outros', async () => {
    route('FROM members m', {
      rows: [
        { id: 'm1', full_name: 'A', email: 'a@example.com' },
        { id: 'm2', full_name: 'B', email: 'b@example.com' },
      ],
    });
    sendEmailMock.mockRejectedValueOnce(new Error('boom'));

    expect(await sendClubSignupReminders()).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });
});
