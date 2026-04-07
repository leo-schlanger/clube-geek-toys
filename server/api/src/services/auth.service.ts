import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import { createHmacToken, verifyHmacToken, hashSha256 } from '../utils/hmac.js';
import { sendTemplateEmail } from './email.service.js';
import crypto from 'crypto';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  email_verified: boolean;
  refresh_token_hash?: string;
  created_at?: string;
}

const BCRYPT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';

async function auditLog(action: string, userId: string | null, details: Record<string, unknown>) {
  try {
    await query(
      'INSERT INTO audit_logs (action, user_id, details) VALUES ($1, $2, $3)',
      [action, userId, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('[AUDIT] Failed to write audit log:', err);
  }
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

export async function register(data: { email: string; password: string; name?: string; ip?: string }) {
  // Check if email already exists
  const existing = await query('SELECT id FROM users WHERE email = $1', [data.email.toLowerCase()]);
  if (existing.rows.length > 0) {
    throw new AppError(409, 'Email já cadastrado');
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  const result = await query<UserRow>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'member')
     RETURNING id, email, role, email_verified, created_at`,
    [data.email.toLowerCase(), passwordHash]
  );

  const user = result.rows[0];
  const { accessToken, refreshToken } = generateTokens(user);

  // Store hashed refresh token
  await query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [
    hashSha256(refreshToken),
    user.id,
  ]);

  // Send verification email
  try {
    await sendVerificationEmail({
      email: user.email,
      uid: user.id,
      name: data.name,
    });
  } catch (err) {
    console.error('[AUTH] Failed to send verification email:', err);
  }

  await auditLog('auth.register', user.id, { email: user.email, ip: data.ip || null });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.email_verified,
    },
  };
}

export async function login(data: { email: string; password: string; ip?: string }) {
  const result = await query<UserRow>(
    'SELECT id, email, password_hash, role, email_verified FROM users WHERE email = $1',
    [data.email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    await auditLog('auth.login_failed', null, { email: data.email, reason: 'not_found', ip: data.ip || null });
    throw new AppError(401, 'Email ou senha inválidos');
  }

  const user = result.rows[0];

  if (user.role === 'disabled') {
    await auditLog('auth.login_failed', user.id, { email: data.email, reason: 'disabled', ip: data.ip || null });
    throw new AppError(403, 'Conta desativada');
  }

  const passwordMatch = await bcrypt.compare(data.password, user.password_hash);
  if (!passwordMatch) {
    await auditLog('auth.login_failed', user.id, { email: data.email, reason: 'wrong_password', ip: data.ip || null });
    throw new AppError(401, 'Email ou senha inválidos');
  }

  const { accessToken, refreshToken } = generateTokens(user);

  await query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [
    hashSha256(refreshToken),
    user.id,
  ]);

  await auditLog('auth.login', user.id, { email: user.email, ip: data.ip || null });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.email_verified,
    },
  };
}

export async function refresh(refreshToken: string) {
  const hash = hashSha256(refreshToken);
  const result = await query<UserRow>(
    'SELECT id, email, role, email_verified FROM users WHERE refresh_token_hash = $1',
    [hash]
  );

  if (result.rows.length === 0) {
    throw new AppError(401, 'Refresh token inválido');
  }

  const user = result.rows[0];
  const tokens = generateTokens(user);

  // Rotate refresh token
  await query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [
    hashSha256(tokens.refreshToken),
    user.id,
  ]);

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.email_verified,
    },
  };
}

export async function logout(userId: string) {
  await query('UPDATE users SET refresh_token_hash = NULL WHERE id = $1', [userId]);
}

export async function getMe(userId: string) {
  const result = await query(
    'SELECT id, email, role, email_verified, created_at FROM users WHERE id = $1',
    [userId]
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'Usuário não encontrado');
  }
  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    emailVerified: row.email_verified,
    createdAt: row.created_at,
  };
}

export async function sendVerificationEmail(data: { email: string; uid?: string; name?: string }) {
  const token = createHmacToken(
    { uid: data.uid, email: data.email },
    24 * 60 * 60 * 1000 // 24 hours
  );

  const verifyUrl = `${env.FRONTEND_URL}/verificar-email?token=${encodeURIComponent(token)}`;

  await sendTemplateEmail({
    template: 'verify-email',
    to: data.email,
    variables: {
      name: data.name || data.email,
      verify_url: verifyUrl,
    },
  });
}

export async function verifyEmail(token: string) {
  const payload = verifyHmacToken(token);
  if (!payload || !payload.email) {
    throw new AppError(400, 'Token de verificação inválido ou expirado');
  }

  const result = await query(
    `UPDATE users SET email_verified = TRUE, email_verified_at = NOW()
     WHERE email = $1 AND email_verified = FALSE
     RETURNING id, email, role, email_verified`,
    [payload.email]
  );

  if (result.rowCount === 0) {
    // Already verified or user not found
    return { message: 'Email já verificado ou usuário não encontrado' };
  }

  return { message: 'Email verificado com sucesso', user: result.rows[0] };
}

export async function sendPasswordReset(email: string) {
  const result = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (result.rows.length === 0) {
    // Don't reveal if email exists
    return;
  }

  const token = createHmacToken(
    { email: email.toLowerCase(), userId: result.rows[0].id },
    60 * 60 * 1000 // 1 hour
  );

  const resetUrl = `${env.FRONTEND_URL}/recuperar-senha?token=${encodeURIComponent(token)}`;

  await sendTemplateEmail({
    template: 'password-reset',
    to: email,
    variables: {
      reset_url: resetUrl,
    },
  });
}

export async function updateProfile(userId: string, data: { email?: string; currentPassword?: string; newPassword?: string }) {
  const userResult = await query<UserRow>(
    'SELECT id, email, password_hash FROM users WHERE id = $1',
    [userId]
  );
  if (userResult.rows.length === 0) {
    throw new AppError(404, 'Usuário não encontrado');
  }
  const user = userResult.rows[0];

  // Password change
  if (data.newPassword) {
    if (!data.currentPassword) {
      throw new AppError(400, 'Senha atual é obrigatória para alterar a senha');
    }
    const match = await bcrypt.compare(data.currentPassword, user.password_hash);
    if (!match) {
      throw new AppError(401, 'Senha atual incorreta');
    }
    const newHash = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
    await query('UPDATE users SET password_hash = $1, refresh_token_hash = NULL WHERE id = $2', [newHash, userId]);
  }

  // Email change
  if (data.email && data.email.toLowerCase() !== user.email) {
    const existing = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [data.email.toLowerCase(), userId]);
    if (existing.rows.length > 0) {
      throw new AppError(409, 'Email já está em uso');
    }
    await query('UPDATE users SET email = $1, email_verified = FALSE WHERE id = $2', [data.email.toLowerCase(), userId]);
    await query('UPDATE members SET email = $1 WHERE user_id = $2', [data.email.toLowerCase(), userId]);
  }

  return { message: 'Perfil atualizado com sucesso' };
}

export async function resetPassword(token: string, newPassword: string) {
  const payload = verifyHmacToken(token);
  if (!payload || !payload.email) {
    throw new AppError(400, 'Token de redefinição inválido ou expirado');
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  const result = await query(
    'UPDATE users SET password_hash = $1, refresh_token_hash = NULL WHERE email = $2 RETURNING id',
    [passwordHash, payload.email]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'Usuário não encontrado');
  }

  await auditLog('auth.password_reset', result.rows[0].id, { email: payload.email });
}
