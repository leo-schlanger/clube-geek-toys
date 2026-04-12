import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import crypto from 'crypto';
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
import { pointsRouter } from './routes/points.routes.js';
import { contractRouter } from './routes/contract.routes.js';
import { reportRouter } from './routes/report.routes.js';
import { logRouter } from './routes/log.routes.js';
import { lgpdRouter } from './routes/lgpd.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { auditRouter } from './routes/audit.routes.js';
import { initCronJobs } from './services/cron.service.js';
import { ensureSchema } from './db/ensure-schema.js';

const app = express();

// Trust nginx proxy (correct IP for rate limiting and audit logs)
app.set('trust proxy', 1);

// Request ID for tracing
app.use((req, _res, next) => {
  (req as unknown as Record<string, unknown>).id = req.headers['x-request-id'] || crypto.randomUUID();
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
      connectSrc: ["'self'", "https://api.stripe.com", "https://accounts.google.com"],
      fontSrc: ["'self'"],
      frameSrc: ["https://js.stripe.com", "https://accounts.google.com"],
    },
  },
}));
app.use(compression());
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(corsMiddleware);

// Body parsing — webhook needs raw body for HMAC verification
app.use('/webhook', express.raw({ type: 'application/json', limit: '100kb' }));
app.use(express.json({ limit: '15mb' }));
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
app.use('/points', pointsRouter);
app.use('/contracts', contractRouter);
app.use('/reports', reportRouter);
app.use('/logs', logRouter);
app.use('/lgpd', lgpdRouter);
app.use('/settings', settingsRouter);
app.use('/audit', auditRouter);
app.use('/cron', reportRouter); // cron endpoints share admin auth pattern

// Error handler
app.use(errorHandler);

// Start server
app.listen(env.PORT, () => {
  console.log(`[API] Server running on port ${env.PORT} (${env.NODE_ENV})`);
  // Idempotent schema sync — keeps DB schema aligned with deployed code without manual SSH.
  // Failures here are logged but non-fatal so the API still serves traffic.
  ensureSchema().catch((err) => console.error('[SCHEMA] ensureSchema unhandled rejection:', err));
  initCronJobs();
});

export default app;
