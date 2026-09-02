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

  // Pagar.me (API v5) — the payment provider for card, PIX and subscriptions.
  PAGARME_SECRET_KEY: z.string().min(1).optional(),
  PAGARME_PUBLIC_KEY: z.string().min(1).optional(),
  PAGARME_ACCOUNT_ID: z.string().optional(),
  PAGARME_API_URL: z.string().url().default('https://api.pagar.me/core/v5'),
  // Basic-auth credentials configured on the Pagar.me webhook. Both must be set
  // for the endpoint to accept anything in production.
  PAGARME_WEBHOOK_USER: z.string().min(1).optional(),
  PAGARME_WEBHOOK_PASSWORD: z.string().min(1).optional(),
  // What the buyer reads on the card statement. PSP caps it at 13 characters.
  PAGARME_STATEMENT_DESCRIPTOR: z.string().max(13).default('GEEKPOPTOYS'),
  PAGARME_MAX_INSTALLMENTS: z.coerce.number().int().min(1).max(12).default(6),
  /** Minimum value per installment, in reais — below it we offer fewer splits. */
  PAGARME_MIN_INSTALLMENT_AMOUNT: z.coerce.number().positive().default(20),
  /** How long a Pagar.me PIX QR stays payable, in seconds. */
  PAGARME_PIX_EXPIRES_IN: z.coerce.number().int().positive().max(86400).default(3600),

  // Stripe — legacy. Kept only so charges created before the Pagar.me migration
  // can still be refunded and their webhooks acknowledged. No new charge uses it.
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
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

const envSchemaRefined = envSchema
  .refine((e) => e.NODE_ENV !== 'production' || Boolean(e.PAGARME_SECRET_KEY), {
    message: 'PAGARME_SECRET_KEY is required in production',
    path: ['PAGARME_SECRET_KEY'],
  })
  // The webhook is the only thing that marks a PIX paid, so an unauthenticated
  // endpoint in production would let anyone settle an order for free.
  .refine(
    (e) =>
      e.NODE_ENV !== 'production' ||
      Boolean(e.PAGARME_WEBHOOK_USER && e.PAGARME_WEBHOOK_PASSWORD),
    {
      message: 'PAGARME_WEBHOOK_USER and PAGARME_WEBHOOK_PASSWORD are required in production',
      path: ['PAGARME_WEBHOOK_USER'],
    },
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

/**
 * Admin panel URL for a given path — for the links inside staff e-mails.
 *
 * Every notification used to build this inline as
 * `FRONTEND_URL.replace('club.', 'admin.')`, which is brittle in two ways, and
 * both bit us. The reservation notification simply forgot the replace and sent
 * the director to `club.geeketoys.com.br/admin`, where the member SPA's
 * catch-all bounces to `/assinar` — he opened the e-mail about a customer and
 * landed on the subscription page. And the replace silently does nothing if
 * `FRONTEND_URL` ever stops starting with `club.`, which no test would notice.
 *
 * Swapping the first label is robust regardless of the value, and `adm` is the
 * canonical host (`admin.*` answers, but only through a 301).
 */
export function adminUrl(path = '/admin'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  try {
    const url = new URL(env.FRONTEND_URL);
    const labels = url.hostname.split('.');
    if (labels.length > 2) labels[0] = 'adm';
    else labels.unshift('adm');
    url.hostname = labels.join('.');
    return `${url.origin}${suffix}`;
  } catch {
    return `https://adm.geeketoys.com.br${suffix}`;
  }
}
