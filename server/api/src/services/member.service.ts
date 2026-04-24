import pg from 'pg';
import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import { auditLog, diffObjects } from '../utils/audit.js';
import { sendTemplateEmail } from './email.service.js';
import type { Member } from '../types/index.js';

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
    points: row.points,
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
  sort?: 'created_at' | 'full_name' | 'expiry_date' | 'points';
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

  const sortColumn = ['created_at', 'full_name', 'expiry_date', 'points'].includes(opts.sort || '') ? opts.sort : 'created_at';
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

export async function createMember(
  userId: string,
  data: {
    cpf: string;
    fullName: string;
    email: string;
    phone?: string;
    plan: string;
    paymentType: string;
  }
): Promise<Member> {
  if (!userId || userId.trim() === '') {
    throw new AppError(400, 'userId é obrigatório');
  }

  // Check CPF uniqueness
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

  // Notify admin about new registration (non-blocking)
  if (env.ADMIN_EMAIL) {
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
        admin_url: `${env.FRONTEND_URL.replace('club.', 'admin.')}/admin?tab=members`,
      },
    }).catch((err) => console.error('[MEMBER] Admin notification error:', err));
  }

  return mapMemberRow(result.rows[0]);
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
  const adminFields = [
    'fullName', 'phone', 'photoUrl', 'plan', 'status', 'paymentType',
    'startDate', 'expiryDate', 'points', 'pendingPayment',
    'subscriptionId', 'subscriptionStatus', 'autoRenewal',
    'activatedAt', 'activatedByPayment',
  ];

  const allowedFields = userRole === 'member' ? memberAllowedFields : adminFields;

  // Convert camelCase to snake_case for SQL
  const fieldMap: Record<string, string> = {
    fullName: 'full_name',
    phone: 'phone',
    photoUrl: 'photo_url',
    plan: 'plan',
    status: 'status',
    paymentType: 'payment_type',
    startDate: 'start_date',
    expiryDate: 'expiry_date',
    points: 'points',
    pendingPayment: 'pending_payment',
    subscriptionId: 'subscription_id',
    subscriptionStatus: 'subscription_status',
    autoRenewal: 'auto_renewal',
    activatedAt: 'activated_at',
    activatedByPayment: 'activated_by_payment',
  };

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

  values.push(id);
  const result = await query(
    `UPDATE members SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'Membro não encontrado', 'MEMBER_NOT_FOUND');
  }

  const after = result.rows[0];

  // Audit log with diff (admin/seller actions only — member self-edits are not security-relevant)
  if (actorUserId && userRole !== 'member') {
    const diff = diffObjects(before, after);
    await auditLog('member.updated', actorUserId, { memberId: id, ...diff }, id);
  }

  return mapMemberRow(after);
}
