import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { query, getClient } from '../config/database.js';
import { env, adminUrl } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import { auditLog, diffObjects } from '../utils/audit.js';
import { sendTemplateEmail } from './email.service.js';
import type { Member } from '../types/index.js';

const BCRYPT_ROUNDS = 12;

function mapMemberRow(row: pg.QueryResultRow): Member {
  return {
    id: row.id,
    userId: row.user_id,
    cpf: row.cpf,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    photoUrl: row.photo_url,
    plan: row.plan,
    status: row.status,
    paymentType: row.payment_type,
    startDate: row.start_date,
    expiryDate: row.expiry_date,
    pendingPayment: row.pending_payment,
    subscriptionId: row.subscription_id,
    subscriptionStatus: row.subscription_status,
    autoRenewal: row.auto_renewal,
    activatedAt: row.activated_at,
    activatedByPayment: row.activated_by_payment,
    paymentCount: row.payment_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listMembers(opts: {
  status?: string;
  plan?: string;
  paymentType?: string;
  search?: string;
  page: number;
  limit: number;
  sort?: 'created_at' | 'full_name' | 'expiry_date';
  order?: 'asc' | 'desc';
}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (opts.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(opts.status);
  }
  if (opts.plan) {
    conditions.push(`plan = $${paramIndex++}`);
    params.push(opts.plan);
  }
  if (opts.paymentType) {
    conditions.push(`payment_type = $${paramIndex++}`);
    params.push(opts.paymentType);
  }
  if (opts.search && opts.search.trim()) {
    const term = `%${opts.search.trim()}%`;
    conditions.push(`(full_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR cpf LIKE $${paramIndex})`);
    params.push(term);
    paramIndex++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(opts.limit || 50, 100));
  const page = Math.max(1, opts.page || 1);
  const offset = (page - 1) * limit;

  const sortColumn = ['created_at', 'full_name', 'expiry_date'].includes(opts.sort || '') ? opts.sort : 'created_at';
  const sortOrder = opts.order === 'asc' ? 'ASC' : 'DESC';

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT * FROM members ${where} ORDER BY ${sortColumn} ${sortOrder} LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*)::int as total FROM members ${where}`, params),
  ]);

  return {
    members: dataResult.rows.map(mapMemberRow),
    total: countResult.rows[0].total,
    page,
    limit,
  };
}

export async function getMemberByUserId(userId: string): Promise<Member | null> {
  const result = await query('SELECT * FROM members WHERE user_id = $1', [userId]);
  return result.rows.length > 0 ? mapMemberRow(result.rows[0]) : null;
}

export async function getMemberById(id: string): Promise<Member | null> {
  const result = await query('SELECT * FROM members WHERE id = $1', [id]);
  return result.rows.length > 0 ? mapMemberRow(result.rows[0]) : null;
}

export async function getMemberByCpf(cpf: string): Promise<Member | null> {
  const result = await query('SELECT * FROM members WHERE cpf = $1', [cpf]);
  return result.rows.length > 0 ? mapMemberRow(result.rows[0]) : null;
}

export async function getMembersCount(): Promise<number> {
  const result = await query('SELECT COUNT(*)::int as count FROM members');
  return result.rows[0].count;
}

type CreateMemberData = {
  cpf: string;
  fullName: string;
  email: string;
  phone?: string;
  plan: string;
  paymentType: string;
};

function notifyAdminNewMember(data: CreateMemberData): void {
  if (!env.ADMIN_EMAIL) return;
  const paymentLabel = data.paymentType === 'monthly' ? 'Mensal' : 'Anual';
  sendTemplateEmail({
    template: 'admin-new-member',
    to: env.ADMIN_EMAIL,
    variables: {
      member_name: data.fullName,
      member_email: data.email,
      member_cpf: data.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
      member_phone: data.phone || '—',
      plan: data.plan,
      payment_type: paymentLabel,
      admin_url: adminUrl('/admin?tab=members'),
    },
  }).catch((err) => console.error('[MEMBER] Admin notification error:', err));
}

/** Self-service: member creates their own profile bound to their JWT user. */
export async function createMember(userId: string, data: CreateMemberData): Promise<Member> {
  if (!userId || userId.trim() === '') {
    throw new AppError(400, 'userId é obrigatório');
  }

  const existing = await query('SELECT id FROM members WHERE cpf = $1', [data.cpf]);
  if (existing.rows.length > 0) {
    throw new AppError(409, 'CPF já cadastrado');
  }

  const result = await query(
    `INSERT INTO members (user_id, cpf, full_name, email, phone, plan, payment_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, data.cpf, data.fullName, data.email, data.phone || null, data.plan, data.paymentType]
  );

  notifyAdminNewMember(data);
  return mapMemberRow(result.rows[0]);
}

/**
 * Admin/seller creates a third-party member.
 * Creates (or reuses) a user for the email — never binds to the staff JWT user_id.
 * Password is a random secret; member must use "esqueci a senha" to access the portal.
 */
export async function createMemberByStaff(
  data: CreateMemberData,
  actorUserId: string
): Promise<Member> {
  const email = data.email.toLowerCase().trim();
  const cpf = data.cpf.replace(/\D/g, '');

  const existingCpf = await query('SELECT id FROM members WHERE cpf = $1', [cpf]);
  if (existingCpf.rows.length > 0) {
    throw new AppError(409, 'CPF já cadastrado', 'CPF_EXISTS');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    let userId: string;
    const existingUser = await client.query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (existingUser.rows[0]) {
      userId = existingUser.rows[0].id as string;
      const linked = await client.query(`SELECT id FROM members WHERE user_id = $1`, [userId]);
      if (linked.rows.length > 0) {
        throw new AppError(409, 'Este e-mail já possui membro vinculado.', 'EMAIL_HAS_MEMBER');
      }
    } else {
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
      const inserted = await client.query(
        `INSERT INTO users (email, password_hash, role, email_verified)
         VALUES ($1, $2, 'member', TRUE)
         RETURNING id`,
        [email, passwordHash]
      );
      userId = inserted.rows[0].id as string;
    }

    const result = await client.query(
      `INSERT INTO members (user_id, cpf, full_name, email, phone, plan, payment_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, cpf, data.fullName, email, data.phone || null, data.plan, data.paymentType]
    );

    await client.query('COMMIT');
    await auditLog('member.created_by_staff', actorUserId, {
      memberId: result.rows[0].id,
      email,
      cpf,
    });
    notifyAdminNewMember({ ...data, email, cpf });
    return mapMemberRow(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function updateMember(
  id: string,
  data: Record<string, unknown>,
  userRole: string,
  actorUserId?: string
): Promise<Member> {
  // Members can only update self-editable profile fields.
  // pendingPayment is allowed for members (used by payment flow to track in-progress checkout).
  const memberAllowedFields = ['fullName', 'phone', 'photoUrl', 'pendingPayment'];
  const staffFields = [
    'fullName', 'phone', 'photoUrl', 'plan', 'status', 'paymentType',
    'startDate', 'expiryDate', 'pendingPayment',
    'subscriptionId', 'subscriptionStatus', 'autoRenewal',
    'activatedAt', 'activatedByPayment',
  ];
  /**
   * Email and CPF are admin-only, not even the PDV seller.
   *
   * Email is the login: changing it and then asking for a password reset is a
   * full account takeover. Members change their own email through
   * /auth/update-profile, which requires the current password and revalidates.
   */
  const adminOnlyIdentityFields = ['email', 'cpf'];

  const allowedFields =
    userRole === 'member'
      ? memberAllowedFields
      : userRole === 'admin'
        ? [...staffFields, ...adminOnlyIdentityFields]
        : staffFields;

  // Convert camelCase to snake_case for SQL
  const fieldMap: Record<string, string> = {
    fullName: 'full_name',
    email: 'email',
    cpf: 'cpf',
    phone: 'phone',
    photoUrl: 'photo_url',
    plan: 'plan',
    status: 'status',
    paymentType: 'payment_type',
    startDate: 'start_date',
    expiryDate: 'expiry_date',
    pendingPayment: 'pending_payment',
    subscriptionId: 'subscription_id',
    subscriptionStatus: 'subscription_status',
    autoRenewal: 'auto_renewal',
    activatedAt: 'activated_at',
    activatedByPayment: 'activated_by_payment',
  };

  // Normalize here so members and users cannot end up with two spellings of
  // the same login address.
  if (typeof data.email === 'string') {
    data = { ...data, email: data.email.toLowerCase().trim() };
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && fieldMap[key]) {
      setClauses.push(`${fieldMap[key]} = $${paramIndex++}`);
      values.push(key === 'pendingPayment' ? JSON.stringify(value) : value);
    }
  }

  if (setClauses.length === 0) {
    throw new AppError(400, 'Nenhum campo válido para atualizar', 'NO_VALID_FIELDS');
  }

  // Snapshot before update for audit diff
  const beforeRow = await query('SELECT * FROM members WHERE id = $1', [id]);
  if (beforeRow.rowCount === 0) {
    throw new AppError(404, 'Membro não encontrado', 'MEMBER_NOT_FOUND');
  }
  const before = beforeRow.rows[0];

  // Admin sets status=active without expiry → fill a monthly window so PDV/shop discount work.
  if (
    userRole !== 'member' &&
    data.status === 'active' &&
    data.expiryDate == null &&
    !before.expiry_date
  ) {
    const start = new Date();
    const expiry = new Date(start);
    expiry.setMonth(expiry.getMonth() + 1);
    if (data.startDate == null && !before.start_date) {
      setClauses.push(`start_date = $${paramIndex++}`);
      values.push(start.toISOString().slice(0, 10));
    }
    setClauses.push(`expiry_date = $${paramIndex++}`);
    values.push(expiry.toISOString().slice(0, 10));
    if (data.activatedAt == null && !before.activated_at) {
      setClauses.push(`activated_at = $${paramIndex++}`);
      values.push(start.toISOString());
    }
    if (data.activatedByPayment == null && !before.activated_by_payment) {
      setClauses.push(`activated_by_payment = $${paramIndex++}`);
      values.push('admin_manual');
    }
  }

  // Both are unique and email is the login, so collisions are checked before
  // writing members and users together. Only fields the role allowlist let
  // through count: a member's `email` was already dropped from the UPDATE.
  const newEmail =
    allowedFields.includes('email') && typeof data.email === 'string' ? data.email : null;
  const newCpf =
    allowedFields.includes('cpf') && typeof data.cpf === 'string' ? data.cpf : null;
  const emailChanged = newEmail != null && newEmail !== before.email;
  const cpfChanged = newCpf != null && newCpf !== before.cpf;

  if (emailChanged) {
    const taken = await query(
      `SELECT 1 FROM users WHERE email = $1 AND id <> $2
       UNION ALL
       SELECT 1 FROM members WHERE email = $1 AND id <> $3
       LIMIT 1`,
      [newEmail, before.user_id, id]
    );
    if (taken.rowCount) {
      throw new AppError(409, 'Este e-mail já está em uso por outra conta.', 'EMAIL_IN_USE');
    }
  }
  if (cpfChanged) {
    const taken = await query(`SELECT 1 FROM members WHERE cpf = $1 AND id <> $2 LIMIT 1`, [
      newCpf,
      id,
    ]);
    if (taken.rowCount) {
      throw new AppError(409, 'Este CPF já está cadastrado em outro membro.', 'CPF_IN_USE');
    }
  }

  values.push(id);
  let after: pg.QueryResultRow;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE members SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    if (result.rowCount === 0) {
      throw new AppError(404, 'Membro não encontrado', 'MEMBER_NOT_FOUND');
    }
    after = result.rows[0];

    // users.email is what login reads; updating only members would lock the
    // account out. The new address needs verifying again.
    if (emailChanged && before.user_id) {
      await client.query(
        `UPDATE users SET email = $1, email_verified = FALSE WHERE id = $2`,
        [newEmail, before.user_id]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Audit log with diff (admin/seller actions only — member self-edits are not security-relevant)
  if (actorUserId && userRole !== 'member') {
    const diff = diffObjects(before, after);
    await auditLog('member.updated', actorUserId, { memberId: id, ...diff }, id);
  }

  return mapMemberRow(after);
}
