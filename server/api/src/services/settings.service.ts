import { query } from '../config/database.js';
import { auditLog } from '../utils/audit.js';

/**
 * Settings persisted in the `config` table (key/JSONB pairs).
 *
 * Pattern: each setting key is a dotted path like `pricing.club_annual` and the value is
 * stored as JSONB. Defaults are returned when a key is missing, so the system keeps working
 * even before any explicit configuration has been saved.
 * `pricing.club_annual` is the stored key for the club price (now monthly).
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
  // Must match CLUB_PLAN.price on the frontend.
  { key: 'pricing.club_annual', default: 12.50, type: 'number', description: 'Plano do Clube — mensal (R$)' },

  // Member benefit: a single discount on any product.
  { key: 'plan.club.discount_products', default: 15, type: 'number', description: 'Desconto do membro em produtos (%)' },

  // Payment guards
  { key: 'payment.duplicate_window_days', default: 7, type: 'number', description: 'Janela em dias para bloquear pagamentos duplicados' },

  // Store credit (BRL) rewarded for reviewing a delivered order.
  { key: 'review_reward_amount', default: 1, type: 'number', description: 'Crédito (R$) ao avaliar um pedido entregue' },

  // Wholesale channel. Registration is always open (the CNPJ list is the point); orders are only
  // accepted once the store is actually selling B2B. Off = /atacado is a waiting list.
  { key: 'wholesale.sales_open', default: false, type: 'boolean', description: 'Atacado vendendo (desligado: só cadastro de CNPJ)' },

  // ─── Promoção da loja online ────────────────────────────────────────────────
  //
  // O pedido do cliente é "no site é 5% mais barato que na loja". A loja física
  // não passa por este sistema (o PDV só verifica carteirinha, não registra
  // venda), então isto não é uma comparação que o código consiga fazer: é um
  // desconto no canal online mais o aviso que explica o porquê.
  //
  // Mora aqui, e não numa constante, porque o pedido era ser configurável: uma
  // chave no catálogo já aparece editável na aba Configurações, sem deploy.
  { key: 'shop.online_discount_enabled', default: true, type: 'boolean', description: 'Promoção da loja online ligada' },
  { key: 'shop.online_discount_percent', default: 5, type: 'number', description: 'Desconto da loja online (%)' },
  { key: 'shop.online_discount_banner_enabled', default: true, type: 'boolean', description: 'Mostrar o aviso da promoção no topo da loja' },
  {
    key: 'shop.online_discount_banner_text',
    default: 'No site é 5% mais barato que na loja física — desconto aplicado no carrinho.',
    type: 'string',
    description: 'Texto do aviso da promoção',
  },
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
