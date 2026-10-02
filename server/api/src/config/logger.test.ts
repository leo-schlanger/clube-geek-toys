import { describe, it, expect } from 'vitest';
import { resolveLogLevel, maskEmail } from './logger.js';

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
