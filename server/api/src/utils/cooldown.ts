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
