import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { publicLookupLimiter } from '../middleware/rate-limit.js';
import * as questionService from '../services/question.service.js';

export const questionRouter = Router();

// ─── Public ──────────────────────────────────────────────────────────────────

// GET /questions/product/:slugOrId — published questions for a product
questionRouter.get('/product/:slugOrId', publicLookupLimiter, async (req, res, next) => {
  try {
    res.json(
      await questionService.listProductQuestions(req.params.slugOrId as string, {
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});

// ─── Cliente logado ──────────────────────────────────────────────────────────

const askSchema = z.object({
  productId: z.string().min(1),
  body: z.string().min(5).max(1000),
});

// POST /questions — login required, which is what puts a name on the question
questionRouter.post('/', authenticate, validate(askSchema), async (req, res, next) => {
  try {
    res
      .status(201)
      .json(await questionService.askQuestion(req.user!.userId, req.body.productId, req.body.body));
  } catch (err) {
    next(err);
  }
});

// GET /questions/me
questionRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    res.json({ questions: await questionService.listUserQuestions(req.user!.userId) });
  } catch (err) {
    next(err);
  }
});

// ─── Admin ───────────────────────────────────────────────────────────────────

// GET /questions/admin — moderation queue, unanswered first
questionRouter.get('/admin', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const answered =
      req.query.answered === 'true' ? true : req.query.answered === 'false' ? false : undefined;
    const [result, pending] = await Promise.all([
      questionService.adminListQuestions({
        answered,
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      }),
      questionService.countPendingQuestions(),
    ]);
    res.json({ ...result, pending });
  } catch (err) {
    next(err);
  }
});

const answerSchema = z.object({
  answer: z.string().min(1).max(2000),
});

// POST /questions/:id/answer — responde e notifica quem perguntou
questionRouter.post(
  '/:id/answer',
  authenticate,
  requireRole('admin'),
  validate(answerSchema),
  async (req, res, next) => {
    try {
      res.json(
        await questionService.answerQuestion(
          req.params.id as string,
          req.body.answer,
          req.user!.userId
        )
      );
    } catch (err) {
      next(err);
    }
  }
);

const statusSchema = z.object({
  status: z.enum(['published', 'hidden']),
});

// PATCH /questions/:id/status — hide spam; questions are public once asked
questionRouter.patch(
  '/:id/status',
  authenticate,
  requireRole('admin'),
  validate(statusSchema),
  async (req, res, next) => {
    try {
      res.json(
        await questionService.setQuestionStatus(
          req.params.id as string,
          req.body.status,
          req.user!.userId
        )
      );
    } catch (err) {
      next(err);
    }
  }
);
