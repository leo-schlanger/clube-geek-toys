import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

/**
 * Wholesale accounts — a CNPJ gets 25% off, so who gets in matters.
 *
 *  1. Login needs e-mail, password **and** the CNPJ on file; a disabled or
 *     rejected account is refused, with the reason when there is one.
 *  2. Registering attaches to an existing account only with its password —
 *     never by e-mail alone — and a CNPJ registers once.
 *  3. A rejection needs a reason, and the review is audited.
 *  4. Checkout discounts only an **approved** account.
 */

const { SECRET, queryMock, bcryptMock, openSession, getSetting, auditMock } = vi.hoisted(() => ({
  SECRET: 'wholesale-tests-secret-with-more-than-32-chars',
  queryMock: vi.fn(),
  bcryptMock: { compare: vi.fn(), hash: vi.fn(async () => 'hashed') },
  openSession: vi.fn(async () => {}),
  getSetting: vi.fn(),
  auditMock: vi.fn(async () => {}),
}));
vi.mock('../config/database.js', () => ({ query: queryMock }));
vi.mock('../config/env.js', () => ({ env: { JWT_SECRET: SECRET } }));
vi.mock('bcrypt', () => ({ default: bcryptMock }));
const { assertLoginAllowedMock, registerLoginFailureMock } = vi.hoisted(() => ({
  assertLoginAllowedMock: vi.fn(async (..._args: unknown[]) => {}),
  registerLoginFailureMock: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock('./auth.service.js', () => ({
  openRefreshSession: openSession,
  ACCESS_TOKEN_EXPIRY: '15m',
  assertLoginAllowed: assertLoginAllowedMock,
  registerLoginFailure: registerLoginFailureMock,
}));
vi.mock('./settings.service.js', () => ({ getSetting }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));

import {
  getApprovedAccountByUserId,
  isWholesaleSalesOpen,
  listAccounts,
  loginWholesale,
  registerWholesale,
  reviewAccount,
} from './wholesale.service.js';

const CNPJ = '11222333000181';
const account = (over: Record<string, unknown> = {}) => ({
  id: 'w1', user_id: 'u1', cnpj: CNPJ, company_name: 'Loja X LTDA', contact_name: 'Ana', status: 'approved', email: 'ana@x.com', created_at: 'x', updated_at: 'x', ...over,
});

/** Answers by SQL fragment. */
function route(routes: Array<[string, { rows: unknown[] }]>) {
  queryMock.mockImplementation(async (text: string) => {
    for (const [fragment, reply] of routes) if (text.includes(fragment)) return reply;
    return { rows: [] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  bcryptMock.compare.mockResolvedValue(true);
});

describe('login', () => {
  const login = { email: ' Ana@X.com ', password: 'secret123', cnpj: '11.222.333/0001-81', userAgent: 'UA' };

  it('signs in with e-mail, password and the CNPJ on file', async () => {
    route([
      ['FROM users WHERE email', { rows: [{ id: 'u1', email: 'ana@x.com', role: 'member', password_hash: 'h' }] }],
      ['FROM wholesale_accounts w', { rows: [account()] }],
    ]);
    const res = await loginWholesale(login);
    expect(queryMock.mock.calls[0][1]).toEqual(['ana@x.com']);
    expect(res.account.cnpj).toBe(CNPJ);
    const payload = jwt.verify(res.accessToken, SECRET) as { userId: string; role: string };
    expect(payload).toMatchObject({ userId: 'u1', role: 'member' });
    expect(openSession).toHaveBeenCalledWith('u1', res.refreshToken, 'UA');
    expect(auditMock).toHaveBeenCalledWith('wholesale.login', 'u1', expect.objectContaining({ cnpj: CNPJ }));
  });

  it('refuses a CNPJ that does not match, a wrong password and an unknown e-mail — the same way', async () => {
    route([
      ['FROM users WHERE email', { rows: [{ id: 'u1', email: 'ana@x.com', role: 'member', password_hash: 'h' }] }],
      ['FROM wholesale_accounts w', { rows: [account({ cnpj: '11444777000161' })] }],
    ]);
    await expect(loginWholesale(login)).rejects.toMatchObject({ code: 'CNPJ_MISMATCH' });

    bcryptMock.compare.mockResolvedValue(false);
    await expect(loginWholesale(login)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });

    route([]);
    await expect(loginWholesale(login)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
    await expect(loginWholesale({ ...login, cnpj: '11111111111111' })).rejects.toMatchObject({ code: 'INVALID_CNPJ' });
  });

  it('refuses disabled, rejected and non-wholesale accounts', async () => {
    const user = { rows: [{ id: 'u1', email: 'ana@x.com', role: 'member', password_hash: 'h' }] };
    route([['FROM users WHERE email', user], ['FROM wholesale_accounts w', { rows: [account({ status: 'disabled' })] }]]);
    await expect(loginWholesale(login)).rejects.toMatchObject({ code: 'WHOLESALE_DISABLED' });

    route([['FROM users WHERE email', user], ['FROM wholesale_accounts w', { rows: [account({ status: 'rejected', rejection_reason: 'CNPJ inativo' })] }]]);
    await expect(loginWholesale(login)).rejects.toThrow('Cadastro recusado: CNPJ inativo');

    route([['FROM users WHERE email', user]]);
    await expect(loginWholesale(login)).rejects.toMatchObject({ code: 'NOT_WHOLESALE' });

    route([['FROM users WHERE email', { rows: [{ id: 'u1', role: 'disabled', password_hash: 'h' }] }]]);
    await expect(loginWholesale(login)).rejects.toMatchObject({ code: 'ACCOUNT_DISABLED' });
  });
});

describe('register', () => {
  const data = { email: 'nova@x.com', password: 'secret123', cnpj: CNPJ, companyName: ' Loja Nova ', contactName: 'Bia', phone: ' 21 99999 ' };

  it('creates a pending account and a login for a new e-mail', async () => {
    route([
      ['INSERT INTO users', { rows: [{ id: 'u9', email: 'nova@x.com', role: 'member' }] }],
      ['INSERT INTO wholesale_accounts', { rows: [account({ id: 'w9', user_id: 'u9', status: 'pending', company_name: 'Loja Nova' })] }],
    ]);
    const res = await registerWholesale(data);
    expect(res.account).toMatchObject({ status: 'pending', email: 'nova@x.com' });
    expect(bcryptMock.hash).toHaveBeenCalledWith('secret123', 12);
    const insert = queryMock.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO wholesale_accounts'))!;
    expect(insert[1]).toEqual(['u9', CNPJ, 'Loja Nova', null, null, '21 99999', 'Bia', null]);
  });

  it('attaches to an existing account only with its password', async () => {
    route([['SELECT id, email, role, password_hash FROM users', { rows: [{ id: 'u1', email: 'nova@x.com', role: 'member', password_hash: 'h' }] }]]);
    bcryptMock.compare.mockResolvedValue(false);
    await expect(registerWholesale(data)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    bcryptMock.compare.mockResolvedValue(true);
    route([
      ['SELECT id, email, role, password_hash FROM users', { rows: [{ id: 'u1', email: 'nova@x.com', role: 'member', password_hash: 'h' }] }],
      ['FROM wholesale_accounts w', { rows: [account()] }],
    ]);
    await expect(registerWholesale(data)).rejects.toMatchObject({ code: 'WHOLESALE_ALREADY_EXISTS' });
  });

  it('refuses a registered CNPJ and incomplete data', async () => {
    route([['FROM wholesale_accounts WHERE cnpj', { rows: [{ id: 'w1' }] }]]);
    await expect(registerWholesale(data)).rejects.toMatchObject({ code: 'CNPJ_ALREADY_EXISTS' });
    await expect(registerWholesale({ ...data, cnpj: '123' })).rejects.toMatchObject({ code: 'INVALID_CNPJ' });
    await expect(registerWholesale({ ...data, companyName: ' ' })).rejects.toMatchObject({ code: 'COMPANY_NAME_REQUIRED' });
    await expect(registerWholesale({ ...data, contactName: '' })).rejects.toMatchObject({ code: 'CONTACT_NAME_REQUIRED' });
    await expect(registerWholesale({ ...data, password: '123' })).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
  });
});

describe('admin review', () => {
  it('approves, and needs a reason to reject', async () => {
    route([
      ['UPDATE wholesale_accounts', { rows: [account({ status: 'approved' })] }],
      ['SELECT email FROM users', { rows: [{ email: 'ana@x.com' }] }],
    ]);
    const res = await reviewAccount('w1', 'approve', 'admin-1', { adminNotes: ' ok ' });
    expect(res).toMatchObject({ status: 'approved', email: 'ana@x.com' });
    expect(queryMock.mock.calls[0][1]).toEqual(['approved', null, 'ok', 'admin-1', 'w1']);
    expect(auditMock).toHaveBeenCalledWith('wholesale.approve', 'admin-1', expect.objectContaining({ status: 'approved' }));

    await expect(reviewAccount('w1', 'reject', 'admin-1')).rejects.toMatchObject({ code: 'REJECTION_REASON_REQUIRED' });
    route([]);
    await expect(reviewAccount('nope', 'disable', 'admin-1')).rejects.toMatchObject({ code: 'WHOLESALE_NOT_FOUND' });
  });

  it('lists pending first, paged', async () => {
    queryMock.mockResolvedValueOnce({ rows: [account({ status: 'pending' })] }).mockResolvedValueOnce({ rows: [{ total: 1 }] });
    const res = await listAccounts({ status: 'pending', limit: 999, page: 3 });
    expect(res).toMatchObject({ total: 1, limit: 100, page: 3 });
    expect(queryMock.mock.calls[0][1]).toEqual(['pending', 100, 200]);
  });
});

describe('checkout gates', () => {
  it('discounts only an approved account', async () => {
    route([['FROM wholesale_accounts w', { rows: [account({ status: 'pending' })] }]]);
    expect(await getApprovedAccountByUserId('u1')).toBeNull();
    route([['FROM wholesale_accounts w', { rows: [account()] }]]);
    expect((await getApprovedAccountByUserId('u1'))?.status).toBe('approved');
    route([]);
    expect(await getApprovedAccountByUserId('u1')).toBeNull();
  });

  it('sells wholesale only when the setting is exactly true', async () => {
    getSetting.mockResolvedValueOnce(true).mockResolvedValueOnce('true').mockResolvedValueOnce(undefined);
    expect(await isWholesaleSalesOpen()).toBe(true);
    expect(await isWholesaleSalesOpen()).toBe(false);
    expect(await isWholesaleSalesOpen()).toBe(false);
  });
});

/** The wholesale door uses the same per-account lock as the main login. */
describe('login — bloqueio por conta', () => {
  it('confere o bloqueio antes da senha e conta a senha errada', async () => {
    route([['FROM users WHERE email', { rows: [{ id: 'u1', email: 'ana@x.com', role: 'member', password_hash: 'h' }] }]]);
    bcryptMock.compare.mockResolvedValueOnce(false);
    await expect(loginWholesale({ email: 'ana@x.com', password: 'x', cnpj: CNPJ })).rejects.toThrow();
    expect(assertLoginAllowedMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
    expect(registerLoginFailureMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
  });
});
