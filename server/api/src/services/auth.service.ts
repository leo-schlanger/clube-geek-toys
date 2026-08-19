import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query, getClient } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import { createHmacToken, verifyHmacToken, hashSha256 } from '../utils/hmac.js';
import { sendTemplateEmail } from './email.service.js';
import { isDisposableEmail } from '../utils/disposable-emails.js';
import { claimGuestOrders } from './order.service.js';
import { auditLog as sharedAuditLog } from '../utils/audit.js';
import crypto from 'crypto';

/**
 * Hands the account any order it made as a guest before signing up.
 *
 * Called wherever an account proves it owns its e-mail — login, verification,
 * Google sign-in — because that proof is exactly what makes the hand-over safe
 * (see `claimGuestOrders`). Never let it break authentication: an order that
 * stays orphaned is a support ticket, a login that 500s is a locked-out
 * customer.
 */
async function linkGuestOrders(userId: string): Promise<void> {
  try {
    await claimGuestOrders(userId);
  } catch (err) {
    console.error('[AUTH] Failed to claim guest orders:', err);
  }
}

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
/**
 * Kept short because the access token is a bearer credential that cannot be
 * revoked before it expires. One hour instead of the original 15 minutes: the
 * refresh round-trip is the moment a session can break (a deploy restarting
 * the API, a phone on a bad connection), so doing it four times less often
 * removes most of the accidental logouts without widening the theft window to
 * anything unusual.
 */
export const ACCESS_TOKEN_EXPIRY = '1h';
/** Matches the refresh cookie's maxAge in auth.routes.ts. */
export const REFRESH_SESSION_TTL_DAYS = 30;
/** Ceiling of simultaneous devices per account; the oldest session is dropped. */
const MAX_SESSIONS_PER_USER = 20;
/**
 * Window in which the previous refresh token of a session is still accepted,
 * so two tabs refreshing at the same time do not knock each other out.
 */
const REFRESH_GRACE_PERIOD_MS = 30_000;

// Local thin wrapper around the shared auditLog helper for back-compat with existing call sites
async function auditLog(action: string, userId: string | null, details: Record<string, unknown>) {
  await sharedAuditLog(action, userId, details);
}
/**
 * Opens a session for one device.
 *
 * Sessions used to live in a single `users.refresh_token_hash` column, so a
 * login on the phone overwrote the one on the desktop and the desktop was
 * logged out at its next refresh. One row per session is what lets the same
 * person stay signed in on more than one device.
 */
export async function openRefreshSession(
  userId: string,
  refreshToken: string,
  userAgent?: string
): Promise<void> {
  await query(
    `INSERT INTO refresh_sessions (user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, NOW() + ($3 || ' days')::interval, $4)
     ON CONFLICT (token_hash) DO NOTHING`,
    [userId, hashSha256(refreshToken), String(REFRESH_SESSION_TTL_DAYS), userAgent?.slice(0, 400) ?? null]
  );

  // Nobody uses twenty devices. Sessions are only dropped by logout, expiry or
  // the daily purge, so without a ceiling a browser that clears cookies on every
  // visit would leave a row per visit standing for a month. The oldest go first,
  // which is also the right answer if the extra sessions are not the owner's.
  await query(
    `DELETE FROM refresh_sessions
      WHERE user_id = $1
        AND id NOT IN (
          SELECT id FROM refresh_sessions
           WHERE user_id = $1
           ORDER BY last_used_at DESC, created_at DESC
           LIMIT $2
        )`,
    [userId, MAX_SESSIONS_PER_USER]
  );
}

/**
 * Ends every session of a user — used when the credential itself changed
 * (password reset, account disabled, LGPD erasure). A plain sign-out must not
 * come through here: it would log the person out of their other devices.
 */
export async function revokeAllRefreshSessions(userId: string): Promise<void> {
  await query('DELETE FROM refresh_sessions WHERE user_id = $1', [userId]);
}

/** Ends a single session, identified by the refresh token the client holds. */
export async function revokeRefreshSession(refreshToken: string): Promise<void> {
  const hash = hashSha256(refreshToken);
  await query('DELETE FROM refresh_sessions WHERE token_hash = $1 OR prev_token_hash = $1', [hash]);
}

/** Drops sessions that are past their expiry. Called by the daily cron. */
export async function purgeExpiredRefreshSessions(): Promise<number> {
  const result = await query('DELETE FROM refresh_sessions WHERE expires_at < NOW()');
  return result.rowCount ?? 0;
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

export async function register(data: { email: string; password: string; name?: string; ip?: string; turnstileToken?: string; userAgent?: string }) {
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
  await openRefreshSession(user.id, refreshToken, data.userAgent);

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

export async function login(data: { email: string; password: string; ip?: string; userAgent?: string }) {
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
  await openRefreshSession(user.id, refreshToken, data.userAgent);

  if (user.email_verified) await linkGuestOrders(user.id);

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

export async function refresh(refreshToken: string, userAgent?: string) {
  const hash = hashSha256(refreshToken);

  // The session is found by its current token, or by the one it just rotated
  // away from while the grace window is open — two tabs refreshing at the same
  // moment must not knock each other out. An expired row is not a session any
  // more, so expiry is part of the lookup rather than a separate check.
  const session = await query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM refresh_sessions
      WHERE expires_at > NOW()
        AND (token_hash = $1
             OR (prev_token_hash = $1
                 AND rotated_at > NOW() - INTERVAL '${REFRESH_GRACE_PERIOD_MS} milliseconds'))
      LIMIT 1`,
    [hash]
  );

  if (session.rows.length === 0) {
    throw new AppError(401, 'Refresh token inválido');
  }

  const result = await query<UserRow>(
    'SELECT id, email, role, email_verified FROM users WHERE id = $1',
    [session.rows[0].user_id]
  );

  if (result.rows.length === 0) {
    throw new AppError(401, 'Refresh token inválido');
  }

  const user = result.rows[0];

  if (user.role === 'disabled') {
    // The account was turned off after this session was opened; the session
    // has to die with it instead of surviving on rotation.
    await revokeAllRefreshSessions(user.id);
    throw new AppError(403, 'Conta desativada');
  }

  const tokens = generateTokens(user);

  // Rotate this session only. Sessions on other devices keep their own tokens.
  await query(
    `UPDATE refresh_sessions SET
       prev_token_hash = token_hash,
       token_hash = $1,
       rotated_at = NOW(),
       last_used_at = NOW(),
       expires_at = NOW() + ($2 || ' days')::interval,
       user_agent = COALESCE($3, user_agent)
     WHERE id = $4`,
    [
      hashSha256(tokens.refreshToken),
      String(REFRESH_SESSION_TTL_DAYS),
      userAgent?.slice(0, 400) ?? null,
      session.rows[0].id,
    ]
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

/**
 * Signs out the device that asked. The refresh token identifies which session
 * to end, so signing out on the phone leaves the desktop signed in; without a
 * token there is nothing to single out and every session goes.
 */
export async function logout(userId: string, refreshToken?: string) {
  if (refreshToken) {
    await revokeRefreshSession(refreshToken);
  } else {
    await revokeAllRefreshSessions(userId);
  }
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

    await linkGuestOrders(result.rows[0].id);

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
    // The password changed: every session opened with the old one is void.
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
    await revokeAllRefreshSessions(userId);
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

export async function googleAuth(idToken: string, ip?: string, userAgent?: string) {
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
    await openRefreshSession(user.id, refreshToken, userAgent);

    if (user.email_verified) await linkGuestOrders(user.id);

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
  await openRefreshSession(user.id, refreshToken, userAgent);

  if (user.email_verified) await linkGuestOrders(user.id);

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
    'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id',
    [passwordHash, payload.email]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'Usuário não encontrado');
  }

  // A reset is the recovery path for a possibly stolen account: end every
  // session, including the ones on devices the owner does not control.
  await revokeAllRefreshSessions(result.rows[0].id);

  await auditLog('auth.password_reset', result.rows[0].id, { email: payload.email });
}
