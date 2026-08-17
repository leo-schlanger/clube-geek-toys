import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same reason as product.service.test.ts: env.ts exits the process outside a
// configured container, and database.ts opens a pool at import time.
vi.mock('../config/env.js', () => ({
  env: { API_URL: 'https://api.test', NODE_ENV: 'test' },
}));

// The native bcrypt binary under server/api/node_modules was built for another
// platform; the service only uses it in createMemberWithUser.
vi.mock('bcrypt', () => ({
  default: { hash: vi.fn(async () => 'hash'), compare: vi.fn(async () => true) },
}));

const query = vi.fn();
const clientQuery = vi.fn();
const release = vi.fn();
vi.mock('../config/database.js', () => ({
  query: (...args: unknown[]) => query(...args),
  getClient: async () => ({ query: (...args: unknown[]) => clientQuery(...args), release }),
}));

vi.mock('../utils/audit.js', () => ({
  auditLog: vi.fn(),
  diffObjects: () => ({}),
}));

vi.mock('./email.service.js', () => ({ sendTemplateEmail: vi.fn() }));

const { updateMember } = await import('./member.service.js');

const BEFORE = {
  id: 'm1',
  user_id: 'u1',
  cpf: '85592200706',
  full_name: 'Fulano',
  email: 'antigo@example.com',
  phone: '21999999999',
  plan: 'club',
  status: 'active',
  payment_type: 'annual',
  start_date: '2026-01-01',
  expiry_date: '2027-01-01',
  activated_at: '2026-01-01',
  activated_by_payment: 'admin_manual',
  photo_url: null,
  pending_payment: null,
  subscription_id: null,
  subscription_status: null,
  auto_renewal: false,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

/** Rows for `SELECT * FROM members WHERE id` and the uniqueness checks. */
function mockSelects(opts: { emailTaken?: boolean; cpfTaken?: boolean } = {}) {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT * FROM members WHERE id')) {
      return { rowCount: 1, rows: [BEFORE] };
    }
    if (sql.includes('FROM users WHERE email')) {
      return { rowCount: opts.emailTaken ? 1 : 0, rows: opts.emailTaken ? [{}] : [] };
    }
    if (sql.includes('FROM members WHERE cpf')) {
      return { rowCount: opts.cpfTaken ? 1 : 0, rows: opts.cpfTaken ? [{}] : [] };
    }
    return { rowCount: 0, rows: [] };
  });
}

describe('updateMember — e-mail e CPF pelo admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE members')) {
        return { rowCount: 1, rows: [{ ...BEFORE, email: 'novo@example.com' }] };
      }
      return { rowCount: 1, rows: [] };
    });
  });

  it('grava o e-mail no members e no users (login usa o de users)', async () => {
    mockSelects();

    await updateMember('m1', { email: 'Novo@Example.com ' }, 'admin', 'actor');

    const sqls = clientQuery.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.startsWith('UPDATE members'))).toBe(true);
    const userUpdate = clientQuery.mock.calls.find((c) =>
      String(c[0]).includes('UPDATE users SET email')
    );
    expect(userUpdate).toBeDefined();
    // Lowercased and trimmed, otherwise members and users drift apart.
    expect(userUpdate?.[1]).toEqual(['novo@example.com', 'u1']);
    // A new address needs verifying again.
    expect(String(userUpdate?.[0])).toContain('email_verified = FALSE');
  });

  it('refuses an email already used by another account', async () => {
    mockSelects({ emailTaken: true });

    await expect(updateMember('m1', { email: 'novo@example.com' }, 'admin')).rejects.toMatchObject({
      statusCode: 409,
      code: 'EMAIL_IN_USE',
    });
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('refuses a CPF already registered to another member', async () => {
    mockSelects({ cpfTaken: true });

    await expect(updateMember('m1', { cpf: '52998224725' }, 'admin')).rejects.toMatchObject({
      statusCode: 409,
      code: 'CPF_IN_USE',
    });
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('ignores email and CPF when the editor is the member themselves', async () => {
    mockSelects();

    // Only phone is a member field; email/cpf are dropped by the allowlist.
    await updateMember('m1', { email: 'novo@example.com', phone: '21988887777' }, 'member');

    const update = clientQuery.mock.calls.find((c) => String(c[0]).startsWith('UPDATE members'));
    expect(String(update?.[0])).toContain('phone =');
    expect(String(update?.[0])).not.toContain('email =');
    expect(
      clientQuery.mock.calls.some((c) => String(c[0]).includes('UPDATE users SET email'))
    ).toBe(false);
  });

  it('ignores email and CPF when the editor is a PDV seller', async () => {
    mockSelects();

    // Sellers may touch status/plan, but changing the login would be a takeover.
    await updateMember(
      'm1',
      { email: 'novo@example.com', cpf: '52998224725', status: 'active' },
      'seller',
      'actor'
    );

    const update = clientQuery.mock.calls.find((c) => String(c[0]).startsWith('UPDATE members'));
    expect(String(update?.[0])).toContain('status =');
    expect(String(update?.[0])).not.toContain('email =');
    expect(String(update?.[0])).not.toContain('cpf =');
    expect(
      clientQuery.mock.calls.some((c) => String(c[0]).includes('UPDATE users SET email'))
    ).toBe(false);
  });

  it('leaves users untouched when the email is unchanged', async () => {
    mockSelects();

    await updateMember('m1', { email: 'antigo@example.com', phone: '21977776666' }, 'admin');

    expect(
      clientQuery.mock.calls.some((c) => String(c[0]).includes('UPDATE users SET email'))
    ).toBe(false);
  });
});
