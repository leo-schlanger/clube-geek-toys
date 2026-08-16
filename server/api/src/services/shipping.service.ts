import crypto from 'crypto';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import { query } from '../config/database.js';
// Fonte única do host e do token: se este arquivo tivesse a própria noção de
// sandbox, um token obtido num ambiente acabaria sendo usado contra o outro —
// e o 401 resultante sumiria no fallback.
import { getAccessToken, melhorEnvioBaseUrl } from './melhor-envio-oauth.service.js';

// ─── Defaults (photocard / small K-pop package) ──────────────────────────────
export const DEFAULT_WEIGHT_G = 300;
export const DEFAULT_HEIGHT_CM = 6;
export const DEFAULT_WIDTH_CM = 11;
export const DEFAULT_LENGTH_CM = 16;

const QUOTE_TTL_MS = 25 * 60 * 1000; // 25 min

export interface ShippingAddressInput {
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  recipientName?: string;
}

export interface QuoteItemInput {
  productId: string;
  quantity: number;
}

export interface ShippingOption {
  id: string;
  name: string;
  company: string;
  price: number;
  days: number;
  /** Correios service label for display */
  service: string;
}

export interface ShippingQuoteResult {
  quoteToken: string;
  expiresAt: string;
  options: ShippingOption[];
  package: { weightG: number; heightCm: number; widthCm: number; lengthCm: number };
  source: 'melhor_envio' | 'fallback';
}

export interface ViaCepResult {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

interface PackageDims {
  weightG: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
}

// ─── CEP helpers ─────────────────────────────────────────────────────────────

export function normalizeCep(cep: string): string {
  return cep.replace(/\D/g, '').slice(0, 8);
}

export function formatCep(cep: string): string {
  const n = normalizeCep(cep);
  if (n.length !== 8) return n;
  return `${n.slice(0, 5)}-${n.slice(5)}`;
}

export async function lookupCep(cepRaw: string): Promise<ViaCepResult> {
  const cep = normalizeCep(cepRaw);
  if (cep.length !== 8) {
    throw new AppError(400, 'CEP inválido.', 'INVALID_CEP');
  }

  const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new AppError(502, 'Não foi possível consultar o CEP.', 'CEP_LOOKUP_FAILED');
  }
  const data = (await res.json()) as {
    erro?: boolean;
    cep?: string;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  };
  if (data.erro || !data.localidade || !data.uf) {
    throw new AppError(404, 'CEP não encontrado.', 'CEP_NOT_FOUND');
  }
  return {
    cep,
    street: data.logradouro || '',
    neighborhood: data.bairro || '',
    city: data.localidade,
    state: data.uf,
  };
}

// ─── Package from cart items ─────────────────────────────────────────────────

export async function buildPackageFromItems(items: QuoteItemInput[]): Promise<PackageDims> {
  if (!items.length) {
    throw new AppError(400, 'Carrinho vazio para cotação.', 'EMPTY_CART');
  }
  const ids = items.map((i) => i.productId);
  const result = await query(
    `SELECT id, weight_g, height_cm, width_cm, length_cm, active, stock, name
     FROM products WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  const byId = new Map(result.rows.map((r) => [r.id as string, r]));

  let weightG = 0;
  let maxH = 0;
  let maxW = 0;
  let sumL = 0;

  for (const it of items) {
    const p = byId.get(it.productId);
    if (!p || !p.active) {
      throw new AppError(400, 'Produto indisponível no carrinho.', 'PRODUCT_UNAVAILABLE');
    }
    const qty = Math.floor(it.quantity);
    if (qty <= 0) throw new AppError(400, 'Quantidade inválida.', 'INVALID_QUANTITY');

    const w = Number(p.weight_g) > 0 ? Number(p.weight_g) : DEFAULT_WEIGHT_G;
    const h = Number(p.height_cm) > 0 ? Number(p.height_cm) : DEFAULT_HEIGHT_CM;
    const width = Number(p.width_cm) > 0 ? Number(p.width_cm) : DEFAULT_WIDTH_CM;
    const len = Number(p.length_cm) > 0 ? Number(p.length_cm) : DEFAULT_LENGTH_CM;

    weightG += w * qty;
    maxH = Math.max(maxH, h);
    maxW = Math.max(maxW, width);
    sumL += len * qty;
  }

  // Single box approximation: stack lengths, keep max height/width; Correios min 1cm
  return {
    weightG: Math.max(1, Math.ceil(weightG)),
    heightCm: Math.max(1, Math.ceil(maxH)),
    widthCm: Math.max(1, Math.ceil(maxW)),
    lengthCm: Math.max(16, Math.min(100, Math.ceil(sumL))),
  };
}

// ─── Quote token (HMAC) ──────────────────────────────────────────────────────

interface QuotePayload {
  cep: string;
  itemsKey: string;
  options: ShippingOption[];
  package: PackageDims;
  exp: number;
  source: 'melhor_envio' | 'fallback';
}

/** Stable cart fingerprint — aggregates qty per product so line order/duplicates match. */
function itemsKey(items: QuoteItemInput[]): string {
  const map = new Map<string, number>();
  for (const i of items) {
    const q = Math.floor(i.quantity);
    if (q <= 0) continue;
    map.set(i.productId, (map.get(i.productId) || 0) + q);
  }
  return [...map.entries()]
    .map(([id, q]) => `${id}:${q}`)
    .sort()
    .join('|');
}

function signQuote(payload: QuotePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', env.HMAC_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyQuoteToken(token: string): QuotePayload {
  const [body, sig] = token.split('.');
  if (!body || !sig) {
    throw new AppError(400, 'Cotação de frete inválida.', 'INVALID_QUOTE');
  }
  const expected = crypto.createHmac('sha256', env.HMAC_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new AppError(400, 'Cotação de frete inválida.', 'INVALID_QUOTE');
  }
  let payload: QuotePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as QuotePayload;
  } catch {
    throw new AppError(400, 'Cotação de frete inválida.', 'INVALID_QUOTE');
  }
  if (payload.exp < Date.now()) {
    throw new AppError(409, 'Cotação de frete expirada. Calcule novamente.', 'QUOTE_EXPIRED');
  }
  return payload;
}

export function pickOptionFromQuote(
  token: string,
  serviceId: string,
  items: QuoteItemInput[],
  destCep: string
): ShippingOption & { days: number; package: PackageDims } {
  const payload = verifyQuoteToken(token);
  if (payload.cep !== normalizeCep(destCep)) {
    throw new AppError(409, 'CEP diferente da cotação. Calcule o frete novamente.', 'QUOTE_CEP_MISMATCH');
  }
  if (payload.itemsKey !== itemsKey(items)) {
    throw new AppError(409, 'Carrinho mudou desde a cotação. Calcule o frete novamente.', 'QUOTE_CART_MISMATCH');
  }
  const opt = payload.options.find((o) => o.id === serviceId);
  if (!opt) {
    throw new AppError(400, 'Opção de frete inválida.', 'INVALID_SHIPPING_OPTION');
  }
  return { ...opt, package: payload.package };
}

// ─── Melhor Envio ────────────────────────────────────────────────────────────

/**
 * Saúde da integração de frete, exposta em `GET /health`.
 *
 * Existe porque a falha aqui é silenciosa por natureza: quando o Melhor Envio
 * recusa, a cotação cai na tabela interna e o cliente vê um preço plausível.
 * Ninguém percebe até a diferença aparecer no caixa. Um token inválido, ou de
 * sandbox com a flag de produção, some exatamente assim.
 */
export interface MelhorEnvioHealth {
  configured: boolean;
  sandbox: boolean;
  /** 'auth' separa credencial errada de instabilidade da API — o tratamento difere. */
  lastFailure: { at: string; status: number; kind: 'auth' | 'other'; detail: string } | null;
  lastSuccessAt: string | null;
}

let lastFailure: MelhorEnvioHealth['lastFailure'] = null;
let lastSuccessAt: string | null = null;

export function getMelhorEnvioHealth(): MelhorEnvioHealth {
  return {
    // "Configurado" agora é credencial OAuth **ou** token manual — com só o
    // client id/secret e sem autorizar, o health precisa dizer unconfigured.
    configured: Boolean(
      env.MELHOR_ENVIO_TOKEN ||
        (env.MELHOR_ENVIO_CLIENT_ID && env.MELHOR_ENVIO_CLIENT_SECRET)
    ),
    sandbox: Boolean(env.MELHOR_ENVIO_SANDBOX),
    lastFailure,
    lastSuccessAt,
  };
}

function recordMelhorEnvioFailure(status: number, body: string): void {
  const kind = status === 401 || status === 403 ? 'auth' : 'other';
  lastFailure = {
    at: new Date().toISOString(),
    status,
    kind,
    detail: body.slice(0, 200),
  };

  if (kind === 'auth') {
    // Grito deliberado: sem isto a linha se perde entre os warnings e o frete
    // segue saindo da tabela de fallback por semanas.
    console.error(
      `[shipping] CREDENCIAL DO MELHOR ENVIO RECUSADA (HTTP ${status}) — ` +
        `ambiente=${env.MELHOR_ENVIO_SANDBOX ? 'sandbox' : 'producao'}. ` +
        `O frete está saindo da TABELA DE FALLBACK, não da cotação real. ` +
        `Confira MELHOR_ENVIO_TOKEN e se MELHOR_ENVIO_SANDBOX bate com o ambiente do token.`
    );
    return;
  }
  console.warn('[shipping] Melhor Envio error', status, body.slice(0, 300));
}

async function quoteMelhorEnvio(
  destCep: string,
  pkg: PackageDims
): Promise<ShippingOption[] | null> {
  // Vem do OAuth (com refresh) ou do MELHOR_ENVIO_TOKEN manual, nessa ordem de
  // precedência — ver melhor-envio-oauth.service.ts.
  const token = await getAccessToken();
  if (!token) return null;

  const origin = env.SHIPPING_ORIGIN_CEP;
  const weightKg = Math.max(0.1, pkg.weightG / 1000);

  try {
    const res = await fetch(`${melhorEnvioBaseUrl()}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'GeekPopToys Loja (contato@geeketoys.com.br)',
      },
      body: JSON.stringify({
        from: { postal_code: origin },
        to: { postal_code: destCep },
        package: {
          height: pkg.heightCm,
          width: pkg.widthCm,
          length: pkg.lengthCm,
          weight: weightKg,
        },
        options: {
          receipt: false,
          own_hand: false,
        },
        services: '1,2', // often PAC/SEDEX — ME may return more; we filter Correios
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      recordMelhorEnvioFailure(res.status, text);
      return null;
    }

    const data = (await res.json()) as Array<{
      id: number | string;
      name?: string;
      company?: { name?: string };
      price?: string | number;
      custom_price?: string | number;
      delivery_time?: number;
      custom_delivery_time?: number;
      error?: string;
    }>;

    if (!Array.isArray(data)) return null;

    const options: ShippingOption[] = [];
    for (const row of data) {
      if (row.error) continue;
      const company = row.company?.name || 'Transportadora';
      // Prefer Correios; still accept if only Correios-like names
      const name = row.name || 'Serviço';
      const price = parseFloat(String(row.custom_price ?? row.price ?? ''));
      const days = Number(row.custom_delivery_time ?? row.delivery_time ?? 0);
      if (!Number.isFinite(price) || price <= 0) continue;
      options.push({
        id: String(row.id),
        name,
        company,
        price: Math.round(price * 100) / 100,
        days: Number.isFinite(days) && days > 0 ? days : 10,
        service: name,
      });
    }

    // Só conta como sucesso se veio opção utilizável: um 200 com lista vazia
    // ainda manda o cliente para o fallback, e registrar isso como "ok"
    // esconderia justamente o caso que queremos enxergar.
    if (options.length > 0) {
      lastSuccessAt = new Date().toISOString();
      lastFailure = null;
    }

    // Prefer Correios-branded options when present
    const correios = options.filter((o) => /correios/i.test(o.company) || /pac|sedex/i.test(o.name));
    return (correios.length ? correios : options).slice(0, 6);
  } catch (err) {
    console.warn('[shipping] Melhor Envio fetch failed', err);
    return null;
  }
}

// ─── Fallback table (when ME not configured / down) ──────────────────────────

function quoteFallback(destCep: string, pkg: PackageDims): ShippingOption[] {
  const uf = destCep; // used only for region via first digit heuristic
  // Brazilian CEP regions (1st digit): 2 = RJ/ES, 0-1 SP, 3 MG, etc.
  const region = destCep.charAt(0);
  const weightFactor = Math.max(1, Math.ceil(pkg.weightG / 500));

  let pacBase = 28;
  let sedexBase = 48;
  let pacDays = 12;
  let sedexDays = 5;

  if (region === '2') {
    // RJ / ES — closer to origin Copacabana
    pacBase = 18;
    sedexBase = 32;
    pacDays = 5;
    sedexDays = 2;
  } else if (region === '0' || region === '1') {
    pacBase = 24;
    sedexBase = 42;
    pacDays = 8;
    sedexDays = 3;
  } else if (region === '8' || region === '9') {
    pacBase = 36;
    sedexBase = 68;
    pacDays = 16;
    sedexDays = 7;
  }

  const pac = Math.round((pacBase + (weightFactor - 1) * 6) * 100) / 100;
  const sedex = Math.round((sedexBase + (weightFactor - 1) * 10) * 100) / 100;

  void uf;
  return [
    {
      id: 'fallback-pac',
      name: 'PAC',
      company: 'Correios',
      price: pac,
      days: pacDays,
      service: 'PAC',
    },
    {
      id: 'fallback-sedex',
      name: 'SEDEX',
      company: 'Correios',
      price: sedex,
      days: sedexDays,
      service: 'SEDEX',
    },
  ];
}

// ─── Public quote API ────────────────────────────────────────────────────────

export async function quoteShipping(
  destCepRaw: string,
  items: QuoteItemInput[]
): Promise<ShippingQuoteResult> {
  const destCep = normalizeCep(destCepRaw);
  if (destCep.length !== 8) {
    throw new AppError(400, 'CEP de destino inválido.', 'INVALID_CEP');
  }

  const pkg = await buildPackageFromItems(items);
  let options = await quoteMelhorEnvio(destCep, pkg);
  let source: 'melhor_envio' | 'fallback' = 'melhor_envio';

  if (!options || options.length === 0) {
    options = quoteFallback(destCep, pkg);
    source = 'fallback';
  }

  const exp = Date.now() + QUOTE_TTL_MS;
  const payload: QuotePayload = {
    cep: destCep,
    itemsKey: itemsKey(items),
    options,
    package: pkg,
    exp,
    source,
  };

  return {
    quoteToken: signQuote(payload),
    expiresAt: new Date(exp).toISOString(),
    options,
    package: pkg,
    source,
  };
}

export function trackingUrlForCode(code: string): string {
  const cleaned = code.trim();
  return `https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(cleaned)}`;
}
