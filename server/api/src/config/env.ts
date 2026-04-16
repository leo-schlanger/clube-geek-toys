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
  FROM_EMAIL: z.string().default('Clube Geek & Toys <contato@geeketoys.com.br>'),
  ADMIN_EMAIL: z.string().email().default('admin@geeketoys.com.br'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),

  // URLs
  FRONTEND_URL: z.string().url(),
  API_URL: z.string().url(),

  // CORS — comma-separated list of additional allowed origins (optional)
  ALLOWED_ORIGINS: z.string().optional(),
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
