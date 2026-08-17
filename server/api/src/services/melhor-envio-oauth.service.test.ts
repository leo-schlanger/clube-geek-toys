import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Melhor Envio OAuth2.
 *
 * Their panel hands out a Client ID + Secret, not an API token; installing the
 * secret as a token returns 401, and that 401 hides in the shipping fallback.
 * Without refresh the store would return to the fallback after ~30 days.
 */

const { queryMock, envMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  envMock: {
    NODE_ENV: 'test',
    API_URL: 'https://api.geeketoys.com.br',
    HMAC_SECRET: 'x'.repeat(32),
    MELHOR_ENVIO_CLIENT_ID: '28418',
    MELHOR_ENVIO_CLIENT_SECRET: 'segredo-do-app',
    MELHOR_ENVIO_SCOPES: 'shipping-calculate',
    MELHOR_ENVIO_REDIRECT_URI: undefined as string | undefined,
    MELHOR_ENVIO_TOKEN: undefined as string | undefined,
    MELHOR_ENVIO_SANDBOX: false,
  },
}));

vi.mock('../config/database.js', () => ({ query: queryMock, getClient: vi.fn() }));
vi.mock('../config/env.js', () => ({ env: envMock }));

const oauth = await import('./melhor-envio-oauth.service.js');
const { AppError } = await import('../middleware/error-handler.js');

const DAY = 24 * 60 * 60 * 1000;

/** A `config` row holding a stored token. */
function storedRow(over: Record<string, unknown> = {}) {
  return {
    rows: [
      {
        value: {
          accessToken: 'token-valido',
          refreshToken: 'refresh-valido',
          expiresAt: Date.now() + 30 * DAY,
          obtainedAt: Date.now(),
          sandbox: false,
          ...over,
        },
      },
    ],
  };
}

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

/** Captures the body sent to /oauth/token. */
function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, string> {
  return JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
}

beforeEach(() => {
  vi.clearAllMocks();
  envMock.MELHOR_ENVIO_TOKEN = undefined;
  envMock.MELHOR_ENVIO_SANDBOX = false;
  envMock.MELHOR_ENVIO_CLIENT_ID = '28418';
  envMock.MELHOR_ENVIO_CLIENT_SECRET = 'segredo-do-app';
  envMock.MELHOR_ENVIO_REDIRECT_URI = undefined;
  queryMock.mockResolvedValue({ rows: [] });
});

afterEach(() => vi.unstubAllGlobals());

describe('buildAuthorizeUrl', () => {
  it('monta a URL com client_id, redirect e scope', () => {
    const url = new URL(oauth.buildAuthorizeUrl());

    expect(url.origin).toBe('https://melhorenvio.com.br');
    expect(url.pathname).toBe('/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('28418');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.geeketoys.com.br/shipping/melhor-envio/callback'
    );
    expect(url.searchParams.get('scope')).toBe('shipping-calculate');
  });

  it('aponta para o sandbox quando a flag está ligada', () => {
    envMock.MELHOR_ENVIO_SANDBOX = true;
    expect(new URL(oauth.buildAuthorizeUrl()).origin).toBe(
      'https://sandbox.melhorenvio.com.br'
    );
  });

  it('nunca coloca o client_secret na URL de autorização', () => {
    // The URL reaches the address bar and the browser history.
    expect(oauth.buildAuthorizeUrl()).not.toContain('segredo-do-app');
  });

  it('falha claro quando faltam as credenciais', () => {
    envMock.MELHOR_ENVIO_CLIENT_ID = undefined as unknown as string;
    expect(() => oauth.buildAuthorizeUrl()).toThrow(AppError);
  });
});

describe('isValidState — proteção do callback', () => {
  it('aceita o state que ele mesmo emitiu', () => {
    const state = new URL(oauth.buildAuthorizeUrl()).searchParams.get('state')!;
    expect(oauth.isValidState(state)).toBe(true);
  });

  // The callback is public; without this check anyone could drive the token
  // exchange with a `code` of their own.
  it('recusa state ausente, vazio ou forjado', () => {
    expect(oauth.isValidState(undefined)).toBe(false);
    expect(oauth.isValidState('')).toBe(false);
    expect(oauth.isValidState('qualquer-coisa')).toBe(false);
  });

  it('recusa state malformado sem estourar exceção', () => {
    // A different-length signature used to make timingSafeEqual throw a 500.
    expect(() => oauth.isValidState('aaa.bbb')).not.toThrow();
    expect(oauth.isValidState('aaa.bbb')).toBe(false);
  });
});

describe('exchangeCodeForToken', () => {
  it('troca o code e guarda access + refresh', async () => {
    const fetchMock = mockFetch(200, {
      access_token: 'novo-token',
      refresh_token: 'novo-refresh',
      expires_in: 2592000,
    });
    vi.stubGlobal('fetch', fetchMock);

    await oauth.exchangeCodeForToken('codigo-do-callback');

    const body = sentBody(fetchMock as ReturnType<typeof vi.fn>);
    expect(body.grant_type).toBe('authorization_code');
    expect(body.client_secret).toBe('segredo-do-app');
    expect(body.code).toBe('codigo-do-callback');

    const saved = queryMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO config')
    );
    const value = JSON.parse((saved![1] as unknown[])[1] as string);
    expect(value.accessToken).toBe('novo-token');
    expect(value.refreshToken).toBe('novo-refresh');
    expect(value.sandbox).toBe(false);
  });

  it('propaga recusa do Melhor Envio sem vazar o secret na mensagem', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(401, { error: 'invalid_client', client_secret: 'segredo-do-app' })
    );

    await expect(oauth.exchangeCodeForToken('x')).rejects.toThrow(/invalid_client/);
    await expect(oauth.exchangeCodeForToken('x')).rejects.not.toThrow(/segredo-do-app/);
  });
});

describe('getAccessToken', () => {
  it('devolve null quando nunca foi autorizado', async () => {
    await expect(oauth.getAccessToken()).resolves.toBeNull();
  });

  it('usa o token guardado quando está longe de expirar', async () => {
    queryMock.mockResolvedValue(storedRow());
    await expect(oauth.getAccessToken()).resolves.toBe('token-valido');
  });

  it('MELHOR_ENVIO_TOKEN manual tem precedência e nem consulta o banco', async () => {
    envMock.MELHOR_ENVIO_TOKEN = 'token-colado-na-mao';
    await expect(oauth.getAccessToken()).resolves.toBe('token-colado-na-mao');
    expect(queryMock).not.toHaveBeenCalled();
  });

  // Without this the store returns to the fallback in ~30 days, unnoticed.
  it('renova quando está perto de expirar', async () => {
    queryMock.mockResolvedValue(storedRow({ expiresAt: Date.now() + 2 * 60 * 60 * 1000 }));
    const fetchMock = mockFetch(200, {
      access_token: 'token-renovado',
      refresh_token: 'refresh-2',
      expires_in: 2592000,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(oauth.getAccessToken()).resolves.toBe('token-renovado');
    expect(sentBody(fetchMock as ReturnType<typeof vi.fn>).grant_type).toBe('refresh_token');
  });

  it('segue com o token atual se a renovação falhar mas ele ainda valer', async () => {
    queryMock.mockResolvedValue(storedRow({ expiresAt: Date.now() + 2 * 60 * 60 * 1000 }));
    vi.stubGlobal('fetch', mockFetch(500, {}));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(oauth.getAccessToken()).resolves.toBe('token-valido');
  });

  it('devolve null quando já expirou e não renovou — token morto só daria 401', async () => {
    queryMock.mockResolvedValue(storedRow({ expiresAt: Date.now() - DAY }));
    vi.stubGlobal('fetch', mockFetch(500, {}));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(oauth.getAccessToken()).resolves.toBeNull();
  });

  // A sandbox token against production returns 401, which the fallback hides.
  it('ignora token guardado de outro ambiente', async () => {
    queryMock.mockResolvedValue(storedRow({ sandbox: true }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(oauth.getAccessToken()).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('sandbox'));
    error.mockRestore();
  });
});

describe('getOAuthStatus', () => {
  it('reporta o estado sem jamais incluir o token', async () => {
    queryMock.mockResolvedValue(storedRow());

    const status = await oauth.getOAuthStatus();

    expect(status.credentialsConfigured).toBe(true);
    expect(status.authorized).toBe(true);
    expect(status.canRefresh).toBe(true);
    expect(status.redirectUri).toBe(
      'https://api.geeketoys.com.br/shipping/melhor-envio/callback'
    );
    expect(JSON.stringify(status)).not.toContain('token-valido');
    expect(JSON.stringify(status)).not.toContain('refresh-valido');
    expect(JSON.stringify(status)).not.toContain('segredo-do-app');
  });

  it('marca não autorizado quando não há token guardado', async () => {
    const status = await oauth.getOAuthStatus();
    expect(status.authorized).toBe(false);
    expect(status.expiresAt).toBeNull();
  });
});

describe('redirectUri — domínio do callback', () => {
  it('deriva do API_URL quando não há override', () => {
    expect(oauth.redirectUri()).toBe(
      'https://api.geeketoys.com.br/shipping/melhor-envio/callback'
    );
  });

  // The two domains are mirrors; the override picks one without touching
  // API_URL, which is baked into stored upload URLs.
  it('respeita o override para o domínio espelho', () => {
    envMock.MELHOR_ENVIO_REDIRECT_URI =
      'https://api.geekpoptoys.com.br/shipping/melhor-envio/callback';

    expect(oauth.redirectUri()).toBe(
      'https://api.geekpoptoys.com.br/shipping/melhor-envio/callback'
    );
    expect(new URL(oauth.buildAuthorizeUrl()).searchParams.get('redirect_uri')).toBe(
      'https://api.geekpoptoys.com.br/shipping/melhor-envio/callback'
    );
  });

  it('ignora override em branco e volta para o API_URL', () => {
    envMock.MELHOR_ENVIO_REDIRECT_URI = '   ';
    expect(oauth.redirectUri()).toContain('api.geeketoys.com.br');
  });
})
