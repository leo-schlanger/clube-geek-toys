import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import crypto from 'crypto';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { memberRouter } from './routes/member.routes.js';
import { userRouter } from './routes/user.routes.js';
import { paymentRouter } from './routes/payment.routes.js';
import { subscriptionRouter } from './routes/subscription.routes.js';
import { webhookRouter } from './routes/webhook.routes.js';
import { emailRouter } from './routes/email.routes.js';
import { contractRouter } from './routes/contract.routes.js';
import { reportRouter } from './routes/report.routes.js';
import { logRouter } from './routes/log.routes.js';
import { lgpdRouter } from './routes/lgpd.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { auditRouter } from './routes/audit.routes.js';
import { productRouter } from './routes/product.routes.js';
import { promoRouter } from './routes/promo.routes.js';
import { orderRouter } from './routes/order.routes.js';
import { shippingRouter } from './routes/shipping.routes.js';
import { reviewRouter } from './routes/review.routes.js';
import { wholesaleRouter } from './routes/wholesale.routes.js';
import { stockRouter } from './routes/stock.routes.js';
import { questionRouter } from './routes/question.routes.js';
import { notificationRouter } from './routes/notification.routes.js';
import { galleryRouter } from './routes/gallery.routes.js';
import { profileRouter } from './routes/profile.routes.js';
import { eventRouter } from './routes/event.routes.js';
import { initCronJobs } from './services/cron.service.js';
import { ensureSchema } from './db/ensure-schema.js';
import { logger, moduleLogger } from './config/logger.js';
import { alertOpsAsync } from './services/ops-alert.service.js';

const log = moduleLogger('app');

const app = express();

// Trust nginx proxy (correct IP for rate limiting and audit logs)
app.set('trust proxy', 1);

// Request id + access log, in one place.
//
// The id was generated here and then used nowhere — not in the access log, not
// in `error_logs`, not in the response — so tying "POST /pay-card 402" to the
// error behind it meant matching timestamps by eye. It now rides on every line
// logged through `req.log`, goes back as `X-Request-Id` (the browser can show
// it to the customer, support pastes it into `journalctl`), and into the
// context of every `error_logs` row. nginx sends its own `$request_id`.
app.use(
  pinoHttp({
    logger: logger.child({ module: 'http' }),
    genReqId: (req, res) => {
      const incoming = req.headers['x-request-id'];
      const id =
        typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    // A client's mistake is not an incident: only 5xx reads as `error`.
    customLogLevel: (_req, res, err) =>
      err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    // The health probe runs every few minutes from two monitors; logging it
    // buries everything else.
    autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/health/' },
    // Path only: the query string carries search terms and guest-order ids.
    serializers: {
      req: (req: { id: unknown; method: string; url: string; remoteAddress?: string; headers: Record<string, string | undefined> }) => ({
        id: req.id,
        method: req.method,
        path: String(req.url).split('?')[0],
        ip: req.headers['x-real-ip'] ?? req.remoteAddress,
        ua: req.headers['user-agent']?.slice(0, 160),
      }),
      res: (res: { statusCode: number }) => ({ status: res.statusCode }),
    },
  }),
);

// API version header
app.use((_req, res, next) => {
  res.setHeader('X-API-Version', '1');
  next();
});

// Global middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://js.stripe.com", "https://accounts.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      // `api.pagar.me` is where the browser exchanges the card for a token —
      // without it the CSP blocks the call and card payment fails with nothing
      // in the UI to explain why. Stripe stays for charges made before the
      // 2026-09-01 migration.
      connectSrc: [
        "'self'",
        'https://api.pagar.me',
        'https://api.stripe.com',
        'https://accounts.google.com',
      ],
      fontSrc: ["'self'"],
      frameSrc: ["https://js.stripe.com", "https://accounts.google.com"],
    },
  },
}));
app.use(compression());
app.use(corsMiddleware);

// Body parsing — webhook needs raw body for HMAC verification
app.use('/webhook', express.raw({ type: 'application/json', limit: '100kb' }));
// Only contracts (signature image) and the PDF-by-e-mail route carry big JSON;
// everything else is small, and a 15 MB ceiling on every route was free memory
// for anyone to fill.
app.use(['/contracts', '/email'], express.json({ limit: '15mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/members', memberRouter);
app.use('/users', userRouter);
app.use('/pix', paymentRouter);
app.use('/checkout', paymentRouter);
app.use('/payment', paymentRouter);
app.use('/payments', paymentRouter);
app.use('/subscription', subscriptionRouter);
app.use('/webhook', webhookRouter);
app.use('/email', emailRouter);
app.use('/contracts', contractRouter);
app.use('/reports', reportRouter);
app.use('/logs', logRouter);
app.use('/lgpd', lgpdRouter);
app.use('/settings', settingsRouter);
app.use('/audit', auditRouter);
app.use('/products', productRouter);
app.use('/promo', promoRouter);
app.use('/orders', orderRouter);
app.use('/shipping', shippingRouter);
app.use('/reviews', reviewRouter);
app.use('/wholesale', wholesaleRouter);
app.use('/stock', stockRouter);
app.use('/questions', questionRouter);
app.use('/notifications', notificationRouter);
app.use('/gallery', galleryRouter);
app.use('/profile', profileRouter);
app.use('/events', eventRouter);
app.use('/cron', reportRouter); // cron endpoints share admin auth pattern

// Error handler
app.use(errorHandler);

// Start server
app.listen(env.PORT, () => {
  log.info(`Server running on port ${env.PORT} (${env.NODE_ENV})`);
  // Idempotent schema sync — keeps DB schema aligned with deployed code without manual SSH.
  // Failures here are logged but non-fatal so the API still serves traffic.
  ensureSchema()
    .then((state) => {
      if (state.status !== 'degraded') return;
      alertOpsAsync({
        kind: 'schema_degraded',
        subject: `Schema do banco degradado (${state.failed.length} etapa(s) falharam)`,
        body:
          `O ensureSchema terminou com etapas falhando — telas que dependem dessas colunas ` +
          `podem quebrar.\n\n` +
          state.failed.map((f) => `- ${f.step}: ${f.error}`).join('\n') +
          `\n\nOnde olhar: GET /health → schema; painel admin → Logs → Schema.`,
        cooldownMin: 30,
      });
    })
    .catch((err) => log.error({ err }, 'ensureSchema unhandled rejection'));
  initCronJobs();
});

export default app;
