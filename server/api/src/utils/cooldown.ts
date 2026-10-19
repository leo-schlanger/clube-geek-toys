import { query } from '../config/database.js';

/**
 * Claim the right to do something now, at most once per `minutes`, across
 * restarts and processes. One statement decides: the row is inserted, or
 * updated only if the last claim is older than the window. Kept in `config`,
 * so a crash loop does not reset it.
 *
 * Returns whether this caller holds the claim.
 */
export async function claimCooldown(key: string, minutes: number): Promise<boolean> {
  const result = await query(
    `INSERT INTO config (key, value) VALUES ($1, to_jsonb(NOW()::text))
     ON CONFLICT (key) DO UPDATE SET value = to_jsonb(NOW()::text), updated_at = NOW()
       WHERE (config.value #>> '{}')::timestamptz < NOW() - ($2::int * INTERVAL '1 minute')
     RETURNING key`,
    [key.slice(0, 100), minutes],
  );
  return result.rows.length > 0;
}

/** Give a claim back early, so the next `claimCooldown` on the key wins. */
export async function releaseCooldown(key: string): Promise<void> {
  await query(
    `UPDATE config SET value = to_jsonb('1970-01-01T00:00:00Z'::text), updated_at = NOW()
      WHERE key = $1`,
    [key.slice(0, 100)],
  );
}
