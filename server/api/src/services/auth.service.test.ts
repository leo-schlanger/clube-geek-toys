import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Sessions — the part of auth that decides **who stays logged in**.
 *
 * The rule being protected here is the one that broke: a session belongs to a
 * device, not to a person. Signing in on the phone must not end the session on
 * the desktop, and rotating one session's token must not touch another's.
 *
 * The second rule is the counterweight: when the credential itself changes
 * (password reset, password change), every session ends — including the ones
 * on devices the owner does not physically control.
 */

vi.mock('../config/env.js', () => ({
  env: {
    JWT_SECRET: 'x'.repeat(48),
    JWT_REFRESH_SECRET: 'y'.repeat(48),
    NODE_ENV: 'test',
    HMAC_SECRET: 'z'.repeat(48),
    FRONTEND_URL: 'https://club.geeketoys.com.br',
  },
}));

const query = vi.fn();
const clientQuery = vi.fn();
vi.mock('../config/database.js', () => ({
  query: (...args: unknown[]) => query(...args),
  getClient: async () => ({ query: clientQuery, release: vi.fn() }),
}));

vi.mock('./email.service.js', () => ({ sendTemplateEmail: vi.fn() }));
vi.mock('../utils/audit.js', () => ({ auditLog: vi.fn() }));
vi.mock('./order.service.js', () => ({ claimGuestOrders: vi.fn(async () => 0) }));
vi.mock('../utils/disposable-emails.js', () => ({ isDisposableEmail: () => false }));

const bcryptCompare = vi.fn(async () => true);
vi.mock('bcrypt', () => ({
  default: { compare: (...a: unknown[]) => bcryptCompare(...(a as [])), hash: async () => 'hashed' },
}));

const { login, logout, refresh, resetPassword, openRefreshSession, revokeAllRefreshSessions } =
  await import('./auth.service.js');
const { hashSha256 } = await import('../utils/hmac.js');

/** Every SQL statement the call emitted, for asserting on shape not order. */
function statements() {
  return query.mock.calls.map((c) => String(c[0]));
}

function userRow(over: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'laura@example.com',
    password_hash: 'hash',
    role: 'member',
    email_verified: true,
    ...over,
  };
}

describe('sessões de refresh', () => {
  beforeEach(() => {
    query.mockReset();
    clientQuery.mockReset();
    bcryptCompare.mockResolvedValue(true as never);
  });

  it('opens a new session on login instead of overwriting the user row', async () => {
    query
      .mockResolvedValueOnce({ rows: [userRow()] }) // SELECT user
      .mockResolvedValue({ rows: [], rowCount: 0 });

    await login({ email: 'laura@example.com', password: 'senha', userAgent: 'iPhone' });

    const sql = statements();
    expect(sql.some((s) => s.includes('INSERT INTO refresh_sessions'))).toBe(true);
    // The regression that logged the other device out.
    expect(sql.some((s) => s.includes('UPDATE users SET refresh_token_hash'))).toBe(false);
  });

  it('rotates only the session that presented the token', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'sess-1', user_id: 'u1' }] })
      .mockResolvedValueOnce({ rows: [userRow()] })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    await refresh('token-do-celular');

    const update = query.mock.calls.find((c) =>
      String(c[0]).includes('UPDATE refresh_sessions SET')
    );
    expect(update).toBeDefined();
    // Scoped by session id — never by user_id, which is what would knock the
    // other devices out.
    expect(String(update?.[0])).toMatch(/WHERE id = \$4/);
    expect((update?.[1] as unknown[])[3]).toBe('sess-1');
  });

  it('accepts the previous token of the same session inside the grace window', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'sess-1', user_id: 'u1' }] })
      .mockResolvedValueOnce({ rows: [userRow()] })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    await refresh('token-antigo');

    const lookup = String(query.mock.calls[0][0]);
    expect(lookup).toMatch(/prev_token_hash = \$1/);
    expect(lookup).toMatch(/rotated_at > NOW\(\)/);
    // An expired row is not a session any more.
    expect(lookup).toMatch(/expires_at > NOW\(\)/);
  });

  it('rejects a token that matches no session', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(refresh('token-inventado')).rejects.toThrow(/inválido/i);
  });

  it('kills every session of an account that was disabled meanwhile', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'sess-1', user_id: 'u1' }] })
      .mockResolvedValueOnce({ rows: [userRow({ role: 'disabled' })] })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(refresh('token')).rejects.toThrow(/desativada/i);
    expect(statements().some((s) => s.includes('DELETE FROM refresh_sessions WHERE user_id'))).toBe(
      true
    );
  });

  it('signs out only the device that asked', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    await logout('u1', 'token-do-celular');

    const del = query.mock.calls.find((c) => String(c[0]).includes('DELETE FROM refresh_sessions'));
    expect(String(del?.[0])).toMatch(/token_hash = \$1 OR prev_token_hash = \$1/);
    expect((del?.[1] as unknown[])[0]).toBe(hashSha256('token-do-celular'));
  });

  it('signs out everywhere when no token identifies the device', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    await logout('u1');

    expect(
      statements().some((s) => s.includes('DELETE FROM refresh_sessions WHERE user_id = $1'))
    ).toBe(true);
  });

  it('ends every session on a password reset', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'u1' }], rowCount: 1 })
      .mockResolvedValue({ rows: [], rowCount: 0 });

    const { createHmacToken } = await import('../utils/hmac.js');
    await resetPassword(createHmacToken({ email: 'laura@example.com' }), 'novaSenha123');

    expect(
      statements().some((s) => s.includes('DELETE FROM refresh_sessions WHERE user_id = $1'))
    ).toBe(true);
  });

  it('stores the session with an expiry the server controls', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    await openRefreshSession('u1', 'tok', 'Mozilla/5.0');

    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toMatch(/NOW\(\) \+ \(\$3 \|\| ' days'\)::interval/);
    expect(params).toEqual(['u1', hashSha256('tok'), '30', 'Mozilla/5.0']);
  });

  it('caps how many sessions one account can pile up', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    await openRefreshSession('u1', 'tok');

    const trim = query.mock.calls[1];
    expect(String(trim[0])).toMatch(/DELETE FROM refresh_sessions/);
    // Trims by user, keeping the most recently used ones.
    expect(trim[1]).toEqual(['u1', 20]);
  });

  it('revokes all sessions of one user without touching anyone else', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 2 });

    await revokeAllRefreshSessions('u1');

    expect(query.mock.calls[0][1]).toEqual(['u1']);
  });
});
