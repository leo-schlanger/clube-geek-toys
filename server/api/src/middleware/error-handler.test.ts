import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

/**
 * Pagar.me failures carry a PT-BR message meant for the buyer. Before this
 * branch they fell through to the generic 500, and a declined document or an
 * acquirer outage reached the checkout as "Erro interno do servidor".
 */

const { createErrorLogMock } = vi.hoisted(() => ({
  createErrorLogMock: vi.fn(async (..._args: unknown[]) => {}),
}));

vi.mock('../config/env.js', () => ({ env: { NODE_ENV: 'test' } }));
vi.mock('../services/log.service.js', () => ({ createErrorLog: createErrorLogMock }));

import { errorHandler, AppError } from './error-handler.js';
import { PagarmeError } from '../utils/pagarme.js';

function run(err: Error) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const req = { path: '/events/x/reservations', method: 'POST', headers: {}, ip: '1.1.1.1' };
  errorHandler(err, req as unknown as Request, res as unknown as Response, () => {});
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('errorHandler — Pagar.me', () => {
  it('422 da operadora vira 400 com a mensagem para o comprador', () => {
    const res = run(
      new PagarmeError(422, 'Pagar.me POST /orders: invalid', 'Dados de pagamento inválidos (CPF/CNPJ): inválido')
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: 'Dados de pagamento inválidos (CPF/CNPJ): inválido',
      code: 'PAYMENT_PROVIDER_ERROR',
    });
  });

  it('operadora fora do ar vira 502, não 500', () => {
    const res = run(new PagarmeError(504, 'timed out', 'Não conseguimos falar com o processador.'));
    expect(res.statusCode).toBe(502);
    expect((res.body as { error: string }).error).toBe('Não conseguimos falar com o processador.');
  });

  it('chave recusada vira 503, sem dizer que é a chave', () => {
    const res = run(new PagarmeError(401, 'unauthorized', 'Pagamento indisponível no momento.'));
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('unauthorized');
  });

  it('registra a falha no log de erros', () => {
    run(new PagarmeError(500, 'boom', 'instável'));
    expect(createErrorLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom', context: expect.objectContaining({ providerStatus: 500 }) })
    );
  });

  it('AppError continua como antes', () => {
    const res = run(new AppError(409, 'Reserva encerrada.', 'EVENT_CLOSED'));
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Reserva encerrada.', code: 'EVENT_CLOSED' });
  });

  it('um Error qualquer continua sendo 500 genérico', () => {
    const res = run(new Error('segredo interno'));
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('segredo');
  });
});
