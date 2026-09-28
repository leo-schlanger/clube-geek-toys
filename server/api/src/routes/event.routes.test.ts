import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Event routes over real HTTP.
 *
 * What these pin:
 *  1. Reserving needs no account, but the door (check-in) needs staff, and the
 *     catalogue of events needs an admin.
 *  2. Link buttons only take http(s) — they become `href` on the storefront.
 *  3. The link preview follows the storefront rule: an ended event is not
 *     advertised.
 *  4. A flyer refused by the service (limit, missing event) leaves no file.
 */

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'event-routes-'));

vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);
vi.mock('../middleware/rate-limit.js', async () => (await import('../test-support/env.js')).rateLimitModule);
vi.mock('../services/log.service.js', () => ({ createErrorLog: vi.fn(async () => {}) }));
vi.mock('../utils/upload-path.js', () => ({
  uploadDir: (_base: string, id: unknown) =>
    typeof id === 'string' && /^[a-z0-9-]+$/.test(id) ? path.join(tmpRoot, id) : null,
}));

const events = vi.hoisted(() => ({
  createReservation: vi.fn(),
  reservationUrl: vi.fn((code: string) => `https://shop.example/ingressos/${code}`),
  getPublicTicket: vi.fn(),
  getPublicReservation: vi.fn(),
  resendReservationPaymentLink: vi.fn(),
  listReservationsForUser: vi.fn(),
  adminListReservations: vi.fn(),
  confirmReservation: vi.fn(),
  cancelReservation: vi.fn(),
  checkInTicket: vi.fn(),
  getEventStats: vi.fn(),
}));
vi.mock('../services/event.service.js', () => events);

const config = vi.hoisted(() => ({
  getActiveEventOrFallback: vi.fn(),
  buildEventShareHtml: vi.fn(() => '<html>preview</html>'),
  listEvents: vi.fn(),
  createEvent: vi.fn(),
  getEventById: vi.fn(),
  updateEvent: vi.fn(),
  duplicateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  addEventFlyer: vi.fn(),
}));
vi.mock('../services/event-config.service.js', async () => {
  const actual = await vi.importActual<typeof import('../services/event-config.service.js')>(
    '../services/event-config.service.js'
  );
  // Real `isWebUrl` and caps: they are the validation under test.
  return { ...config, isWebUrl: actual.isWebUrl, MAX_EVENT_FLYERS: 6, MAX_EVENT_LINKS: 6 };
});
vi.mock('../config/database.js', () => ({ query: vi.fn() }));

import { eventRouter } from './event.routes.js';
import { routerClient } from '../test-support/http.js';
import { AppError } from '../middleware/error-handler.js';

const api = routerClient('/events', eventRouter);
const EVENT_ID = 'evento-geekpop';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

function imageForm(field: string, bytes = JPEG, type = 'image/jpeg', name = 'cartaz.jpg') {
  const f = new FormData();
  f.append(field, new Blob([bytes], { type }), name);
  return f;
}
function filesOnDisk(): string[] {
  const dir = path.join(tmpRoot, EVENT_ID);
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

const future = {
  id: EVENT_ID,
  status: 'published',
  startsAt: new Date(Date.now() + 86_400_000).toISOString(),
  endsAt: new Date(Date.now() + 90_000_000).toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  fs.rmSync(path.join(tmpRoot, EVENT_ID), { recursive: true, force: true });
});
afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe('public', () => {
  it('serves the active event with a short cache', async () => {
    config.getActiveEventOrFallback.mockResolvedValue(future);
    const res = await api.get('/active');
    expect(res.body).toEqual({ event: future });
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
  });

  it('previews only an event that has not ended', async () => {
    config.getActiveEventOrFallback.mockResolvedValue(future);
    const ok = await api.get('/active/share');
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('<html>preview</html>');

    config.getActiveEventOrFallback.mockResolvedValue({
      ...future,
      startsAt: '2026-09-20T17:00:00Z',
      endsAt: '2026-09-20T21:00:00Z',
    });
    expect((await api.get('/active/share')).status).toBe(404);

    config.getActiveEventOrFallback.mockResolvedValue(null);
    expect((await api.get('/active/share')).status).toBe(404);
  });

  it('reserves without an account, and validates the attendees', async () => {
    events.createReservation.mockResolvedValue({ code: 'R-1' });
    const body = {
      buyerName: 'Norberto',
      buyerEmail: 'norberto@example.com',
      buyerPhone: '21999999999',
      attendees: [{ name: 'Janaina', kind: 'member' }],
    };
    const res = await api.post(`/${EVENT_ID}/reservations`, { body });
    expect(res.status).toBe(201);
    expect(res.body.ticketsUrl).toBe('https://shop.example/ingressos/R-1');
    expect(events.createReservation).toHaveBeenCalledWith(EVENT_ID, expect.objectContaining({ userId: null }));

    // Logged in: the reservation is tied to the account.
    await api.post(`/${EVENT_ID}/reservations`, { body, as: 'member' });
    expect(events.createReservation).toHaveBeenLastCalledWith(EVENT_ID, expect.objectContaining({ userId: 'user-member' }));

    // The CPF reaches the service, masked as typed: the service normalises it.
    await api.post(`/${EVENT_ID}/reservations`, { body: { ...body, buyerDocument: '529.982.247-25' } });
    expect(events.createReservation).toHaveBeenLastCalledWith(
      EVENT_ID,
      expect.objectContaining({ buyerDocument: '529.982.247-25' })
    );

    for (const bad of [
      { ...body, buyerDocument: '1'.repeat(21) },
      { ...body, attendees: [] },
      { ...body, buyerEmail: 'not-an-email' },
      { ...body, attendees: Array.from({ length: 51 }, () => ({ name: 'Fulano' })) },
      { ...body, attendees: [{ name: 'Fulano', kind: 'vip' }] },
    ]) {
      expect((await api.post(`/${EVENT_ID}/reservations`, { body: bad })).status).toBe(400);
    }
  });

  it('shows a ticket and a reservation by code, 404 when unknown', async () => {
    events.getPublicTicket.mockResolvedValueOnce({ code: 'T-1' }).mockResolvedValueOnce(null);
    expect((await api.get('/tickets/T-1')).body).toEqual({ ticket: { code: 'T-1' } });
    expect((await api.get('/tickets/NOPE')).status).toBe(404);

    events.getPublicReservation.mockResolvedValueOnce({ code: 'R-1' }).mockResolvedValueOnce(null);
    expect((await api.get('/reservations/R-1')).body).toEqual({ reservation: { code: 'R-1' } });
    expect((await api.get('/reservations/NOPE')).status).toBe(404);
  });

  it('resends the PIX link to the stored address, masked in the answer', async () => {
    events.resendReservationPaymentLink.mockResolvedValue({ buyerEmail: 'fernanda@gmail.com' });
    expect((await api.post('/reservations/R-1/payment-link')).body).toEqual({
      sent: true,
      email: 'fer*****@gmail.com',
    });
  });

  it("lists the customer's own tickets only when logged in", async () => {
    expect((await api.get('/my-reservations')).status).toBe(401);
    events.listReservationsForUser.mockResolvedValue([{ code: 'R-1' }]);
    expect((await api.get('/my-reservations', { as: 'member' })).body).toEqual({ reservations: [{ code: 'R-1' }] });
    expect(events.listReservationsForUser).toHaveBeenCalledWith('user-member', 'member@example.com');
  });
});

describe('admin: event catalogue', () => {
  it('is admin-only', async () => {
    expect((await api.get('/admin/events')).status).toBe(401);
    expect((await api.get('/admin/events', { as: 'seller' })).status).toBe(403);
  });

  it('lists, creates, reads, updates, duplicates and deletes', async () => {
    config.listEvents.mockResolvedValue([future]);
    expect((await api.get('/admin/events', { as: 'admin' })).body).toEqual({ events: [future] });
    expect(config.listEvents).toHaveBeenCalledWith(true);

    config.createEvent.mockResolvedValue(future);
    const created = await api.post('/admin/events', {
      as: 'admin',
      body: { title: 'Evento GeeKpop!', startsAt: '2026-10-11T14:00:00-03:00' },
    });
    expect(created.status).toBe(201);
    expect(config.createEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Evento GeeKpop!' }), 'user-admin');

    config.getEventById.mockResolvedValueOnce(future).mockResolvedValueOnce(null);
    expect((await api.get(`/admin/events/${EVENT_ID}`, { as: 'admin' })).status).toBe(200);
    expect((await api.get('/admin/events/nope', { as: 'admin' })).status).toBe(404);

    config.updateEvent.mockResolvedValue(future);
    expect((await api.patch(`/admin/events/${EVENT_ID}`, { as: 'admin', body: { reservationsOpen: false } })).status).toBe(200);

    config.duplicateEvent.mockResolvedValue({ ...future, id: 'copy' });
    expect((await api.post(`/admin/events/${EVENT_ID}/duplicate`, { as: 'admin' })).status).toBe(201);

    expect((await api.delete(`/admin/events/${EVENT_ID}`, { as: 'admin' })).status).toBe(204);
    config.deleteEvent.mockRejectedValueOnce(new AppError(409, 'Tem reservas', 'EVENT_HAS_RESERVATIONS'));
    expect((await api.delete(`/admin/events/${EVENT_ID}`, { as: 'admin' })).status).toBe(409);
  });

  it('refuses a date without offset and a link that is not http(s)', async () => {
    expect((await api.post('/admin/events', { as: 'admin', body: { title: 'X y', startsAt: '2026-10-11 14:00' } })).status).toBe(400);
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'forms.gle/x']) {
      const res = await api.patch(`/admin/events/${EVENT_ID}`, {
        as: 'admin',
        body: { links: [{ label: 'Inscrição', url }] },
      });
      expect(res.status, url).toBe(400);
    }
    expect(config.updateEvent).not.toHaveBeenCalled();
  });
});

describe('admin: art', () => {
  it('uploads the banner under a fresh name and points the event at it', async () => {
    config.updateEvent.mockResolvedValue(future);
    const res = await api.post(`/admin/events/${EVENT_ID}/banner`, { as: 'admin', form: imageForm('banner') });
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/\/uploads\/events\/evento-geekpop\/banner-\d+-[0-9a-f]{8}\.jpg$/);
    expect(config.updateEvent).toHaveBeenCalledWith(EVENT_ID, { bannerImageUrl: res.body.url }, 'user-admin');
    expect(filesOnDisk()).toHaveLength(1);
  });

  it('refuses a wrong type, a missing file and a bad event id', async () => {
    expect((await api.post(`/admin/events/${EVENT_ID}/banner`, { as: 'admin', form: imageForm('banner', JPEG, 'application/pdf', 'x.pdf') })).status).toBe(400);
    expect((await api.post(`/admin/events/${EVENT_ID}/banner`, { as: 'admin', form: new FormData() })).status).toBe(400);
    expect((await api.post('/admin/events/..%2F..%2Fetc/banner', { as: 'admin', form: imageForm('banner') })).status).toBe(400);
  });

  it('appends a flyer, and deletes the file when the service refuses it', async () => {
    config.addEventFlyer.mockResolvedValueOnce(future);
    const ok = await api.post(`/admin/events/${EVENT_ID}/flyers`, { as: 'admin', form: imageForm('flyer') });
    expect(ok.status).toBe(201);
    expect(ok.body.url).toMatch(/\/flyer-\d+-[0-9a-f]{8}\.jpg$/);
    expect(filesOnDisk()).toHaveLength(1);

    config.addEventFlyer.mockRejectedValueOnce(new AppError(409, 'Limite', 'EVENT_FLYER_LIMIT'));
    const full = await api.post(`/admin/events/${EVENT_ID}/flyers`, { as: 'admin', form: imageForm('flyer') });
    expect(full.status).toBe(409);
    await new Promise((r) => setTimeout(r, 50)); // unlink is fire-and-forget
    expect(filesOnDisk()).toHaveLength(1);

    expect((await api.post(`/admin/events/${EVENT_ID}/flyers`, { as: 'admin', form: new FormData() })).status).toBe(400);
  });
});

describe('admin: reservations and the door', () => {
  it('lists with filters, ignoring an unknown status', async () => {
    events.adminListReservations.mockResolvedValue({ reservations: [], total: 0 });
    await api.get('/admin/reservations?status=pending&eventId=e1&search=ana&page=2&limit=10', { as: 'admin' });
    expect(events.adminListReservations).toHaveBeenCalledWith({ status: 'pending', eventId: 'e1', search: 'ana', page: 2, limit: 10 });
    await api.get('/admin/reservations?status=hacked', { as: 'admin' });
    expect(events.adminListReservations).toHaveBeenLastCalledWith(expect.objectContaining({ status: undefined }));
  });

  it('confirms and cancels', async () => {
    events.confirmReservation.mockResolvedValue({ id: 'r1', status: 'confirmed' });
    expect((await api.post('/admin/reservations/r1/confirm', { as: 'admin' })).body.reservation.status).toBe('confirmed');
    events.cancelReservation.mockResolvedValue({ id: 'r1', status: 'cancelled' });
    await api.post('/admin/reservations/r1/cancel', { as: 'admin', body: { reason: 'desistiu' } });
    expect(events.cancelReservation).toHaveBeenCalledWith('r1', 'user-admin', 'desistiu');
  });

  it('lets the seller at the door check in, but not a member', async () => {
    events.checkInTicket.mockResolvedValue({ ok: true });
    expect((await api.post('/admin/check-in', { as: 'seller', body: { code: 'T-AAAA' } })).status).toBe(200);
    expect((await api.post('/admin/check-in', { as: 'member', body: { code: 'T-AAAA' } })).status).toBe(403);
    expect((await api.post('/admin/check-in', { as: 'seller', body: { code: 'x' } })).status).toBe(400);

    events.getEventStats.mockResolvedValue({ checkedIn: 3 });
    expect((await api.get(`/admin/${EVENT_ID}/stats`, { as: 'seller' })).body).toEqual({ checkedIn: 3 });
  });
});
