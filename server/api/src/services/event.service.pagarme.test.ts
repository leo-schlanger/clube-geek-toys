import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Event tickets paid through Pagar.me. The legacy static-PIX path is pinned in
 * `event.service.test.ts`, which runs without a Pagar.me key; this file turns
 * the key on.
 *
 * What these protect, in cost order:
 *
 *  1. A reservation is born with a dynamic Pagar.me PIX tagged
 *     `kind: event_reservation` — the tag is what makes the webhook confirm it
 *     by itself instead of hunting for a shop order.
 *  2. A charge that fails leaves nothing payable behind: the reservation is
 *     cancelled and no e-mail goes out.
 *  3. The tickets page settles a paid charge on the spot, under the same
 *     idempotency key as the sweep, so a lost webhook never strands a buyer.
 *  4. Cancelling a paid reservation refunds first; a failed refund stops the
 *     cancel instead of voiding tickets that were paid for.
 */

const {
  queryMock,
  clientQueryMock,
  sendEmailMock,
  auditMock,
  createOrderMock,
  getChargeThrottledMock,
  refundChargeMock,
  processEventMock,
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  clientQueryMock: vi.fn(),
  sendEmailMock: vi.fn(async (..._args: unknown[]) => ({ status: 'sent' })),
  auditMock: vi.fn(async (..._args: unknown[]) => {}),
  createOrderMock: vi.fn(),
  getChargeThrottledMock: vi.fn(),
  refundChargeMock: vi.fn(),
  processEventMock: vi.fn(async (..._args: unknown[]) => {}),
}));

vi.mock('../config/database.js', () => ({
  query: queryMock,
  getClient: async () => ({ query: clientQueryMock, release: vi.fn() }),
}));

vi.mock('../config/env.js', () => ({
  env: {
    ADMIN_EMAIL: 'admin@geeketoys.com.br',
    FRONTEND_URL: 'https://club.geeketoys.com.br',
    PIX_KEY: 'geekpopee@gmail.com',
    PIX_MERCHANT_NAME: 'GEEKPOP E TOYS',
    PIX_MERCHANT_CITY: 'RIO DE JANEIRO',
    PAGARME_SECRET_KEY: 'sk_test_x',
    PAGARME_API_URL: 'https://api.pagar.me/core/v5',
  },
  SHOP_CANONICAL_URL: 'https://shop.geekpoptoys.com.br',
  adminUrl: (path = '/admin') => `https://adm.geeketoys.com.br${path}`,
}));

vi.mock('./email.service.js', () => ({ sendTemplateEmail: sendEmailMock }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));
vi.mock('./pagarme-webhook.service.js', () => ({ processPagarmeEvent: processEventMock }));
vi.mock('./shipping.service.js', () => ({
  STORE_PICKUP_LOCATION: {
    cep: '22050-002',
    street: 'Avenida Nossa Senhora de Copacabana',
    number: '552',
    complement: 'Loja',
    neighborhood: 'Copacabana',
    city: 'Rio de Janeiro',
    state: 'RJ',
  },
}));
vi.mock('../utils/pagarme.js', async () => {
  const actual = await vi.importActual<typeof import('../utils/pagarme.js')>('../utils/pagarme.js');
  return {
    ...actual,
    createOrder: createOrderMock,
    getChargeThrottled: getChargeThrottledMock,
    refundCharge: refundChargeMock,
  };
});

vi.mock('./event-config.service.js', async () => {
  const actual = await vi.importActual<typeof import('./event-config.service.js')>(
    './event-config.service.js'
  );
  const { FALLBACK_EVENT } = await vi.importActual<typeof import('../config/events.js')>(
    '../config/events.js'
  );
  return {
    ...actual,
    getEventById: vi.fn(async (id: string) => (id === FALLBACK_EVENT.id ? FALLBACK_EVENT : null)),
  };
});

import * as eventService from './event.service.js';

const EVENT_ID = 'kpop-night-2026-09-06';
/** Valid check digits — the service runs the real CPF validation. */
const CPF = '529.982.247-25';
const FUTURE = '2099-01-01T00:00:00.000Z';
const RES_ID = '11111111-1111-4111-8111-111111111111';

function reservationRow(over: Record<string, unknown> = {}) {
  return {
    id: RES_ID,
    event_id: EVENT_ID,
    code: 'R-AAAA-BBBB',
    buyer_name: 'Ana Souza',
    buyer_email: 'ana@example.com',
    buyer_phone: '21999999999',
    buyer_document: '52998224725',
    quantity: 2,
    total_cents: 4000,
    status: 'pending',
    notes: null,
    payment_provider: 'pagarme',
    pagarme_order_id: null,
    pagarme_charge_id: null,
    pix_qr_code: null,
    pix_qr_code_url: null,
    pix_expires_at: null,
    paid_at: null,
    confirmed_at: null,
    cancelled_at: null,
    created_at: '2026-09-28T12:00:00.000Z',
    ...over,
  };
}

function ticketRow(over: Record<string, unknown> = {}) {
  return {
    id: 'ticket-1',
    reservation_id: RES_ID,
    event_id: EVENT_ID,
    code: 'T-AAAA-BBBB-CCCC',
    attendee_name: 'Ana Souza',
    kind: 'full',
    price_cents: 2000,
    status: 'pending',
    used_at: null,
    created_at: '2026-09-28T12:00:00.000Z',
    ...over,
  };
}

const pagarmeOrder = {
  id: 'or_1',
  amount: 4000,
  status: 'pending',
  charges: [
    {
      id: 'ch_1',
      status: 'pending',
      amount: 4000,
      payment_method: 'pix',
      last_transaction: {
        qr_code: '00020126PAGARME-DYNAMIC',
        qr_code_url: 'https://api.pagar.me/qr.png',
        expires_at: FUTURE,
      },
    },
  ],
};

const sqlOf = (a: unknown) => (typeof a === 'string' ? a.replace(/\s+/g, ' ').trim() : '');
const clientRan = (prefix: string) =>
  clientQueryMock.mock.calls.some(([sql]) => sqlOf(sql).startsWith(prefix));

function wireCreate(row: Record<string, unknown> = {}) {
  clientQueryMock.mockImplementation(async (sql: string) => {
    if (sql.startsWith('INSERT INTO event_reservations')) return { rows: [reservationRow(row)] };
    if (sql.startsWith('INSERT INTO event_tickets')) return { rows: [ticketRow()] };
    if (sqlOf(sql).startsWith('UPDATE event_reservations')) return { rows: [{ id: 'x' }] };
    return { rows: [] };
  });
}

const input = {
  buyerName: 'Ana Souza',
  buyerEmail: 'ana@example.com',
  buyerPhone: '(21) 99999-9999',
  buyerDocument: CPF,
  attendees: [
    { name: 'Ana Souza', kind: 'full' as const },
    { name: 'Bia Souza', kind: 'full' as const },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  clientQueryMock.mockResolvedValue({ rows: [] });
  queryMock.mockResolvedValue({ rows: [] });
  createOrderMock.mockResolvedValue(pagarmeOrder);
});

describe('createReservation com Pagar.me', () => {
  it('emite o PIX dinâmico marcado como ingresso, com o total do servidor', async () => {
    wireCreate();

    const reservation = await eventService.createReservation(EVENT_ID, input);

    expect(createOrderMock).toHaveBeenCalledTimes(1);
    const [payload, opts] = createOrderMock.mock.calls[0]!;
    expect(payload.metadata).toEqual(
      expect.objectContaining({ kind: 'event_reservation', reservationId: RES_ID })
    );
    // No `orderId`: that key would route the webhook to the shop branch.
    expect(payload.metadata.orderId).toBeUndefined();
    expect(payload.items[0].amount).toBe(4000);
    expect(payload.customer.document).toBe('52998224725');
    expect(payload.customer.address.zip_code).toBe('22050002');
    expect(payload.payments[0].payment_method).toBe('pix');
    expect(opts.idempotencyKey).toMatch(/^[0-9a-f]{40}$/);

    expect(reservation.pix).toEqual(
      expect.objectContaining({
        provider: 'pagarme',
        emvCode: '00020126PAGARME-DYNAMIC',
        expiresAt: FUTURE,
      })
    );
  });

  it('grava o código da Pagar.me na reserva, com um parâmetro por coluna', async () => {
    wireCreate();

    await eventService.createReservation(EVENT_ID, input);

    const update = queryMock.mock.calls.find(([sql]) =>
      sqlOf(sql).startsWith('UPDATE event_reservations SET pagarme_order_id')
    );
    expect(update?.[1]).toEqual([
      'or_1',
      'ch_1',
      '00020126PAGARME-DYNAMIC',
      'https://api.pagar.me/qr.png',
      FUTURE,
      RES_ID,
    ]);
  });

  it('grava CPF e provedor, e não gera txid de PIX estático', async () => {
    wireCreate();

    await eventService.createReservation(EVENT_ID, input);

    const insert = clientQueryMock.mock.calls.find(([sql]) =>
      String(sql).startsWith('INSERT INTO event_reservations')
    );
    const params = insert?.[1] as unknown[];
    expect(params[9]).toBeNull(); // pix_txid
    expect(params[10]).toBe('52998224725');
    expect(params[11]).toBe('pagarme');
  });

  it('o e-mail diz que a confirmação é automática e não oferece a chave', async () => {
    wireCreate();

    await eventService.createReservation(EVENT_ID, input);
    await new Promise((r) => setTimeout(r, 0));

    const buyerMail = sendEmailMock.mock.calls.find(
      ([arg]) => (arg as { template: string }).template === 'event-reservation-received'
    )?.[0] as { variables: Record<string, string> };
    expect(buyerMail.variables.pix_auto).toBe('1');
    expect(buyerMail.variables.pix_code).toBe('00020126PAGARME-DYNAMIC');
    // Paying by key reaches the account but never the charge: it would not confirm.
    expect(buyerMail.variables.pix_key).toBe('');
  });

  it('recusa CPF inválido antes de gravar qualquer coisa', async () => {
    await expect(
      eventService.createReservation(EVENT_ID, { ...input, buyerDocument: '111.111.111-11' })
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_DOCUMENT' });
    expect(clientQueryMock).not.toHaveBeenCalled();
    expect(createOrderMock).not.toHaveBeenCalled();
  });

  it('recusa reserva paga sem CPF', async () => {
    await expect(
      eventService.createReservation(EVENT_ID, { ...input, buyerDocument: undefined })
    ).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
  });

  it('reserva só de isentos não pede CPF nem cria cobrança', async () => {
    wireCreate({ total_cents: 0, payment_provider: null, buyer_document: null });

    const reservation = await eventService.createReservation(EVENT_ID, {
      ...input,
      buyerDocument: undefined,
      attendees: [{ name: 'Bebê Souza', kind: 'free' }],
    });

    expect(createOrderMock).not.toHaveBeenCalled();
    expect(reservation.pix).toBeNull();
  });

  it('falha na Pagar.me cancela a reserva e não manda e-mail', async () => {
    wireCreate();
    createOrderMock.mockRejectedValue(new Error('Pagar.me POST /orders: HTTP 500'));

    await expect(eventService.createReservation(EVENT_ID, input)).rejects.toThrow(/HTTP 500/);

    expect(clientRan("UPDATE event_reservations SET status = 'cancelled'")).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('cobrança sem QR Code também cancela a reserva', async () => {
    wireCreate();
    createOrderMock.mockResolvedValue({ id: 'or_1', amount: 4000, status: 'failed', charges: [] });

    await expect(eventService.createReservation(EVENT_ID, input)).rejects.toMatchObject({
      code: 'PIX_QRCODE_UNAVAILABLE',
    });
    expect(clientRan("UPDATE event_reservations SET status = 'cancelled'")).toBe(true);
  });
});

describe('página dos ingressos', () => {
  const pending = reservationRow({
    pagarme_charge_id: 'ch_1',
    pix_qr_code: '00020126PAGARME-DYNAMIC',
    pix_expires_at: FUTURE,
  });

  it('confirma na hora uma cobrança já paga, pela mesma chave da conciliação', async () => {
    const paidCharge = { id: 'ch_1', status: 'paid', amount: 4000 };
    getChargeThrottledMock.mockResolvedValue(paidCharge);
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM event_reservations WHERE code')) return { rows: [pending] };
      if (sql.includes('FROM event_reservations WHERE id')) {
        return { rows: [{ ...pending, status: 'confirmed' }] };
      }
      if (sql.includes('FROM event_tickets')) return { rows: [ticketRow({ status: 'valid' })] };
      return { rows: [] };
    });

    const found = await eventService.getPublicReservation('R-AAAA-BBBB');

    expect(processEventMock).toHaveBeenCalledWith({
      id: 'reconcile_ch_1',
      type: 'charge.paid',
      data: paidCharge,
    });
    expect(found?.status).toBe('confirmed');
    expect(found?.pix).toBeNull();
  });

  it('cobrança ainda pendente mostra o PIX e não liquida nada', async () => {
    getChargeThrottledMock.mockResolvedValue({ id: 'ch_1', status: 'pending', amount: 4000 });
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('FROM event_reservations WHERE code') ? { rows: [pending] } : { rows: [] }
    );

    const found = await eventService.getPublicReservation('R-AAAA-BBBB');

    expect(processEventMock).not.toHaveBeenCalled();
    expect(found?.paymentProvider).toBe('pagarme');
    expect(found?.pix?.emvCode).toBe('00020126PAGARME-DYNAMIC');
    expect(found?.pixExpired).toBe(false);
  });

  it('a página carrega mesmo com a Pagar.me fora do ar', async () => {
    getChargeThrottledMock.mockRejectedValue(new Error('timeout'));
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('FROM event_reservations WHERE code') ? { rows: [pending] } : { rows: [] }
    );

    const found = await eventService.getPublicReservation('R-AAAA-BBBB');
    expect(found?.status).toBe('pending');
  });

  it('PIX vencido some da tela e a página avisa', async () => {
    getChargeThrottledMock.mockResolvedValue({ id: 'ch_1', status: 'pending', amount: 4000 });
    const expired = { ...pending, pix_expires_at: '2020-01-01T00:00:00.000Z' };
    queryMock.mockImplementation(async (sql: string) =>
      sql.includes('FROM event_reservations WHERE code') ? { rows: [expired] } : { rows: [] }
    );

    const found = await eventService.getPublicReservation('R-AAAA-BBBB');

    expect(found?.pix).toBeNull();
    expect(found?.pixExpired).toBe(true);
  });

  it('não reenvia por e-mail um PIX vencido', async () => {
    queryMock.mockResolvedValue({
      rows: [{ ...pending, pix_expires_at: '2020-01-01T00:00:00.000Z' }],
    });

    await expect(eventService.resendReservationPaymentLink('R-AAAA-BBBB')).rejects.toMatchObject({
      statusCode: 409,
      code: 'RESERVATION_PIX_EXPIRED',
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('cancelReservation com Pagar.me', () => {
  it('reserva paga é estornada antes de cancelar', async () => {
    queryMock.mockResolvedValue({
      rows: [reservationRow({ status: 'confirmed', pagarme_charge_id: 'ch_1' })],
    });
    refundChargeMock.mockResolvedValue({ id: 'ch_1', status: 'canceled' });
    clientQueryMock.mockImplementation(async (sql: string) =>
      sqlOf(sql).startsWith('UPDATE event_reservations')
        ? { rows: [reservationRow({ status: 'cancelled' })] }
        : { rows: [] }
    );

    await eventService.cancelReservation(RES_ID, 'admin-1');

    expect(refundChargeMock).toHaveBeenCalledWith('ch_1');
    expect(auditMock).toHaveBeenCalledWith(
      'event.reservation_cancelled',
      'admin-1',
      expect.objectContaining({ refunded: true })
    );
  });

  it('estorno recusado impede o cancelamento', async () => {
    queryMock.mockResolvedValue({
      rows: [reservationRow({ status: 'confirmed', pagarme_charge_id: 'ch_1' })],
    });
    refundChargeMock.mockRejectedValue(new Error('refund failed'));

    await expect(eventService.cancelReservation(RES_ID, 'admin-1')).rejects.toThrow(
      'refund failed'
    );
    expect(clientQueryMock).not.toHaveBeenCalled();
  });

  it('reserva pendente cancela mesmo se anular o PIX falhar', async () => {
    queryMock.mockResolvedValue({
      rows: [reservationRow({ status: 'pending', pagarme_charge_id: 'ch_1' })],
    });
    refundChargeMock.mockRejectedValue(new Error('already expired'));
    clientQueryMock.mockImplementation(async (sql: string) =>
      sqlOf(sql).startsWith('UPDATE event_reservations')
        ? { rows: [reservationRow({ status: 'cancelled' })] }
        : { rows: [] }
    );

    const cancelled = await eventService.cancelReservation(RES_ID, 'admin-1');
    expect(cancelled.status).toBe('cancelled');
  });
});

describe('expireReservation', () => {
  it('fecha só reserva ainda pendente', async () => {
    clientQueryMock.mockImplementation(async (sql: string) =>
      sqlOf(sql).startsWith('UPDATE event_reservations') ? { rows: [{ id: 'r' }] } : { rows: [] }
    );

    await expect(eventService.expireReservation('r')).resolves.toBe(true);
    const update = clientQueryMock.mock.calls.find(([sql]) =>
      sqlOf(sql).startsWith('UPDATE event_reservations')
    );
    expect(sqlOf(update?.[0])).toContain("status = 'pending'");
  });

  it('não mexe em reserva que foi paga no meio do caminho', async () => {
    clientQueryMock.mockResolvedValue({ rows: [] });
    await expect(eventService.expireReservation('r')).resolves.toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });
});
