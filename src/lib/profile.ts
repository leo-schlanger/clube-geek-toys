import { api, apiRequest } from './api-client'
import type { CustomerProfile, SavedProduct, UpdateProfilePayload } from '../types'

/**
 * Shop profile: the account that buys without subscribing.
 *
 * Every route acts on the token's user. There is no id in the URL, so no way to
 * request someone else's profile.
 */

export async function fetchProfile(): Promise<CustomerProfile> {
  const result = await api.get<CustomerProfile>('/profile')
  if (result.error || !result.data) {
    throw new Error(result.error || 'Não foi possível carregar o perfil.')
  }
  return result.data
}

/**
 * Omitting a key leaves the field alone; sending `null` clears it. The screen
 * saves per section, and sending the whole object would wipe fields the person
 * never opened.
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

/** The photo is optional, so failure returns a value instead of throwing. */
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

// ─── Saved products ──────────────────────────────────────────────────────────

export async function fetchSavedProducts(): Promise<SavedProduct[]> {
  const result = await api.get<SavedProduct[]>('/profile/saved')
  return result.data ?? []
}

/** Ids only, so the catalogue can fill in hearts without a call per card. */
export async function fetchSavedProductIds(): Promise<string[]> {
  const result = await api.get<string[]>('/profile/saved/ids')
  return result.data ?? []
}

/**
 * Session cache of saved ids.
 *
 * A storefront renders dozens of cards and each needs to know its state; without
 * this it would be one call per card. It lives here rather than in the component
 * so AuthContext can clear it on logout without importing from `components/`.
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

/** Keeps the cache in step after a save or removal, without refetching. */
export function markSavedInCache(productId: string, saved: boolean): void {
  if (!savedIdsCache) return
  if (saved) savedIdsCache.add(productId)
  else savedIdsCache.delete(productId)
}

/** Called on logout: the next user must not inherit the previous one's saves. */
export function clearSavedIdsCache(): void {
  savedIdsCache = null
  inFlight = null
}

/** Save and remove are idempotent server-side; repeating is harmless. */
export async function saveProduct(productId: string): Promise<boolean> {
  const result = await apiRequest(`/profile/saved/${productId}`, { method: 'PUT' })
  return !result.error
}

export async function unsaveProduct(productId: string): Promise<boolean> {
  const result = await apiRequest(`/profile/saved/${productId}`, { method: 'DELETE' })
  return !result.error
}
