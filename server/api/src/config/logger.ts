import pino from 'pino';

/**
 * The one logger.
 *
 * JSON per line on stdout, which Docker hands to journald on the host — so a
 * line survives the deploy that recreates the container (the json-file driver
 * lost everything at each deploy). Read it with:
 *
 *   journalctl CONTAINER_NAME=clube-geek-api --since -1d -o cat | jq
 *
 * Every module takes a child with its own `module` field instead of the free
 * `[TAG]` prefixes it used to write by hand — thirty of them, half spelled two
 * ways. Inside a request, prefer `req.log`: it carries the `reqId` that also
 * goes back to the browser in `X-Request-Id` and into `error_logs`.
 *
 * Levels: `error` is for something the team must look at; a client mistake
 * (4xx) is `info` or `warn`, never `error`.
 *
 * Read from `process.env` directly, not `config/env.ts`: the logger has to load
 * before — and independently of — the schema that validates everything else.
 */
const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

/**
 * Compose expands an unset `${LOG_LEVEL:-}` to an empty string, and pino
 * refuses to start on a level it does not know — on 02/10/2026 that took the
 * API down at boot. Anything empty or unknown falls back to the default.
 */
export function resolveLogLevel(raw: string | undefined, isTest: boolean): string {
  const wanted = raw?.trim().toLowerCase();
  if (wanted && LEVELS.includes(wanted)) return wanted;
  return isTest ? 'silent' : 'info';
}

const level = resolveLogLevel(process.env.LOG_LEVEL, Boolean(process.env.VITEST));

export const logger = pino({
  level,
  base: { service: 'api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  // Never in a log line: credentials, card data, documents. E-mails and names
  // are left to the caller — log an id instead of the person.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.newPassword',
      '*.card_token',
      '*.cardToken',
      '*.cvv',
      '*.document',
      '*.cpf',
      '*.customerDocument',
      '*.secret',
      '*.token',
    ],
    censor: '[redacted]',
  },
});

/** A logger for one area of the code — `module` is what you filter on. */
export function moduleLogger(module: string): pino.Logger {
  return logger.child({ module });
}

/** Mask an e-mail for logs: `lucas.lima@gmail.com` → `lu***@gmail.com`. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at < 1) return '***';
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}
