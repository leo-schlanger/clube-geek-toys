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
const { record5xxMock } = vi.hoisted(() => ({ record5xxMock: vi.fn() }));
vi.mock('../services/ops-alert.service.js', () => ({ record5xx: record5xxMock }));

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

/**
 * The request id ties what the customer reads on screen to the exact log line
 * and `error_logs` row. It was generated and thrown away before 02/10/2026.
 */
describe('errorHandler — request id e severidade', () => {
  function runWith(err: Error, id: string) {
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
    const req = { id, path: '/orders', method: 'POST', headers: {}, ip: '1.1.1.1' };
    errorHandler(err, req as unknown as Request, res as unknown as Response, () => {});
    return res;
  }

  it('500 devolve o requestId e grava junto no error_logs', () => {
    const res = runWith(new Error('boom'), 'req-123456');
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL_ERROR', requestId: 'req-123456' });
    expect(createErrorLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ requestId: 'req-123456' }) })
    );
  });

  it('recusa da operadora (412) entra como aviso, não como erro', () => {
    runWith(new PagarmeError(412, 'card refused', 'Não foi possível validar o cartão.'), 'req-abcdefgh');
    expect(createErrorLogMock).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warning' }));
  });

  it('operadora fora do ar continua erro', () => {
    runWith(new PagarmeError(503, 'down', 'Instável.'), 'req-abcdefgh');
    expect(createErrorLogMock).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });
});

describe('errorHandler — rajada de 500', () => {
  it('conta o 500 para o alerta de rajada', () => {
    run(new Error('boom'));
    expect(record5xxMock).toHaveBeenCalledWith('/events/x/reservations');
  });

  it('não conta erro do cliente (4xx)', () => {
    run(new AppError(404, 'Pedido não encontrado.'));
    expect(record5xxMock).not.toHaveBeenCalled();
  });
});
