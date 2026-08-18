import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  // Database
  DATABASE_URL: z.string().url(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  HMAC_SECRET: z.string().min(32),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // PIX
  PIX_KEY: z.string().min(1).optional(),
  PIX_MERCHANT_NAME: z.string().optional(),
  PIX_MERCHANT_CITY: z.string().optional(),

  // Email (Resend)
  RESEND_API_KEY: z.string().min(1),
  FROM_EMAIL: z.string().default('Clube GeekPop & Toys <contato@geeketoys.com.br>'),
  ADMIN_EMAIL: z.string().email().default('admin@geeketoys.com.br'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),

  // Cloudflare Turnstile (CAPTCHA)
  TURNSTILE_SECRET_KEY: z.string().optional(),

  // URLs
  FRONTEND_URL: z.string().url(),
  API_URL: z.string().url(),

  // CORS — comma-separated list of additional allowed origins (optional)
  ALLOWED_ORIGINS: z.string().optional(),

  // Without a credential, quotes come from the fallback table — visible in
  // GET /health (shipping.quotes). Their panel hands out CLIENT_ID +
  // CLIENT_SECRET; the API token comes from the OAuth flow. MELHOR_ENVIO_TOKEN
  // remains a manual escape hatch and takes precedence when set.
  MELHOR_ENVIO_CLIENT_ID: z.string().min(1).optional(),
  MELHOR_ENVIO_CLIENT_SECRET: z.string().min(1).optional(),
  MELHOR_ENVIO_SCOPES: z.string().default('shipping-calculate'),
  // Separate from API_URL because that one is baked into stored upload URLs.
  MELHOR_ENVIO_REDIRECT_URI: z.string().url().optional(),
  MELHOR_ENVIO_TOKEN: z.string().min(1).optional(),
  MELHOR_ENVIO_SANDBOX: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  SHIPPING_ORIGIN_CEP: z.string().regex(/^\d{8}$/).default('22011001'),

  // How long a pending order holds stock before the cron hands the units back.
  // It has a default so the correct behaviour ships without touching the VPS
  // .env — an unset variable must not mean "no hold at all".
  STOCK_RESERVATION_TTL_HOURS: z.coerce.number().int().positive().max(720).default(24),
});

const envSchemaRefined = envSchema.refine(
  (e) => e.NODE_ENV !== 'production' || (e.STRIPE_WEBHOOK_SECRET && e.STRIPE_WEBHOOK_SECRET.length > 0),
  { message: 'STRIPE_WEBHOOK_SECRET is required in production', path: ['STRIPE_WEBHOOK_SECRET'] },
);

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // docker-compose expands `${VAR:-}` to an empty string when the variable
  // is unset. Treat empty strings as absent so `.optional()` fields don't
  // fail `.min(1)` checks.
  const cleaned: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) {
    cleaned[k] = v === '' ? undefined : v;
  }
  const result = envSchemaRefined.safeParse(cleaned);
  if (!result.success) {
    console.error('Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();

/**
 * Canonical shop origin, used by the sitemap, link previews and notifications.
 *
 * The two domains are full mirrors, which Google reads as duplicate content
 * unless one is canonical. Everything emitting a public shop URL reads from
 * here rather than from scattered literals. Mirrors CANONICAL_ORIGINS.shop in
 * src/lib/subdomain.ts.
 */
export const SHOP_CANONICAL_URL = 'https://shop.geekpoptoys.com.br';
