import pg from 'pg';
import { query } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { auditLog } from '../utils/audit.js';

/**
 * Perfil de cliente — existe para qualquer conta, com ou sem assinatura.
 *
 * Não confundir com `member.service`: `members` é o registro do clube (exige
 * CPF, tem plano e validade). Aqui é só quem a pessoa é, para quem compra na
 * loja sem assinar nada. Uma conta pode ter os dois, um, ou nenhum.
 */

export const GENDERS = [
  'feminino',
  'masculino',
  'nao_binario',
  'outro',
  'prefiro_nao_dizer',
] as const;

export type Gender = (typeof GENDERS)[number];

export interface ProfileAddress {
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface CustomerProfile {
  userId: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  birthDate: string | null;
  gender: Gender | null;
  photoUrl: string | null;
  address: ProfileAddress | null;
  marketingConsent: boolean;
  /** True quando a conta também é membro do clube — o painel muda com isso. */
  isMember: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

function mapProfile(row: pg.QueryResultRow): CustomerProfile {
  return {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name ?? null,
    phone: row.phone ?? null,
    // DATE volta como Date do pg; a SPA só quer YYYY-MM-DD.
    birthDate: row.birth_date ? toIsoDate(row.birth_date) : null,
    gender: (row.gender as Gender) ?? null,
    photoUrl: row.photo_url ?? null,
    address: (row.address as ProfileAddress) ?? null,
    marketingConsent: Boolean(row.marketing_consent),
    isMember: Boolean(row.is_member),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function toIsoDate(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/**
 * Lê o perfil da conta. Devolve um perfil vazio (não 404) quando a pessoa ainda
 * não preencheu nada: a conta existe desde o registro, o perfil é opcional.
 */
export async function getProfile(userId: string): Promise<CustomerProfile> {
  const result = await query(
    `SELECT u.id AS user_id, u.email, p.full_name, p.phone, p.birth_date, p.gender,
            p.photo_url, p.address, p.marketing_consent, p.created_at, p.updated_at,
            EXISTS (SELECT 1 FROM members m WHERE m.user_id = u.id) AS is_member
       FROM users u
       LEFT JOIN customer_profiles p ON p.user_id = u.id
      WHERE u.id = $1`,
    [userId]
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'Conta não encontrada.', 'USER_NOT_FOUND');
  }
  return mapProfile(result.rows[0]);
}

export interface UpdateProfileInput {
  fullName?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  gender?: Gender | null;
  address?: ProfileAddress | null;
  marketingConsent?: boolean;
}

/**
 * Cria ou atualiza o perfil.
 *
 * Só grava as chaves presentes no payload — `undefined` é "não mexe", `null` é
 * "apaga". A distinção importa porque a tela salva por seção: mandar o objeto
 * inteiro a cada PATCH apagaria campos que a pessoa nem viu.
 */
export async function upsertProfile(
  userId: string,
  input: UpdateProfileInput
): Promise<CustomerProfile> {
  const columns: Record<keyof UpdateProfileInput, string> = {
    fullName: 'full_name',
    phone: 'phone',
    birthDate: 'birth_date',
    gender: 'gender',
    address: 'address',
    marketingConsent: 'marketing_consent',
  };

  const provided = (Object.keys(columns) as (keyof UpdateProfileInput)[]).filter(
    (key) => input[key] !== undefined
  );

  if (provided.length === 0) {
    return getProfile(userId);
  }

  const cols = provided.map((key) => columns[key]);
  const values = provided.map((key) => {
    const value = input[key];
    // address é JSONB; os demais vão como texto/boolean/date direto.
    return key === 'address' && value != null ? JSON.stringify(value) : value;
  });

  const placeholders = cols.map((_, i) => `$${i + 2}`);
  const updates = cols.map((col, i) => `${col} = $${i + 2}`);

  await query(
    `INSERT INTO customer_profiles (user_id, ${cols.join(', ')})
     VALUES ($1, ${placeholders.join(', ')})
     ON CONFLICT (user_id) DO UPDATE SET ${updates.join(', ')}, updated_at = NOW()`,
    [userId, ...values]
  );

  // O audit registra **quais** campos mudaram, nunca os valores: são dados
  // pessoais e o log de auditoria é lido por admin.
  await auditLog('profile.updated', userId, { fields: provided });

  return getProfile(userId);
}

/** Grava a foto (ou remove, com null). Caminho separado por vir de upload. */
export async function setProfilePhoto(
  userId: string,
  photoUrl: string | null
): Promise<CustomerProfile> {
  await query(
    `INSERT INTO customer_profiles (user_id, photo_url)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET photo_url = $2, updated_at = NOW()`,
    [userId, photoUrl]
  );
  await auditLog(photoUrl ? 'profile.photo_set' : 'profile.photo_removed', userId, {});
  return getProfile(userId);
}

// ─── Produtos salvos ─────────────────────────────────────────────────────────

export interface SavedProduct {
  productId: string;
  name: string;
  slug: string;
  price: number;
  imageUrl: string | null;
  active: boolean;
  stock: number;
  savedAt: string;
}

/** Lista os salvos com o preço e estoque **atuais**, não os de quando salvou. */
export async function listSavedProducts(userId: string): Promise<SavedProduct[]> {
  const result = await query(
    `SELECT s.product_id, s.created_at AS saved_at,
            p.name, p.slug, p.price, p.active, p.stock, p.images
       FROM saved_products s
       JOIN products p ON p.id = s.product_id
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC`,
    [userId]
  );
  return result.rows.map((row) => ({
    productId: row.product_id,
    name: row.name,
    slug: row.slug,
    price: parseFloat(row.price),
    imageUrl: Array.isArray(row.images) && row.images.length > 0 ? row.images[0] : null,
    active: Boolean(row.active),
    stock: Number(row.stock),
    savedAt: row.saved_at,
  }));
}

/** Salva um produto. Idempotente: salvar de novo não duplica nem falha. */
export async function saveProduct(userId: string, productId: string): Promise<void> {
  const product = await query(`SELECT id FROM products WHERE id = $1`, [productId]);
  if (product.rows.length === 0) {
    throw new AppError(404, 'Produto não encontrado.', 'PRODUCT_NOT_FOUND');
  }
  await query(
    `INSERT INTO saved_products (user_id, product_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, product_id) DO NOTHING`,
    [userId, productId]
  );
}

/** Remove dos salvos. Idempotente: remover o que não está salvo é no-op. */
export async function unsaveProduct(userId: string, productId: string): Promise<void> {
  await query(`DELETE FROM saved_products WHERE user_id = $1 AND product_id = $2`, [
    userId,
    productId,
  ]);
}

/** IDs salvos — usado pelo catálogo para pintar o coração sem N consultas. */
export async function listSavedProductIds(userId: string): Promise<string[]> {
  const result = await query(`SELECT product_id FROM saved_products WHERE user_id = $1`, [
    userId,
  ]);
  return result.rows.map((row) => row.product_id as string);
}
