import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { publicLookupLimiter } from '../middleware/rate-limit.js';
import { MAX_TICKETS_PER_RESERVATION } from '../config/events.js';
import * as eventService from '../services/event.service.js';

export const eventRouter = Router();

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
