import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Perfil de cliente — o cadastro de quem compra na loja **sem** assinar o clube.
 *
 * O que estes testes protegem:
 *
 *  1. PATCH parcial: `undefined` não mexe no campo, `null` apaga. Mandar o
 *     objeto inteiro a cada salvamento apagaria o que a pessoa nem abriu.
 *  2. Conta sem perfil devolve perfil vazio, não 404 — o perfil é opcional.
 *  3. O audit registra **quais** campos mudaram, nunca os valores: nascimento,
 *     gênero e endereço são dado pessoal e o log é lido por admin.
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

/** Linha do JOIN users+customer_profiles; `over` sobrescreve o que interessa. */
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

/** Captura o INSERT ... ON CONFLICT emitido pelo upsert. */
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
  it('devolve perfil vazio quando a conta nunca preencheu nada', async () => {
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

  it('normaliza a data de nascimento para YYYY-MM-DD', async () => {
    const profile = await getProfile('u1');
    // O driver devolve Date; fuso não pode empurrar o aniversário um dia.
    expect(profile.birthDate).toBe('1998-03-14');
  });

  it('marca isMember quando a conta também assina o clube', async () => {
    queryMock.mockResolvedValue({ rows: [profileRow({ is_member: true })] });
    expect((await getProfile('u1')).isMember).toBe(true);
  });

  it('404 quando a conta não existe', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(getProfile('nope')).rejects.toBeInstanceOf(AppError);
  });
});

describe('upsertProfile — atualização parcial', () => {
  it('grava só os campos enviados, sem tocar nos demais', async () => {
    await upsertProfile('u1', { phone: '21988887777' });

    const [sql, params] = upsertCall();
    expect(sql).toContain('phone');
    expect(sql).not.toContain('birth_date');
    expect(sql).not.toContain('gender');
    expect(params).toEqual(['u1', '21988887777']);
  });

  it('trata null como "apagar o campo"', async () => {
    await upsertProfile('u1', { gender: null });

    const [sql, params] = upsertCall();
    expect(sql).toContain('gender');
    expect(params).toEqual(['u1', null]);
  });

  it('não emite escrita quando o payload vem vazio', async () => {
    await upsertProfile('u1', {});

    expect(
      queryMock.mock.calls.some(
        (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO customer_profiles')
      )
    ).toBe(false);
  });

  it('serializa o endereço como JSON para a coluna JSONB', async () => {
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

  it('apaga o endereço com null sem passar pelo JSON.stringify', async () => {
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

    // Nenhum valor pessoal pode ter vazado para o log.
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

  it('remove a foto com null e registra a remoção', async () => {
    await setProfilePhoto('u1', null);
    expect(upsertCall()[1][1]).toBeNull();
    expect(auditMock).toHaveBeenCalledWith('profile.photo_removed', 'u1', {});
  });
});

describe('produtos salvos', () => {
  it('lista com preço e estoque atuais, não os de quando salvou', async () => {
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

  it('salvar é idempotente — ON CONFLICT DO NOTHING', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 'p1' }] });

    await saveProduct('u1', 'p1');

    const insert = queryMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO saved_products')
    );
    expect(insert![0]).toContain('ON CONFLICT (user_id, product_id) DO NOTHING');
  });

  it('recusa salvar produto inexistente', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(saveProduct('u1', 'fantasma')).rejects.toBeInstanceOf(AppError);
  });

  it('remover é idempotente e escopado ao dono', async () => {
    await unsaveProduct('u1', 'p1');

    const del = queryMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('DELETE FROM saved_products')
    );
    // O user_id no WHERE é o que impede apagar o salvo de outra pessoa.
    expect(del![0]).toContain('user_id = $1');
    expect(del![1]).toEqual(['u1', 'p1']);
  });
});
