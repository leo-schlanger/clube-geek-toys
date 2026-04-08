import { Request, Response } from 'express';
import { query } from '../config/database.js';

/**
 * Verify that the authenticated user owns the member record,
 * or is an admin/seller (who bypass ownership checks).
 * Returns the memberId if authorized, null if denied (response already sent).
 */
export async function verifyMemberOwnership(
  req: Request,
  res: Response,
  memberId: string
): Promise<boolean> {
  if (req.user!.role === 'admin' || req.user!.role === 'seller') {
    return true;
  }

  const result = await query(
    'SELECT user_id FROM members WHERE id = $1',
    [memberId]
  );

  if (result.rows.length === 0 || result.rows[0].user_id !== req.user!.userId) {
    res.status(403).json({ error: 'Acesso negado' });
    return false;
  }

  return true;
}

/**
 * Get the member ID for the authenticated user.
 * Returns null if no member found.
 */
export async function getMemberIdForUser(userId: string): Promise<string | null> {
  const result = await query(
    'SELECT id FROM members WHERE user_id = $1',
    [userId]
  );
  return result.rows[0]?.id || null;
}
