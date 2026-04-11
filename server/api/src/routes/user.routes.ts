import { Router } from 'express';
import pg from 'pg';
import { authenticate, requireRole } from '../middleware/auth.js';
import { query } from '../config/database.js';
import { auditLog } from '../utils/audit.js';

export const userRouter = Router();
userRouter.use(authenticate, requireRole('admin'));

// GET /users — list all users
userRouter.get('/', async (_req, res, next) => {
  try {
    const result = await query(
      'SELECT id, email, role, email_verified, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows.map(mapUserRow));
  } catch (err) {
    next(err);
  }
});

// PATCH /users/:id/role
userRouter.patch('/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['member', 'seller', 'admin', 'disabled'].includes(role)) {
      res.status(400).json({ error: 'Role inválida', code: 'INVALID_ROLE' });
      return;
    }

    // Snapshot before for audit diff
    const before = await query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (before.rowCount === 0) {
      res.status(404).json({ error: 'Usuário não encontrado', code: 'USER_NOT_FOUND' });
      return;
    }
    const previousRole = before.rows[0].role;

    const result = await query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role, email_verified, created_at',
      [role, req.params.id]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Usuário não encontrado', code: 'USER_NOT_FOUND' });
      return;
    }

    // Audit any role change. Soft-delete (role: 'disabled') is also captured here.
    await auditLog('user.role_changed', req.user!.userId, {
      targetUserId: req.params.id,
      before: { role: previousRole },
      after: { role },
    });

    res.json(mapUserRow(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

function mapUserRow(row: pg.QueryResultRow) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    emailVerified: row.email_verified,
    createdAt: row.created_at,
  };
}
