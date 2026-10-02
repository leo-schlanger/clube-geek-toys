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
import * as pagarme from '../utils/pagarme.js';
import { isValidCPF } from '../utils/cpf.js';
import { isValidCnpj } from '../utils/cnpj.js';
import { STORE_PICKUP_LOCATION } from './shipping.service.js';
import { processPagarmeEvent } from './pagarme-webhook.service.js';
import { moduleLogger } from '../config/logger.js';

const log = moduleLogger('event');

/**
 * Event tickets.
 *
 * Each person gets a **named** ticket with a unique code, and entry **burns**
 * it: a second scan of the same QR reads as already used.
 *
 * Payment is a Pagar.me PIX, same as the shop: the webhook (or the
 * reconciliation sweep) confirms the reservation and the tickets go valid on
 * their own. Reservations from before 28/09/2026 carry the old static BR Code
 * (`payment_provider = 'local'`), which only an admin can confirm; the same
 * path is the fallback when Pagar.me is not configured.
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

/**
 * How long a ticket PIX stays payable.
 *
 * Longer than the shop's hour on purpose: a ticket holds no stock, and the code
 * travels by e-mail to someone who may pay it that evening.
 */
export const EVENT_PIX_EXPIRES_IN_SECONDS = 24 * 60 * 60;

export type ReservationPaymentProvider = 'pagarme' | 'local';

/** `emvCode` is the copy-and-paste payload; the QR is drawn from it client-side. */
export interface ReservationPix {
  emvCode: string;
  pixKey: string;
  merchantName: string;
  amount: number;
  txId: string;
  /** 'pagarme' confirms itself; 'local' waits for an admin. */
  provider: ReservationPaymentProvider;
  qrCodeUrl?: string | null;
  expiresAt?: string | null;
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
  buyerDocument: string | null;
  quantity: number;
  totalCents: number;
  status: ReservationStatus;
  notes: string | null;
  paymentProvider: ReservationPaymentProvider | null;
  pagarmeOrderId: string | null;
  pagarmeChargeId: string | null;
  /** The Pagar.me code, stored because a dynamic PIX cannot be rebuilt. */
  pixQrCode: string | null;
  pixQrCodeUrl: string | null;
  pixExpiresAt: string | null;
  paidAt: string | null;
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
    buyerDocument: row.buyer_document ?? null,
    quantity: row.quantity,
    totalCents: row.total_cents,
    status: row.status,
    notes: row.notes ?? null,
    paymentProvider: row.payment_provider ?? null,
    pagarmeOrderId: row.pagarme_order_id ?? null,
    pagarmeChargeId: row.pagarme_charge_id ?? null,
    pixQrCode: row.pix_qr_code ?? null,
    pixQrCodeUrl: row.pix_qr_code_url ?? null,
    pixExpiresAt: row.pix_expires_at ? new Date(row.pix_expires_at).toISOString() : null,
    paidAt: row.paid_at ?? null,
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

/** A Pagar.me code past its `expires_at` can no longer be paid. */
export function isReservationPixExpired(reservation: EventReservation): boolean {
  if (reservation.paymentProvider !== 'pagarme') return false;
  const expiresAt = reservation.pixExpiresAt;
  return Boolean(expiresAt && Date.parse(expiresAt) <= Date.now());
}

/**
 * The PIX the buyer pays, or `null` for a free event, an unconfigured key or an
 * expired code.
 *
 * A Pagar.me code is read back from the row: it is dynamic and cannot be
 * rebuilt. The static one is rebuilt from `pix_txid`, which is never
 * regenerated — it is what ties a statement line to the reservation.
 * Reservations older than migration 031 fall back to the reservation code.
 */
export function buildReservationPix(reservation: EventReservation): ReservationPix | null {
  if (reservation.totalCents <= 0) return null;

  if (reservation.paymentProvider === 'pagarme') {
    if (!reservation.pixQrCode || isReservationPixExpired(reservation)) return null;
    return {
      emvCode: reservation.pixQrCode,
      pixKey: PIX_KEY,
      merchantName: PIX_MERCHANT_NAME,
      amount: reservation.totalCents / 100,
      txId: reservation.pagarmeChargeId ?? '',
      provider: 'pagarme',
      qrCodeUrl: reservation.pixQrCodeUrl,
      expiresAt: reservation.pixExpiresAt,
    };
  }

  if (!PIX_KEY) return null;
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
    provider: 'local',
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
  /** CPF (or CNPJ). Required when the reservation is charged through Pagar.me. */
  buyerDocument?: string | null;
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

  // Pagar.me when there is money to take and the integration is up; otherwise
  // the static code the team confirms by hand. A missing key degrades the
  // sale, it does not stop it.
  const provider: ReservationPaymentProvider | null =
    totalCents <= 0 ? null : pagarme.isPagarmeConfigured() ? 'pagarme' : 'local';

  // The acquirer refuses an order without a valid document. Checked before
  // anything is written, so a typo costs a corrected field, not a dead row.
  const buyerDocument = pagarme.normalizeDocument(input.buyerDocument);
  if (provider === 'pagarme' && !isValidBuyerDocument(buyerDocument)) {
    throw new AppError(400, 'Informe um CPF válido para pagar com PIX.', 'INVALID_DOCUMENT');
  }

  const client = await getClient();
  let reservation: EventReservation;
  try {
    await client.query('BEGIN');

    const reservationResult = await client.query(
      `INSERT INTO event_reservations
         (event_id, code, buyer_name, buyer_email, buyer_phone, quantity, total_cents, notes,
          user_id, pix_txid, buyer_document, payment_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        provider === 'local' ? generatePixTxId() : null,
        buyerDocument || null,
        provider,
      ]
    );
    reservation = mapReservation(reservationResult.rows[0]!);

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
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // The charge is created outside the transaction: holding a connection open
  // across an acquirer call is how a slow provider starves the pool. If it
  // fails, the reservation is cancelled so nothing unpayable is left behind.
  if (provider === 'pagarme') {
    try {
      await createReservationPixCharge(reservation, event, buyerDocument);
    } catch (err) {
      await voidReservation(reservation.id).catch((e) =>
        log.error({ err: e }, 'Falha ao cancelar reserva sem cobrança')
      );
      void auditLog('event.reservation_charge_failed', input.userId ?? null, {
        reservationId: reservation.id,
        code: reservation.code,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
  reservation.pix = buildReservationPix(reservation);

  // The reservation is already committed: a Resend failure must not fail the
  // response.
  void sendReservationReceivedEmail(reservation, event).catch((err) =>
    log.error({ err }, 'Falha ao enviar e-mail de reserva')
  );
  void notifyAdminOfReservation(reservation, event).catch((err) =>
    log.error({ err }, 'Falha ao avisar o admin')
  );
  void auditLog('event.reservation_created', input.userId ?? null, {
    reservationId: reservation.id,
    code: reservation.code,
    eventId: event.id,
    quantity: reservation.quantity,
    provider,
  });

  return reservation;
}

function isValidBuyerDocument(document: string): boolean {
  if (document.length === 11) return isValidCPF(document);
  return document.length === 14 && isValidCnpj(document);
}

/**
 * Issues the Pagar.me PIX for a reservation and stores the code on the row.
 *
 * `metadata.kind = 'event_reservation'` is what routes the webhook here and
 * never to a shop order. The address is the shop's own, as on a pickup order:
 * a PSP customer needs one, and a ticket has no destination to ask for.
 */
async function createReservationPixCharge(
  reservation: EventReservation,
  event: EventDefinition,
  document: string
): Promise<void> {
  const phone = pagarme.parseBrazilianPhone(reservation.buyerPhone);
  const store = STORE_PICKUP_LOCATION;
  const created = await pagarme.createOrder(
    {
      code: reservation.code,
      customer: {
        name: reservation.buyerName,
        email: reservation.buyerEmail,
        document,
        code: `reservation-${reservation.id}`,
        phones: phone ? { mobile_phone: phone } : undefined,
        address: {
          line_1: [store.number, store.street, store.neighborhood].filter(Boolean).join(', '),
          line_2: store.complement || undefined,
          zip_code: store.cep.replace(/\D/g, ''),
          city: store.city,
          state: store.state,
          country: 'BR',
        },
      },
      items: [
        {
          amount: reservation.totalCents,
          description: `${reservation.quantity} ingresso(s) - ${event.title}`.slice(0, 256),
          quantity: 1,
          code: reservation.code,
        },
      ],
      payments: [
        {
          payment_method: 'pix',
          pix: {
            expires_in: EVENT_PIX_EXPIRES_IN_SECONDS,
            additional_information: [{ name: 'Reserva', value: reservation.code }],
          },
        },
      ],
      metadata: {
        kind: 'event_reservation',
        reservationId: reservation.id,
        reservationCode: reservation.code,
        eventId: event.id,
      },
    },
    {
      idempotencyKey: pagarme.idempotencyKeyFor(
        'event_pix',
        reservation.id,
        reservation.totalCents
      ),
    }
  );

  const charge = created.charges?.[0];
  const tx = charge?.last_transaction;
  if (!charge || !tx?.qr_code) {
    log.error({ detail: JSON.stringify(created).slice(0, 800) }, 'Pagar.me order without qr_code');
    throw new AppError(
      502,
      'Não foi possível gerar o PIX agora. Tente novamente em instantes.',
      'PIX_QRCODE_UNAVAILABLE'
    );
  }

  const expiresAt =
    tx.expires_at ?? new Date(Date.now() + EVENT_PIX_EXPIRES_IN_SECONDS * 1000).toISOString();
  await query(
    `UPDATE event_reservations
        SET pagarme_order_id = $1, pagarme_charge_id = $2, pix_qr_code = $3,
            pix_qr_code_url = $4, pix_expires_at = $5, updated_at = NOW()
      WHERE id = $6`,
    [created.id, charge.id, tx.qr_code, tx.qr_code_url ?? null, expiresAt, reservation.id]
  );

  reservation.pagarmeOrderId = created.id;
  reservation.pagarmeChargeId = charge.id;
  reservation.pixQrCode = tx.qr_code;
  reservation.pixQrCodeUrl = tx.qr_code_url ?? null;
  reservation.pixExpiresAt = new Date(expiresAt).toISOString();
}

/**
 * Cancels a reservation that is still waiting for money, with its tickets.
 *
 * `status = 'pending'` in the WHERE is what keeps this safe next to the
 * webhook: a reservation that got paid in the meantime is left alone.
 */
async function voidReservation(id: string): Promise<boolean> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE event_reservations
          SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING id`,
      [id]
    );
    if (updated.rows.length > 0) {
      await client.query(
        `UPDATE event_tickets SET status = 'cancelled', updated_at = NOW()
          WHERE reservation_id = $1 AND status = 'pending'`,
        [id]
      );
    }
    await client.query('COMMIT');
    return updated.rows.length > 0;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Closes a reservation whose PIX can no longer be paid. Called by the
 * reconciliation sweep — an expired Pagar.me PIX never changes status on its
 * own, so without this the "aguardando pagamento" queue only grows.
 */
export async function expireReservation(id: string): Promise<boolean> {
  const closed = await voidReservation(id);
  if (closed) {
    void auditLog('event.reservation_expired', null, { reservationId: id });
  }
  return closed;
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
      // Paying by key reaches the account but not the Pagar.me charge, so it
      // would never confirm itself: the key is offered only for the old code.
      pix_key: pix?.provider === 'local' ? pix.pixKey : '',
      pix_auto: pix?.provider === 'pagarme' ? '1' : '',
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
  if (isReservationPixExpired(reservation)) {
    throw new AppError(
      409,
      'O PIX desta reserva expirou. Faça uma nova reserva na página do evento.',
      'RESERVATION_PIX_EXPIRED'
    );
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
      pix_auto: reservation.paymentProvider === 'pagarme' ? '1' : '',
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
  /** 'pagarme' confirms itself, so the page can wait for it. */
  paymentProvider: ReservationPaymentProvider | null;
  /** Pending, but the code can no longer be paid: the page says so instead of a dead QR. */
  pixExpired: boolean;
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
    paymentProvider: reservation.paymentProvider,
    pixExpired: reservation.status === 'pending' && isReservationPixExpired(reservation),
  };
}

/**
 * Asks Pagar.me about a pending reservation and settles it if the money is in.
 *
 * The buyer is on the tickets page with the bank app still open; waiting for
 * the webhook (or the 10-minute sweep, if the delivery was lost) reads as a
 * payment that failed. Settlement goes through the webhook processor under the
 * same key the reconciliation uses, so the three paths settle a charge once.
 * The processor re-reads the charge uncached before moving anything.
 *
 * Never throws: the page must load even with the provider down.
 */
async function settleIfPaid(reservation: EventReservation): Promise<boolean> {
  if (reservation.status !== 'pending' || !reservation.pagarmeChargeId) return false;
  try {
    const charge = await pagarme.getChargeThrottled(reservation.pagarmeChargeId);
    if (pagarme.mapChargeStatus(charge.status) !== 'paid') return false;
    await processPagarmeEvent({
      id: `reconcile_${charge.id}`,
      type: 'charge.paid',
      data: charge as unknown as Record<string, unknown>,
    });
    return true;
  } catch (err) {
    log.error({ err }, `live charge lookup failed (${reservation.code})`);
    return false;
  }
}

/** Every ticket of a purchase — this is the link the email carries. */
export async function getPublicReservation(code: string): Promise<PublicReservation | null> {
  const normalized = normalizeCode(code);
  const result = await query(`SELECT * FROM event_reservations WHERE code = $1`, [normalized]);
  if (result.rows.length === 0) return null;
  let reservation = mapReservation(result.rows[0]!);

  if (await settleIfPaid(reservation)) {
    const settled = await query(`SELECT * FROM event_reservations WHERE id = $1`, [reservation.id]);
    if (settled.rows[0]) reservation = mapReservation(settled.rows[0]);
  }

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

  // Counters follow the chosen event only: status and search narrow the list,
  // not the totals the door works from.
  const summaryParams = opts.eventId ? [opts.eventId] : [];
  const summaryWhere = opts.eventId ? 'WHERE event_id = $1' : '';

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
       FROM event_reservations ${summaryWhere}`,
      summaryParams
    ),
  ]);

  const ticketSummary = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'valid')::int AS tickets_valid,
       COUNT(*) FILTER (WHERE status = 'used')::int  AS tickets_used
     FROM event_tickets ${summaryWhere}`,
    summaryParams
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
      }).catch((err) => log.error({ err }, 'Falha ao enviar ingressos'));
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

/**
 * Cancels the reservation and voids the tickets that have not entered yet.
 *
 * A reservation paid through Pagar.me is refunded first, and a refund that
 * fails stops the cancel: voiding the tickets while keeping the money is the
 * one outcome nobody can explain to the buyer. A pending charge is voided on a
 * best-effort basis — if that call fails and the buyer pays anyway, the webhook
 * confirms the reservation again rather than dropping the money.
 */
export async function cancelReservation(
  id: string,
  actorUserId: string,
  reason?: string
): Promise<EventReservation> {
  const current = await query(`SELECT * FROM event_reservations WHERE id = $1`, [id]);
  const before = current.rows[0] ? mapReservation(current.rows[0]) : null;
  let refunded = false;
  if (before?.pagarmeChargeId && before.status === 'confirmed') {
    await pagarme.refundCharge(before.pagarmeChargeId);
    refunded = true;
  } else if (before?.pagarmeChargeId && before.status === 'pending') {
    await pagarme
      .refundCharge(before.pagarmeChargeId)
      .catch((err) => log.error({ err }, `Falha ao anular o PIX de ${before.code}`));
  }

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
      refunded,
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
  | { ok: true; ticket: EventTicket; buyerName: string; eventTitle: string | null }
  | {
      ok: false;
      reason: 'not_found' | 'already_used' | 'not_confirmed' | 'cancelled' | 'wrong_event';
      message: string;
      ticket?: EventTicket;
      buyerName?: string;
      eventTitle?: string | null;
    };

/**
 * A ticket only enters on its own event's day: from 12h before the start until
 * 6h after the end (24h after the start when there is no end). Kept in SQL so
 * the window and the burn are one statement, on the database clock.
 */
const OUTSIDE_EVENT_WINDOW_SQL = `(
  NOW() < e.starts_at - INTERVAL '12 hours'
  OR NOW() > COALESCE(e.ends_at, e.starts_at + INTERVAL '24 hours') + INTERVAL '6 hours'
)`;

function formatEventDate(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: EVENT_TIME_ZONE });
}

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
      `UPDATE event_tickets t
         SET status = 'used', used_at = NOW(), used_by = $2, updated_at = NOW()
       WHERE t.code = $1 AND t.status = 'valid'
         AND NOT EXISTS (
           SELECT 1 FROM events e WHERE e.id = t.event_id AND ${OUTSIDE_EVENT_WINDOW_SQL}
         )
       RETURNING t.*`,
      [normalized, actorUserId]
    );

    if (burned.rows.length > 0) {
      const ticket = mapTicket(burned.rows[0]!);
      const buyer = await client.query(
        `SELECT r.buyer_name, e.title AS event_title
           FROM event_reservations r LEFT JOIN events e ON e.id = r.event_id
          WHERE r.id = $1`,
        [ticket.reservationId]
      );
      await client.query('COMMIT');
      void auditLog('event.ticket_checked_in', actorUserId, { code: ticket.code, ticketId: ticket.id });
      return {
        ok: true,
        ticket,
        buyerName: buyer.rows[0]?.buyer_name ?? '',
        eventTitle: buyer.rows[0]?.event_title ?? null,
      };
    }

    const existing = await client.query(
      `SELECT t.*, e.title AS event_title, e.starts_at AS event_starts_at,
              (e.id IS NOT NULL AND ${OUTSIDE_EVENT_WINDOW_SQL}) AS outside_window
         FROM event_tickets t LEFT JOIN events e ON e.id = t.event_id
        WHERE t.code = $1`,
      [normalized]
    );
    await client.query('COMMIT');

    if (existing.rows.length === 0) {
      void auditLog('event.ticket_checkin_failed', actorUserId, { code: normalized, reason: 'not_found' });
      return { ok: false, reason: 'not_found', message: 'Ingresso não encontrado.' };
    }

    const row = existing.rows[0]!;
    const ticket = mapTicket(row);
    const eventTitle: string | null = row.event_title ?? null;
    const buyer = await query(`SELECT buyer_name FROM event_reservations WHERE id = $1`, [
      ticket.reservationId,
    ]);
    const buyerName = buyer.rows[0]?.buyer_name ?? '';

    if (ticket.status === 'valid' && row.outside_window) {
      void auditLog('event.ticket_checkin_failed', actorUserId, {
        code: normalized,
        reason: 'wrong_event',
      });
      return {
        ok: false,
        reason: 'wrong_event',
        message: `Este ingresso é de outro evento: ${eventTitle ?? 'evento'} (${formatEventDate(row.event_starts_at)}). Não vale para hoje.`,
        ticket,
        buyerName,
        eventTitle,
      };
    }

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
      const usedMessage = when ? `Ingresso já utilizado às ${when}.` : 'Ingresso já utilizado.';
      return {
        ok: false,
        reason: 'already_used',
        message: row.outside_window
          ? `${usedMessage.slice(0, -1)} em ${formatEventDate(ticket.usedAt ?? row.event_starts_at)}, no evento ${eventTitle ?? 'anterior'}.`
          : usedMessage,
        ticket,
        buyerName,
        eventTitle,
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
