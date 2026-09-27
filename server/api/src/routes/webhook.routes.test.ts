import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Payment webhooks over real HTTP, with the raw body the signature needs.
 *
 * What these pin:
 *  1. Pagar.me without the Basic credentials is refused before the body is read.
 *  2. A processing failure answers **500**, so the provider re-delivers. The
 *     idempotency claim rolls back with the effects; answering 200 would make
 *     the provider forget a payment that was captured and never applied.
 *  3. Stripe verifies the signature when a secret is set, and production
 *     without a secret refuses everything instead of trusting the body.
 */

vi.mock('../config/env.js', async () => {
  const base = (await import('../test-support/env.js')).envModule;
  return { ...base, env: { ...base.env } };
});
vi.mock('../services/log.service.js', () => ({ createErrorLog: vi.fn(async () => {}) }));

const { stripe, pagarme } = vi.hoisted(() => ({
  stripe: { verifyWebhookEvent: vi.fn(), processStripeEvent: vi.fn() },
  pagarme: { processPagarmeEvent: vi.fn(), verifyWebhookAuth: vi.fn(), webhookAuthConfigured: vi.fn(() => true) },
}));
vi.mock('../utils/stripe.js', () => ({ verifyWebhookEvent: stripe.verifyWebhookEvent }));
vi.mock('../services/webhook.service.js', () => ({ processStripeEvent: stripe.processStripeEvent }));
vi.mock('../services/pagarme-webhook.service.js', () => pagarme);

import { webhookRouter } from './webhook.routes.js';
import { routerClient } from '../test-support/http.js';
import { env } from '../config/env.js';

const api = routerClient('/webhook', webhookRouter, { raw: true });
const mutableEnv = env as unknown as Record<string, unknown>;

/** JSON over the wire; the router receives it as a raw Buffer, as in production. */
function post(path: string, body: string, headers: Record<string, string> = {}) {
  return api.post(path, { headers, body: JSON.parse(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete mutableEnv.STRIPE_WEBHOOK_SECRET;
  mutableEnv.NODE_ENV = 'test';
});

describe('Pagar.me', () => {
  const event = { id: 'hook_1', type: 'charge.paid', data: {} };

  it('refuses a call without the Basic credentials', async () => {
    pagarme.verifyWebhookAuth.mockReturnValue(false);
    const res = await post('/pagarme', JSON.stringify(event));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('WEBHOOK_UNAUTHORIZED');
    expect(pagarme.processPagarmeEvent).not.toHaveBeenCalled();
  });

  it('processes an authenticated event', async () => {
    pagarme.verifyWebhookAuth.mockReturnValue(true);
    const res = await post('/pagarme', JSON.stringify(event), { Authorization: 'Basic abc' });
    expect(res.status).toBe(200);
    expect(pagarme.verifyWebhookAuth).toHaveBeenCalledWith('Basic abc');
    expect(pagarme.processPagarmeEvent).toHaveBeenCalledWith(event);
  });

  it('answers 500 on a processing failure so the provider re-delivers', async () => {
    pagarme.verifyWebhookAuth.mockReturnValue(true);
    pagarme.processPagarmeEvent.mockRejectedValue(new Error('db down'));
    expect((await post('/pagarme', JSON.stringify(event))).status).toBe(500);
  });

  it('refuses a malformed event', async () => {
    pagarme.verifyWebhookAuth.mockReturnValue(true);
    expect((await post('/pagarme', JSON.stringify({ type: 'charge.paid' }))).body.code).toBe('WEBHOOK_MALFORMED');
  });

  it('answers a liveness GET without processing anything', async () => {
    const res = await api.get('/pagarme');
    expect(res.body).toMatchObject({ status: 'ok', accepts: 'POST', authenticated: true });
  });

  it('turns PagBank away for good', async () => {
    expect((await post('/pagbank', '{}')).status).toBe(410);
  });
});

describe('Stripe (legacy)', () => {
  const event = { id: 'evt_1', type: 'charge.refunded' };

  it('verifies the signature when a secret is set', async () => {
    mutableEnv.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    expect((await post('/stripe', JSON.stringify(event))).body.code).toBe('WEBHOOK_MISSING_SIGNATURE');

    stripe.verifyWebhookEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });
    expect((await post('/stripe', JSON.stringify(event), { 'Stripe-Signature': 't=1,v1=x' })).status).toBe(401);

    stripe.verifyWebhookEvent.mockReturnValue(event);
    const ok = await post('/stripe', JSON.stringify(event), { 'Stripe-Signature': 't=1,v1=ok' });
    expect(ok.status).toBe(200);
    // The raw bytes reach the verifier, not a parsed object.
    expect(Buffer.isBuffer(stripe.verifyWebhookEvent.mock.calls.at(-1)![0])).toBe(true);
    expect(stripe.processStripeEvent).toHaveBeenCalledWith(event);
  });

  it('refuses everything in production without a secret', async () => {
    mutableEnv.NODE_ENV = 'production';
    const res = await post('/stripe', JSON.stringify(event));
    expect(res.body.code).toBe('WEBHOOK_MISCONFIGURED');
    expect(stripe.processStripeEvent).not.toHaveBeenCalled();
  });

  it('parses the body in development, and asks for a retry when processing fails', async () => {
    stripe.processStripeEvent.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('db'));
    expect((await post('/stripe', JSON.stringify(event))).status).toBe(200);
    expect(stripe.processStripeEvent).toHaveBeenCalledWith(event);
    expect((await post('/stripe', JSON.stringify(event))).status).toBe(500);
  });

});
