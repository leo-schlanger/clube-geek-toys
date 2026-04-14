import cors from 'cors';
import { env } from '../config/env.js';

const DEV_ORIGINS = env.NODE_ENV !== 'production'
  ? ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:80']
  : [];

const EXTRA_ORIGINS = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

const ALLOWED_ORIGINS = [
  env.FRONTEND_URL,
  ...DEV_ORIGINS,
  ...EXTRA_ORIGINS,
];

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, webhooks)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Signature', 'X-Request-Id'],
});
