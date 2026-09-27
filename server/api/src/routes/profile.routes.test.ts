import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Profile routes over real HTTP.
 *
 * Every route acts on the caller's own account (`req.user.userId`) — there is
 * no id to swap. These pin that, the validation of the personal data (a
 * birthday cannot be in the future, a CEP has its shape) and that saved
 * products are idempotent.
 */

vi.mock('../config/env.js', async () => (await import('../test-support/env.js')).envModule);
vi.mock('../middleware/rate-limit.js', async () => (await import('../test-support/env.js')).rateLimitModule);
vi.mock('../services/log.service.js', () => ({ createErrorLog: vi.fn(async () => {}) }));

const profile = vi.hoisted(() => ({
  getProfile: vi.fn(),
  upsertProfile: vi.fn(),
  setProfilePhoto: vi.fn(),
  listSavedProducts: vi.fn(),
  listSavedProductIds: vi.fn(),
  saveProduct: vi.fn(),
  unsaveProduct: vi.fn(),
}));
vi.mock('../services/profile.service.js', async () => {
  const actual = await vi.importActual<typeof import('../services/profile.service.js')>('../services/profile.service.js');
  return { ...profile, GENDERS: actual.GENDERS };
});
vi.mock('../config/database.js', () => ({ query: vi.fn() }));

import { profileRouter } from './profile.routes.js';
import { routerClient } from '../test-support/http.js';

const api = routerClient('/profile', profileRouter);
const PRODUCT = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

beforeEach(() => vi.clearAllMocks());

describe('profile', () => {
  it('needs a login', async () => {
    expect((await api.get('/')).status).toBe(401);
    expect((await api.get('/saved')).status).toBe(401);
  });

  it("reads and writes the caller's own profile", async () => {
    profile.getProfile.mockResolvedValue({ fullName: 'Laura' });
    expect((await api.get('/', { as: 'member' })).body).toEqual({ fullName: 'Laura' });
    expect(profile.getProfile).toHaveBeenCalledWith('user-member');

    profile.upsertProfile.mockResolvedValue({ ok: true });
    const body = {
      phone: '(21) 99999-9999',
      birthDate: '2008-05-10',
      gender: 'feminino',
      address: { cep: '22041-001', street: 'Rua X', number: '10', neighborhood: 'Copacabana', city: 'Rio', state: 'RJ' },
      marketingConsent: true,
    };
    expect((await api.patch('/', { as: 'member', body })).status).toBe(200);
    expect(profile.upsertProfile).toHaveBeenCalledWith('user-member', body);
  });

  it('refuses personal data out of shape', async () => {
    const future = new Date(Date.now() + 86_400_000 * 30).toISOString().slice(0, 10);
    for (const body of [
      { birthDate: future },
      { birthDate: '1800-01-01' },
      { birthDate: '10/05/2008' },
      { phone: 'abc' },
      { gender: 'robot' },
      { address: { cep: '123', street: 'x', number: '1', neighborhood: 'x', city: 'x', state: 'RJ' } },
    ]) {
      expect((await api.patch('/', { as: 'member', body })).status, JSON.stringify(body)).toBe(400);
    }
    expect(profile.upsertProfile).not.toHaveBeenCalled();
  });

  it('removes the photo, and refuses an upload that is not an image', async () => {
    profile.setProfilePhoto.mockResolvedValue({ photoUrl: null });
    expect((await api.delete('/photo', { as: 'member' })).body).toEqual({ photoUrl: null });
    expect(profile.setProfilePhoto).toHaveBeenCalledWith('user-member', null);

    const form = new FormData();
    form.append('photo', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'doc.pdf');
    const res = await api.post('/photo', { as: 'member', form });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_IMAGE');
  });
});

describe('saved products', () => {
  it('lists, saves and unsaves for the caller', async () => {
    profile.listSavedProducts.mockResolvedValue([{ id: PRODUCT }]);
    profile.listSavedProductIds.mockResolvedValue([PRODUCT]);
    expect((await api.get('/saved', { as: 'member' })).body).toEqual([{ id: PRODUCT }]);
    expect((await api.get('/saved/ids', { as: 'member' })).body).toEqual([PRODUCT]);

    expect((await api.put(`/saved/${PRODUCT}`, { as: 'member' })).status).toBe(204);
    expect(profile.saveProduct).toHaveBeenCalledWith('user-member', PRODUCT);
    expect((await api.delete(`/saved/${PRODUCT}`, { as: 'member' })).status).toBe(204);
    expect(profile.unsaveProduct).toHaveBeenCalledWith('user-member', PRODUCT);
  });

  it('passes service errors through', async () => {
    profile.saveProduct.mockRejectedValue(new Error('db down'));
    expect((await api.put(`/saved/${PRODUCT}`, { as: 'member' })).status).toBe(500);
  });
});
