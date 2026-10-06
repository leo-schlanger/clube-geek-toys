import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Event tickets. What these tests pin, in cost order:
 *
 *  1. Check-in **burns** the code: a second scan of the same QR is denied,
 *     with the time of the first. That is what stops a print from circulating.
 *  2. An unconfirmed reservation cannot enter — payment first.
 *  3. Confirm only leaves `pending`, so a double-click neither resends
 *     email nor revives a cancelled reservation.
 *  4. Price comes from the server, by ticket type, never from the client.
 *  5. The code is read with or without hyphens, because door staff type it.
 *  6. The reservation is born with payable PIX and the txid does not change
 *     — without that, purchase depends on WhatsApp opening, which is how
 *     one reservation was left unpaid.
 */

const { queryMock, clientQueryMock, releaseMock, sendEmailMock, auditMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  clientQueryMock: vi.fn(),
  releaseMock: vi.fn(),
  sendEmailMock: vi.fn(async (..._args: unknown[]) => ({ status: 'sent' })),
  auditMock: vi.fn(async (..._args: unknown[]) => {}),
}));

vi.mock('../config/database.js', () => ({
  query: queryMock,
  getClient: async () => ({ query: clientQueryMock, release: releaseMock }),
}));

vi.mock('../config/env.js', () => ({
  env: {
    ADMIN_EMAIL: 'admin@geeketoys.com.br',
    FRONTEND_URL: 'https://club.geeketoys.com.br',
    PIX_KEY: 'pix-teste@exemplo.com',
    PIX_MERCHANT_NAME: 'GEEKPOP E TOYS',
    PIX_MERCHANT_CITY: 'RIO DE JANEIRO',
  },
  SHOP_CANONICAL_URL: 'https://shop.geekpoptoys.com.br',
  // Fiel ao real (que o `email-contract.test.ts` exercita sem mock); aqui o que
  // importa é qual caminho o service pede.
  adminUrl: (path = '/admin') => `https://adm.geeketoys.com.br${path}`,
}));

vi.mock('./email.service.js', () => ({ sendTemplateEmail: sendEmailMock }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));

// Event now comes from the `events` table. These tests pin ticket logic,
// not catalogue: the catalogue service is mocked with the same event the
// migration seeds, so `queryMock` only talks about reservations.
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
    getActiveEvent: vi.fn(async () => FALLBACK_EVENT),
    getActiveEventOrFallback: vi.fn(async () => FALLBACK_EVENT),
  };
});

import * as eventService from './event.service.js';
import { ticketPriceCents, EVENTS, MAX_TICKETS_PER_RESERVATION } from '../config/events.js';

const EVENT_ID = 'kpop-night-2026-09-06';

function ticketRow(over: Record<string, unknown> = {}) {
  return {
    id: 'ticket-1',
    reservation_id: 'res-1',
    event_id: EVENT_ID,
    code: 'T-AAAA-BBBB-CCCC',
    attendee_name: 'Ana Souza',
    kind: 'full',
    price_cents: 2000,
    status: 'valid',
    used_at: null,
    created_at: '2026-08-21T12:00:00.000Z',
    ...over,
  };
}

function reservationRow(over: Record<string, unknown> = {}) {
  return {
    id: 'res-1',
    event_id: EVENT_ID,
    code: 'R-AAAA-BBBB',
    buyer_name: 'Ana Souza',
    buyer_email: 'ana@example.com',
    buyer_phone: '21999999999',
    quantity: 2,
    total_cents: 4000,
    status: 'pending',
    notes: null,
    confirmed_at: null,
    cancelled_at: null,
    created_at: '2026-08-21T12:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientQueryMock.mockResolvedValue({ rows: [] });
  queryMock.mockResolvedValue({ rows: [] });
});

describe('preço do ingresso', () => {
  const event = EVENTS[EVENT_ID]!;

  it('cobra inteira, metade para membro e nada para isento', () => {
    expect(ticketPriceCents(event, 'full')).toBe(2000);
    expect(ticketPriceCents(event, 'member')).toBe(1000);
    expect(ticketPriceCents(event, 'free')).toBe(0);
  });
});

describe('createReservation', () => {
  it('grava um ingresso por pessoa e soma o total no servidor', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('INSERT INTO event_reservations')) {
        return { rows: [reservationRow({ quantity: 2, total_cents: 4000 })] };
      }
      if (sql.startsWith('INSERT INTO event_tickets')) {
        return { rows: [ticketRow({ status: 'pending' })] };
      }
      return { rows: [] };
    });

    const reservation = await eventService.createReservation(EVENT_ID, {
      buyerName: 'Ana Souza',
      buyerEmail: 'ana@example.com',
      buyerPhone: '21999999999',
      attendees: [
        { name: 'Ana Souza', kind: 'full' },
        { name: 'Bia Souza', kind: 'full' },
      ],
    });

    expect(reservation.tickets).toHaveLength(2);

    const insert = clientQueryMock.mock.calls.find(([sql]) =>
      String(sql).startsWith('INSERT INTO event_reservations')
    )!;
    // R$ 20 + R$ 20 — the client does not send a price.
    expect(insert[1]).toEqual(
      expect.arrayContaining([2, 4000, expect.stringMatching(/^R-[A-Z0-9]{4}-[A-Z0-9]{4}$/)])
    );
  });

  it('recusa meia sem sócio ativo — o formulário não é prova', async () => {
    await expect(
      eventService.createReservation(EVENT_ID, {
        buyerName: 'Ana Souza',
        buyerEmail: 'ana@example.com',
        buyerPhone: '21999999999',
        attendees: [{ name: 'Bia Souza', kind: 'member' }],
      })
    ).rejects.toMatchObject({ code: 'MEMBER_TICKET_UNVERIFIED' });

    await expect(
      eventService.createReservation(EVENT_ID, {
        buyerName: 'Ana Souza',
        buyerEmail: 'ana@example.com',
        buyerPhone: '21999999999',
        attendees: [{ name: 'Bia Souza', kind: 'member', document: '52998224725' }],
      })
    ).rejects.toMatchObject({ code: 'MEMBER_NOT_ACTIVE' });

    expect(clientQueryMock).not.toHaveBeenCalled();
  });

  it('aplica a meia só no nome da carteirinha, uma vez por evento', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM members')) {
        return { rows: [{ id: 'member-1', full_name: 'Bia Souza' }] };
      }
      return { rows: [] };
    });
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('INSERT INTO event_reservations')) {
        return { rows: [reservationRow({ quantity: 1, total_cents: 1000 })] };
      }
      if (sql.startsWith('INSERT INTO event_tickets')) {
        return { rows: [ticketRow({ kind: 'member', price_cents: 1000, member_id: 'member-1' })] };
      }
      return { rows: [] };
    });

    const reservation = await eventService.createReservation(EVENT_ID, {
      buyerName: 'Ana Souza',
      buyerEmail: 'ana@example.com',
      buyerPhone: '21999999999',
      attendees: [{ name: 'biá  souza', kind: 'member', document: '529.982.247-25' }],
    });

    const ticketInsert = clientQueryMock.mock.calls.find(([sql]) =>
      String(sql).startsWith('INSERT INTO event_tickets')
    )!;
    expect(ticketInsert[1]).toEqual(
      expect.arrayContaining(['Bia Souza', 'member', 1000, 'member-1'])
    );
    expect(reservation.tickets?.[0]?.memberId).toBe('member-1');

    const memberLookup = queryMock.mock.calls.find(([sql]) => String(sql).includes('FROM members'))!;
    expect(String(memberLookup[0])).toContain("status = 'active'");
    expect(String(memberLookup[0])).toContain('expiry_date >= CURRENT_DATE');
    expect(memberLookup[1]).toEqual(['52998224725']);

    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM members')) {
        return { rows: [{ id: 'member-1', full_name: 'Bia Souza' }] };
      }
      if (String(sql).includes('FROM event_tickets')) return { rows: [{ '?column?': 1 }] };
      return { rows: [] };
    });
    await expect(
      eventService.createReservation(EVENT_ID, {
        buyerName: 'Ana Souza',
        buyerEmail: 'ana@example.com',
        buyerPhone: '21999999999',
        attendees: [{ name: 'Bia Souza', kind: 'member', document: '52998224725' }],
      })
    ).rejects.toMatchObject({ code: 'MEMBER_TICKET_ALREADY_USED' });
  });

  it('não revela o nome da carteirinha quando o nome digitado não é o do sócio', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM members')) {
        return { rows: [{ id: 'member-1', full_name: 'Beatriz Souza' }] };
      }
      return { rows: [] };
    });

    await expect(
      eventService.createReservation(EVENT_ID, {
        buyerName: 'Ana Souza',
        buyerEmail: 'ana@example.com',
        buyerPhone: '21999999999',
        attendees: [{ name: 'Bia Souza', kind: 'member', document: '52998224725' }],
      })
    ).rejects.toMatchObject({
      code: 'MEMBER_NAME_MISMATCH',
      message: expect.not.stringContaining('Beatriz'),
    });
    expect(clientQueryMock).not.toHaveBeenCalled();
  });

  it('recusa duas meias do mesmo sócio na mesma compra', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM members')) {
        return { rows: [{ id: 'member-1', full_name: 'Bia Souza' }] };
      }
      return { rows: [] };
    });

    await expect(
      eventService.createReservation(EVENT_ID, {
        buyerName: 'Ana Souza',
        buyerEmail: 'ana@example.com',
        buyerPhone: '21999999999',
        attendees: [
          { name: 'Bia Souza', kind: 'member', document: '52998224725' },
          { name: 'Bia Souza', kind: 'member', document: '529.982.247-25' },
        ],
      })
    ).rejects.toMatchObject({ code: 'MEMBER_TICKET_DUPLICATE' });
    expect(clientQueryMock).not.toHaveBeenCalled();
  });

  it('dois cliques ao mesmo tempo desfazem a reserva e devolvem 409', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM members')) {
        return { rows: [{ id: 'member-1', full_name: 'Bia Souza' }] };
      }
      return { rows: [] };
    });
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('INSERT INTO event_reservations')) return { rows: [reservationRow()] };
      if (sql.startsWith('INSERT INTO event_tickets')) {
        const err = new Error('duplicate key') as Error & { code: string; constraint: string };
        err.code = '23505';
        err.constraint = 'idx_event_tickets_one_member_discount';
        throw err;
      }
      return { rows: [] };
    });

    await expect(
      eventService.createReservation(EVENT_ID, {
        buyerName: 'Ana Souza',
        buyerEmail: 'ana@example.com',
        buyerPhone: '21999999999',
        attendees: [{ name: 'Bia Souza', kind: 'member', document: '52998224725' }],
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 'MEMBER_TICKET_ALREADY_USED' });

    expect(clientQueryMock.mock.calls.some(([sql]) => String(sql) === 'ROLLBACK')).toBe(true);
  });

  /**
   * A diretoria abriu este aviso, clicou no botão e caiu na página de
   * assinatura do clube: o link era `${FRONTEND_URL}/admin?tab=events`, e no
   * host do clube `/admin` não existe — o catch-all da SPA de membro manda para
   * `/assinar`. Ela relatou que "não achava o cliente". Todos os outros avisos
   * de staff trocavam o subdomínio; este ponto não trocava.
   */
  it('o aviso ao admin aponta para o painel admin, não para o clube', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('INSERT INTO event_reservations')) return { rows: [reservationRow()] };
      if (sql.startsWith('INSERT INTO event_tickets')) return { rows: [ticketRow()] };
      return { rows: [] };
    });

    await eventService.createReservation(EVENT_ID, {
      buyerName: 'Norberto',
      buyerEmail: 'norberto@example.com',
      buyerPhone: '21999999999',
      attendees: [{ name: 'Janaina', kind: 'full' }],
    });

    const call = sendEmailMock.mock.calls.find(
      ([arg]) => (arg as { template?: string })?.template === 'admin-event-reservation'
    )!;
    expect(call, 'o aviso ao admin não foi enviado').toBeDefined();
    const vars = (call[0] as { variables: Record<string, string> }).variables;
    expect(vars.admin_url).toBe('https://adm.geeketoys.com.br/admin?tab=events');
    expect(vars.admin_url).not.toContain('club.');
  });

  it('recusa grupo acima do teto anti-abuso do endpoint público', async () => {
    const attendees = Array.from({ length: MAX_TICKETS_PER_RESERVATION + 1 }, (_, i) => ({
      name: `Pessoa ${i}`,
      kind: 'full' as const,
    }));

    await expect(
      eventService.createReservation(EVENT_ID, {
        buyerName: 'Ana',
        buyerEmail: 'ana@example.com',
        buyerPhone: '21999999999',
        attendees,
      })
    ).rejects.toThrow(/Máximo de/);
  });

  it('recusa evento desconhecido', async () => {
    await expect(
      eventService.createReservation('evento-que-nao-existe', {
        buyerName: 'Ana',
        buyerEmail: 'ana@example.com',
        buyerPhone: '21999999999',
        attendees: [{ name: 'Ana', kind: 'full' }],
      })
    ).rejects.toThrow(/Evento não encontrado/);
  });
});

describe('PIX da reserva', () => {
  it('nasce com PIX pagável e guarda o txid', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('INSERT INTO event_reservations')) {
        return { rows: [reservationRow({ quantity: 2, total_cents: 4000, pix_txid: 'CGTABC123' })] };
      }
      if (sql.startsWith('INSERT INTO event_tickets')) {
        return { rows: [ticketRow({ status: 'pending' })] };
      }
      return { rows: [] };
    });

    const reservation = await eventService.createReservation(EVENT_ID, {
      buyerName: 'Ana Souza',
      buyerEmail: 'ana@example.com',
      buyerPhone: '21999999999',
      attendees: [
        { name: 'Ana Souza', kind: 'full' },
        { name: 'Bia Souza', kind: 'full' },
      ],
    });

    expect(reservation.pix?.emvCode).toContain('pix-teste@exemplo.com');
    expect(reservation.pix?.amount).toBe(40);

    const insert = clientQueryMock.mock.calls.find(([sql]) =>
      String(sql).startsWith('INSERT INTO event_reservations')
    )!;
    expect(insert[1]).toEqual(expect.arrayContaining([expect.stringMatching(/^CGT[A-Z0-9]+$/)]));
  });

  it('o e-mail da reserva leva o copia-e-cola', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('INSERT INTO event_reservations')) {
        return { rows: [reservationRow({ total_cents: 2000, pix_txid: 'CGTABC123' })] };
      }
      if (sql.startsWith('INSERT INTO event_tickets')) return { rows: [ticketRow()] };
      return { rows: [] };
    });

    await eventService.createReservation(EVENT_ID, {
      buyerName: 'Ana',
      buyerEmail: 'ana@example.com',
      buyerPhone: '21999999999',
      attendees: [{ name: 'Ana', kind: 'full' }],
    });

    const call = sendEmailMock.mock.calls.find(
      ([arg]) => (arg as { template?: string })?.template === 'event-reservation-received'
    )!;
    const vars = (call[0] as { variables: Record<string, string> }).variables;
    expect(vars.pix_code).toContain('pix-teste@exemplo.com');
  });

  // A paid reservation must not show a QR: that invites paying twice.
  it('não devolve PIX em reserva confirmada', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM event_reservations')) {
        return { rows: [reservationRow({ status: 'confirmed', total_cents: 2000 })] };
      }
      return { rows: [] };
    });
    const reservation = await eventService.getPublicReservation('R-ABCD-EFGH');
    expect(reservation?.pix).toBeNull();
  });

  it('reenvia o PIX só para o e-mail gravado e só enquanto pendente', async () => {
    queryMock.mockResolvedValue({
      rows: [reservationRow({ status: 'pending', total_cents: 2000, pix_txid: 'CGTABC123' })],
    });

    await eventService.resendReservationPaymentLink('R-ABCD-EFGH');

    const call = sendEmailMock.mock.calls.at(-1)!;
    const payload = call[0] as { to: string; variables: Record<string, string> };
    expect(payload.to).toBe('ana@example.com');
    expect(payload.variables.pix_code).toContain('pix-teste@exemplo.com');
  });

  it('recusa reenvio de reserva já confirmada', async () => {
    queryMock.mockResolvedValue({ rows: [reservationRow({ status: 'confirmed' })] });
    await expect(eventService.resendReservationPaymentLink('R-ABCD-EFGH')).rejects.toMatchObject({
      code: 'RESERVATION_NOT_PENDING',
    });
  });
});

describe('confirmReservation', () => {
  it('libera os ingressos e manda o link para o comprador', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE event_reservations')) {
        return { rows: [reservationRow({ status: 'confirmed' })] };
      }
      if (sql.startsWith('UPDATE event_tickets')) {
        return { rows: [ticketRow(), ticketRow({ id: 'ticket-2', code: 'T-DDDD-EEEE-FFFF' })] };
      }
      return { rows: [] };
    });

    const reservation = await eventService.confirmReservation('res-1', 'admin-1');

    expect(reservation.status).toBe('confirmed');
    expect(reservation.tickets).toHaveLength(2);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'event-tickets-ready',
        to: 'ana@example.com',
        variables: expect.objectContaining({
          tickets_url: 'https://shop.geekpoptoys.com.br/ingressos/R-AAAA-BBBB',
        }),
      })
    );
  });

  it('não confirma duas vezes', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE event_reservations')) return { rows: [] };
      if (sql.startsWith('SELECT status')) return { rows: [{ status: 'confirmed' }] };
      return { rows: [] };
    });

    await expect(eventService.confirmReservation('res-1', 'admin-1')).rejects.toThrow(
      /já está confirmada/
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('checkInTicket', () => {
  it('libera a entrada na primeira leitura', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE event_tickets')) return { rows: [ticketRow({ status: 'used' })] };
      if (sql.startsWith('SELECT r.buyer_name')) return { rows: [{ buyer_name: 'Ana Souza', event_title: 'Evento GeeKpop!' }] };
      return { rows: [] };
    });

    const result = await eventService.checkInTicket('T-AAAA-BBBB-CCCC', 'seller-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ticket.attendeeName).toBe('Ana Souza');
      expect(result.ticket.status).toBe('used');
    }
  });

  it('nega o mesmo código na segunda leitura e diz a hora da primeira', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      // UPDATE matches nothing: the row is no longer `valid`.
      if (sql.startsWith('UPDATE event_tickets')) return { rows: [] };
      if (sql.startsWith('SELECT t.*')) {
        return { rows: [ticketRow({ status: 'used', used_at: '2026-09-06T17:32:00.000Z' })] };
      }
      return { rows: [] };
    });
    queryMock.mockResolvedValue({ rows: [{ buyer_name: 'Ana Souza' }] });

    const result = await eventService.checkInTicket('T-AAAA-BBBB-CCCC', 'seller-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('already_used');
      // 17:32 UTC is 14:32 in Rio. The container runs UTC; door staff
      // read their wall clock, not the server's.
      expect(result.message).toBe('Ingresso já utilizado às 14:32.');
    }
  });

  it('nega ingresso de reserva ainda não paga', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE event_tickets')) return { rows: [] };
      if (sql.startsWith('SELECT t.*')) {
        return { rows: [ticketRow({ status: 'pending' })] };
      }
      return { rows: [] };
    });
    queryMock.mockResolvedValue({ rows: [{ buyer_name: 'Ana Souza' }] });

    const result = await eventService.checkInTicket('T-AAAA-BBBB-CCCC', 'seller-1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_confirmed');
  });

  it('só queima o código dentro da janela do próprio evento', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE event_tickets')) return { rows: [ticketRow({ status: 'used' })] };
      if (sql.startsWith('SELECT r.buyer_name')) return { rows: [{ buyer_name: 'Ana Souza', event_title: 'Evento GeeKpop!' }] };
      return { rows: [] };
    });

    const result = await eventService.checkInTicket('T-AAAA-BBBB-CCCC', 'seller-1');

    const update = String(
      clientQueryMock.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE event_tickets'))![0]
    );
    expect(update).toContain('NOT EXISTS');
    expect(update).toContain("e.starts_at - INTERVAL '12 hours'");
    expect(update).toContain("COALESCE(e.ends_at, e.starts_at + INTERVAL '24 hours') + INTERVAL '6 hours'");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.eventTitle).toBe('Evento GeeKpop!');
  });

  it('nega ingresso válido de outro evento sem queimar e diz de qual evento é', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE event_tickets')) return { rows: [] };
      if (sql.startsWith('SELECT t.*')) {
        return {
          rows: [
            {
              ...ticketRow({ status: 'valid' }),
              event_title: 'Photocard Trading',
              event_starts_at: '2026-09-20T17:00:00.000Z',
              outside_window: true,
            },
          ],
        };
      }
      return { rows: [] };
    });
    queryMock.mockResolvedValue({ rows: [{ buyer_name: 'Ana Souza' }] });

    const result = await eventService.checkInTicket('T-AAAA-BBBB-CCCC', 'seller-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('wrong_event');
      expect(result.message).toBe(
        'Este ingresso é de outro evento: Photocard Trading (20/09). Não vale para hoje.'
      );
      expect(result.eventTitle).toBe('Photocard Trading');
    }
  });

  it('ingresso usado em evento passado diz o dia e o evento', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE event_tickets')) return { rows: [] };
      if (sql.startsWith('SELECT t.*')) {
        return {
          rows: [
            {
              ...ticketRow({ status: 'used', used_at: '2026-09-20T17:32:00.000Z' }),
              event_title: 'Photocard Trading',
              event_starts_at: '2026-09-20T17:00:00.000Z',
              outside_window: true,
            },
          ],
        };
      }
      return { rows: [] };
    });
    queryMock.mockResolvedValue({ rows: [{ buyer_name: 'Ana Souza' }] });

    const result = await eventService.checkInTicket('T-AAAA-BBBB-CCCC', 'seller-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('already_used');
      expect(result.message).toBe(
        'Ingresso já utilizado às 14:32 em 20/09, no evento Photocard Trading.'
      );
    }
  });

  it('nega código inexistente', async () => {
    clientQueryMock.mockResolvedValue({ rows: [] });

    const result = await eventService.checkInTicket('T-ZZZZ-ZZZZ-ZZZZ', 'seller-1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_found');
  });

  it('aceita o código digitado sem hífen e em minúsculas', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE event_tickets')) return { rows: [ticketRow({ status: 'used' })] };
      if (sql.startsWith('SELECT r.buyer_name')) return { rows: [{ buyer_name: 'Ana Souza', event_title: 'Evento GeeKpop!' }] };
      return { rows: [] };
    });

    await eventService.checkInTicket('taaaabbbbcccc', 'seller-1');

    const update = clientQueryMock.mock.calls.find(([sql]) =>
      String(sql).startsWith('UPDATE event_tickets')
    )!;
    expect(update[1]![0]).toBe('T-AAAA-BBBB-CCCC');
  });
});

describe('normalizeCode', () => {
  it('reconstrói os grupos de ingresso e de reserva', () => {
    expect(eventService.normalizeCode(' t-aaaa bbbb cccc ')).toBe('T-AAAA-BBBB-CCCC');
    expect(eventService.normalizeCode('raaaabbbb')).toBe('R-AAAA-BBBB');
  });
});

describe('cancelReservation', () => {
  it('invalida os ingressos que ainda não entraram', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE event_reservations')) {
        return { rows: [reservationRow({ status: 'cancelled' })] };
      }
      if (sql.startsWith('UPDATE event_tickets')) {
        return { rows: [ticketRow({ status: 'cancelled' })] };
      }
      return { rows: [] };
    });

    const reservation = await eventService.cancelReservation('res-1', 'admin-1', 'não pagou');

    expect(reservation.status).toBe('cancelled');
    const ticketUpdate = clientQueryMock.mock.calls.find(([sql]) =>
      String(sql).startsWith('UPDATE event_tickets')
    )!;
    // Already admitted stays `used`: clearing that would wipe the door log.
    expect(String(ticketUpdate[0])).toContain("status IN ('pending', 'valid')");
  });
});

describe('adminListReservations', () => {
  it('conta só o evento escolhido, sem deixar busca e status mexerem nos totais', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('AS pending')) return { rows: [{ pending: 1, confirmed: 2, cancelled: 0 }] };
      if (sql.includes('AS tickets_valid')) return { rows: [{ tickets_valid: 3, tickets_used: 1 }] };
      if (sql.includes('COUNT(*)::int AS total')) return { rows: [{ total: 0 }] };
      return { rows: [] };
    });

    const result = await eventService.adminListReservations({
      eventId: 'evento-geekpop',
      status: 'confirmed',
      search: 'ana',
    });

    const summaryCalls = queryMock.mock.calls.filter(
      ([sql]) => String(sql).includes('AS pending') || String(sql).includes('AS tickets_valid')
    );
    expect(summaryCalls).toHaveLength(2);
    for (const [sql, params] of summaryCalls) {
      expect(String(sql)).toContain('WHERE event_id = $1');
      expect(params).toEqual(['evento-geekpop']);
    }
    expect(result.summary).toEqual({
      pending: 1,
      confirmed: 2,
      cancelled: 0,
      ticketsValid: 3,
      ticketsUsed: 1,
    });
    const listSql = queryMock.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('FROM event_reservations r'));
    expect(listSql).toContain('t.attendee_name ILIKE');
  });

  it('sem evento escolhido, os totais cobrem tudo', async () => {
    queryMock.mockResolvedValue({ rows: [] });

    await eventService.adminListReservations();

    const summary = queryMock.mock.calls.find(([sql]) => String(sql).includes('AS tickets_valid'))!;
    expect(String(summary[0])).not.toContain('event_id');
    expect(summary[1]).toEqual([]);
  });
});
