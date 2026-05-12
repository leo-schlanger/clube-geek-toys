import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query, getClient } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import { createHmacToken, verifyHmacToken, hashSha256 } from '../utils/hmac.js';
import { sendTemplateEmail } from './email.service.js';
import { isDisposableEmail } from '../utils/disposable-emails.js';
import { auditLog as sharedAuditLog } from '../utils/audit.js';
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

// Local thin wrapper around the shared auditLog helper for back-compat with existing call sites
async function auditLog(action: string, userId: string | null, details: Record<string, unknown>) {
  await sharedAuditLog(action, userId, details);
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

async function verifyTurnstileToken(token: string, ip?: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true; // Skip if not configured
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
    });
    const result = await response.json() as { success: boolean };
    return result.success;
  } catch (err) {
    console.error('[AUTH] Turnstile verification failed:', err);
    return false;
  }
}

export async function register(data: { email: string; password: string; name?: string; ip?: string; turnstileToken?: string }) {
  // Verify Turnstile CAPTCHA if configured
  if (env.TURNSTILE_SECRET_KEY) {
    if (!data.turnstileToken) {
      throw new AppError(400, 'Verificação de segurança obrigatória', 'CAPTCHA_REQUIRED');
    }
    const valid = await verifyTurnstileToken(data.turnstileToken, data.ip);
    if (!valid) {
      throw new AppError(400, 'Verificação de segurança falhou. Tente novamente.', 'CAPTCHA_FAILED');
    }
  }

  const normalizedEmail = data.email.toLowerCase().trim();

  // Defense-in-depth: reject disposable email providers (frontend also blocks).
  if (isDisposableEmail(normalizedEmail)) {
    throw new AppError(
      400,
      'Por favor, use um email permanente. Emails temporários não são aceitos.',
      'DISPOSABLE_EMAIL'
    );
  }

  // Check if email already exists
  const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length > 0) {
    throw new AppError(409, 'Email já cadastrado', 'EMAIL_ALREADY_EXISTS');
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  const result = await query<UserRow>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'member')
     RETURNING id, email, role, email_verified, created_at`,
    [normalizedEmail, passwordHash]
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

const REFRESH_GRACE_PERIOD_MS = 30_000; // 30 seconds

export async function refresh(refreshToken: string) {
  const hash = hashSha256(refreshToken);

  // Check current token first
  let result = await query<UserRow>(
    'SELECT id, email, role, email_verified FROM users WHERE refresh_token_hash = $1',
    [hash]
  );

  // Grace period: accept previous token if rotation happened < 30s ago.
  // This prevents race conditions when multiple tabs refresh simultaneously.
  if (result.rows.length === 0) {
    result = await query<UserRow>(
      `SELECT id, email, role, email_verified FROM users
       WHERE prev_refresh_token_hash = $1
         AND refresh_rotated_at > NOW() - INTERVAL '${REFRESH_GRACE_PERIOD_MS} milliseconds'`,
      [hash]
    );
  }

  if (result.rows.length === 0) {
    throw new AppError(401, 'Refresh token inválido');
  }

  const user = result.rows[0];
  const tokens = generateTokens(user);

  // Rotate refresh token, keep previous for grace period
  await query(
    `UPDATE users SET
       prev_refresh_token_hash = refresh_token_hash,
       refresh_token_hash = $1,
       refresh_rotated_at = NOW()
     WHERE id = $2`,
    [hashSha256(tokens.refreshToken), user.id]
  );

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
  await query(
    'UPDATE users SET refresh_token_hash = NULL, prev_refresh_token_hash = NULL WHERE id = $1',
    [userId]
  );
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
  // 1. HMAC validity & expiration check (24h TTL embedded in token)
  const payload = verifyHmacToken(token);
  if (!payload || !payload.email) {
    throw new AppError(400, 'Link de verificação inválido ou expirado.', 'TOKEN_INVALID');
  }

  // 2. One-time use enforcement: claim the token hash atomically.
  // If another request already consumed it, ON CONFLICT bails out.
  const tokenHash = hashSha256(token);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const claim = await client.query(
      `INSERT INTO consumed_verification_tokens (token_hash, user_id)
       SELECT $1, id FROM users WHERE email = $2
       ON CONFLICT (token_hash) DO NOTHING
       RETURNING token_hash`,
      [tokenHash, payload.email]
    );

    if (claim.rowCount === 0) {
      // Token was either previously consumed OR user not found
      const existsCheck = await client.query(
        'SELECT 1 FROM consumed_verification_tokens WHERE token_hash = $1',
        [tokenHash]
      );
      await client.query('ROLLBACK');
      if (existsCheck.rowCount && existsCheck.rowCount > 0) {
        throw new AppError(410, 'Este link de verificação já foi usado.', 'TOKEN_ALREADY_USED');
      }
      throw new AppError(404, 'Usuário não encontrado.', 'USER_NOT_FOUND');
    }

    // 3. Mark email as verified (idempotent — only updates if not already verified)
    const result = await client.query(
      `UPDATE users SET email_verified = TRUE, email_verified_at = NOW()
       WHERE email = $1 AND email_verified = FALSE
       RETURNING id, email, role, email_verified`,
      [payload.email]
    );

    await client.query('COMMIT');

    if (result.rowCount === 0) {
      // Already verified — but token claim succeeded. Return success message.
      return { message: 'Email já verificado anteriormente.' };
    }

    await auditLog('auth.email_verified', result.rows[0].id, { email: payload.email });
    return { message: 'Email verificado com sucesso', user: result.rows[0] };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* swallow */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function sendPasswordReset(email: string) {
  const result = await query(
    'SELECT u.id, m.full_name FROM users u LEFT JOIN members m ON m.user_id = u.id WHERE u.email = $1',
    [email.toLowerCase()]
  );
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
      name: result.rows[0].full_name || email,
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
    await query('UPDATE users SET password_hash = $1, refresh_token_hash = NULL, prev_refresh_token_hash = NULL WHERE id = $2', [newHash, userId]);
  }

  // Email change
  if (data.email && data.email.toLowerCase() !== user.email) {
    if (isDisposableEmail(data.email)) {
      throw new AppError(400, 'Email temporário não é permitido');
    }
    const existing = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [data.email.toLowerCase(), userId]);
    if (existing.rows.length > 0) {
      throw new AppError(409, 'Email já está em uso');
    }
    const oldEmail = user.email;
    const newEmail = data.email.toLowerCase();
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE users SET email = $1, email_verified = FALSE WHERE id = $2', [newEmail, userId]);
      await client.query('UPDATE members SET email = $1 WHERE user_id = $2', [newEmail, userId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    await auditLog('auth.email_changed', userId, { oldEmail, newEmail });
  }

  const changes: string[] = [];
  if (data.newPassword) changes.push('password');
  if (data.email) changes.push('email');
  await auditLog('auth.profile_updated', userId, { changed: changes });

  return { message: 'Perfil atualizado com sucesso' };
}

export async function googleAuth(idToken: string, ip?: string) {
  // 1. Verify Google ID token via Google's tokeninfo endpoint
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );

  if (!response.ok) {
    throw new AppError(401, 'Token Google inválido');
  }

  const payload = (await response.json()) as {
    email?: string;
    name?: string;
    email_verified?: string;
    sub?: string;
    aud?: string;
  };

  if (!payload.email || !payload.sub) {
    throw new AppError(401, 'Token Google não contém informações necessárias');
  }

  // 2. Audience check — reject if GOOGLE_CLIENT_ID not configured
  if (!env.GOOGLE_CLIENT_ID) {
    throw new AppError(503, 'Login Google não configurado no servidor');
  }
  if (payload.aud !== env.GOOGLE_CLIENT_ID) {
    throw new AppError(401, 'Token Google com audience inválido');
  }

  const email = payload.email.toLowerCase();
  const name = payload.name || '';
  const emailVerified = payload.email_verified === 'true';

  // 3. Check if user exists
  const existing = await query<UserRow>(
    'SELECT id, email, password_hash, role, email_verified FROM users WHERE email = $1',
    [email]
  );

  if (existing.rows.length > 0) {
    // 4. User exists — log them in
    const user = existing.rows[0];

    if (user.role === 'disabled') {
      throw new AppError(403, 'Conta desativada');
    }

    // Update email_verified if Google says it's verified and we haven't yet
    if (emailVerified && !user.email_verified) {
      await query(
        'UPDATE users SET email_verified = TRUE, email_verified_at = NOW() WHERE id = $1',
        [user.id]
      );
      user.email_verified = true;
    }

    const { accessToken, refreshToken } = generateTokens(user);

    await query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [
      hashSha256(refreshToken),
      user.id,
    ]);

    await auditLog('auth.google_login', user.id, { email: user.email, ip: ip || null });

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

  // 5. User does not exist — register with random password
  const randomPassword = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(randomPassword, BCRYPT_ROUNDS);

  const result = await query<UserRow>(
    `INSERT INTO users (email, password_hash, role, email_verified, email_verified_at)
     VALUES ($1, $2, 'member', $3, $4)
     RETURNING id, email, role, email_verified, created_at`,
    [email, passwordHash, emailVerified, emailVerified ? new Date() : null]
  );

  const user = result.rows[0];
  const { accessToken, refreshToken } = generateTokens(user);

  await query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [
    hashSha256(refreshToken),
    user.id,
  ]);

  await auditLog('auth.google_register', user.id, { email: user.email, name, ip: ip || null });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.email_verified,
    },
    isNewUser: true,
    googleName: name,
  };
}

export async function resetPassword(token: string, newPassword: string) {
  const payload = verifyHmacToken(token);
  if (!payload || !payload.email) {
    throw new AppError(400, 'Token de redefinição inválido ou expirado');
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  const result = await query(
    'UPDATE users SET password_hash = $1, refresh_token_hash = NULL, prev_refresh_token_hash = NULL WHERE email = $2 RETURNING id',
    [passwordHash, payload.email]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'Usuário não encontrado');
  }

  await auditLog('auth.password_reset', result.rows[0].id, { email: payload.email });
}
