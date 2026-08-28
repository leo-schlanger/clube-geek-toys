import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Loading } from '../ui/loading'
import { buttonVariants } from '../ui/button'
import { cn } from '../../lib/utils'
import { logger } from '../../lib/logger'
import { toast } from 'sonner'
import { prepareProductImages, PRODUCT_IMAGE_ACCEPT } from '../../lib/product-image'
import {
  listAlbums,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  getAlbum,
  uploadPhotos,
  deletePhoto,
  type GalleryAlbum,
} from '../../lib/gallery'
import { Images, Plus, Trash2, Upload, ArrowLeft, Star, EyeOff, Eye } from 'lucide-react'

/**
 * Institutional-site gallery. Two screens: the album list, and an open album
 * with its photos.
 */
export function GalleryTab() {
  const [albums, setAlbums] = useState<GalleryAlbum[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<GalleryAlbum | null>(null)
  const [uploading, setUploading] = useState(false)

  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchAlbums = useCallback(async () => {
    setLoading(true)
    try {
      setAlbums(await listAlbums(true))
    } catch (error) {
      logger.error('Error loading albums:', error)
      toast.error('Erro ao carregar a galeria')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    fetchAlbums()
  }, [fetchAlbums])

  const refreshOpenAlbum = useCallback(async (slug: string) => {
    const full = await getAlbum(slug)
    if (full) setOpen(full)
  }, [])

  async function handleCreate() {
    const name = newName.trim()
    if (!name) {
      toast.error('Dê um nome à pasta (ex.: Evento 6/9)')
      return
    }
    setCreating(true)
    try {
      const album = await createAlbum({ name, eventDate: newDate || null })
      if (!album) {
        toast.error('Erro ao criar a pasta')
        return
      }
      toast.success(`Pasta "${album.name}" criada`)
      setNewName('')
      setNewDate('')
      await fetchAlbums()
      setOpen(album)
    } catch (error) {
      logger.error('Error creating album:', error)
      toast.error('Erro ao criar a pasta')
    }
    setCreating(false)
  }

  async function handleDeleteAlbum(album: GalleryAlbum) {
    if (
      !window.confirm(
        `Apagar a pasta "${album.name}" e as ${album.photoCount} foto(s) dela? Isso não tem volta.`
      )
    ) {
      return
    }
    try {
      const ok = await deleteAlbum(album.id)
      if (!ok) {
        toast.error('Erro ao apagar a pasta')
        return
      }
      toast.success('Pasta apagada')
      setOpen(null)
      await fetchAlbums()
    } catch (error) {
      logger.error('Error deleting album:', error)
      toast.error('Erro ao apagar a pasta')
    }
  }

  async function handleToggleActive(album: GalleryAlbum) {
    try {
      const updated = await updateAlbum(album.id, { active: !album.active })
      if (!updated) {
        toast.error('Erro ao alterar a visibilidade')
        return
      }
      toast.success(updated.active ? 'Pasta publicada no site' : 'Pasta escondida do site')
      await fetchAlbums()
      if (open?.id === album.id) setOpen(updated)
    } catch (error) {
      logger.error('Error toggling album:', error)
      toast.error('Erro ao alterar a visibilidade')
    }
  }

  async function handlePickPhotos(e: React.ChangeEvent<HTMLInputElement>, album: GalleryAlbum) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (picked.length === 0) return

    setUploading(true)
    try {
      // Same preparation as product photos: 4K phone shots are resized.
      const { files, errors } = await prepareProductImages(picked)
      for (const msg of errors) toast.error(msg)
      if (files.length === 0) return

      const result = await uploadPhotos(album.id, files)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.skippedOverLimit > 0) {
        toast.error(`${result.skippedOverLimit} foto(s) não couberam no limite da pasta`)
      }
      toast.success(`${result.photos.length} foto(s) enviada(s)`)
      await refreshOpenAlbum(album.slug)
      await fetchAlbums()
    } catch (error) {
      logger.error('Error uploading photos:', error)
      toast.error('Erro ao enviar as fotos')
    }
    setUploading(false)
  }

  async function handleDeletePhoto(album: GalleryAlbum, photoId: string) {
    try {
      const ok = await deletePhoto(album.id, photoId)
      if (!ok) {
        toast.error('Erro ao remover a foto')
        return
      }
      await refreshOpenAlbum(album.slug)
      await fetchAlbums()
    } catch (error) {
      logger.error('Error deleting photo:', error)
      toast.error('Erro ao remover a foto')
    }
  }

  async function handleSetCover(album: GalleryAlbum, url: string) {
    try {
      const updated = await updateAlbum(album.id, { coverUrl: url })
      if (!updated) {
        toast.error('Erro ao definir a capa')
        return
      }
      toast.success('Capa definida')
      setOpen(updated)
      await fetchAlbums()
    } catch (error) {
      logger.error('Error setting cover:', error)
      toast.error('Erro ao definir a capa')
    }
  }

  // ─── Open album ────────────────────────────────────────────────────────────
  if (open) {
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
                <ArrowLeft className="h-4 w-4" />
                Pastas
              </Button>
              <div>
                <CardTitle>{open.name}</CardTitle>
                <CardDescription>
                  {open.photos?.length ?? 0} foto(s)
                  {open.eventDate && ` · ${new Date(`${open.eventDate}T12:00`).toLocaleDateString('pt-BR')}`}
                  {!open.active && ' · escondida do site'}
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              <label
                className={cn(
                  buttonVariants({ size: 'sm' }),
                  'relative cursor-pointer overflow-hidden',
                  uploading && 'pointer-events-none opacity-50'
                )}
              >
                <input
                  type="file"
                  accept={PRODUCT_IMAGE_ACCEPT}
                  multiple
                  onChange={(e) => handlePickPhotos(e, open)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Enviar fotos"
                />
                {uploading ? <Loading size="sm" /> : <Upload className="h-4 w-4" />}
                {uploading ? 'Enviando…' : 'Enviar fotos'}
              </label>
              <Button variant="outline" size="sm" onClick={() => handleToggleActive(open)}>
                {open.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {open.active ? 'Esconder' : 'Publicar'}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {!open.photos || open.photos.length === 0 ? (
            <div className="py-12 text-center">
              <Images className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="font-medium text-muted-foreground">Pasta vazia</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Use "Enviar fotos" para adicionar as imagens desta pasta.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {open.photos.map((photo) => {
                const isCover = open.coverUrl === photo.url
                return (
                  <div
                    key={photo.id}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border"
                  >
                    <img src={photo.url} alt={photo.caption ?? ''} className="h-full w-full object-cover" />
                    {isCover && (
                      <Badge className="absolute left-1 top-1 text-[10px]">capa</Badge>
                    )}
                    <div className="absolute inset-x-1 bottom-1 flex justify-between">
                      <button
                        type="button"
                        onClick={() => handleSetCover(open, photo.url)}
                        className="rounded bg-black/60 p-1 text-white hover:bg-black/80"
                        title="Usar como capa"
                        aria-label="Usar como capa"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePhoto(open, photo.id)}
                        className="rounded bg-black/60 p-1 text-white hover:bg-destructive"
                        title="Remover foto"
                        aria-label="Remover foto"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // ─── Lista de pastas ───────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Images className="h-5 w-5 text-primary" />
          Galeria do site
        </CardTitle>
        <CardDescription>
          Pastas de fotos que aparecem em geeketoys.com.br/galeria — ex.: "Evento 6/9", "Loja
          presencial Copacabana".
        </CardDescription>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="album-name">Nova pasta</Label>
            <Input
              id="album-name"
              placeholder="Ex.: Evento 6/9"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleCreate()
                }
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="album-date">Data (opcional)</Label>
            <Input
              id="album-date"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
          <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? <Loading size="sm" /> : <Plus className="h-4 w-4" />}
            Criar pasta
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loading />
          </div>
        ) : albums.length === 0 ? (
          <div className="py-12 text-center">
            <Images className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="font-medium text-muted-foreground">Nenhuma pasta ainda</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((album) => (
              <div
                key={album.id}
                className={cn(
                  'overflow-hidden rounded-lg border border-border transition-colors hover:border-primary/50',
                  !album.active && 'opacity-60'
                )}
              >
                <button
                  type="button"
                  onClick={() => refreshOpenAlbum(album.slug)}
                  className="block w-full text-left"
                >
                  <div className="flex aspect-video items-center justify-center bg-muted">
                    {album.coverUrl ? (
                      <img src={album.coverUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Images className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate font-medium">{album.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {album.photoCount} foto(s)
                      {album.eventDate &&
                        ` · ${new Date(`${album.eventDate}T12:00`).toLocaleDateString('pt-BR')}`}
                    </p>
                  </div>
                </button>
                <div className="flex items-center justify-between border-t border-border px-3 py-2">
                  <Badge variant={album.active ? 'success' : 'outline'}>
                    {album.active ? 'No site' : 'Escondida'}
                  </Badge>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleToggleActive(album)}
                      title={album.active ? 'Esconder do site' : 'Publicar no site'}
                      aria-label={album.active ? 'Esconder do site' : 'Publicar no site'}
                    >
                      {album.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                      onClick={() => handleDeleteAlbum(album)}
                      title="Apagar pasta"
                      aria-label={`Apagar pasta ${album.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
