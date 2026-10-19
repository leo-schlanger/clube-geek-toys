import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

export const defaultLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em instantes.' },
});

export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde 5 minutos.' },
});

// Separate limiter for public lookup endpoints (CPF check, etc.)
// that should NOT share the auth rate limit pool.
export const publicLookupLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas consultas. Aguarde um momento.' },
});

export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições de pagamento. Tente novamente em instantes.' },
});

export const emailLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições de email. Aguarde 5 minutos.' },
});

// Contract upload: signing retries three times at most, and each request may
// carry 5 MB to the uploads volume.
export const contractUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitos envios de contrato. Aguarde alguns minutos.' },
});

// "CPF já cadastrado?" answers whether a CPF is a member. Registration asks it
// once or twice per attempt; a tight window keeps it from being a lookup service.
// Counted per account (it runs after `authenticate`), so rotating IPs does not
// buy more lookups; per IP only as a fallback.
export const cpfLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.userId ?? ipKeyGenerator(req.ip ?? ''),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas consultas de CPF. Aguarde alguns minutos.' },
});
