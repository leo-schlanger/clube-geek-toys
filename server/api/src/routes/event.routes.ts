import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { authenticate, optionalAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { publicLookupLimiter, emailLimiter } from '../middleware/rate-limit.js';
import { MAX_TICKETS_PER_RESERVATION } from '../config/events.js';
import { env } from '../config/env.js';
import * as eventService from '../services/event.service.js';
import * as eventConfig from '../services/event-config.service.js';

export const eventRouter = Router();

/** `fer***@gmail.com` — confirms which inbox without exposing the address. */
function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  const visible = user.slice(0, 3);
  return `${visible}${'*'.repeat(Math.max(1, user.length - visible.length))}@${domain}`;
}

// ─── Public: the event currently on ──────────────────────────────────────────
// Declared before any param route so "active" is not captured as an id.
// Consumed by the shop AND the institutional site — it replaced the three
// hardcoded files.

eventRouter.get('/active', async (_req, res, next) => {
  try {
    const event = await eventConfig.getActiveEventOrFallback();
    // Short on purpose: the admin publishes and wants it live, but the banner
    // is requested on every shop page.
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ event });
  } catch (err) {
    next(err);
  }
});

// ─── Public ──────────────────────────────────────────────────────────────────

const reservationSchema = z.object({
  buyerName: z.string().min(2).max(120),
  buyerEmail: z.string().email().max(160),
  buyerPhone: z.string().min(8).max(30),
  notes: z.string().max(500).optional().nullable(),
  attendees: z
    .array(
      z.object({
        name: z.string().min(2).max(120),
        kind: z.enum(['full', 'member', 'free']).default('full'),
      })
    )
    .min(1)
    .max(MAX_TICKETS_PER_RESERVATION),
});

// POST /events/:eventId/reservations — shop reservation, one ticket per person
eventRouter.post(
  '/:eventId/reservations',
  optionalAuth,
  publicLookupLimiter,
  validate(reservationSchema),
  async (req, res, next) => {
    try {
      const reservation = await eventService.createReservation(req.params.eventId as string, {
        ...req.body,
        userId: req.user?.userId ?? null,
      });
      res.status(201).json({
        reservation,
        ticketsUrl: eventService.reservationUrl(reservation.code),
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /events/tickets/:code — the ticket itself (no login: the QR circulates)
eventRouter.get('/tickets/:code', publicLookupLimiter, async (req, res, next) => {
  try {
    const ticket = await eventService.getPublicTicket(req.params.code as string);
    if (!ticket) {
      res.status(404).json({ error: 'Ingresso não encontrado.' });
      return;
    }
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

// GET /events/reservations/:code — every ticket from the purchase
eventRouter.get('/reservations/:code', publicLookupLimiter, async (req, res, next) => {
  try {
    const reservation = await eventService.getPublicReservation(req.params.code as string);
    if (!reservation) {
      res.status(404).json({ error: 'Reserva não encontrada.' });
      return;
    }
    res.json({ reservation });
  } catch (err) {
    next(err);
  }
});

// POST /events/reservations/:code/payment-link — resend the PIX to the reservation email
eventRouter.post('/reservations/:code/payment-link', emailLimiter, async (req, res, next) => {
  try {
    const reservation = await eventService.resendReservationPaymentLink(
      req.params.code as string
    );
    res.json({ sent: true, email: maskEmail(reservation.buyerEmail) });
  } catch (err) {
    next(err);
  }
});

// GET /events/my-reservations — the logged-in customer's tickets, for the profile
eventRouter.get('/my-reservations', authenticate, async (req, res, next) => {
  try {
    const reservations = await eventService.listReservationsForUser(
      req.user!.userId,
      req.user!.email
    );
    res.json({ reservations });
  } catch (err) {
    next(err);
  }
});

// ─── Admin: event CRUD ───────────────────────────────────────────────────────
// Before `/admin/:eventId/stats`: both have three segments, and putting the
// specific one first avoids depending on Express match order.

const isoDate = z.string().datetime({ offset: true });

const eventSchema = z.object({
  title: z.string().min(2).max(160),
  slug: z.string().max(60).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  shortTitle: z.string().max(80).optional(),
  bannerText: z.string().max(300).optional(),
  bannerImageUrl: z.string().url().max(500).optional().nullable(),
  startsAt: isoDate,
  endsAt: isoDate.optional().nullable(),
  locationName: z.string().max(160).optional(),
  locationAddress: z.string().max(300).optional(),
  locationMapsUrl: z.string().url().max(500).optional().nullable(),
  description: z.array(z.string().max(1500)).max(10).optional(),
  highlights: z.array(z.string().max(200)).max(15).optional(),
  memberPerk: z.string().max(400).optional().nullable(),
  reservationsOpen: z.boolean().optional(),
  // `null` = free / TBD. Zero is also valid.
  priceCents: z.number().int().min(0).max(10_000_00).optional().nullable(),
  currencyLabel: z.string().max(8).optional(),
  maxPerReservation: z.number().int().min(1).max(500).optional().nullable(),
  whatsappNumber: z.string().max(20).optional(),
  reservationNotes: z.string().max(1000).optional().nullable(),
});

// GET /events/admin/events — includes draft and archived
eventRouter.get('/admin/events', authenticate, requireRole('admin'), async (_req, res, next) => {
  try {
    res.json({ events: await eventConfig.listEvents(true) });
  } catch (err) {
    next(err);
  }
});

eventRouter.post(
  '/admin/events',
  authenticate,
  requireRole('admin'),
  validate(eventSchema),
  async (req, res, next) => {
    try {
      res.status(201).json({ event: await eventConfig.createEvent(req.body, req.user!.userId) });
    } catch (err) {
      next(err);
    }
  }
);

eventRouter.get('/admin/events/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const event = await eventConfig.getEventById(req.params.id as string);
    if (!event) {
      res.status(404).json({ error: 'Evento não encontrado.' });
      return;
    }
    res.json({ event });
  } catch (err) {
    next(err);
  }
});

eventRouter.patch(
  '/admin/events/:id',
  authenticate,
  requireRole('admin'),
  validate(eventSchema.partial()),
  async (req, res, next) => {
    try {
      res.json({
        event: await eventConfig.updateEvent(req.params.id as string, req.body, req.user!.userId),
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /events/admin/events/:id/duplicate — starting point for the next event
eventRouter.post(
  '/admin/events/:id/duplicate',
  authenticate,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      res.status(201).json({
        event: await eventConfig.duplicateEvent(req.params.id as string, req.user!.userId),
      });
    } catch (err) {
      next(err);
    }
  }
);

eventRouter.delete('/admin/events/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    await eventConfig.deleteEvent(req.params.id as string, req.user!.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ─── Admin: event banner ─────────────────────────────────────────────────────
// The flyer is the art that changes every edition — that is what the admin
// asked to swap without a deploy.

const BANNER_MAX_BYTES = 8 * 1024 * 1024;
const BANNER_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const bannerStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join('/app/uploads/events', String(req.params.id || 'temp'));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    // Fresh filename per upload: the old one stays in browser and WhatsApp
    // cache, so reusing the name would show the previous flyer.
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `banner-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

const bannerUpload = multer({
  storage: bannerStorage,
  limits: { fileSize: BANNER_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!BANNER_MIME.has(file.mimetype)) {
      cb(new Error('Formato inválido. Envie JPG, PNG ou WebP.'));
      return;
    }
    cb(null, true);
  },
});

eventRouter.post(
  '/admin/events/:id/banner',
  authenticate,
  requireRole('admin'),
  (req, res, next) => {
    bannerUpload.single('banner')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'Imagem acima de 8 MB.' });
        return;
      }
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Upload inválido.' });
        return;
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Envie um arquivo no campo "banner".' });
        return;
      }
      const url = `${env.API_URL}/uploads/events/${req.params.id}/${path.basename(file.path)}`;
      const event = await eventConfig.updateEvent(
        req.params.id as string,
        { bannerImageUrl: url },
        req.user!.userId
      );
      res.status(201).json({ event, url });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Admin ───────────────────────────────────────────────────────────────────

// GET /events/admin/reservations
eventRouter.get('/admin/reservations', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const status = req.query.status as eventService.ReservationStatus | undefined;
    res.json(
      await eventService.adminListReservations({
        status: status && ['pending', 'confirmed', 'cancelled'].includes(status) ? status : undefined,
        eventId: (req.query.eventId as string) || undefined,
        search: (req.query.search as string) || undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});

// POST /events/admin/reservations/:id/confirm — payment checked: tickets go valid
eventRouter.post(
  '/admin/reservations/:id/confirm',
  authenticate,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      res.json({
        reservation: await eventService.confirmReservation(req.params.id as string, req.user!.userId),
      });
    } catch (err) {
      next(err);
    }
  }
);

const cancelSchema = z.object({ reason: z.string().max(300).optional() });

// POST /events/admin/reservations/:id/cancel
eventRouter.post(
  '/admin/reservations/:id/cancel',
  authenticate,
  requireRole('admin'),
  validate(cancelSchema),
  async (req, res, next) => {
    try {
      res.json({
        reservation: await eventService.cancelReservation(
          req.params.id as string,
          req.user!.userId,
          req.body.reason
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

const checkInSchema = z.object({ code: z.string().min(4).max(40) });

/**
 * POST /events/admin/check-in — door staff.
 * `seller` is allowed here with `admin`: the person at the door is the same
 * who runs the POS, and nobody should hand out the admin password on the day.
 */
eventRouter.post(
  '/admin/check-in',
  authenticate,
  requireRole('admin', 'seller'),
  validate(checkInSchema),
  async (req, res, next) => {
    try {
      res.json(await eventService.checkInTicket(req.body.code, req.user!.userId));
    } catch (err) {
      next(err);
    }
  }
);

// GET /events/admin/:eventId/stats — how many entered, how many still to
eventRouter.get(
  '/admin/:eventId/stats',
  authenticate,
  requireRole('admin', 'seller'),
  async (req, res, next) => {
    try {
      res.json(await eventService.getEventStats(req.params.eventId as string));
    } catch (err) {
      next(err);
    }
  }
);
