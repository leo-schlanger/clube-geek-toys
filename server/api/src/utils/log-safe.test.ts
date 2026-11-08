import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pino } from 'pino';
import { loggerOptions } from '../config/logger.js';
import { providerBodyForLog, providerOrderForLog, redactLogPath, scrubForLog } from './log-safe.js';

const CPF = '52998224725';
const EMAIL = 'maria.silva@example.com';

const ORDER = {
  id: 'or_08qV4bkFPWt2o25Z',
  code: 'R-3YNM-4AEH',
  status: 'failed',
  amount: 7500,
  customer: {
    id: 'cus_PvZzBJ4I0WIlQzAQ',
    name: CPF,
    email: EMAIL,
    code: 'reservation-b5d268bc',
    document: CPF,
    phones: { mobile_phone: { country_code: '55', area_code: '21', number: '999998888' } },
    address: { line_1: '181, Rua Exemplo', zip_code: '22011001', city: 'Rio de Janeiro' },
  },
  charges: [
    {
      id: 'ch_abc123',
      status: 'failed',
      last_transaction: {
        status: 'failed',
        acquirer_message: 'Timeout no adquirente',
        gateway_response: { code: '500', errors: [{ message: 'pix unavailable' }] },
        card: { brand: 'Visa', last_four_digits: '1234', holder_name: 'MARIA SILVA' },
      },
    },
  ],
  metadata: { reservationId: 'b5d268bc-56a9-4582-b77e-fd42b852556c', kind: 'event_reservation' },
};

function logged(fields: Record<string, unknown>, msg: string): string {
  const lines: string[] = [];
  const log = pino({ ...loggerOptions, level: 'info' }, { write: (line: string) => lines.push(line) });
  log.error(fields, msg);
  return lines.join('');
}

describe('redactLogPath', () => {
  it.each([
    [`/members/cpf-exists/${CPF}`, '/members/cpf-exists/:cpf'],
    ['/members/cpf-exists/529.982.247-25', '/members/cpf-exists/:cpf'],
    [`/members/by-cpf/${CPF}`, '/members/by-cpf/:cpf'],
  ])('%s', (path, expected) => {
    expect(redactLogPath(path)).toBe(expected);
  });

  it.each(['/members/me', '/members/44f97bdc-d77c-4d1d-ae5c-a77a21394817', '/orders/abc/pay-card', '/'])(
    'leaves %s alone',
    (path) => {
      expect(redactLogPath(path)).toBe(path);
    },
  );
});

describe('provider order in a log line', () => {
  const line = logged({ reservationId: 'res-1', ...providerOrderForLog(ORDER) }, 'Pagar.me order without qr_code');

  it('has no CPF, e-mail, phone, street or holder name', () => {
    for (const secret of [CPF, EMAIL, '999998888', 'Rua Exemplo', '22011001', 'MARIA SILVA']) {
      expect(line).not.toContain(secret);
    }
  });

  it('keeps every id and the failure reason', () => {
    for (const kept of [
      'res-1',
      'or_08qV4bkFPWt2o25Z',
      'R-3YNM-4AEH',
      'cus_PvZzBJ4I0WIlQzAQ',
      'ch_abc123',
      'b5d268bc-56a9-4582-b77e-fd42b852556c',
      'Timeout no adquirente',
      'pix unavailable',
      'Pagar.me order without qr_code',
    ]) {
      expect(line).toContain(kept);
    }
  });

  it('leaves room for the charge after the customer is gone', () => {
    expect(providerOrderForLog(ORDER).detail).toContain('ch_abc123');
  });
});

describe('providerBodyForLog', () => {
  it('keeps the message and field errors of a refusal, without the echoed request', () => {
    const body = providerBodyForLog({
      message: 'The request is invalid.',
      errors: { 'customer.document': ['The document number is not valid'] },
      request: { customer: { name: 'Maria', email: EMAIL, document: CPF } },
    });
    expect(body).toContain('The request is invalid.');
    expect(body).toContain('The document number is not valid');
    expect(body).not.toContain(EMAIL);
    expect(body).not.toContain(CPF);
  });

  it('scrubs a document or e-mail inside free text', () => {
    expect(scrubForLog(`falha para ${EMAIL}, documento ${CPF} / 529.982.247-25`)).toBe(
      'falha para [email], documento [doc] / [doc]',
    );
  });

  it('does not touch long provider ids or PIX codes', () => {
    const emv = '00020126580014br.gov.bcb.pix0136574a10c6';
    expect(scrubForLog(emv)).toBe(emv);
    expect(scrubForLog('ch_12345678901')).toBe('ch_12345678901');
  });
});

describe('nginx access log', () => {
  it('rewrites the CPF routes before the catch-all path regex', () => {
    const conf = readFileSync(join(process.cwd(), 'server/nginx/nginx.conf'), 'utf8');
    const cpf = conf.indexOf('(?:cpf-exists|by-cpf)');
    const catchAll = conf.indexOf('"~^(?<p>[^?]*)"');
    expect(cpf).toBeGreaterThan(-1);
    expect(cpf).toBeLessThan(catchAll);
  });
});
