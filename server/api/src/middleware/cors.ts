import cors from 'cors';
import { env } from '../config/env.js';

const DEV_ORIGINS = env.NODE_ENV !== 'production'
  ? ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:80']
  : [];

const EXTRA_ORIGINS = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

// Pages that call the API, on both mirror domains: the SPAs (club, adm, shop)
// and the institutional site on Vercel (apex and www of both domains). Exact origins only: the API
// answers with credentials, so a wildcard would trust hosts that serve no app.
export const SITE_ORIGINS = [
  ...['club', 'adm', 'shop'].flatMap((sub) =>
    ['geeketoys.com.br', 'geekpoptoys.com.br'].map((d) => `https://${sub}.${d}`)
  ),
  'https://geekpoptoys.com.br',
  'https://www.geekpoptoys.com.br',
  'https://www.geeketoys.com.br',
  'https://geeketoys.com.br',
];

export const ALLOWED_ORIGINS = Array.from(
  new Set([env.FRONTEND_URL, ...SITE_ORIGINS, ...DEV_ORIGINS, ...EXTRA_ORIGINS])
);

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
