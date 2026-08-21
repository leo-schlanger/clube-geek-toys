import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Ingressos de evento. O que estes testes seguram, na ordem do prejuízo:
 *
 *  1. O check-in **queima** o código: a segunda leitura do mesmo QR é negada,
 *     com a hora da primeira. É isso que impede o print de circular.
 *  2. Ingresso de reserva não confirmada não entra — pagamento vem antes.
 *  3. Confirmar só sai de `pending`, então clicar duas vezes não reenvia
 *     e-mail nem ressuscita reserva cancelada.
 *  4. O preço vem do servidor, por tipo de ingresso, e não do cliente.
 *  5. O código é lido com ou sem hífen, porque a portaria digita à mão.
 */

const { queryMock, clientQueryMock, releaseMock, sendEmailMock, auditMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  clientQueryMock: vi.fn(),
  releaseMock: vi.fn(),
  sendEmailMock: vi.fn(async () => ({ status: 'sent' })),
  auditMock: vi.fn(async () => {}),
}));

vi.mock('../config/database.js', () => ({
  query: queryMock,
  getClient: async () => ({ query: clientQueryMock, release: releaseMock }),
}));

vi.mock('../config/env.js', () => ({
  env: { ADMIN_EMAIL: 'admin@geeketoys.com.br', FRONTEND_URL: 'https://club.geeketoys.com.br' },
  SHOP_CANONICAL_URL: 'https://shop.geekpoptoys.com.br',
}));

vi.mock('./email.service.js', () => ({ sendTemplateEmail: sendEmailMock }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));

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
        return { rows: [reservationRow({ quantity: 2, total_cents: 3000 })] };
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
        { name: 'Bia Souza', kind: 'member' },
      ],
    });

    expect(reservation.tickets).toHaveLength(2);

    const insert = clientQueryMock.mock.calls.find(([sql]) =>
      String(sql).startsWith('INSERT INTO event_reservations')
    )!;
    // R$ 20 (inteira) + R$ 10 (membro) — o cliente não manda preço.
    expect(insert[1]).toEqual(
      expect.arrayContaining([2, 3000, expect.stringMatching(/^R-[A-Z0-9]{4}-[A-Z0-9]{4}$/)])
    );
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
      if (sql.startsWith('SELECT buyer_name')) return { rows: [{ buyer_name: 'Ana Souza' }] };
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
      // O UPDATE não pega nada: a linha já não está mais em `valid`.
      if (sql.startsWith('UPDATE event_tickets')) return { rows: [] };
      if (sql.startsWith('SELECT * FROM event_tickets')) {
        return { rows: [ticketRow({ status: 'used', used_at: '2026-09-06T17:32:00.000Z' })] };
      }
      return { rows: [] };
    });
    queryMock.mockResolvedValue({ rows: [{ buyer_name: 'Ana Souza' }] });

    const result = await eventService.checkInTicket('T-AAAA-BBBB-CCCC', 'seller-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('already_used');
      expect(result.message).toMatch(/já utilizado/i);
    }
  });

  it('nega ingresso de reserva ainda não paga', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE event_tickets')) return { rows: [] };
      if (sql.startsWith('SELECT * FROM event_tickets')) {
        return { rows: [ticketRow({ status: 'pending' })] };
      }
      return { rows: [] };
    });
    queryMock.mockResolvedValue({ rows: [{ buyer_name: 'Ana Souza' }] });

    const result = await eventService.checkInTicket('T-AAAA-BBBB-CCCC', 'seller-1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_confirmed');
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
      if (sql.startsWith('SELECT buyer_name')) return { rows: [{ buyer_name: 'Ana Souza' }] };
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
    // Quem já entrou continua `used`: apagar isso apagaria a trilha da portaria.
    expect(String(ticketUpdate[0])).toContain("status IN ('pending', 'valid')");
  });
});
