import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
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
import { initCronJobs } from './services/cron.service.js';

const app = express();

// Global middleware
app.use(helmet({ contentSecurityPolicy: false }));
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
app.use('/subscription', subscriptionRouter);
app.use('/webhook', webhookRouter);
app.use('/email', emailRouter);
app.use('/points', pointsRouter);
app.use('/contracts', contractRouter);
app.use('/reports', reportRouter);
app.use('/logs', logRouter);
app.use('/cron', reportRouter); // cron endpoints share admin auth pattern

// Error handler
app.use(errorHandler);

// Start server
app.listen(env.PORT, () => {
  console.log(`[API] Server running on port ${env.PORT} (${env.NODE_ENV})`);
  initCronJobs();
});

export default app;
