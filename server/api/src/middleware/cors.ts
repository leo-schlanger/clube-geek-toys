import cors from 'cors';
import { env } from '../config/env.js';

const DEV_ORIGINS = env.NODE_ENV !== 'production'
  ? ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:80']
  : [];

const EXTRA_ORIGINS = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

// Derive the registrable domain from FRONTEND_URL so that all subdomains
// (admin.*, adm.*, club.*, shop.*) are allowed automatically without manual config.
function getSiteDomain(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    const parts = hostname.split('.');
    // Handle 3-label public suffixes like .com.br → keep the last 3 labels.
    if (parts.length >= 3 && parts[parts.length - 2] === 'com') return parts.slice(-3).join('.');
    if (parts.length >= 2) return parts.slice(-2).join('.');
    return hostname;
  } catch {
    return null;
  }
}

// The club runs on two mirror domains — every subdomain of either is allowed.
const MIRROR_DOMAINS = ['geeketoys.com.br', 'geekpoptoys.com.br'];
const SITE_DOMAINS = Array.from(
  new Set([getSiteDomain(env.FRONTEND_URL), ...MIRROR_DOMAINS].filter(Boolean))
) as string[];

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
    // Allow any subdomain of either mirror site (e.g. admin.geeketoys.com.br,
    // shop.geekpoptoys.com.br) plus each apex.
    if (SITE_DOMAINS.length) {
      try {
        const { hostname, protocol } = new URL(origin);
        const ok = SITE_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
        if (protocol === 'https:' && ok) {
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
