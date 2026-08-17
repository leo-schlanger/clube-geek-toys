import { Router } from 'express';
import { pool } from '../config/database.js';
import { getSchemaState } from '../db/ensure-schema.js';
import { getMelhorEnvioHealth } from '../services/shipping.service.js';

export const healthRouter = Router();

/**
 * Public health check, consumed by the docker healthcheck and by the final
 * step of `deploy.yml`.
 *
 * `schema` is here because `ensureSchema()` runs at boot without taking the
 * API down: a broken migration used to surface only in a container log line
 * nobody read. `shipping` is here for the same reason — a rejected credential
 * drops quotes to the internal table and the customer still sees a plausible,
 * wrong price.
 *
 * Neither exposes detail: failed step names and upstream response bodies are
 * internal, and stay in the logs and in `GET /logs/schema` (admin).
 */
healthRouter.get('/', async (_req, res) => {
  const schema = getSchemaState();
  const shipping = getMelhorEnvioHealth();
  try {
    await pool.query('SELECT 1');
    res.json({
      status: schema.status === 'degraded' ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      schema: {
        status: schema.status,
        ranAt: schema.ranAt,
        failedSteps: schema.failed.length,
        totalSteps: schema.total,
      },
      shipping: {
        // 'live' requires an observed success, not merely a credential:
        // claiming live before any quote is the same misleading signal this
        // block exists to prevent. 'untested' is the honest middle state.
        quotes: !shipping.configured
          ? 'unconfigured'
          : shipping.lastFailure
            ? 'fallback'
            : shipping.lastSuccessAt
              ? 'live'
              : 'untested',
        sandbox: shipping.sandbox,
        credentialRejected: shipping.lastFailure?.kind === 'auth',
        lastSuccessAt: shipping.lastSuccessAt,
      },
    });
  } catch {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
    });
  }
});
