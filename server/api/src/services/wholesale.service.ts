import pg from 'pg';
import bcrypt from 'bcrypt';
import { query } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';
import { isValidCnpj, normalizeCnpj } from '../utils/cnpj.js';
import { auditLog } from '../utils/audit.js';
import { openRefreshSession, ACCESS_TOKEN_EXPIRY } from './auth.service.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { getSetting } from './settings.service.js';

export type WholesaleStatus = 'pending' | 'approved' | 'rejected' | 'disabled';

export interface WholesaleAccount {
  id: string;
  userId: string;
  cnpj: string;
  companyName: string;
  tradeName: string | null;
  stateRegistration: string | null;
  phone: string | null;
  contactName: string;
  businessActivity: string | null;
  status: WholesaleStatus;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  adminNotes: string | null;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

const BCRYPT_ROUNDS = 12;

function mapAccount(row: pg.QueryResultRow): WholesaleAccount {
  return {
    id: row.id,
    userId: row.user_id,
    cnpj: row.cnpj,
    companyName: row.company_name,
    tradeName: row.trade_name ?? null,
    stateRegistration: row.state_registration ?? null,
    phone: row.phone ?? null,
    contactName: row.contact_name,
    businessActivity: row.business_activity ?? null,
    status: row.status,
    rejectionReason: row.rejection_reason ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    adminNotes: row.admin_notes ?? null,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateTokens(user: { id: string; email: string; role: string }) {
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
  const refreshToken = crypto.randomBytes(64).toString('hex');
  return { accessToken, refreshToken };
}

/** Returns the wholesale account for a user, or null. */
export async function getAccountByUserId(userId: string): Promise<WholesaleAccount | null> {
  const result = await query(
    `SELECT w.*, u.email
     FROM wholesale_accounts w
     JOIN users u ON u.id = w.user_id
     WHERE w.user_id = $1`,
    [userId]
  );
  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

/** Approved account only — used at checkout. */
export async function getApprovedAccountByUserId(userId: string): Promise<WholesaleAccount | null> {
  const acc = await getAccountByUserId(userId);
  if (!acc || acc.status !== 'approved') return null;
  return acc;
}

/**
 * Register a new wholesale account.
 * Creates user (role member) if email is new; or attaches to existing user when password matches.
 * Always requires a valid CNPJ that is not already registered.
 */
export async function registerWholesale(data: {
  email: string;
  password: string;
  cnpj: string;
  companyName: string;
  tradeName?: string;
  stateRegistration?: string;
  phone?: string;
  contactName: string;
  businessActivity?: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ account: WholesaleAccount; accessToken: string; refreshToken: string }> {
  const email = data.email.toLowerCase().trim();
  const cnpj = normalizeCnpj(data.cnpj);

  if (!isValidCnpj(cnpj)) {
    throw new AppError(400, 'CNPJ inválido. Verifique os dígitos.', 'INVALID_CNPJ');
  }
  if (!data.companyName?.trim()) {
    throw new AppError(400, 'Razão social é obrigatória.', 'COMPANY_NAME_REQUIRED');
  }
  if (!data.contactName?.trim()) {
    throw new AppError(400, 'Nome do responsável é obrigatório.', 'CONTACT_NAME_REQUIRED');
  }
  if (!data.password || data.password.length < 8) {
    throw new AppError(400, 'Senha deve ter no mínimo 8 caracteres.', 'WEAK_PASSWORD');
  }

  const existingCnpj = await query(`SELECT id FROM wholesale_accounts WHERE cnpj = $1`, [cnpj]);
  if (existingCnpj.rows.length > 0) {
    throw new AppError(409, 'Este CNPJ já está cadastrado no atacado.', 'CNPJ_ALREADY_EXISTS');
  }

  let userId: string;
  let userEmail: string;
  let userRole: string;

  const existingUser = await query(
    `SELECT id, email, role, password_hash FROM users WHERE email = $1`,
    [email]
  );

  if (existingUser.rows.length > 0) {
    const u = existingUser.rows[0];
    if (u.role === 'disabled') {
      throw new AppError(403, 'Conta desativada.', 'ACCOUNT_DISABLED');
    }
    const ok = await bcrypt.compare(data.password, u.password_hash);
    if (!ok) {
      throw new AppError(401, 'E-mail já cadastrado. Use a senha correta ou recupere a senha.', 'INVALID_CREDENTIALS');
    }
    const already = await getAccountByUserId(u.id);
    if (already) {
      throw new AppError(409, 'Esta conta já possui cadastro de atacado.', 'WHOLESALE_ALREADY_EXISTS');
    }
    userId = u.id;
    userEmail = u.email;
    userRole = u.role;
  } else {
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const created = await query(
      `INSERT INTO users (email, password_hash, role, email_verified)
       VALUES ($1, $2, 'member', FALSE)
       RETURNING id, email, role`,
      [email, passwordHash]
    );
    userId = created.rows[0].id;
    userEmail = created.rows[0].email;
    userRole = created.rows[0].role;
  }

  const result = await query(
    `INSERT INTO wholesale_accounts (
       user_id, cnpj, company_name, trade_name, state_registration,
       phone, contact_name, business_activity, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
     RETURNING *`,
    [
      userId,
      cnpj,
      data.companyName.trim(),
      data.tradeName?.trim() || null,
      data.stateRegistration?.trim() || null,
      data.phone?.trim() || null,
      data.contactName.trim(),
      data.businessActivity?.trim() || null,
    ]
  );

  const account = mapAccount({ ...result.rows[0], email: userEmail });
  const { accessToken, refreshToken } = generateTokens({ id: userId, email: userEmail, role: userRole });
  await openRefreshSession(userId, refreshToken, data.userAgent);

  await auditLog('wholesale.register', userId, {
    cnpj,
    companyName: account.companyName,
    ip: data.ip || null,
  });

  return { account, accessToken, refreshToken };
}

/**
 * Wholesale login: email + password + CNPJ must match the registered account.
 */
export async function loginWholesale(data: {
  email: string;
  password: string;
  cnpj: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ account: WholesaleAccount; accessToken: string; refreshToken: string }> {
  const email = data.email.toLowerCase().trim();
  const cnpj = normalizeCnpj(data.cnpj);

  if (!isValidCnpj(cnpj)) {
    throw new AppError(400, 'CNPJ inválido.', 'INVALID_CNPJ');
  }

  const userResult = await query(
    `SELECT id, email, role, password_hash FROM users WHERE email = $1`,
    [email]
  );
  if (userResult.rows.length === 0) {
    throw new AppError(401, 'E-mail, senha ou CNPJ incorretos.', 'INVALID_CREDENTIALS');
  }
  const user = userResult.rows[0];
  if (user.role === 'disabled') {
    throw new AppError(403, 'Conta desativada.', 'ACCOUNT_DISABLED');
  }
  const ok = await bcrypt.compare(data.password, user.password_hash);
  if (!ok) {
    throw new AppError(401, 'E-mail, senha ou CNPJ incorretos.', 'INVALID_CREDENTIALS');
  }

  const accResult = await query(
    `SELECT w.*, u.email
     FROM wholesale_accounts w
     JOIN users u ON u.id = w.user_id
     WHERE w.user_id = $1`,
    [user.id]
  );
  if (accResult.rows.length === 0) {
    throw new AppError(
      403,
      'Esta conta não tem cadastro de atacado. Solicite o acesso em /atacado/cadastro.',
      'NOT_WHOLESALE'
    );
  }
  const account = mapAccount(accResult.rows[0]);
  if (account.cnpj !== cnpj) {
    throw new AppError(401, 'CNPJ não confere com o cadastro de atacado.', 'CNPJ_MISMATCH');
  }
  if (account.status === 'disabled') {
    throw new AppError(403, 'Conta atacadista desativada. Fale com a loja.', 'WHOLESALE_DISABLED');
  }
  if (account.status === 'rejected') {
    throw new AppError(
      403,
      account.rejectionReason
        ? `Cadastro recusado: ${account.rejectionReason}`
        : 'Cadastro de atacado recusado. Fale com a loja.',
      'WHOLESALE_REJECTED'
    );
  }

  const { accessToken, refreshToken } = generateTokens({
    id: user.id,
    email: user.email,
    role: user.role,
  });
  await openRefreshSession(user.id, refreshToken, data.userAgent);

  await auditLog('wholesale.login', user.id, { cnpj, status: account.status, ip: data.ip || null });

  return { account, accessToken, refreshToken };
}

export async function listAccounts(opts: {
  status?: WholesaleStatus;
  page?: number;
  limit?: number;
}): Promise<{ accounts: WholesaleAccount[]; total: number; page: number; limit: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (opts.status) {
    conditions.push(`w.status = $${i++}`);
    params.push(opts.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.max(1, Math.min(opts.limit || 50, 100));
  const page = Math.max(1, opts.page || 1);
  const offset = (page - 1) * limit;

  const [data, count] = await Promise.all([
    query(
      `SELECT w.*, u.email
       FROM wholesale_accounts w
       JOIN users u ON u.id = w.user_id
       ${where}
       ORDER BY
         CASE w.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
         w.created_at DESC
       LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM wholesale_accounts w ${where}`,
      params
    ),
  ]);

  return {
    accounts: data.rows.map(mapAccount),
    total: count.rows[0].total as number,
    page,
    limit,
  };
}

export async function reviewAccount(
  id: string,
  action: 'approve' | 'reject' | 'disable',
  adminUserId: string,
  opts?: { rejectionReason?: string; adminNotes?: string }
): Promise<WholesaleAccount> {
  const statusMap = {
    approve: 'approved',
    reject: 'rejected',
    disable: 'disabled',
  } as const;
  const status = statusMap[action];

  if (action === 'reject' && !opts?.rejectionReason?.trim()) {
    throw new AppError(400, 'Informe o motivo da recusa.', 'REJECTION_REASON_REQUIRED');
  }

  const result = await query(
    `UPDATE wholesale_accounts
     SET status = $1,
         rejection_reason = $2,
         admin_notes = COALESCE($3, admin_notes),
         reviewed_by = $4,
         reviewed_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [
      status,
      action === 'reject' ? opts?.rejectionReason?.trim() : null,
      opts?.adminNotes?.trim() || null,
      adminUserId,
      id,
    ]
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'Conta atacadista não encontrada.', 'WHOLESALE_NOT_FOUND');
  }

  const emailRow = await query(`SELECT email FROM users WHERE id = $1`, [result.rows[0].user_id]);
  const account = mapAccount({ ...result.rows[0], email: emailRow.rows[0]?.email });

  await auditLog(`wholesale.${action}`, adminUserId, {
    accountId: id,
    cnpj: account.cnpj,
    status,
  });

  return account;
}

/**
 * Is the wholesale channel actually selling?
 *
 * Registration/approval stay open regardless — the CNPJ list is what we want while we are not
 * selling B2B yet. Only order creation is gated (see `createOrder`), and the storefront reads
 * this through `GET /wholesale/status` to show the "we'll tell you when we open" notice.
 */
export async function isWholesaleSalesOpen(): Promise<boolean> {
  return (await getSetting<boolean>('wholesale.sales_open')) === true;
}
