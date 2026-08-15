import { api, apiRequest } from './api-client'

/** Galeria do site institucional, organizada em álbuns ("pastas"). */

export const MAX_PHOTO_UPLOAD_BATCH = 20

export interface GalleryPhoto {
  id: string
  albumId: string
  url: string
  caption: string | null
  sortOrder: number
  createdAt: string
}

export interface GalleryAlbum {
  id: string
  name: string
  slug: string
  description: string | null
  coverUrl: string | null
  /** YYYY-MM-DD, quando o álbum é de um evento. */
  eventDate: string | null
  active: boolean
  sortOrder: number
  photoCount: number
  createdAt: string
  updatedAt: string
  photos?: GalleryPhoto[]
}

export interface AlbumInput {
  name: string
  description?: string | null
  coverUrl?: string | null
  eventDate?: string | null
  active?: boolean
  sortOrder?: number
}

export async function listAlbums(includeInactive = false): Promise<GalleryAlbum[]> {
  const path = includeInactive ? '/gallery/admin/albums' : '/gallery'
  const result = await api.get<{ albums: GalleryAlbum[] }>(path, {
    skipAuth: !includeInactive,
  })
  return result.data?.albums ?? []
}

export async function getAlbum(slug: string): Promise<GalleryAlbum | null> {
  const result = await api.get<GalleryAlbum>(`/gallery/${slug}`, { skipAuth: true })
  return result.data ?? null
}

export async function createAlbum(data: AlbumInput): Promise<GalleryAlbum | null> {
  const result = await api.post<GalleryAlbum>('/gallery/albums', data as unknown as Record<string, unknown>)
  return result.data ?? null
}

export async function updateAlbum(
  id: string,
  data: Partial<AlbumInput>
): Promise<GalleryAlbum | null> {
  const result = await api.patch<GalleryAlbum>(
    `/gallery/albums/${id}`,
    data as unknown as Record<string, unknown>
  )
  return result.data ?? null
}

export async function deleteAlbum(id: string): Promise<boolean> {
  const result = await api.delete(`/gallery/albums/${id}`)
  return !result.error
}

export type UploadPhotosResult =
  | { ok: true; photos: GalleryPhoto[]; skippedOverLimit: number }
  | { ok: false; error: string }

/** Sobe fotos em lotes do tamanho que o multer aceita por requisição. */
export async function uploadPhotos(albumId: string, files: File[]): Promise<UploadPhotosResult> {
  if (!files.length) return { ok: false, error: 'Nenhuma foto selecionada.' }

  const photos: GalleryPhoto[] = []
  let skippedOverLimit = 0

  for (let i = 0; i < files.length; i += MAX_PHOTO_UPLOAD_BATCH) {
    const form = new FormData()
    for (const f of files.slice(i, i + MAX_PHOTO_UPLOAD_BATCH)) form.append('photos', f)
    const result = await apiRequest<{ photos: GalleryPhoto[]; skippedOverLimit: number }>(
      `/gallery/albums/${albumId}/photos`,
      { method: 'POST', body: form, noRetry: true, timeoutMs: 180_000 }
    )
    if (!result.data) {
      return { ok: false, error: result.error || 'Falha no upload das fotos.' }
    }
    photos.push(...result.data.photos)
    skippedOverLimit += result.data.skippedOverLimit ?? 0
  }

  return { ok: true, photos, skippedOverLimit }
}

export async function deletePhoto(albumId: string, photoId: string): Promise<boolean> {
  const result = await api.delete(`/gallery/albums/${albumId}/photos/${photoId}`)
  return !result.error
}

export async function reorderPhotos(
  albumId: string,
  photoIds: string[]
): Promise<GalleryPhoto[] | null> {
  const result = await api.put<{ photos: GalleryPhoto[] }>(
    `/gallery/albums/${albumId}/photos/order`,
    { photoIds } as unknown as Record<string, unknown>
  )
  return result.data?.photos ?? null
}
