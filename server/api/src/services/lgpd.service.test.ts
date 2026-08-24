import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LGPD — export (Art. 18) and erasure.
 *
 * What these protect, ordered by what a regression costs:
 *
 *  1. Erasure needs the right password, and it never fires while money is in
 *     flight — an active subscription or an order still shipping.
 *  2. `users` is anonymised, **never deleted**: the row carries CASCADEs to
 *     contracts and subscription payments, so a real DELETE would take the
 *     accounting history with it.
 *  3. Every table holding this person's PII is reached, and the open sessions
 *     die with the account — otherwise a signed-in device keeps working against
 *     the anonymised record.
 *  4. The export never carries a password hash or a refresh token.
 *  5. Optional tables (pre-migration volumes) are skipped via `to_regclass`,
 *     because in Postgres one failed statement aborts the whole transaction and
 *     would block the erasure request entirely.
 */

const { queryMock, clientQueryMock, releaseMock, auditMock, compareMock, hashMock } = vi.hoisted(
  () => ({
    queryMock: vi.fn(),
    clientQueryMock: vi.fn(),
    releaseMock: vi.fn(),
    auditMock: vi.fn(async () => {}),
    compareMock: vi.fn(async () => true),
    hashMock: vi.fn(async () => '$2b$12$hashed'),
  })
);

vi.mock('../config/database.js', () => ({
  query: queryMock,
  getClient: async () => ({ query: clientQueryMock, release: releaseMock }),
}));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));
vi.mock('bcrypt', () => ({ default: { compare: compareMock, hash: hashMock } }));
vi.mock('../config/env.js', () => ({ env: { NODE_ENV: 'test' } }));

import { exportUserData, deleteUserAccount } from './lgpd.service.js';

type Reply = { rows?: Record<string, unknown>[]; rowCount?: number };
let routes: [string, Reply][] = [];
let clientRoutes: [string, Reply][] = [];
const sqlLog: string[] = [];
const clientSqlLog: string[] = [];

const sqlOf = (a: unknown) => (typeof a === 'string' ? a.replace(/\s+/g, ' ').trim() : '');
const ranClient = (...f: string[]) => clientSqlLog.some((s) => f.every((x) => s.includes(x)));
const clientParamsOf = (...f: string[]) =>
  clientQueryMock.mock.calls.find((c) => f.every((x) => sqlOf(c[0]).includes(x)))?.[1] as
    | unknown[]
    | undefined;
const route = (fragment: string, reply: Reply) => routes.push([fragment, reply]);
const clientRoute = (fragment: string, reply: Reply) => clientRoutes.push([fragment, reply]);

const USER_ID = 'a3f1e0c2-0000-4000-8000-000000000000';
const userRow = {
  id: USER_ID,
  email: 'ana@example.com',
  password_hash: '$2b$12$stored',
  role: 'member',
  email_verified: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  sqlLog.length = 0;
  clientSqlLog.length = 0;
  routes = [];
  clientRoutes = [];
  compareMock.mockResolvedValue(true);

  queryMock.mockImplementation(async (text: unknown) => {
    const sql = sqlOf(text);
    sqlLog.push(sql);
    for (const [f, r] of routes) {
      if (sql.includes(f)) return { rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) };
    }
    return { rows: [], rowCount: 0 };
  });

  clientQueryMock.mockImplementation(async (text: unknown) => {
    const sql = sqlOf(text);
    clientSqlLog.push(sql);
    // Every optional table exists unless a test says otherwise.
    if (sql.includes('to_regclass')) {
      return {
        rows: [{ questions: true, notifications: true, profile: true, saved: true }],
        rowCount: 1,
      };
    }
    for (const [f, r] of clientRoutes) {
      if (sql.includes(f)) return { rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) };
    }
    return { rows: [], rowCount: 0 };
  });
});

/** The reads `deleteUserAccount` makes before it opens the transaction. */
function erasureAllowed() {
  route('FROM users WHERE id', { rows: [userRow] });
  route('FROM subscriptions s JOIN members m', { rows: [] });
  route('FROM orders', { rows: [] });
  clientRoute('SELECT id FROM members WHERE user_id', { rows: [{ id: 'member-1' }] });
}

// ─── Export ──────────────────────────────────────────────────────────────────

describe('exportUserData', () => {
  it('recusa um usuário inexistente', async () => {
    route('FROM users WHERE id', { rows: [] });
    await expect(exportUserData(USER_ID)).rejects.toThrow('Usuário não encontrado');
  });

  /** Art. 18 asks for the data, not for the credentials that guard it. */
  it('nunca devolve hash de senha nem refresh token', async () => {
    route('FROM users WHERE id', { rows: [userRow] });
    route('FROM members WHERE user_id', { rows: [] });

    const out = await exportUserData(USER_ID);

    expect(JSON.stringify(out)).not.toContain('password_hash');
    expect(JSON.stringify(out)).not.toContain('refresh_token');
    // And the SELECT itself must not ask for them.
    expect(sqlLog.some((s) => s.includes('FROM users WHERE id') && s.includes('password'))).toBe(
      false
    );
  });

  it('registra a exportação no audit log', async () => {
    route('FROM users WHERE id', { rows: [userRow] });
    route('FROM members WHERE user_id', { rows: [{ id: 'member-1' }] });

    await exportUserData(USER_ID);

    expect(auditMock).toHaveBeenCalledWith(
      'lgpd.export',
      USER_ID,
      expect.objectContaining({ memberId: 'member-1' }),
      'member-1'
    );
  });

  it('sem membro, não consulta as tabelas de membro', async () => {
    route('FROM users WHERE id', { rows: [userRow] });
    route('FROM members WHERE user_id', { rows: [] });

    const out = await exportUserData(USER_ID);

    expect(out.member).toBeNull();
    expect(out.contracts).toEqual([]);
    expect(sqlLog.some((s) => s.includes('FROM contracts WHERE member_id'))).toBe(false);
  });

  it('devolve saldo zero quando não há crédito de loja', async () => {
    route('FROM users WHERE id', { rows: [userRow] });
    route('FROM members WHERE user_id', { rows: [] });

    const out = await exportUserData(USER_ID);
    expect(out.storeCredit).toEqual({ balance: 0 });
  });
});

// ─── Erasure guards ──────────────────────────────────────────────────────────

describe('deleteUserAccount — o que impede a exclusão', () => {
  it('recusa um usuário inexistente', async () => {
    route('FROM users WHERE id', { rows: [] });
    await expect(deleteUserAccount(USER_ID, 'senha')).rejects.toThrow('Usuário não encontrado');
  });

  it('exige a senha correta', async () => {
    route('FROM users WHERE id', { rows: [userRow] });
    compareMock.mockResolvedValueOnce(false);

    await expect(deleteUserAccount(USER_ID, 'errada')).rejects.toThrow('Senha incorreta');
    expect(clientSqlLog).toHaveLength(0);
  });

  /** Erasing under a live subscription would leave Stripe billing a ghost. */
  it('bloqueia com assinatura ativa', async () => {
    route('FROM users WHERE id', { rows: [userRow] });
    route('FROM subscriptions s JOIN members m', { rows: [{ id: 'sub_1' }] });

    await expect(deleteUserAccount(USER_ID, 'senha')).rejects.toThrow('Cancele sua assinatura');
    expect(clientSqlLog).toHaveLength(0);
  });

  it('bloqueia com pedido em andamento na loja', async () => {
    route('FROM users WHERE id', { rows: [userRow] });
    route('FROM subscriptions s JOIN members m', { rows: [] });
    route('FROM orders', { rows: [{ id: 'order-1' }] });

    await expect(deleteUserAccount(USER_ID, 'senha')).rejects.toThrow('Conclua ou cancele pedidos');
    expect(clientSqlLog).toHaveLength(0);
  });
});

// ─── Erasure effects ─────────────────────────────────────────────────────────

describe('deleteUserAccount — o que a exclusão faz', () => {
  /**
   * `users` carries ON DELETE CASCADE down to contracts and subscription
   * payments. A real DELETE would take the accounting history with it, so the
   * row is anonymised in place — deliberately, and this test says so.
   */
  it('anonimiza a linha de users em vez de apagá-la', async () => {
    erasureAllowed();

    await deleteUserAccount(USER_ID, 'senha');

    expect(ranClient('DELETE FROM users')).toBe(false);
    expect(ranClient('UPDATE users SET', "role = 'disabled'")).toBe(true);
    expect(clientParamsOf('UPDATE users SET')?.[0]).toBe(`deleted_${USER_ID}@redacted`);
  });

  it('mata as sessões abertas junto', async () => {
    erasureAllowed();

    await deleteUserAccount(USER_ID, 'senha');

    // Otherwise a device still signed in keeps working against the anonymised
    // account.
    expect(ranClient('DELETE FROM refresh_sessions')).toBe(true);
  });

  it('redige as tabelas de membro: cadastro e contrato', async () => {
    erasureAllowed();

    await deleteUserAccount(USER_ID, 'senha');

    expect(ranClient('UPDATE members SET', "full_name = 'REDACTED'", "cpf = '00000000000'")).toBe(
      true
    );
    expect(ranClient('UPDATE contracts SET', "member_cpf = '00000000000'")).toBe(true);
  });

  it('cancela assinatura que ainda esteja de pé', async () => {
    erasureAllowed();

    await deleteUserAccount(USER_ID, 'senha');

    expect(ranClient('UPDATE subscriptions SET', "status = 'cancelled'")).toBe(true);
  });

  it('redige perguntas públicas e apaga notificações', async () => {
    erasureAllowed();

    await deleteUserAccount(USER_ID, 'senha');

    // The public answer quotes the question, so it goes with it.
    expect(ranClient('UPDATE product_questions SET', "body = 'REDACTED'", "answer_body = NULL")).toBe(
      true
    );
    expect(ranClient('DELETE FROM notifications')).toBe(true);
  });

  it('zera o crédito de loja e desabilita o atacado', async () => {
    erasureAllowed();

    await deleteUserAccount(USER_ID, 'senha');

    expect(ranClient('UPDATE store_credits SET balance = 0')).toBe(true);
    expect(ranClient('UPDATE wholesale_accounts SET', "company_name = 'REDACTED'")).toBe(true);
  });

  it('roda tudo numa transação só', async () => {
    erasureAllowed();

    await deleteUserAccount(USER_ID, 'senha');

    expect(clientSqlLog[0]).toBe('BEGIN');
    expect(ranClient('COMMIT')).toBe(true);
    expect(releaseMock).toHaveBeenCalled();
  });

  it('faz ROLLBACK e propaga quando uma etapa falha', async () => {
    erasureAllowed();
    clientQueryMock.mockImplementation(async (text: unknown) => {
      const sql = sqlOf(text);
      clientSqlLog.push(sql);
      if (sql.includes('to_regclass')) return { rows: [{}], rowCount: 1 };
      if (sql.includes('UPDATE users SET')) throw new Error('deadlock');
      if (sql.includes('SELECT id FROM members')) return { rows: [{ id: 'member-1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await expect(deleteUserAccount(USER_ID, 'senha')).rejects.toThrow('deadlock');

    expect(ranClient('ROLLBACK')).toBe(true);
    expect(releaseMock).toHaveBeenCalled();
  });

  /**
   * `ensureSchema` runs after listen() and is not awaited, so on an old volume
   * an optional table may still be missing. A plain statement against it would
   * abort the transaction and block the erasure request outright.
   */
  it('pula tabelas opcionais que ainda não existem', async () => {
    erasureAllowed();
    clientQueryMock.mockImplementation(async (text: unknown) => {
      const sql = sqlOf(text);
      clientSqlLog.push(sql);
      if (sql.includes('to_regclass')) {
        return { rows: [{ questions: false, notifications: false }], rowCount: 1 };
      }
      if (sql.includes('SELECT id FROM members')) return { rows: [{ id: 'member-1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await expect(deleteUserAccount(USER_ID, 'senha')).resolves.toBeDefined();

    expect(ranClient('UPDATE product_questions')).toBe(false);
    expect(ranClient('DELETE FROM notifications')).toBe(false);
    expect(ranClient('COMMIT')).toBe(true);
  });

  it('funciona para quem nunca foi membro do clube', async () => {
    route('FROM users WHERE id', { rows: [userRow] });
    route('FROM subscriptions s JOIN members m', { rows: [] });
    route('FROM orders', { rows: [] });
    clientRoute('SELECT id FROM members WHERE user_id', { rows: [] });

    await expect(deleteUserAccount(USER_ID, 'senha')).resolves.toBeDefined();

    expect(ranClient('UPDATE members SET')).toBe(false);
    expect(ranClient('UPDATE users SET')).toBe(true);
  });
});
