import crypto from 'crypto';
import pg from 'pg';
import { query, getClient } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { SHOP_CANONICAL_URL, env, adminUrl } from '../config/env.js';
import {
  ticketPriceCents,
  MAX_TICKETS_PER_RESERVATION,
  type EventDefinition,
  type TicketKind,
} from '../config/events.js';
import { getEventById, toDefinition } from './event-config.service.js';
import { auditLog } from '../utils/audit.js';
import { sendTemplateEmail } from './email.service.js';
import { generatePixEMV, generatePixTxId } from '../utils/pix.js';

/**
 * Event tickets.
 *
 * Each person gets a **named** ticket with a unique code, and entry **burns**
 * it: a second scan of the same QR reads as already used.
 *
 * Payment is PIX on screen (same EMV as the shop), but settlement stays manual
 * as with orders — there is no PIX webhook: a reservation starts `pending` and
 * only becomes a valid ticket once an admin confirms the money arrived.
 */

/** Shop timezone: the API container runs in UTC. */
const EVENT_TIME_ZONE = 'America/Sao_Paulo';

// Same account that receives shop orders (order.service uses these too).
const PIX_KEY = env.PIX_KEY || '';
const PIX_MERCHANT_NAME = env.PIX_MERCHANT_NAME || 'GEEK E TOYS';
const PIX_MERCHANT_CITY = env.PIX_MERCHANT_CITY || 'RIO DE JANEIRO';

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

/** `emvCode` is the copy-and-paste payload; the QR is drawn from it client-side. */
export interface ReservationPix {
  emvCode: string;
  pixKey: string;
  merchantName: string;
  amount: number;
  txId: string;
}

export interface EventReservation {
  id: string;
  userId: string | null;
  pixTxid: string | null;
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
  /** Only while `pending` and with PIX configured. */
  pix?: ReservationPix | null;
}

/**
 * Alphabet without 0/O/1/I/L: the code is also typed by hand at the door, and a
 * "0" read as "O" becomes a ticket that does not exist.
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

/** `R-XXXX-XXXX` — opens the purchase's ticket list; must be unguessable. */
function newReservationCode(): string {
  const raw = randomCode(8);
  return `R-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** `T-XXXX-XXXX-XXXX` — 60 bits; what the QR carries and the door burns. */
function newTicketCode(): string {
  const raw = randomCode(12);
  return `T-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/** Accepts the code with or without hyphens and in any case: humans type it. */
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
    userId: row.user_id ?? null,
    pixTxid: row.pix_txid ?? null,
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

/** Event definition from the database, or `null` if the id is gone. */
async function loadDefinition(eventId: string): Promise<EventDefinition | null> {
  const event = await getEventById(eventId);
  return event ? toDefinition(event) : null;
}

/**
 * `null` for a free event or an unconfigured key.
 *
 * The txid comes from the database and is never regenerated — it is what ties a
 * statement line to the reservation. Reservations older than migration 031 fall
 * back to the reservation code.
 */
export function buildReservationPix(reservation: EventReservation): ReservationPix | null {
  if (!PIX_KEY) return null;
  if (reservation.totalCents <= 0) return null;
  const txId = (reservation.pixTxid || reservation.code.replace(/-/g, '')).substring(0, 25);
  const pix = generatePixEMV({
    pixKey: PIX_KEY,
    amount: reservation.totalCents / 100,
    merchantName: PIX_MERCHANT_NAME,
    merchantCity: PIX_MERCHANT_CITY,
    txId,
  });
  return {
    emvCode: pix.emvCode,
    pixKey: PIX_KEY,
    merchantName: PIX_MERCHANT_NAME,
    amount: pix.amount,
    txId,
  };
}

async function requireOpenEvent(eventId: string): Promise<EventDefinition> {
  const event = await loadDefinition(eventId);
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
  /** Logged-in account, when there is one: what makes the reservation show in the profile. */
  userId?: string | null;
}

/**
 * Creates the reservation and one ticket **per person**, all `pending`.
 *
 * Tickets are born with their code so the buyer leaves with a link and the team
 * has something to search for; valid only after payment is confirmed.
 */
export async function createReservation(
  eventId: string,
  input: CreateReservationInput
): Promise<EventReservation> {
  const event = await requireOpenEvent(eventId);

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
         (event_id, code, buyer_name, buyer_email, buyer_phone, quantity, total_cents, notes,
          user_id, pix_txid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        input.userId ?? null,
        generatePixTxId(),
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
    reservation.pix = buildReservationPix(reservation);

    // The reservation is already committed: a Resend failure must not fail the
    // response.
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

/** Carries the copy-and-paste code: the on-screen QR dies with the tab. */
async function sendReservationReceivedEmail(
  reservation: EventReservation,
  event: EventDefinition
): Promise<void> {
  const pix = reservation.pix ?? buildReservationPix(reservation);
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
      pix_code: pix?.emvCode ?? '',
      pix_key: pix?.pixKey ?? '',
    },
  });
}

/**
 * Resends the reservation PIX.
 *
 * Public (rate limited at the route): reserving needs no account. The recipient
 * is always the stored email — nothing from the caller changes it.
 */
export async function resendReservationPaymentLink(code: string): Promise<EventReservation> {
  const normalized = normalizeCode(code);
  const result = await query(`SELECT * FROM event_reservations WHERE code = $1`, [normalized]);
  if (result.rows.length === 0) {
    throw new AppError(404, 'Reserva não encontrada.', 'RESERVATION_NOT_FOUND');
  }
  const reservation = mapReservation(result.rows[0]!);
  if (reservation.status !== 'pending') {
    throw new AppError(
      409,
      reservation.status === 'confirmed'
        ? 'Esta reserva já está paga e confirmada.'
        : 'Esta reserva foi cancelada.',
      'RESERVATION_NOT_PENDING'
    );
  }
  const event = await loadDefinition(reservation.eventId);
  if (!event) {
    throw new AppError(404, 'Evento não encontrado.', 'EVENT_NOT_FOUND');
  }
  reservation.pix = buildReservationPix(reservation);
  await sendReservationReceivedEmail(reservation, event);
  await auditLog('event.payment_link_resent', reservation.userId, {
    reservationId: reservation.id,
    code: reservation.code,
  });
  return reservation;
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
      admin_url: adminUrl('/admin?tab=events'),
    },
  });
}

export function formatBRL(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

// ─── Public lookup ───────────────────────────────────────────────────────────

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

function buildPublicTicket(ticket: EventTicket, event: EventDefinition): PublicTicket {
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

/** Standalone ticket. Does not expose the buyer — the QR circulates. */
export async function getPublicTicket(code: string): Promise<PublicTicket | null> {
  const result = await query(`SELECT * FROM event_tickets WHERE code = $1`, [normalizeCode(code)]);
  if (result.rows.length === 0) return null;
  const ticket = mapTicket(result.rows[0]!);
  const event = await loadDefinition(ticket.eventId);
  return event ? buildPublicTicket(ticket, event) : null;
}

export interface PublicReservation {
  code: string;
  buyerName: string;
  status: ReservationStatus;
  quantity: number;
  totalCents: number;
  createdAt: string;
  tickets: PublicTicket[];
  /** Present only while the reservation is pending — it is how she pays. */
  pix: ReservationPix | null;
}

function buildPublicReservation(
  reservation: EventReservation,
  tickets: PublicTicket[]
): PublicReservation {
  return {
    code: reservation.code,
    buyerName: reservation.buyerName,
    status: reservation.status,
    quantity: reservation.quantity,
    totalCents: reservation.totalCents,
    createdAt: reservation.createdAt,
    tickets,
    // A QR on a confirmed reservation would invite paying twice.
    pix: reservation.status === 'pending' ? buildReservationPix(reservation) : null,
  };
}

/** Every ticket of a purchase — this is the link the email carries. */
export async function getPublicReservation(code: string): Promise<PublicReservation | null> {
  const normalized = normalizeCode(code);
  const result = await query(`SELECT * FROM event_reservations WHERE code = $1`, [normalized]);
  if (result.rows.length === 0) return null;
  const reservation = mapReservation(result.rows[0]!);

  const ticketsResult = await query(
    `SELECT * FROM event_tickets WHERE reservation_id = $1 ORDER BY created_at, code`,
    [reservation.id]
  );
  // All tickets share the event: one read, not one per ticket.
  const event = await loadDefinition(reservation.eventId);
  const tickets = event
    ? ticketsResult.rows.map((row) => buildPublicTicket(mapTicket(row), event))
    : [];

  return buildPublicReservation(reservation, tickets);
}

/** Matches by account **or** email: reserved as a guest, account created later. */
export async function listReservationsForUser(
  userId: string,
  email: string
): Promise<PublicReservation[]> {
  const result = await query(
    `SELECT * FROM event_reservations
      WHERE user_id = $1 OR LOWER(buyer_email) = LOWER($2)
      ORDER BY created_at DESC
      LIMIT 50`,
    [userId, email]
  );
  if (result.rows.length === 0) return [];

  const reservations = result.rows.map(mapReservation);
  const ticketsResult = await query(
    `SELECT * FROM event_tickets WHERE reservation_id = ANY($1::uuid[]) ORDER BY created_at, code`,
    [reservations.map((r) => r.id)]
  );

  const definitions = new Map<string, EventDefinition | null>();
  for (const eventId of new Set(reservations.map((r) => r.eventId))) {
    definitions.set(eventId, await loadDefinition(eventId));
  }

  return reservations.map((reservation) => {
    const event = definitions.get(reservation.eventId) ?? null;
    const tickets = event
      ? ticketsResult.rows
          .filter((row) => row.reservation_id === reservation.id)
          .map((row) => buildPublicTicket(mapTicket(row), event))
      : [];
    return buildPublicReservation(reservation, tickets);
  });
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
 * Confirms payment: the reservation's tickets become valid and the buyer gets
 * the link. Only leaves `pending`, so confirming twice neither revives a
 * cancelled ticket nor resends the email.
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

    const event = await loadDefinition(reservation.eventId);
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

/** Cancels the reservation and voids the tickets that have not entered yet. */
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
    // `used` stays: erasing it would erase the door's audit trail.
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
 * Door entry: validates and **burns** the code.
 *
 * `UPDATE ... WHERE status = 'valid'` is the whole point: only the first scan
 * changes the row. A forwarded screenshot lands on `already_used`, with the
 * time the ticket actually entered.
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
      // The container runs in UTC. Without pinning the zone, door staff would
      // read "already used at 19:53" for someone who entered at 16:53 — three
      // hours of argument at the door over a string.
      const when = ticket.usedAt
        ? new Date(ticket.usedAt).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: EVENT_TIME_ZONE,
          })
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

/** Door counters: how many entered, how many still to. */
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
