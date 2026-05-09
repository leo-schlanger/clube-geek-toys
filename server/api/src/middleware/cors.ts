import cors from 'cors';
import { env } from '../config/env.js';

const DEV_ORIGINS = env.NODE_ENV !== 'production'
  ? ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:80']
  : [];

const EXTRA_ORIGINS = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

// Derive the registrable domain from FRONTEND_URL so that all subdomains
// (admin.*, adm.*, club.*) are allowed automatically without manual config.
function getSiteDomain(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    const parts = hostname.split('.');
    if (parts.length >= 2) return parts.slice(-2).join('.');
    return hostname;
  } catch {
    return null;
  }
}
const SITE_DOMAIN = getSiteDomain(env.FRONTEND_URL);

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
    // Allow any subdomain of the same site (e.g. admin.geeketoys.com.br)
    if (SITE_DOMAIN) {
      try {
        const { hostname, protocol } = new URL(origin);
        if (protocol === 'https:' && hostname.endsWith(`.${SITE_DOMAIN}`)) {
          return callback(null, true);
        }
      } catch { /* invalid origin — fall through to reject */ }
    }
    return callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Signature', 'X-Request-Id'],
});
