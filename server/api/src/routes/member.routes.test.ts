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
vi.mock('../services/log.service.js', () => ({ createErrorLog: vi.fn(async () => {}) }));

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
    expect((await api.get('/cpf-exists/529.982.247-25')).body).toEqual({ exists: true });
    expect((await api.get(`/cpf-exists/${CPF}`)).body).toEqual({ exists: false });
    expect((await api.get('/cpf-exists/11111111111')).status).toBe(400);
    expect((await api.get('/cpf-exists/123')).status).toBe(400);
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
