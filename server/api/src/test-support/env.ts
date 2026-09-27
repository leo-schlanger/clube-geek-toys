/**
 * `config/env.js` stand-in for route tests.
 *
 * The real module parses the environment with Zod on import and calls
 * `process.exit(1)` without it — vitest then reports "no tests", not a failure.
 * No imports here on purpose: `vi.mock` factories load this file, and anything
 * it imported could pull the real env back in.
 */
export const TEST_JWT_SECRET = 'route-tests-secret-with-more-than-32-chars';

export const envModule = {
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: TEST_JWT_SECRET,
    JWT_REFRESH_SECRET: 'route-tests-refresh-secret-more-than-32-chars',
    HMAC_SECRET: 'route-tests-hmac-secret-with-more-than-32-chars',
    FRONTEND_URL: 'https://club.geeketoys.com.br',
    API_URL: 'https://api.geeketoys.com.br',
    ADMIN_EMAIL: 'admin@geeketoys.com.br',
    PIX_KEY: 'pix@example.com',
    PIX_MERCHANT_NAME: 'GEEKPOP E TOYS',
    PIX_MERCHANT_CITY: 'RIO DE JANEIRO',
  },
  SHOP_CANONICAL_URL: 'https://shop.geekpoptoys.com.br',
  adminUrl: (path = '/admin') => `https://adm.geeketoys.com.br${path}`,
};

/** Rate limiters are per-IP and would make a test file fail by its own volume. */
const pass = (_req: unknown, _res: unknown, next: () => void) => next();
export const rateLimitModule = {
  defaultLimiter: pass,
  authLimiter: pass,
  publicLookupLimiter: pass,
  paymentLimiter: pass,
  emailLimiter: pass,
};
