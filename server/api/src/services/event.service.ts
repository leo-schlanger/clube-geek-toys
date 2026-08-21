import crypto from 'crypto';
import pg from 'pg';
import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { SHOP_CANONICAL_URL, env } from '../config/env.js';
import {
  getEvent,
  ticketPriceCents,
  MAX_TICKETS_PER_RESERVATION,
  type EventDefinition,
  type TicketKind,
} from '../config/events.js';
import { auditLog } from '../utils/audit.js';
import { sendTemplateEmail } from './email.service.js';

/**
 * Ingressos de evento.
 *
 * O problema que isto resolve: até aqui o "ingresso" era uma mensagem de
 * WhatsApp. Qualquer print valia na porta, e a reserva só existia na conversa.
 * Agora cada pessoa tem um ingresso **nominal** com código único, e a entrada
 * **queima** o código — o segundo print do mesmo QR aparece como já utilizado.
 *
 * O pagamento continua fora do sistema (PIX/dinheiro confirmado pela equipe),
 * como nos pedidos: a reserva nasce `pending` e só vira ingresso válido quando
 * um admin confirma.
 */

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled';
export type TicketStatus = 'pending' | 'valid' | 'used' | 'cancelled';

export interface EventTicket {
  id: string;
  reservationId: string;
  eventId: string;
  code: string;
  attendeeName: string;
  kind: TicketKind;
  priceCents: number;
  status: TicketStatus;
  usedAt: string | null;
  createdAt: string;
}

export interface EventReservation {
  id: string;
  eventId: string;
  code: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  quantity: number;
  totalCents: number;
  status: ReservationStatus;
  notes: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  tickets?: EventTicket[];
}

/**
 * Alfabeto sem 0/O/1/I/L: o código também é digitado à mão quando a câmera da
 * portaria não coopera, e um "0" lido como "O" vira ingresso inexistente.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

/** `R-XXXX-XXXX` — abre a lista de ingressos da compra; precisa ser inadivinhável. */
function newReservationCode(): string {
  const raw = randomCode(8);
  return `R-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** `T-XXXX-XXXX-XXXX` — 60 bits, é o que o QR carrega e a portaria queima. */
function newTicketCode(): string {
  const raw = randomCode(12);
  return `T-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/** Aceita o código com ou sem hífen/caixa, porque digitação humana varia. */
export function normalizeCode(input: string): string {
  const clean = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.startsWith('T') && clean.length === 13) {
    const raw = clean.slice(1);
    return `T-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
  }
  if (clean.startsWith('R') && clean.length === 9) {
    const raw = clean.slice(1);
    return `R-${raw.slice(0, 4)}-${raw.slice(4)}`;
  }
  return input.trim().toUpperCase();
}

export function ticketUrl(code: string): string {
  return `${SHOP_CANONICAL_URL}/ingresso/${code}`;
}

export function reservationUrl(code: string): string {
  return `${SHOP_CANONICAL_URL}/ingressos/${code}`;
}

function mapTicket(row: pg.QueryResultRow): EventTicket {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    eventId: row.event_id,
    code: row.code,
    attendeeName: row.attendee_name,
    kind: row.kind,
    priceCents: row.price_cents,
    status: row.status,
    usedAt: row.used_at ?? null,
    createdAt: row.created_at,
  };
}

function mapReservation(row: pg.QueryResultRow): EventReservation {
  return {
    id: row.id,
    eventId: row.event_id,
    code: row.code,
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    buyerPhone: row.buyer_phone,
    quantity: row.quantity,
    totalCents: row.total_cents,
    status: row.status,
    notes: row.notes ?? null,
    confirmedAt: row.confirmed_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    createdAt: row.created_at,
  };
}

function requireOpenEvent(eventId: string): EventDefinition {
  const event = getEvent(eventId);
  if (!event) throw new AppError(404, 'Evento não encontrado.', 'EVENT_NOT_FOUND');
  if (!event.reservationsOpen) {
    throw new AppError(409, 'As reservas para este evento estão encerradas.', 'EVENT_CLOSED');
  }
  return event;
}

export interface AttendeeInput {
  name: string;
  kind: TicketKind;
}

export interface CreateReservationInput {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  notes?: string | null;
  attendees: AttendeeInput[];
}

/**
 * Cria a reserva e um ingresso **por pessoa**, todos `pending`.
 *
 * O ingresso já nasce com código: assim o cliente sai da loja com o link na
 * mão e a equipe tem o que procurar no painel. Válido, só depois da confirmação
 * do pagamento.
 */
export async function createReservation(
  eventId: string,
  input: CreateReservationInput
): Promise<EventReservation> {
  const event = requireOpenEvent(eventId);

  const attendees = input.attendees
    .map((a) => ({ name: a.name.trim(), kind: a.kind }))
    .filter((a) => a.name.length > 0);

  if (attendees.length === 0) {
    throw new AppError(400, 'Informe o nome de cada pessoa.', 'NO_ATTENDEES');
  }
  if (attendees.length > MAX_TICKETS_PER_RESERVATION) {
    throw new AppError(
      400,
      `Máximo de ${MAX_TICKETS_PER_RESERVATION} ingressos por reserva. Para grupos maiores, fale com a loja.`,
      'TOO_MANY_TICKETS'
    );
  }

  const priced = attendees.map((a) => ({ ...a, priceCents: ticketPriceCents(event, a.kind) }));
  const totalCents = priced.reduce((sum, a) => sum + a.priceCents, 0);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const reservationResult = await client.query(
      `INSERT INTO event_reservations
         (event_id, code, buyer_name, buyer_email, buyer_phone, quantity, total_cents, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        event.id,
        newReservationCode(),
        input.buyerName.trim(),
        input.buyerEmail.trim().toLowerCase(),
        input.buyerPhone.trim(),
        priced.length,
        totalCents,
        input.notes?.trim() || null,
      ]
    );
    const reservation = mapReservation(reservationResult.rows[0]!);

    const tickets: EventTicket[] = [];
    for (const attendee of priced) {
      const ticketResult = await client.query(
        `INSERT INTO event_tickets
           (reservation_id, event_id, code, attendee_name, kind, price_cents)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [reservation.id, event.id, newTicketCode(), attendee.name, attendee.kind, attendee.priceCents]
      );
      tickets.push(mapTicket(ticketResult.rows[0]!));
    }

    await client.query('COMMIT');
    reservation.tickets = tickets;

    // E-mail é conveniência: a reserva já está gravada, então uma falha do
    // Resend não pode derrubar a resposta.
    void sendReservationReceivedEmail(reservation, event).catch((err) =>
      console.error('[EVENT] Falha ao enviar e-mail de reserva:', err)
    );
    void notifyAdminOfReservation(reservation, event).catch((err) =>
      console.error('[EVENT] Falha ao avisar o admin:', err)
    );
    void auditLog('event.reservation_created', null, {
      reservationId: reservation.id,
      code: reservation.code,
      eventId: event.id,
      quantity: reservation.quantity,
    });

    return reservation;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function sendReservationReceivedEmail(
  reservation: EventReservation,
  event: EventDefinition
): Promise<void> {
  await sendTemplateEmail({
    template: 'event-reservation-received',
    to: reservation.buyerEmail,
    variables: {
      name: reservation.buyerName,
      event_title: event.title,
      reservation_code: reservation.code,
      quantity: String(reservation.quantity),
      total: formatBRL(reservation.totalCents),
      tickets_url: reservationUrl(reservation.code),
    },
  });
}

async function notifyAdminOfReservation(
  reservation: EventReservation,
  event: EventDefinition
): Promise<void> {
  if (!env.ADMIN_EMAIL) return;
  await sendTemplateEmail({
    template: 'admin-event-reservation',
    to: env.ADMIN_EMAIL,
    variables: {
      event_title: event.title,
      buyer_name: reservation.buyerName,
      buyer_phone: reservation.buyerPhone,
      buyer_email: reservation.buyerEmail,
      reservation_code: reservation.code,
      quantity: String(reservation.quantity),
      total: formatBRL(reservation.totalCents),
      admin_url: `${env.FRONTEND_URL}/admin?tab=events`,
    },
  });
}

export function formatBRL(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

// ─── Consulta pública ────────────────────────────────────────────────────────

export interface PublicTicket {
  code: string;
  attendeeName: string;
  kind: TicketKind;
  status: TicketStatus;
  usedAt: string | null;
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt?: string;
    locationName: string;
    locationAddress: string;
  };
}

function toPublicTicket(ticket: EventTicket): PublicTicket | null {
  const event = getEvent(ticket.eventId);
  if (!event) return null;
  return {
    code: ticket.code,
    attendeeName: ticket.attendeeName,
    kind: ticket.kind,
    status: ticket.status,
    usedAt: ticket.usedAt,
    event: {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      locationName: event.locationName,
      locationAddress: event.locationAddress,
    },
  };
}

/** Ingresso avulso. Não expõe o comprador — o QR circula. */
export async function getPublicTicket(code: string): Promise<PublicTicket | null> {
  const result = await query(`SELECT * FROM event_tickets WHERE code = $1`, [normalizeCode(code)]);
  if (result.rows.length === 0) return null;
  return toPublicTicket(mapTicket(result.rows[0]!));
}

export interface PublicReservation {
  code: string;
  buyerName: string;
  status: ReservationStatus;
  quantity: number;
  totalCents: number;
  createdAt: string;
  tickets: PublicTicket[];
}

/** Todos os ingressos de uma compra — é o link que vai no e-mail. */
export async function getPublicReservation(code: string): Promise<PublicReservation | null> {
  const normalized = normalizeCode(code);
  const result = await query(`SELECT * FROM event_reservations WHERE code = $1`, [normalized]);
  if (result.rows.length === 0) return null;
  const reservation = mapReservation(result.rows[0]!);

  const ticketsResult = await query(
    `SELECT * FROM event_tickets WHERE reservation_id = $1 ORDER BY created_at, code`,
    [reservation.id]
  );
  const tickets = ticketsResult.rows
    .map((row) => toPublicTicket(mapTicket(row)))
    .filter((t): t is PublicTicket => t !== null);

  return {
    code: reservation.code,
    buyerName: reservation.buyerName,
    status: reservation.status,
    quantity: reservation.quantity,
    totalCents: reservation.totalCents,
    createdAt: reservation.createdAt,
    tickets,
  };
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface ReservationListResult {
  reservations: EventReservation[];
  total: number;
  page: number;
  limit: number;
  summary: { pending: number; confirmed: number; cancelled: number; ticketsValid: number; ticketsUsed: number };
}

export async function adminListReservations(
  opts: { status?: ReservationStatus; eventId?: string; search?: string; page?: number; limit?: number } = {}
): Promise<ReservationListResult> {
  const limit = Math.max(1, Math.min(opts.limit || 20, 100));
  const page = Math.max(1, opts.page || 1);
  const offset = (page - 1) * limit;

  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.status) {
    params.push(opts.status);
    where.push(`r.status = $${params.length}`);
  }
  if (opts.eventId) {
    params.push(opts.eventId);
    where.push(`r.event_id = $${params.length}`);
  }
  if (opts.search?.trim()) {
    params.push(`%${opts.search.trim()}%`);
    const idx = params.length;
    where.push(
      `(r.buyer_name ILIKE $${idx} OR r.buyer_email ILIKE $${idx} OR r.buyer_phone ILIKE $${idx} OR r.code ILIKE $${idx})`
    );
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows, countResult, summaryResult] = await Promise.all([
    query(
      `SELECT r.* FROM event_reservations r
       ${whereSql}
       ORDER BY r.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    query(`SELECT COUNT(*)::int AS total FROM event_reservations r ${whereSql}`, params),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int   AS pending,
         COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
         COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
       FROM event_reservations`
    ),
  ]);

  const ticketSummary = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'valid')::int AS tickets_valid,
       COUNT(*) FILTER (WHERE status = 'used')::int  AS tickets_used
     FROM event_tickets`
  );

  const reservations = rows.rows.map(mapReservation);
  if (reservations.length > 0) {
    const ticketsResult = await query(
      `SELECT * FROM event_tickets WHERE reservation_id = ANY($1::uuid[]) ORDER BY created_at, code`,
      [reservations.map((r) => r.id)]
    );
    const byReservation = new Map<string, EventTicket[]>();
    for (const row of ticketsResult.rows) {
      const ticket = mapTicket(row);
      const list = byReservation.get(ticket.reservationId) ?? [];
      list.push(ticket);
      byReservation.set(ticket.reservationId, list);
    }
    for (const reservation of reservations) {
      reservation.tickets = byReservation.get(reservation.id) ?? [];
    }
  }

  return {
    reservations,
    total: countResult.rows[0]?.total ?? 0,
    page,
    limit,
    summary: {
      pending: summaryResult.rows[0]?.pending ?? 0,
      confirmed: summaryResult.rows[0]?.confirmed ?? 0,
      cancelled: summaryResult.rows[0]?.cancelled ?? 0,
      ticketsValid: ticketSummary.rows[0]?.tickets_valid ?? 0,
      ticketsUsed: ticketSummary.rows[0]?.tickets_used ?? 0,
    },
  };
}

/**
 * Confirma o pagamento: os ingressos da reserva viram válidos e o comprador
 * recebe o link. Só sai de `pending`, para que confirmar duas vezes não
 * ressuscite ingresso cancelado nem reenvie e-mail à toa.
 */
export async function confirmReservation(
  id: string,
  actorUserId: string
): Promise<EventReservation> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE event_reservations
         SET status = 'confirmed', confirmed_at = NOW(), confirmed_by = $2, updated_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id, actorUserId]
    );
    if (updated.rows.length === 0) {
      const current = await client.query(`SELECT status FROM event_reservations WHERE id = $1`, [id]);
      await client.query('ROLLBACK');
      if (current.rows.length === 0) {
        throw new AppError(404, 'Reserva não encontrada.', 'RESERVATION_NOT_FOUND');
      }
      throw new AppError(
        409,
        `Esta reserva já está ${current.rows[0]!.status === 'confirmed' ? 'confirmada' : 'cancelada'}.`,
        'RESERVATION_NOT_PENDING'
      );
    }

    const reservation = mapReservation(updated.rows[0]!);
    const tickets = await client.query(
      `UPDATE event_tickets SET status = 'valid', updated_at = NOW()
       WHERE reservation_id = $1 AND status = 'pending'
       RETURNING *`,
      [id]
    );
    await client.query('COMMIT');

    reservation.tickets = tickets.rows.map(mapTicket);

    const event = getEvent(reservation.eventId);
    if (event) {
      void sendTemplateEmail({
        template: 'event-tickets-ready',
        to: reservation.buyerEmail,
        variables: {
          name: reservation.buyerName,
          event_title: event.title,
          reservation_code: reservation.code,
          quantity: String(reservation.quantity),
          tickets_url: reservationUrl(reservation.code),
        },
      }).catch((err) => console.error('[EVENT] Falha ao enviar ingressos:', err));
    }

    void auditLog('event.reservation_confirmed', actorUserId, {
      reservationId: id,
      code: reservation.code,
      tickets: reservation.tickets.length,
    });

    return reservation;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Cancela a reserva e invalida os ingressos que ainda não entraram. */
export async function cancelReservation(
  id: string,
  actorUserId: string,
  reason?: string
): Promise<EventReservation> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE event_reservations
         SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status <> 'cancelled'
       RETURNING *`,
      [id]
    );
    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new AppError(404, 'Reserva não encontrada ou já cancelada.', 'RESERVATION_NOT_FOUND');
    }
    // `used` fica como está: quem já entrou, entrou — apagar isso apagaria a
    // trilha da portaria.
    const tickets = await client.query(
      `UPDATE event_tickets SET status = 'cancelled', updated_at = NOW()
       WHERE reservation_id = $1 AND status IN ('pending', 'valid')
       RETURNING *`,
      [id]
    );
    await client.query('COMMIT');

    const reservation = mapReservation(updated.rows[0]!);
    reservation.tickets = tickets.rows.map(mapTicket);
    void auditLog('event.reservation_cancelled', actorUserId, {
      reservationId: id,
      code: reservation.code,
      reason: reason ?? null,
    });
    return reservation;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export type CheckInResult =
  | { ok: true; ticket: EventTicket; buyerName: string }
  | {
      ok: false;
      reason: 'not_found' | 'already_used' | 'not_confirmed' | 'cancelled';
      message: string;
      ticket?: EventTicket;
      buyerName?: string;
    };

/**
 * Entrada na portaria: valida e **queima** o código.
 *
 * O `UPDATE ... WHERE status = 'valid'` é o ponto do sistema todo: só a
 * primeira leitura muda a linha. O print reenviado para o grupo da família cai
 * em `already_used`, com a hora em que o ingresso entrou.
 */
export async function checkInTicket(code: string, actorUserId: string): Promise<CheckInResult> {
  const normalized = normalizeCode(code);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const burned = await client.query(
      `UPDATE event_tickets
         SET status = 'used', used_at = NOW(), used_by = $2, updated_at = NOW()
       WHERE code = $1 AND status = 'valid'
       RETURNING *`,
      [normalized, actorUserId]
    );

    if (burned.rows.length > 0) {
      const ticket = mapTicket(burned.rows[0]!);
      const buyer = await client.query(
        `SELECT buyer_name FROM event_reservations WHERE id = $1`,
        [ticket.reservationId]
      );
      await client.query('COMMIT');
      void auditLog('event.ticket_checked_in', actorUserId, { code: ticket.code, ticketId: ticket.id });
      return { ok: true, ticket, buyerName: buyer.rows[0]?.buyer_name ?? '' };
    }

    const existing = await client.query(`SELECT * FROM event_tickets WHERE code = $1`, [normalized]);
    await client.query('COMMIT');

    if (existing.rows.length === 0) {
      void auditLog('event.ticket_checkin_failed', actorUserId, { code: normalized, reason: 'not_found' });
      return { ok: false, reason: 'not_found', message: 'Ingresso não encontrado.' };
    }

    const ticket = mapTicket(existing.rows[0]!);
    const buyer = await query(`SELECT buyer_name FROM event_reservations WHERE id = $1`, [
      ticket.reservationId,
    ]);
    const buyerName = buyer.rows[0]?.buyer_name ?? '';

    if (ticket.status === 'used') {
      const when = ticket.usedAt
        ? new Date(ticket.usedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : null;
      void auditLog('event.ticket_checkin_failed', actorUserId, {
        code: normalized,
        reason: 'already_used',
      });
      return {
        ok: false,
        reason: 'already_used',
        message: when ? `Ingresso já utilizado às ${when}.` : 'Ingresso já utilizado.',
        ticket,
        buyerName,
      };
    }
    if (ticket.status === 'cancelled') {
      return { ok: false, reason: 'cancelled', message: 'Ingresso cancelado.', ticket, buyerName };
    }
    return {
      ok: false,
      reason: 'not_confirmed',
      message: 'Pagamento ainda não confirmado — confirme a reserva no painel antes de liberar a entrada.',
      ticket,
      buyerName,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Contadores da portaria: quantos entraram, quantos faltam. */
export async function getEventStats(eventId: string): Promise<{
  eventId: string;
  pending: number;
  valid: number;
  used: number;
  cancelled: number;
}> {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'pending')::int   AS pending,
       COUNT(*) FILTER (WHERE status = 'valid')::int     AS valid,
       COUNT(*) FILTER (WHERE status = 'used')::int      AS used,
       COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
     FROM event_tickets WHERE event_id = $1`,
    [eventId]
  );
  const row = result.rows[0] ?? {};
  return {
    eventId,
    pending: row.pending ?? 0,
    valid: row.valid ?? 0,
    used: row.used ?? 0,
    cancelled: row.cancelled ?? 0,
  };
}
