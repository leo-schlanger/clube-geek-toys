import { query } from '../config/database.js';
import { auditLog } from '../utils/audit.js';

/**
 * Settings persisted in the `config` table (key/JSONB pairs).
 *
 * Pattern: each setting key is a dotted path like `pricing.silver_monthly` and the value is
 * stored as JSONB. Defaults are returned when a key is missing, so the system keeps working
 * even before any explicit configuration has been saved.
 */

export interface SettingDefinition {
  key: string;
  default: unknown;
  type: 'number' | 'string' | 'boolean' | 'object';
  description: string;
}

/**
 * Catalogue of known settings. Adding a new setting here makes it readable/writable through
 * the admin Settings tab without further code changes.
 */
export const SETTINGS_CATALOGUE: SettingDefinition[] = [
  // Pricing — values must match what the frontend PLANS constant exposes initially.
  { key: 'pricing.silver_monthly',  default: 19.90,  type: 'number', description: 'Plano Silver mensal (R$)' },
  { key: 'pricing.silver_annual',   default: 199.00, type: 'number', description: 'Plano Silver anual (R$)' },
  { key: 'pricing.gold_monthly',    default: 39.90,  type: 'number', description: 'Plano Gold mensal (R$)' },
  { key: 'pricing.gold_annual',     default: 399.00, type: 'number', description: 'Plano Gold anual (R$)' },
  { key: 'pricing.black_monthly',   default: 79.90,  type: 'number', description: 'Plano Black mensal (R$)' },
  { key: 'pricing.black_annual',    default: 799.00, type: 'number', description: 'Plano Black anual (R$)' },

  // Plan benefits
  { key: 'plan.silver.discount_products',   default: 5,  type: 'number', description: 'Desconto Silver em produtos (%)' },
  { key: 'plan.silver.discount_services',   default: 10, type: 'number', description: 'Desconto Silver em serviços (%)' },
  { key: 'plan.gold.discount_products',     default: 10, type: 'number', description: 'Desconto Gold em produtos (%)' },
  { key: 'plan.gold.discount_services',     default: 15, type: 'number', description: 'Desconto Gold em serviços (%)' },
  { key: 'plan.black.discount_products',    default: 15, type: 'number', description: 'Desconto Black em produtos (%)' },
  { key: 'plan.black.discount_services',    default: 20, type: 'number', description: 'Desconto Black em serviços (%) — válido a partir do 2º pagamento' },

  // Points
  { key: 'points.multiplier_silver',  default: 1,   type: 'number', description: 'Multiplicador de pontos Silver' },
  { key: 'points.multiplier_gold',    default: 1.5, type: 'number', description: 'Multiplicador de pontos Gold' },
  { key: 'points.multiplier_black',   default: 2,   type: 'number', description: 'Multiplicador de pontos Black' },
  { key: 'points.expiry_days',        default: 365, type: 'number', description: 'Dias até expiração de pontos' },

  // Payment guards
  { key: 'payment.duplicate_window_days', default: 7, type: 'number', description: 'Janela em dias para bloquear pagamentos duplicados' },
];

const definitionByKey = new Map(SETTINGS_CATALOGUE.map((d) => [d.key, d]));

// In-memory cache (60s TTL) to avoid hammering the DB.
interface CacheEntry { value: unknown; expiresAt: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000;

export async function getSetting<T = unknown>(key: string): Promise<T> {
  const def = definitionByKey.get(key);
  if (!def) throw new Error(`Unknown setting key: ${key}`);

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const result = await query('SELECT value FROM config WHERE key = $1', [key]);
  const value = result.rows.length > 0 ? result.rows[0].value : def.default;
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value as T;
}

/**
 * Returns ALL known settings (defaults merged with stored overrides).
 */
export async function getAllSettings(): Promise<Record<string, unknown>> {
  const result = await query('SELECT key, value FROM config');
  const stored = new Map<string, unknown>();
  for (const row of result.rows) {
    stored.set(row.key, row.value);
  }
  const out: Record<string, unknown> = {};
  for (const def of SETTINGS_CATALOGUE) {
    out[def.key] = stored.has(def.key) ? stored.get(def.key) : def.default;
  }
  return out;
}

function validateValueType(def: SettingDefinition, value: unknown): boolean {
  switch (def.type) {
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'object': return typeof value === 'object' && value !== null;
  }
}

/**
 * Bulk update settings. Validates each key against the catalogue and rejects unknown keys
 * or type mismatches. Audits each change with before/after values.
 */
export async function updateSettings(updates: Record<string, unknown>, actorUserId: string): Promise<Record<string, unknown>> {
  const before = await getAllSettings();

  // Validate all updates first — fail-fast before any writes
  for (const [key, value] of Object.entries(updates)) {
    const def = definitionByKey.get(key);
    if (!def) {
      throw new Error(`Unknown setting key: ${key}`);
    }
    if (!validateValueType(def, value)) {
      throw new Error(`Invalid value type for ${key}: expected ${def.type}`);
    }
  }

  // Upsert each — pg supports JSONB parameter via stringify
  for (const [key, value] of Object.entries(updates)) {
    await query(
      `INSERT INTO config (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
    cache.delete(key);
  }

  // Audit
  const changedKeys = Object.keys(updates);
  const beforeChanged: Record<string, unknown> = {};
  const afterChanged: Record<string, unknown> = {};
  for (const k of changedKeys) {
    beforeChanged[k] = before[k];
    afterChanged[k] = updates[k];
  }
  await auditLog('settings.updated', actorUserId, { before: beforeChanged, after: afterChanged });

  return getAllSettings();
}

/**
 * Returns the catalogue (for the admin UI to render dynamic forms / labels).
 */
export function getSettingsCatalogue(): SettingDefinition[] {
  return SETTINGS_CATALOGUE;
}

/** Force-flush the cache (useful in tests or after migrations). */
export function clearSettingsCache(): void {
  cache.clear();
}
