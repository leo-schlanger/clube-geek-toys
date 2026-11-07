import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Member routes over real HTTP.
 *
 * The rule that costs most if it breaks: a member sees and edits **only their
 * own** record — any other id is 403, not someone else's CPF and address. The
 * public card check (QR at the door) shows what a physical card shows and no
 * more: never CPF, e-mail or user id.
 */

vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);
vi.mock('../middleware/rate-limit.js', async () => (await import('../test-support/env.js')).rateLimitModule);
// Real getMemberActivity over the mocked `query`, so the test sees the SQL.
vi.mock('../services/log.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/log.service.js')>()),
  createErrorLog: vi.fn(async () => {}),
}));

const { members, payments, queryMock } = vi.hoisted(() => ({
  members: {
    getMemberByCpf: vi.fn(),
    getMemberById: vi.fn(),
    getMemberByUserId: vi.fn(),
    listMembers: vi.fn(),
    getMembersCount: vi.fn(),
    createMember: vi.fn(),
    createMemberByStaff: vi.fn(),
    updateMember: vi.fn(),
  },
  payments: { getPayments: vi.fn() },
  queryMock: vi.fn(),
}));
vi.mock('../services/member.service.js', () => members);
vi.mock('../services/payment.service.js', () => payments);
vi.mock('../config/database.js', () => ({ query: queryMock }));

import { memberRouter } from './member.routes.js';
import { issueCardToken } from '../utils/card-token.js';
import { routerClient } from '../test-support/http.js';

const api = routerClient('/members', memberRouter);
const CPF = '52998224725';
const ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const own = { id: ID, userId: 'user-member', fullName: 'Laura', cpf: CPF, email: 'laura@example.com' };
const someoneElse = { ...own, userId: 'user-other' };

beforeEach(() => vi.clearAllMocks());

describe('public', () => {
  it('says only whether a CPF exists, and refuses an invalid one', async () => {
    members.getMemberByCpf.mockResolvedValueOnce(own).mockResolvedValueOnce(null);
    expect((await api.get('/cpf-exists/529.982.247-25', { as: 'member' })).body).toEqual({ exists: true });
    expect((await api.get(`/cpf-exists/${CPF}`, { as: 'member' })).body).toEqual({ exists: false });
    expect((await api.get('/cpf-exists/11111111111', { as: 'member' })).status).toBe(400);
    expect((await api.get('/cpf-exists/123', { as: 'member' })).status).toBe(400);
  });

  // Anonymous, it answered whether any CPF belongs to a member.
  it('does not tell a stranger whether a CPF is a member', async () => {
    expect((await api.get(`/cpf-exists/${CPF}`)).status).toBe(401);
    expect(members.getMemberByCpf).not.toHaveBeenCalled();
  });

  it('checks a card without exposing personal data', async () => {
    members.getMemberById.mockResolvedValue({
      ...own,
      status: 'active',
      expiryDate: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const res = await api.get(`/verify/${ID}`);
    expect(res.body).toMatchObject({ fullName: 'Laura', status: 'active', isCurrent: true, discountPercent: 10 });
    expect(res.body).not.toHaveProperty('cpf');
    expect(res.body).not.toHaveProperty('email');
    expect(res.body).not.toHaveProperty('userId');

    members.getMemberById.mockResolvedValue({ ...own, status: 'active', expiryDate: '2020-01-01' });
    expect((await api.get(`/verify/${ID}`)).body.isCurrent).toBe(false);

    members.getMemberById.mockResolvedValue(null);
    expect((await api.get(`/verify/${ID}`)).status).toBe(404);
    expect((await api.get('/verify/not-an-id')).status).toBe(400);
  });

  describe('anti-print token on the card QR', () => {
    const current = { ...own, status: 'active', expiryDate: new Date(Date.now() + 86_400_000).toISOString() };

    it('a fresh token from the owner verifies as valid', async () => {
      members.getMemberById.mockResolvedValue(current);
      const { token } = issueCardToken(ID);
      const res = await api.get(`/verify/${ID}?t=${encodeURIComponent(token)}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ isCurrent: true, token: 'valid' });
    });

    it('an expired token (a screenshot) still shows the status, flagged as old', async () => {
      members.getMemberById.mockResolvedValue(current);
      const { token } = issueCardToken(ID, Date.now() - 6 * 60_000);
      const res = await api.get(`/verify/${ID}?t=${encodeURIComponent(token)}`);
      expect(res.body).toMatchObject({ isCurrent: true, token: 'expired' });
    });

    it('a tampered token or one from another card is invalid', async () => {
      members.getMemberById.mockResolvedValue(current);
      const { token } = issueCardToken(ID);
      const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
      expect((await api.get(`/verify/${ID}?t=${encodeURIComponent(tampered)}`)).body.token).toBe('invalid');
      const other = issueCardToken('9b2c1a10-0000-4000-8000-000000000abc').token;
      expect((await api.get(`/verify/${ID}?t=${encodeURIComponent(other)}`)).body.token).toBe('invalid');
    });

    it('an old card without a token keeps working, marked missing', async () => {
      members.getMemberById.mockResolvedValue(current);
      expect((await api.get(`/verify/${ID}`)).body).toMatchObject({ isCurrent: true, token: 'missing' });
    });

    it('a valid token never makes an expired membership pass', async () => {
      members.getMemberById.mockResolvedValue({ ...own, status: 'active', expiryDate: '2020-01-01' });
      const { token } = issueCardToken(ID);
      expect((await api.get(`/verify/${ID}?t=${encodeURIComponent(token)}`)).body).toMatchObject({
        isCurrent: false,
        token: 'valid',
      });
      members.getMemberById.mockResolvedValue({ ...current, status: 'inactive' });
      expect((await api.get(`/verify/${ID}?t=${encodeURIComponent(token)}`)).body.isCurrent).toBe(false);
    });

    it('the owner gets a token for their own card only; anonymous gets 401', async () => {
      members.getMemberByUserId.mockResolvedValue(own);
      const res = await api.get('/me/card-token', { as: 'member' });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.body.memberId).toBe(ID);
      expect(members.getMemberByUserId).toHaveBeenCalledWith('user-member');
      members.getMemberById.mockResolvedValue(current);
      expect((await api.get(`/verify/${ID}?t=${encodeURIComponent(res.body.token)}`)).body.token).toBe('valid');

      expect((await api.get('/me/card-token')).status).toBe(401);
      members.getMemberByUserId.mockResolvedValue(null);
      expect((await api.get('/me/card-token', { as: 'member' })).status).toBe(404);
    });
  });
});

describe('authenticated', () => {
  it('needs a login past the public routes', async () => {
    expect((await api.get('/me')).status).toBe(401);
  });

  it("returns the member's own profile", async () => {
    members.getMemberByUserId.mockResolvedValueOnce(own).mockResolvedValueOnce(null);
    expect((await api.get('/me', { as: 'member' })).body.id).toBe(ID);
    expect((await api.get('/me', { as: 'member' })).status).toBe(404);
  });

  it("never shows a member someone else's record", async () => {
    members.getMemberById.mockResolvedValue(someoneElse);
    expect((await api.get(`/${ID}`, { as: 'member' })).status).toBe(403);
    // Staff see any record.
    expect((await api.get(`/${ID}`, { as: 'seller' })).status).toBe(200);
    members.getMemberById.mockResolvedValue(own);
    expect((await api.get(`/${ID}`, { as: 'member' })).status).toBe(200);
    members.getMemberById.mockResolvedValue(null);
    expect((await api.get(`/${ID}`, { as: 'admin' })).status).toBe(404);
  });
});

describe('own activity', () => {
  it("returns only the caller's own timeline, without details or actor ids", async () => {
    members.getMemberByUserId.mockResolvedValue(own);
    queryMock.mockResolvedValue({
      rows: [{ id: 'a1', action: 'payment.pix_confirmed', timestamp: '2026-11-01T12:00:00Z', details: { actor: 'staff' }, user_id: 'u-staff' }],
    });
    const res = await api.get('/me/activity?memberId=someone-else&limit=999', { as: 'member' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'a1', action: 'payment.pix_confirmed', timestamp: '2026-11-01T12:00:00Z' }]);
    expect(members.getMemberByUserId).toHaveBeenCalledWith('user-member');
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/SELECT id, action, timestamp FROM audit_logs/);
    expect(sql).toMatch(/action = ANY/);
    // The query string cannot pick another member, and the cap holds.
    expect(params[0]).toBe(ID);
    expect(params[1]).toContain('member.activated');
    expect(params[1]).not.toContain('order.status_changed');
    expect(params[2]).toBe(50);
  });

  it('needs a login, and a user without a member record gets 404', async () => {
    expect((await api.get('/me/activity')).status).toBe(401);
    members.getMemberByUserId.mockResolvedValue(null);
    expect((await api.get('/me/activity', { as: 'member' })).status).toBe(404);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('staff views', () => {
  it('lists with validated filters', async () => {
    members.listMembers.mockResolvedValue({ members: [], total: 0 });
    await api.get('/?status=active&search=laura&page=2&limit=10&sort=full_name&order=asc', { as: 'seller' });
    expect(members.listMembers).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', search: 'laura', page: 2, limit: 10, sort: 'full_name', order: 'asc' })
    );
    expect((await api.get('/?limit=1000', { as: 'admin' })).status).toBe(400);
    expect((await api.get('/?sort=password', { as: 'admin' })).status).toBe(400);
    expect((await api.get('/', { as: 'member' })).status).toBe(403);
  });

  it('counts, finds by CPF, and reads payments and the subscription', async () => {
    members.getMembersCount.mockResolvedValue(4);
    expect((await api.get('/count', { as: 'admin' })).body).toEqual({ count: 4 });

    members.getMemberByCpf.mockResolvedValueOnce(own).mockResolvedValueOnce(null);
    expect((await api.get(`/by-cpf/${CPF}`, { as: 'seller' })).body.id).toBe(ID);
    expect((await api.get(`/by-cpf/${CPF}`, { as: 'seller' })).status).toBe(404);

    payments.getPayments.mockResolvedValue({ payments: [] });
    await api.get(`/${ID}/payments`, { as: 'admin' });
    expect(payments.getPayments).toHaveBeenCalledWith({ memberId: ID, limit: 50 });

    queryMock.mockResolvedValueOnce({ rows: [{ id: 's1' }] }).mockResolvedValueOnce({ rows: [] });
    expect((await api.get(`/${ID}/subscription`, { as: 'admin' })).body).toEqual({ id: 's1' });
    expect((await api.get(`/${ID}/subscription`, { as: 'admin' })).body).toBeNull();
    expect((await api.get(`/${ID}/subscription`, { as: 'member' })).status).toBe(403);
  });
});

describe('create and update', () => {
  const body = { cpf: CPF, fullName: 'Laura Silva', email: 'laura@example.com' };

  it('binds a self-registration to the member, and a staff one to a new login', async () => {
    members.createMember.mockResolvedValue(own);
    expect((await api.post('/', { as: 'member', body })).status).toBe(201);
    expect(members.createMember).toHaveBeenCalledWith('user-member', expect.objectContaining({ plan: 'club', paymentType: 'annual' }));

    members.createMemberByStaff.mockResolvedValue(own);
    expect((await api.post('/', { as: 'admin', body })).status).toBe(201);
    expect(members.createMemberByStaff).toHaveBeenCalledWith(expect.any(Object), 'user-admin');

    expect((await api.post('/', { as: 'member', body: { ...body, cpf: '11111111111' } })).status).toBe(400);
  });

  it("lets a member edit only their own record, and refuses unknown fields", async () => {
    members.getMemberById.mockResolvedValue(someoneElse);
    expect((await api.patch(`/${ID}`, { as: 'member', body: { fullName: 'Hacker Name' } })).status).toBe(403);
    expect(members.updateMember).not.toHaveBeenCalled();

    members.getMemberById.mockResolvedValue(own);
    members.updateMember.mockResolvedValue({ ...own, phone: '21999999999' });
    expect((await api.patch(`/${ID}`, { as: 'member', body: { phone: '21999999999' } })).status).toBe(200);
    expect(members.updateMember).toHaveBeenCalledWith(ID, { phone: '21999999999' }, 'member', 'user-member');

    // `.strict()`: a role or user id smuggled in the body is a 400.
    expect((await api.patch(`/${ID}`, { as: 'member', body: { role: 'admin' } })).status).toBe(400);

    members.getMemberById.mockResolvedValue(null);
    expect((await api.patch(`/${ID}`, { as: 'admin', body: { status: 'active' } })).status).toBe(404);
  });
});
