import { Router } from 'express';
import { pool } from '../config/database.js';
import { getSchemaState } from '../db/ensure-schema.js';

export const healthRouter = Router();

/**
 * Health check público — consumido pelo docker healthcheck e pelo passo final
 * do `deploy.yml`.
 *
 * `schema` existe porque o `ensureSchema()` roda no boot sem derrubar a API:
 * antes, uma migration quebrada só aparecia numa linha de log do container que
 * ninguém lia (foi assim que o certbot ficou 3 semanas parado). Agora um schema
 * degradado é visível de fora, e o deploy pode falhar em cima disso.
 *
 * A lista de etapas que falharam **não** é exposta aqui — nome de tabela/coluna
 * é informação de dentro. O detalhe fica no log e em `GET /logs/schema` (admin).
 */
healthRouter.get('/', async (_req, res) => {
  const schema = getSchemaState();
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
    });
  } catch {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
    });
  }
});
