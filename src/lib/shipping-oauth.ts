import { api } from './api-client'

export interface MelhorEnvioStatus {
  credentialsConfigured: boolean
  authorized: boolean
  sandbox: boolean
  expiresAt: string | null
  obtainedAt: string | null
  canRefresh: boolean
  redirectUri: string
  manualTokenOverride: boolean
  scopes: string[]
  missingScopes: string[]
  /**
   * Whether a label can be bought *today*. `authorized` only says a token
   * exists; one issued before the scope list was widened is authorized and
   * still cannot buy.
   */
  canBuyLabel: boolean
}

export async function getMelhorEnvioStatus(): Promise<MelhorEnvioStatus | null> {
  const result = await api.get<MelhorEnvioStatus>('/shipping/melhor-envio/status')
  if (result.error || !result.data) return null
  return result.data
}

/** The URL to send the shop owner to. Opening it is the caller's job. */
export async function startMelhorEnvioAuthorization(): Promise<string> {
  const result = await api.get<{ url: string }>('/shipping/melhor-envio/authorize')
  if (result.error || !result.data?.url) {
    throw new Error(result.error || 'O servidor não devolveu o link de autorização.')
  }
  return result.data.url
}
