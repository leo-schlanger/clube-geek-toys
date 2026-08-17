import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Customer profile — the record for people who buy **without** subscribing.
 *
 *  1. Partial PATCH: `undefined` leaves a field alone, `null` clears it.
 *     Sending the whole object each save would wipe untouched fields.
 *  2. An account with no profile returns an empty one, not a 404.
 *  3. The audit logs **which** fields changed, never their values: birth date,
 *     gender and address are personal data and the log is read by admins.
 */

const { queryMock, auditMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({ query: queryMock, getClient: vi.fn() }));
vi.mock('../config/env.js', () => ({ env: { NODE_ENV: 'test' } }));
vi.mock('../utils/audit.js', () => ({ auditLog: auditMock }));

const {
  getProfile,
  upsertProfile,
  setProfilePhoto,
  listSavedProducts,
  saveProduct,
  unsaveProduct,
} = await import('./profile.service.js');
const { AppError } = await import('../middleware/error-handler.js');

/** A users+customer_profiles JOIN row; `over` overrides what matters. */
function profileRow(over: Record<string, unknown> = {}) {
  return {
    user_id: 'u1',
    email: 'laura@example.com',
    full_name: 'Laura',
    phone: '21999998888',
    birth_date: new Date('1998-03-14T00:00:00Z'),
    gender: 'feminino',
    photo_url: null,
    address: null,
    marketing_consent: false,
    is_member: false,
    created_at: '2026-08-16T00:00:00Z',
    updated_at: '2026-08-16T00:00:00Z',
    ...over,
  };
}

/** Captures the INSERT ... ON CONFLICT emitted by the upsert. */
function upsertCall(): [string, unknown[]] {
  const call = queryMock.mock.calls.find(
    (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO customer_profiles')
  );
  if (!call) throw new Error('nenhum upsert de customer_profiles foi emitido');
  return [call[0] as string, call[1] as unknown[]];
}

beforeEach(() => {
  vi.clearAllMocks();
  auditMock.mockResolvedValue(undefined);
  queryMock.mockResolvedValue({ rows: [profileRow()] });
});

describe('getProfile', () => {
  it('returns an empty profile when nothing was ever filled in', async () => {
    queryMock.mockResolvedValue({
      rows: [
        profileRow({
          full_name: null,
          phone: null,
          birth_date: null,
          gender: null,
          marketing_consent: null,
        }),
      ],
    });

    const profile = await getProfile('u1');

    expect(profile.email).toBe('laura@example.com');
    expect(profile.fullName).toBeNull();
    expect(profile.birthDate).toBeNull();
    expect(profile.marketingConsent).toBe(false);
  });

  it('normalises the birth date to YYYY-MM-DD', async () => {
    const profile = await getProfile('u1');
    // The driver returns a Date; a timezone must not shift the birthday.
    expect(profile.birthDate).toBe('1998-03-14');
  });

  it('flags isMember when the account also holds a membership', async () => {
    queryMock.mockResolvedValue({ rows: [profileRow({ is_member: true })] });
    expect((await getProfile('u1')).isMember).toBe(true);
  });

  it('404 when the account does not exist', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(getProfile('nope')).rejects.toBeInstanceOf(AppError);
  });
});

describe('upsertProfile — partial update', () => {
  it('writes only the fields sent, leaving the rest untouched', async () => {
    await upsertProfile('u1', { phone: '21988887777' });

    const [sql, params] = upsertCall();
    expect(sql).toContain('phone');
    expect(sql).not.toContain('birth_date');
    expect(sql).not.toContain('gender');
    expect(params).toEqual(['u1', '21988887777']);
  });

  it('treats null as clearing the field', async () => {
    await upsertProfile('u1', { gender: null });

    const [sql, params] = upsertCall();
    expect(sql).toContain('gender');
    expect(params).toEqual(['u1', null]);
  });

  it('emits no write when the payload is empty', async () => {
    await upsertProfile('u1', {});

    expect(
      queryMock.mock.calls.some(
        (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO customer_profiles')
      )
    ).toBe(false);
  });

  it('serialises the address as JSON for the JSONB column', async () => {
    const address = {
      cep: '22041-001',
      street: 'Av. Atlântica',
      number: '1702',
      neighborhood: 'Copacabana',
      city: 'Rio de Janeiro',
      state: 'RJ',
    };

    await upsertProfile('u1', { address });

    const [, params] = upsertCall();
    expect(params[1]).toBe(JSON.stringify(address));
  });

  it('clears the address with null, bypassing JSON.stringify', async () => {
    await upsertProfile('u1', { address: null });
    expect(upsertCall()[1]).toEqual(['u1', null]);
  });

  it('faz upsert de verdade: insere ou atualiza a linha existente', async () => {
    await upsertProfile('u1', { fullName: 'Laura' });
    const [sql] = upsertCall();
    expect(sql).toContain('ON CONFLICT (user_id) DO UPDATE');
    expect(sql).toContain('updated_at = NOW()');
  });
});

describe('upsertProfile — privacidade do audit', () => {
  it('registra os nomes dos campos, nunca os valores', async () => {
    await upsertProfile('u1', {
      birthDate: '1998-03-14',
      gender: 'feminino',
      phone: '21999998888',
    });

    expect(auditMock).toHaveBeenCalledWith(
      'profile.updated',
      'u1',
      { fields: ['phone', 'birthDate', 'gender'] }
    );

    // No personal value may have leaked into the log.
    const logged = JSON.stringify(auditMock.mock.calls);
    expect(logged).not.toContain('1998-03-14');
    expect(logged).not.toContain('21999998888');
  });
});

describe('foto de perfil', () => {
  it('grava a URL da foto', async () => {
    await setProfilePhoto('u1', 'https://api.test/uploads/profiles/x.jpg');
    const [sql, params] = upsertCall();
    expect(sql).toContain('photo_url');
    expect(params[1]).toBe('https://api.test/uploads/profiles/x.jpg');
    expect(auditMock).toHaveBeenCalledWith('profile.photo_set', 'u1', {});
  });

  it('removes the photo with null and audits the removal', async () => {
    await setProfilePhoto('u1', null);
    expect(upsertCall()[1][1]).toBeNull();
    expect(auditMock).toHaveBeenCalledWith('profile.photo_removed', 'u1', {});
  });
});

describe('produtos salvos', () => {
  it('lists current price and stock, not those at save time', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          product_id: 'p1',
          saved_at: '2026-08-16T00:00:00Z',
          name: 'Photocard BTS',
          slug: 'photocard-bts',
          price: '89.90',
          active: true,
          stock: 3,
          images: ['/uploads/a.jpg', '/uploads/b.jpg'],
        },
      ],
    });

    const saved = await listSavedProducts('u1');

    expect(saved).toEqual([
      {
        productId: 'p1',
        name: 'Photocard BTS',
        slug: 'photocard-bts',
        price: 89.9,
        imageUrl: '/uploads/a.jpg',
        active: true,
        stock: 3,
        savedAt: '2026-08-16T00:00:00Z',
      },
    ]);
  });

  it('aguenta produto sem foto', async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          product_id: 'p1',
          saved_at: '2026-08-16T00:00:00Z',
          name: 'X',
          slug: 'x',
          price: '10.00',
          active: true,
          stock: 0,
          images: [],
        },
      ],
    });
    expect((await listSavedProducts('u1'))[0].imageUrl).toBeNull();
  });

  it('saving is idempotent via ON CONFLICT DO NOTHING', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 'p1' }] });

    await saveProduct('u1', 'p1');

    const insert = queryMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO saved_products')
    );
    expect(insert![0]).toContain('ON CONFLICT (user_id, product_id) DO NOTHING');
  });

  it('refuses to save a product that does not exist', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(saveProduct('u1', 'fantasma')).rejects.toBeInstanceOf(AppError);
  });

  it('removing is idempotent and scoped to the owner', async () => {
    await unsaveProduct('u1', 'p1');

    const del = queryMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('DELETE FROM saved_products')
    );
    // The user_id in the WHERE is what prevents deleting someone else's save.
    expect(del![0]).toContain('user_id = $1');
    expect(del![1]).toEqual(['u1', 'p1']);
  });
});
