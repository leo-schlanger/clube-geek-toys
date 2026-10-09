import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';
import { resolveLogLevel, maskEmail, loggerOptions } from './logger.js';

/**
 * Compose expands an unset `${LOG_LEVEL:-}` to "", and pino throws on a level
 * it does not know — the API crash-looped at boot on 02/10/2026. The logger
 * must start whatever the variable holds.
 */
describe('resolveLogLevel', () => {
  it.each([
    [undefined, 'info'],
    ['', 'info'],
    ['   ', 'info'],
    ['loud', 'info'],
    ['DEBUG', 'debug'],
    ['warn', 'warn'],
  ])('%j → %s', (raw, expected) => {
    expect(resolveLogLevel(raw as string | undefined, false)).toBe(expected);
  });

  it('em teste fica mudo, salvo pedido explícito', () => {
    expect(resolveLogLevel('', true)).toBe('silent');
    expect(resolveLogLevel('debug', true)).toBe('debug');
  });
});

describe('maskEmail', () => {
  it('esconde o usuário e mantém o domínio', () => {
    expect(maskEmail('lucas.lima@gmail.com')).toBe('lu***@gmail.com');
    expect(maskEmail(null)).toBeNull();
  });
});

/**
 * The real options, written to a buffer. journald keeps every line, so what
 * must never be in it is checked here: a pino upgrade replaced the redaction
 * library once, and nothing else would notice a password reaching the log.
 */
describe('log line', () => {
  function capture(write: (log: pino.Logger) => void) {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, done) {
        lines.push(String(chunk));
        done();
      },
    });
    write(pino({ level: 'info', ...loggerOptions }, sink));
    return lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  }

  it('is JSON with the level by name, an ISO time and the service', () => {
    const [line] = capture((log) => log.child({ module: 'cron' }).warn('ok'));
    expect(line).toMatchObject({ level: 'warn', service: 'api', module: 'cron', msg: 'ok' });
    expect(String(line.time)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('never carries credentials, card data or documents', () => {
    const secrets = {
      password: 'S3nha!', newPassword: 'N0va!', card_token: 'tok_1', cardToken: 'tok_2', cvv: '123',
      document: '12345678909', cpf: '12345678909', customerDocument: '12345678909', secret: 'sk_live', token: 'jwt',
    };
    const [line] = capture((log) =>
      log.info({
        body: secrets,
        req: { headers: { authorization: 'Bearer abc', cookie: 'cgt_refresh=r' } },
        res: { headers: { 'set-cookie': 'cgt_refresh=r' } },
      }, 'login')
    );
    const text = JSON.stringify(line);
    for (const value of [...Object.values(secrets), 'Bearer abc', 'cgt_refresh=r']) {
      expect(text).not.toContain(value);
    }
    expect((line.body as Record<string, string>).cpf).toBe('[redacted]');
    expect((line.req as { headers: Record<string, string> }).headers.authorization).toBe('[redacted]');
  });
});
