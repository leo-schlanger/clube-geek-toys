import { useEffect, useState } from 'react'
import { Camera, Download, Loader2, X, Images } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import {
  ACTIVE_EVENT,
  photoPublicUrl,
  type EventConfig,
  type EventPhoto,
} from '../../data/event'

async function downloadFile(url: string, filename: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Falha ao baixar ${filename}`)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

type LightboxState = { photo: EventPhoto; url: string } | null

export function EventPhotosSection({ event = ACTIVE_EVENT }: { event?: EventConfig }) {
  const [lightbox, setLightbox] = useState<LightboxState>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [busyFile, setBusyFile] = useState<string | null>(null)

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  const photos = event.photos
  const hasPhotos = photos.length > 0

  async function handleDownloadOne(photo: EventPhoto) {
    const url = photoPublicUrl(event, photo.file)
    setBusyFile(photo.file)
    try {
      await downloadFile(url, photo.file)
      toast.success(`Download: ${photo.file}`)
    } catch {
      toast.error('Não foi possível baixar esta foto.')
    } finally {
      setBusyFile(null)
    }
  }

  async function handleDownloadAll() {
    if (!hasPhotos) return
    setDownloadingAll(true)
    let ok = 0
    try {
      for (const photo of photos) {
        try {
          await downloadFile(photoPublicUrl(event, photo.file), photo.file)
          ok += 1
          await new Promise((r) => setTimeout(r, 350))
        } catch {
          /* continua */
        }
      }
      if (ok === photos.length) toast.success(`${ok} foto(s) baixada(s).`)
      else if (ok > 0) toast.message(`Baixadas ${ok} de ${photos.length}.`)
      else toast.error('Nenhuma foto pôde ser baixada.')
    } finally {
      setDownloadingAll(false)
    }
  }

  return (
    <>
      <section id="fotos-evento" className="scroll-mt-28">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
              <Camera className="h-3.5 w-3.5" />
              Fotos do evento
            </span>
            <h2 className="font-heading text-2xl font-bold md:text-3xl">
              Galeria — {event.shortTitle}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Baixe as fotos oficiais daqui — sem precisar pedir a foto de cada pessoa no WhatsApp.
            </p>
          </div>

          {hasPhotos && (
            <Button onClick={handleDownloadAll} disabled={downloadingAll} className="gap-2">
              {downloadingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Baixar todas ({photos.length})
            </Button>
          )}
        </div>

        {!hasPhotos ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center md:p-14">
            <Images className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 font-heading text-xl font-bold">Fotos em breve</h3>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Assim que a equipe publicar as fotos do evento, elas aparecem aqui com download.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((photo) => {
              const url = photoPublicUrl(event, photo.file)
              return (
                <div
                  key={photo.file}
                  className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => setLightbox({ photo, url })}
                    className="block w-full text-left"
                  >
                    <img
                      src={url}
                      alt={photo.alt ?? photo.caption ?? photo.file}
                      className="h-64 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  </button>
                  <div className="flex items-center justify-between gap-2 border-t border-border p-3">
                    <p className="min-w-0 truncate text-xs text-muted-foreground">
                      {photo.caption ?? photo.file}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="shrink-0 gap-1"
                      disabled={busyFile === photo.file}
                      onClick={() => handleDownloadOne(photo)}
                    >
                      {busyFile === photo.file ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Baixar
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {lightbox && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Foto ampliada"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-5 top-5 rounded-full p-2 text-white hover:bg-white/10"
            aria-label="Fechar"
          >
            <X size={28} />
          </button>
          <div
            className="flex w-full max-w-5xl flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox.url}
              alt={lightbox.photo.alt ?? lightbox.photo.caption ?? 'Foto do evento'}
              className="max-h-[78vh] max-w-full rounded-xl object-contain shadow-2xl"
            />
            <Button
              type="button"
              className="gap-2"
              onClick={() => handleDownloadOne(lightbox.photo)}
            >
              <Download className="h-4 w-4" />
              Baixar esta foto
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

export default EventPhotosSection
