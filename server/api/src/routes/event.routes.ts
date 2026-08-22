import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { publicLookupLimiter } from '../middleware/rate-limit.js';
import { MAX_TICKETS_PER_RESERVATION } from '../config/events.js';
import { env } from '../config/env.js';
import * as eventService from '../services/event.service.js';
import * as eventConfig from '../services/event-config.service.js';

export const eventRouter = Router();

// ─── Público: o evento em cartaz ─────────────────────────────────────────────
// Declarado antes de qualquer rota com parâmetro para "active" não virar id.
// Consumido pela loja E pelo site institucional — é o que substituiu os três
// arquivos hardcoded.

eventRouter.get('/active', async (_req, res, next) => {
  try {
    const event = await eventConfig.getActiveEventOrFallback();
    // Curto de propósito: a admin publica e quer ver no ar, mas o banner é
    // pedido em toda página da loja.
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ event });
  } catch (err) {
    next(err);
  }
});

// ─── Público ─────────────────────────────────────────────────────────────────

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

// POST /events/:eventId/reservations — reserva da loja, um ingresso por pessoa
eventRouter.post(
  '/:eventId/reservations',
  publicLookupLimiter,
  validate(reservationSchema),
  async (req, res, next) => {
    try {
      const reservation = await eventService.createReservation(req.params.eventId as string, req.body);
      res.status(201).json({
        reservation,
        ticketsUrl: eventService.reservationUrl(reservation.code),
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /events/tickets/:code — o ingresso em si (sem login: o QR circula)
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

// GET /events/reservations/:code — todos os ingressos da compra
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

// ─── Admin: cadastro de eventos ──────────────────────────────────────────────
// Vem antes de `/admin/:eventId/stats`: ambas têm três segmentos, e deixar a
// específica primeiro evita depender da ordem de match do Express.

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
  // `null` = evento gratuito / a combinar. Zero também é válido.
  priceCents: z.number().int().min(0).max(10_000_00).optional().nullable(),
  currencyLabel: z.string().max(8).optional(),
  maxPerReservation: z.number().int().min(1).max(500).optional().nullable(),
  whatsappNumber: z.string().max(20).optional(),
  reservationNotes: z.string().max(1000).optional().nullable(),
});

// GET /events/admin/events — inclui rascunho e arquivado
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

// POST /events/admin/events/:id/duplicate — base para o próximo evento
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

// ─── Admin: banner do evento ─────────────────────────────────────────────────
// O flyer é a arte que muda a cada edição — é justamente o que a Laura pediu
// para poder trocar sozinha.

const BANNER_MAX_BYTES = 8 * 1024 * 1024;
const BANNER_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const bannerStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join('/app/uploads/events', String(req.params.id || 'temp'));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    // Nome novo a cada upload: o antigo fica no cache do navegador e do
    // WhatsApp, e reaproveitar o nome mostraria o flyer velho.
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

// POST /events/admin/reservations/:id/confirm — pagamento conferido: libera os ingressos
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
 * POST /events/admin/check-in — portaria.
 * `seller` entra aqui junto com `admin`: quem fica na porta é a mesma pessoa
 * que opera o PDV, e ninguém vai passar a senha de admin adiante no dia.
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

// GET /events/admin/:eventId/stats — quantos entraram, quantos faltam
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
