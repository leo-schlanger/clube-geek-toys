import pg from 'pg';
import { env } from './env.js';
import { moduleLogger } from '../config/logger.js';

const log = moduleLogger('database');

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // A runaway query is cancelled by Postgres instead of holding a connection
  // (and the request) forever. The heaviest legit one, a 3-year finance report,
  // takes under 1 s; backups use pg_dump, not this pool.
  statement_timeout: 30_000,
});

pool.on('error', (err) => {
  log.error({ err }, 'Unexpected pool error');
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (env.NODE_ENV === 'development') {
    log.info(`Query (${duration}ms): ${text.substring(0, 80)}...`);
  }
  return result;
}

export async function getClient() {
  return pool.connect();
}
