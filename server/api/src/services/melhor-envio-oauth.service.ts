import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import { createHmacToken, verifyHmacToken } from '../utils/hmac.js';

/**
 * OAuth2 do Melhor Envio.
 *
 * O painel deles entrega **Client ID + Secret**, não um token de API — foi essa
 * confusão que gerou 401 em produção e em sandbox em 16/08/2026, com o frete
 * caindo silenciosamente na tabela interna. Com as duas credenciais dá para
 * obter um token, e é isso que este módulo faz.
 *
 * O refresh não é luxo: o token do Melhor Envio expira (na ordem de 30 dias).
 * Sem renovar, a loja voltaria a cotar pela tabela interna um mês depois, do
 * mesmo jeito invisível — por isso o refresh_token é guardado junto.
 */

const CONFIG_KEY = 'melhor_envio_oauth';

/** Renova antes de expirar de fato: evita corrida com a cotação em andamento. */
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;

/** O `state` só precisa sobreviver ao tempo da pessoa autorizando na tela deles. */
const STATE_TTL_MS = 15 * 60 * 1000;

export function melhorEnvioBaseUrl(): string {
  return env.MELHOR_ENVIO_SANDBOX
    ? 'https://sandbox.melhorenvio.com.br'
    : 'https://melhorenvio.com.br';
}

/** Precisa bater **exatamente** com o cadastrado no painel do Melhor Envio. */
export function redirectUri(): string {
  return `${env.API_URL}/shipping/melhor-envio/callback`;
}

interface StoredToken {
  accessToken: string;
  refreshToken: string | null;
  /** epoch ms */
  expiresAt: number;
  obtainedAt: number;
  sandbox: boolean;
}

async function loadToken(): Promise<StoredToken | null> {
  const result = await query(`SELECT value FROM config WHERE key = $1`, [CONFIG_KEY]);
  const value = result.rows[0]?.value as StoredToken | undefined;
  if (!value?.accessToken) return null;
  return value;
}

async function saveToken(token: StoredToken): Promise<void> {
  await query(
    `INSERT INTO config (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
    [CONFIG_KEY, JSON.stringify(token)]
  );
}

export async function clearToken(): Promise<void> {
  await query(`DELETE FROM config WHERE key = $1`, [CONFIG_KEY]);
}

function requireCredentials(): { clientId: string; clientSecret: string } {
  const clientId = env.MELHOR_ENVIO_CLIENT_ID;
  const clientSecret = env.MELHOR_ENVIO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new AppError(
      503,
      'Melhor Envio não configurado: faltam MELHOR_ENVIO_CLIENT_ID e MELHOR_ENVIO_CLIENT_SECRET.',
      'MELHOR_ENVIO_NOT_CONFIGURED'
    );
  }
  return { clientId, clientSecret };
}

/**
 * Monta a URL de autorização com um `state` assinado.
 *
 * O `state` é HMAC com validade curta em vez de um valor guardado em sessão: o
 * callback chega numa requisição sem cookie nossa, e assinar é o que impede
 * alguém de disparar o callback com um `code` próprio.
 */
export function buildAuthorizeUrl(): string {
  const { clientId } = requireCredentials();
  const state = createHmacToken({ purpose: 'melhor_envio_oauth' }, STATE_TTL_MS);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    state,
    scope: env.MELHOR_ENVIO_SCOPES,
  });
  return `${melhorEnvioBaseUrl()}/oauth/authorize?${params.toString()}`;
}

export function isValidState(state: string | undefined): boolean {
  if (!state) return false;
  const payload = verifyHmacToken(state);
  return payload?.purpose === 'melhor_envio_oauth';
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  message?: string;
}

async function postToken(body: Record<string, string>): Promise<StoredToken> {
  const res = await fetch(`${melhorEnvioBaseUrl()}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'GeekPopToys Loja (contato@geeketoys.com.br)',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  const data = (await res.json().catch(() => ({}))) as TokenResponse;

  if (!res.ok || !data.access_token) {
    // Nunca ecoar `data` inteiro: a resposta de erro pode devolver o que foi
    // enviado, e aí o client_secret entraria no log.
    const reason = data.error || data.message || `HTTP ${res.status}`;
    throw new AppError(
      502,
      `Melhor Envio recusou a troca de token: ${reason}`,
      'MELHOR_ENVIO_TOKEN_EXCHANGE_FAILED'
    );
  }

  // Sem expires_in, assume 30 dias e deixa o refresh cuidar do resto.
  const expiresInMs = (data.expires_in ?? 30 * 24 * 3600) * 1000;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: Date.now() + expiresInMs,
    obtainedAt: Date.now(),
    sandbox: Boolean(env.MELHOR_ENVIO_SANDBOX),
  };
}

/** Troca o `code` do callback por um token e guarda. */
export async function exchangeCodeForToken(code: string): Promise<void> {
  const { clientId, clientSecret } = requireCredentials();
  const token = await postToken({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(),
    code,
  });
  await saveToken(token);
  console.log('[shipping] Melhor Envio: token obtido e salvo');
}

async function refresh(stored: StoredToken): Promise<StoredToken | null> {
  if (!stored.refreshToken) return null;
  const { clientId, clientSecret } = requireCredentials();
  try {
    const token = await postToken({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: stored.refreshToken,
      scope: env.MELHOR_ENVIO_SCOPES,
    });
    await saveToken(token);
    console.log('[shipping] Melhor Envio: token renovado');
    return token;
  } catch (err) {
    console.error(
      '[shipping] Melhor Envio: FALHA AO RENOVAR O TOKEN — o frete vai cair na ' +
        'tabela de fallback quando o atual expirar. Refaça a autorização em ' +
        '/shipping/melhor-envio/authorize.',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Token válido para as chamadas da API, ou null.
 *
 * `MELHOR_ENVIO_TOKEN` continua tendo precedência: serve de escape manual se o
 * OAuth estiver indisponível e alguém colar um token na mão.
 */
export async function getAccessToken(): Promise<string | null> {
  if (env.MELHOR_ENVIO_TOKEN) return env.MELHOR_ENVIO_TOKEN;

  const stored = await loadToken();
  if (!stored) return null;

  // Token obtido no outro ambiente não vale aqui — e usá-lo daria 401, que o
  // fallback esconderia. Melhor tratar como ausente.
  if (stored.sandbox !== Boolean(env.MELHOR_ENVIO_SANDBOX)) {
    console.error(
      `[shipping] Melhor Envio: token guardado é de ${stored.sandbox ? 'sandbox' : 'produção'} ` +
        `mas a API está em ${env.MELHOR_ENVIO_SANDBOX ? 'sandbox' : 'produção'}. Ignorando.`
    );
    return null;
  }

  if (stored.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return stored.accessToken;
  }
  const renewed = await refresh(stored);
  // Expirado de fato e sem renovar: devolver o velho só produziria 401.
  if (!renewed) return stored.expiresAt > Date.now() ? stored.accessToken : null;
  return renewed.accessToken;
}

export interface OAuthStatus {
  credentialsConfigured: boolean;
  authorized: boolean;
  sandbox: boolean;
  expiresAt: string | null;
  obtainedAt: string | null;
  canRefresh: boolean;
  redirectUri: string;
  manualTokenOverride: boolean;
}

/** Estado para o painel admin. Nunca inclui o token em si. */
export async function getOAuthStatus(): Promise<OAuthStatus> {
  const stored = await loadToken();
  return {
    credentialsConfigured: Boolean(
      env.MELHOR_ENVIO_CLIENT_ID && env.MELHOR_ENVIO_CLIENT_SECRET
    ),
    authorized: Boolean(stored),
    sandbox: Boolean(env.MELHOR_ENVIO_SANDBOX),
    expiresAt: stored ? new Date(stored.expiresAt).toISOString() : null,
    obtainedAt: stored ? new Date(stored.obtainedAt).toISOString() : null,
    canRefresh: Boolean(stored?.refreshToken),
    redirectUri: redirectUri(),
    manualTokenOverride: Boolean(env.MELHOR_ENVIO_TOKEN),
  };
}
