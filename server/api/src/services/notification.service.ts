import pg from 'pg';
import { query } from '../config/database.js';
import { AppError } from '../middleware/error-handler.js';

/**
 * Notificações no perfil do cliente.
 *
 * Deliberadamente simples: uma linha por aviso, lida/não lida, com um link
 * relativo para a SPA. Não é fila nem push — o cliente vê quando abre a loja.
 */

export type NotificationKind = 'question_answered' | 'order_shipped' | 'generic';

export interface Notification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

function mapNotification(row: pg.QueryResultRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    title: row.title,
    body: row.body ?? null,
    link: row.link ?? null,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
  };
}

export async function notify(
  client: pg.PoolClient | null,
  input: {
    userId: string;
    kind: NotificationKind;
    title: string;
    body?: string | null;
    link?: string | null;
  }
): Promise<void> {
  const run = client
    ? (sql: string, params: unknown[]) => client.query(sql, params)
    : (sql: string, params: unknown[]) => query(sql, params);

  await run(
    `INSERT INTO notifications (user_id, kind, title, body, link)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.userId, input.kind, input.title.slice(0, 200), input.body ?? null, input.link ?? null]
  );
}

export async function listForUser(
  userId: string,
  opts: { limit?: number; unreadOnly?: boolean } = {}
): Promise<{ notifications: Notification[]; unread: number }> {
  const limit = Math.max(1, Math.min(opts.limit || 30, 100));
  const [data, unread] = await Promise.all([
    query(
      `SELECT * FROM notifications
       WHERE user_id = $1 ${opts.unreadOnly ? 'AND read_at IS NULL' : ''}
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    ),
  ]);

  return {
    notifications: data.rows.map(mapNotification),
    unread: unread.rows[0].total as number,
  };
}

/** Marca uma notificação como lida. O WHERE user_id garante a posse. */
export async function markRead(userId: string, id: string): Promise<Notification> {
  const result = await query(
    `UPDATE notifications SET read_at = NOW()
     WHERE id = $1 AND user_id = $2 AND read_at IS NULL
     RETURNING *`,
    [id, userId]
  );
  if (result.rows.length === 0) {
    // Já lida ou de outro usuário — devolve o estado atual sem vazar existência.
    const existing = await query(`SELECT * FROM notifications WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
    ]);
    if (existing.rows.length === 0) {
      throw new AppError(404, 'Notificação não encontrada.', 'NOTIFICATION_NOT_FOUND');
    }
    return mapNotification(existing.rows[0]);
  }
  return mapNotification(result.rows[0]);
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await query(
    `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return result.rowCount ?? 0;
}
