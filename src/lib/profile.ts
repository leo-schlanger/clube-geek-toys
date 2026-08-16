import { api, apiRequest } from './api-client'
import type { CustomerProfile, SavedProduct, UpdateProfilePayload } from '../types'

/**
 * Perfil da loja — a conta que compra sem assinar o clube.
 *
 * Todas as rotas agem sobre o usuário do token; não existe id na URL, então não
 * há como pedir o perfil de outra pessoa.
 */

export async function fetchProfile(): Promise<CustomerProfile> {
  const result = await api.get<CustomerProfile>('/profile')
  if (result.error || !result.data) {
    throw new Error(result.error || 'Não foi possível carregar o perfil.')
  }
  return result.data
}

/**
 * Salva só o que mudou.
 *
 * Omitir a chave = não mexe; mandar `null` = apagar. A tela salva por seção, e
 * enviar o objeto inteiro apagaria campos que a pessoa nem abriu.
 */
export async function updateProfile(payload: UpdateProfilePayload): Promise<CustomerProfile> {
  const result = await api.patch<CustomerProfile>(
    '/profile',
    payload as unknown as Record<string, unknown>
  )
  if (result.error || !result.data) {
    throw new Error(result.error || 'Não foi possível salvar o perfil.')
  }
  return result.data
}

export type UploadPhotoResult =
  | { ok: true; profile: CustomerProfile }
  | { ok: false; error: string }

/** Foto é opcional — o erro volta tratável em vez de estourar. */
export async function uploadProfilePhoto(file: File): Promise<UploadPhotoResult> {
  const form = new FormData()
  form.append('photo', file)
  const result = await apiRequest<CustomerProfile>('/profile/photo', {
    method: 'POST',
    body: form,
    noRetry: true,
    timeoutMs: 120_000,
  })
  return result.data
    ? { ok: true, profile: result.data }
    : { ok: false, error: result.error || 'Falha no upload da foto.' }
}

export async function removeProfilePhoto(): Promise<CustomerProfile> {
  const result = await api.delete<CustomerProfile>('/profile/photo')
  if (result.error || !result.data) {
    throw new Error(result.error || 'Não foi possível remover a foto.')
  }
  return result.data
}

// ─── Produtos salvos ─────────────────────────────────────────────────────────

export async function fetchSavedProducts(): Promise<SavedProduct[]> {
  const result = await api.get<SavedProduct[]>('/profile/saved')
  return result.data ?? []
}

/** Só os ids — o catálogo usa para pintar o coração sem uma chamada por card. */
export async function fetchSavedProductIds(): Promise<string[]> {
  const result = await api.get<string[]>('/profile/saved/ids')
  return result.data ?? []
}

/**
 * Cache dos ids salvos, por sessão.
 *
 * Uma vitrine renderiza dezenas de cards e cada um precisa saber se está salvo;
 * sem isto seria uma chamada por card. Fica aqui, e não no componente, para o
 * AuthContext poder limpar no logout sem importar de `components/`.
 */
let savedIdsCache: Set<string> | null = null
let inFlight: Promise<Set<string>> | null = null

export async function loadSavedIds(): Promise<Set<string>> {
  if (savedIdsCache) return savedIdsCache
  if (!inFlight) {
    inFlight = fetchSavedProductIds()
      .then((ids) => {
        savedIdsCache = new Set(ids)
        return savedIdsCache
      })
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

/** Mantém o cache coerente após salvar/remover, sem refazer a chamada. */
export function markSavedInCache(productId: string, saved: boolean): void {
  if (!savedIdsCache) return
  if (saved) savedIdsCache.add(productId)
  else savedIdsCache.delete(productId)
}

/** Chamado no logout: o próximo usuário não pode herdar os salvos do anterior. */
export function clearSavedIdsCache(): void {
  savedIdsCache = null
  inFlight = null
}

/** Salvar e remover são idempotentes no servidor: repetir não quebra. */
export async function saveProduct(productId: string): Promise<boolean> {
  const result = await apiRequest(`/profile/saved/${productId}`, { method: 'PUT' })
  return !result.error
}

export async function unsaveProduct(productId: string): Promise<boolean> {
  const result = await apiRequest(`/profile/saved/${productId}`, { method: 'DELETE' })
  return !result.error
}
