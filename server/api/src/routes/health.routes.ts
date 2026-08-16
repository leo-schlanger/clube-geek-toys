import { Router } from 'express';
import { pool } from '../config/database.js';
import { getSchemaState } from '../db/ensure-schema.js';
import { getMelhorEnvioHealth } from '../services/shipping.service.js';

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
 *
 * `shipping` segue a mesma regra: diz **se** a cotação real está de pé, sem o
 * corpo da resposta do Melhor Envio. Está aqui porque a falha dessa integração
 * é invisível por natureza — credencial recusada faz o frete cair na tabela
 * interna e o cliente vê um preço plausível, errado, sem nenhum sinal.
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
        // 'live' exige um sucesso observado, não só credencial presente:
        // anunciar "live" sem nunca ter cotado é o mesmo tipo de sinal
        // enganoso que este bloco existe para evitar. 'untested' é o estado
        // honesto entre configurar e a primeira cotação.
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
