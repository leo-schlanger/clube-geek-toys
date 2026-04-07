import { Router } from 'express';
import pg from 'pg';
import { authenticate, requireRole } from '../middleware/auth.js';
import { query } from '../config/database.js';

export const userRouter = Router();
userRouter.use(authenticate, requireRole('admin'));

// GET /users — list all users
userRouter.get('/', async (req, res, next) => {
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
      res.status(400).json({ error: 'Role inválida' });
      return;
    }
    const result = await query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role, email_verified, created_at',
      [role, req.params.id]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
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
