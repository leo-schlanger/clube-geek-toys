import pg from 'pg';
import { query } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { auditLog } from '../utils/audit.js';
import { FALLBACK_EVENT, type EventDefinition } from '../config/events.js';

/**
 * Event CRUD.
 *
 * The event used to live hardcoded in three files (shop, API, and the
 * institutional site) and swapping it meant a deploy in two repos. The
 * `events` table is now source of truth: the API exposes the active event
 * and both storefronts only consume it. When one event ends, the admin
 * publishes the next — no developer in the middle.
 *
 * Price and the reservation window still come **from here**, never from the
 * client: whoever POSTs the reservation would send the price with it if it
 * came from the front.
 */

export type EventStatus = 'draft' | 'published' | 'archived';

export interface EventRecord {
  id: string;
  slug: string;
  status: EventStatus;
  title: string;
  shortTitle: string;
  bannerText: string;
  bannerImageUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  location: { name: string; address: string; mapsUrl: string | null };
  description: string[];
  highlights: string[];
  memberPerk: string | null;
  ticketReservation: {
    enabled: boolean;
    priceBRL: number | null;
    currencyLabel: string;
    maxPerReservation: number | null;
    whatsappNumber: string;
    notes: string | null;
  };
  /** Cents — what the server charges. `priceBRL` is the storefront display. */
  priceCents: number | null;
  createdAt: string;
  updatedAt: string;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function mapEvent(row: pg.QueryResultRow): EventRecord {
  const priceCents: number | null = row.price_cents ?? null;
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    title: row.title,
    shortTitle: row.short_title ?? '',
    bannerText: row.banner_text ?? '',
    bannerImageUrl: row.banner_image_url ?? null,
    startsAt: row.starts_at instanceof Date ? row.starts_at.toISOString() : row.starts_at,
    endsAt: row.ends_at instanceof Date ? row.ends_at.toISOString() : (row.ends_at ?? null),
    location: {
      name: row.location_name ?? '',
      address: row.location_address ?? '',
      mapsUrl: row.location_maps_url ?? null,
    },
    description: toStringArray(row.description),
    highlights: toStringArray(row.highlights),
    memberPerk: row.member_perk ?? null,
    ticketReservation: {
      enabled: row.reservations_open === true,
      priceBRL: priceCents == null ? null : priceCents / 100,
      currencyLabel: row.currency_label ?? 'R$',
      maxPerReservation: row.max_per_reservation ?? null,
      whatsappNumber: row.whatsapp_number ?? '',
      notes: row.reservation_notes ?? null,
    },
    priceCents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Shape `event.service` consumes to price tickets and refuse a closed reservation. */
export function toDefinition(event: EventRecord): EventDefinition {
  return {
    id: event.id,
    title: event.title,
    priceCents: event.priceCents ?? 0,
    startsAt: event.startsAt,
    endsAt: event.endsAt ?? undefined,
    locationName: event.location.name,
    locationAddress: event.location.address,
    reservationsOpen: event.ticketReservation.enabled && event.status === 'published',
  };
}

export async function listEvents(includeArchived = true): Promise<EventRecord[]> {
  const result = await query(
    includeArchived
      ? `SELECT * FROM events ORDER BY starts_at DESC`
      : `SELECT * FROM events WHERE status <> 'archived' ORDER BY starts_at DESC`
  );
  return result.rows.map(mapEvent);
}

export async function getEventById(id: string): Promise<EventRecord | null> {
  const result = await query(`SELECT * FROM events WHERE id = $1`, [id]);
  return result.rows.length ? mapEvent(result.rows[0]) : null;
}

/**
 * The event the storefronts show.
 *
 * Rule: among published ones, the one that has not ended yet and starts
 * soonest; if they have all passed, the most recent. The banner then
 * disappears on its own when the event ends, but the past event's page
 * stays up for anyone holding a ticket link.
 */
export async function getActiveEvent(): Promise<EventRecord | null> {
  const result = await query(
    `SELECT * FROM events
      WHERE status = 'published'
      ORDER BY (COALESCE(ends_at, starts_at) >= NOW()) DESC,
               CASE WHEN COALESCE(ends_at, starts_at) >= NOW() THEN starts_at END ASC,
               starts_at DESC
      LIMIT 1`
  );
  return result.rows.length ? mapEvent(result.rows[0]) : null;
}

/**
 * Active event with a safety net — and only the net that makes sense.
 *
 * Fallback applies to an **empty table** (fresh deploy, migration has not
 * seeded yet) and to a **read failure**. No published event on a table that
 * already has events is an admin decision: they archived everything, and
 * returning the hardcoded seed would put back on the site the event they
 * just took down.
 */
export async function getActiveEventOrFallback(): Promise<EventRecord | null> {
  try {
    const active = await getActiveEvent();
    if (active) return active;

    const any = await query(`SELECT 1 FROM events LIMIT 1`);
    // Events exist, none published: nothing on the marquee, and that is correct.
    if (any.rows.length > 0) return null;
  } catch (err) {
    console.error('[EVENTS] falha lendo o evento ativo, usando fallback:', err);
  }
  return FALLBACK_EVENT;
}

export interface EventInput {
  id?: string;
  slug?: string;
  status?: EventStatus;
  title: string;
  shortTitle?: string;
  bannerText?: string;
  bannerImageUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  locationName?: string;
  locationAddress?: string;
  locationMapsUrl?: string | null;
  description?: string[];
  highlights?: string[];
  memberPerk?: string | null;
  reservationsOpen?: boolean;
  priceCents?: number | null;
  currencyLabel?: string;
  maxPerReservation?: number | null;
  whatsappNumber?: string;
  reservationNotes?: string | null;
}

/** `Photocard Trading 2026` → `photocard-trading-2026`. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function uniqueEventSlug(base: string, ignoreId?: string): Promise<string> {
  const root = slugify(base) || 'evento';
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const clash = await query(
      `SELECT 1 FROM events WHERE slug = $1 AND ($2::text IS NULL OR id <> $2) LIMIT 1`,
      [candidate, ignoreId ?? null]
    );
    if (clash.rows.length === 0) return candidate;
  }
  return `${root}-${Date.now()}`;
}

async function uniqueEventId(base: string): Promise<string> {
  const root = slugify(base) || 'evento';
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const clash = await query(`SELECT 1 FROM events WHERE id = $1 LIMIT 1`, [candidate]);
    if (clash.rows.length === 0) return candidate;
  }
  return `${root}-${Date.now()}`;
}

export async function createEvent(input: EventInput, actorUserId?: string): Promise<EventRecord> {
  const slug = await uniqueEventSlug(input.slug ?? input.title);
  const id = input.id ? await uniqueEventId(input.id) : await uniqueEventId(slug);

  const result = await query(
    `INSERT INTO events (
       id, slug, status, title, short_title, banner_text, banner_image_url,
       starts_at, ends_at, location_name, location_address, location_maps_url,
       description, highlights, member_perk, reservations_open,
       price_cents, currency_label, max_per_reservation, whatsapp_number, reservation_notes
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
       $13::jsonb, $14::jsonb, $15, $16, $17, $18, $19, $20, $21
     ) RETURNING *`,
    [
      id,
      slug,
      input.status ?? 'draft',
      input.title,
      input.shortTitle ?? input.title,
      input.bannerText ?? '',
      input.bannerImageUrl ?? null,
      input.startsAt,
      input.endsAt ?? null,
      input.locationName ?? '',
      input.locationAddress ?? '',
      input.locationMapsUrl ?? null,
      JSON.stringify(input.description ?? []),
      JSON.stringify(input.highlights ?? []),
      input.memberPerk ?? null,
      input.reservationsOpen ?? true,
      input.priceCents ?? null,
      input.currencyLabel ?? 'R$',
      input.maxPerReservation ?? null,
      input.whatsappNumber ?? '',
      input.reservationNotes ?? null,
    ]
  );
  const event = mapEvent(result.rows[0]);
  await auditLog('event.created', actorUserId ?? null, { eventId: event.id, title: event.title });
  return event;
}

const FIELD_MAP: Record<keyof EventInput & string, string> = {
  slug: 'slug',
  status: 'status',
  title: 'title',
  shortTitle: 'short_title',
  bannerText: 'banner_text',
  bannerImageUrl: 'banner_image_url',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  locationName: 'location_name',
  locationAddress: 'location_address',
  locationMapsUrl: 'location_maps_url',
  description: 'description',
  highlights: 'highlights',
  memberPerk: 'member_perk',
  reservationsOpen: 'reservations_open',
  priceCents: 'price_cents',
  currencyLabel: 'currency_label',
  maxPerReservation: 'max_per_reservation',
  whatsappNumber: 'whatsapp_number',
  reservationNotes: 'reservation_notes',
  id: 'id',
};

const JSON_FIELDS = new Set(['description', 'highlights']);

export async function updateEvent(
  id: string,
  data: Partial<EventInput>,
  actorUserId?: string
): Promise<EventRecord> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  for (const [key, value] of Object.entries(data)) {
    // `id` never changes: tickets already issued point at it.
    if (key === 'id') continue;
    const column = FIELD_MAP[key as keyof EventInput];
    if (!column) continue;
    if (key === 'slug' && typeof value === 'string') {
      sets.push(`slug = $${i++}`);
      values.push(await uniqueEventSlug(value, id));
      continue;
    }
    if (JSON_FIELDS.has(key)) {
      sets.push(`${column} = $${i++}::jsonb`);
      values.push(JSON.stringify(value ?? []));
      continue;
    }
    sets.push(`${column} = $${i++}`);
    values.push(value);
  }

  if (sets.length === 0) {
    const current = await getEventById(id);
    if (!current) throw new AppError(404, 'Evento não encontrado.', 'EVENT_NOT_FOUND');
    return current;
  }

  values.push(id);
  const result = await query(
    `UPDATE events SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'Evento não encontrado.', 'EVENT_NOT_FOUND');
  }
  const event = mapEvent(result.rows[0]);
  await auditLog('event.updated', actorUserId ?? null, { eventId: id, fields: Object.keys(data) });
  return event;
}

/**
 * Copies an event as a starting point for the next one.
 *
 * The path used when an event ends: duplicate the previous, change date and
 * venue, publish. Born `draft` and without a banner — the art is always new.
 */
export async function duplicateEvent(id: string, actorUserId?: string): Promise<EventRecord> {
  const source = await getEventById(id);
  if (!source) throw new AppError(404, 'Evento não encontrado.', 'EVENT_NOT_FOUND');

  return createEvent(
    {
      title: `${source.title} (cópia)`,
      slug: source.slug,
      status: 'draft',
      shortTitle: source.shortTitle,
      bannerText: source.bannerText,
      bannerImageUrl: null,
      startsAt: source.startsAt,
      endsAt: source.endsAt,
      locationName: source.location.name,
      locationAddress: source.location.address,
      locationMapsUrl: source.location.mapsUrl,
      description: source.description,
      highlights: source.highlights,
      memberPerk: source.memberPerk,
      reservationsOpen: false,
      priceCents: source.priceCents,
      currencyLabel: source.ticketReservation.currencyLabel,
      maxPerReservation: source.ticketReservation.maxPerReservation,
      whatsappNumber: source.ticketReservation.whatsappNumber,
      reservationNotes: source.ticketReservation.notes,
    },
    actorUserId
  );
}

/**
 * Deletes an event — only while nobody has reserved.
 *
 * With a ticket already issued, deletion would leave a QR pointing at nothing
 * at the door; archive instead.
 */
export async function deleteEvent(id: string, actorUserId?: string): Promise<void> {
  const used = await query(`SELECT 1 FROM event_reservations WHERE event_id = $1 LIMIT 1`, [id]);
  if (used.rows.length > 0) {
    throw new AppError(
      409,
      'Este evento já tem reservas. Arquive-o em vez de excluir.',
      'EVENT_HAS_RESERVATIONS'
    );
  }
  const result = await query(`DELETE FROM events WHERE id = $1 RETURNING id`, [id]);
  if (result.rows.length === 0) {
    throw new AppError(404, 'Evento não encontrado.', 'EVENT_NOT_FOUND');
  }
  await auditLog('event.deleted', actorUserId ?? null, { eventId: id });
}
