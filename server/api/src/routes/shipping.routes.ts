import { Router } from 'express';
import { z } from 'zod';
import { publicLookupLimiter } from '../middleware/rate-limit.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as shippingService from '../services/shipping.service.js';
import * as oauth from '../services/melhor-envio-oauth.service.js';

export const shippingRouter = Router();

const quoteSchema = z.object({
  cep: z.string().min(8).max(9),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive().max(99),
      })
    )
    .min(1)
    .max(50),
});

// GET /shipping/cep/:cep — ViaCEP proxy
shippingRouter.get('/cep/:cep', publicLookupLimiter, async (req, res, next) => {
  try {
    const result = await shippingService.lookupCep(req.params.cep as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /shipping/quote — Melhor Envio (or fallback table)
shippingRouter.post('/quote', publicLookupLimiter, validate(quoteSchema), async (req, res, next) => {
  try {
    const result = await shippingService.quoteShipping(req.body.cep, req.body.items);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── Melhor Envio: OAuth ─────────────────────────────────────────────────────
//
// Their panel gives a Client ID + Secret; the API token comes from this flow.
// The redirect URL registered there must match exactly what
// `GET /melhor-envio/status` reports as `redirectUri`.

// GET /shipping/melhor-envio/status — authorization state (admin)
shippingRouter.get(
  '/melhor-envio/status',
  authenticate,
  requireRole('admin'),
  async (_req, res, next) => {
    try {
      res.json(await oauth.getOAuthStatus());
    } catch (err) {
      next(err);
    }
  }
);

// GET /shipping/melhor-envio/authorize — starts the flow (admin)
shippingRouter.get(
  '/melhor-envio/authorize',
  authenticate,
  requireRole('admin'),
  (req, res, next) => {
    try {
      const url = oauth.buildAuthorizeUrl();
      // ?redirect=1 sends the browser straight there; otherwise the URL is
      // returned so the panel can open a tab, since a 302 would drop the
      // Authorization header the panel's own call carries.
      if (req.query.redirect === '1') {
        res.redirect(url);
        return;
      }
      res.json({ url });
    } catch (err) {
      next(err);
    }
  }
);

// GET /shipping/melhor-envio/callback — where Melhor Envio sends the browser.
//
// Public by design: the caller is the authorizing person's browser, carrying
// none of our auth. The signed `state` is what authenticates the request.
shippingRouter.get('/melhor-envio/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query as Record<string, string | undefined>;

    if (error) {
      res.status(400).send(oauthPage('Autorização negada', `O Melhor Envio recusou: ${escapeHtml(error)}`));
      return;
    }
    if (!oauth.isValidState(state)) {
      res.status(400).send(oauthPage('Link inválido ou expirado', 'Recomece a autorização pelo painel.'));
      return;
    }
    if (!code) {
      res.status(400).send(oauthPage('Faltou o código', 'O Melhor Envio não devolveu o parâmetro `code`.'));
      return;
    }

    await oauth.exchangeCodeForToken(code);
    res.send(
      oauthPage(
        'Melhor Envio conectado',
        'O token foi salvo. Pode fechar esta aba — a loja já passa a cotar frete real.'
      )
    );
  } catch (err) {
    next(err);
  }
});

// DELETE /shipping/melhor-envio/token — revoke locally (admin)
shippingRouter.delete(
  '/melhor-envio/token',
  authenticate,
  requireRole('admin'),
  async (_req, res, next) => {
    try {
      await oauth.clearToken();
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}

/** Minimal page: the callback opens in a browser, not in code. */
function oauthPage(title: string, message: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui,sans-serif;background:#0f0f14;color:#f5f5f7;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="max-width:34rem;padding:2rem;text-align:center">
<h1 style="color:#F04080;font-size:1.5rem;margin:0 0 .75rem">${escapeHtml(title)}</h1>
<p style="color:#a1a1aa;line-height:1.6;margin:0">${escapeHtml(message)}</p>
</div></body></html>`;
}
