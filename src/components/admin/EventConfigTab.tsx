import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CalendarDays,
  Copy,
  ImageUp,
  MapPin,
  Plus,
  Ticket,
  Trash2,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Loading } from '../ui/loading'
import { logger } from '../../lib/logger'
import { useConfirm } from '../../hooks/useConfirm'
import { formatEventDateRange, type EventConfig, type EventStatus } from '../../data/event'
import {
  createEvent,
  deleteEvent,
  duplicateEvent,
  listEvents,
  updateEvent,
  uploadEventBanner,
  type EventInput,
} from '../../lib/events'

/**
 * Event catalogue.
 *
 * Until this, the event was hardcoded in three files and two repos, and every
 * change — new date, venue, flyer, next event — was a deploy. Now an event
 * ends, you duplicate, adjust, and publish.
 *
 * Only **published** appears in the shop and site; among several published,
 * the one that has not ended and starts first wins (`event-config.service`).
 */

const STATUS_LABEL: Record<EventStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  archived: 'Arquivado',
}

const STATUS_VARIANT: Record<EventStatus, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  published: 'default',
  archived: 'outline',
}

const BANNER_ACCEPT = 'image/jpeg,image/png,image/webp'
const BANNER_MAX_BYTES = 8 * 1024 * 1024

/** Offset ISO → `YYYY-MM-DDTHH:mm` for `datetime-local`, in the browser timezone. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** `datetime-local` → offset ISO. The server requires an explicit offset. */
function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function priceToInput(cents: number | null): string {
  return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',')
}

/** `20,00` and `20.00` become 2000. Empty becomes `null` (free event). */
function inputToPriceCents(value: string): number | null {
  const cleaned = value.trim().replace(/\./g, '').replace(',', '.')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null
}

type FormState = {
  title: string
  shortTitle: string
  status: EventStatus
  bannerText: string
  startsAt: string
  endsAt: string
  locationName: string
  locationAddress: string
  locationMapsUrl: string
  description: string
  highlights: string
  memberPerk: string
  reservationsOpen: boolean
  price: string
  currencyLabel: string
  maxPerReservation: string
  whatsappNumber: string
  reservationNotes: string
}

function toForm(event: EventConfig): FormState {
  return {
    title: event.title,
    shortTitle: event.shortTitle,
    status: event.status,
    bannerText: event.bannerText,
    startsAt: toLocalInput(event.startsAt),
    endsAt: toLocalInput(event.endsAt),
    locationName: event.location.name,
    locationAddress: event.location.address,
    locationMapsUrl: event.location.mapsUrl ?? '',
    // One paragraph per line, one highlight per line: what Laura can edit
    // without learning a syntax.
    description: event.description.join('\n'),
    highlights: event.highlights.join('\n'),
    memberPerk: event.memberPerk ?? '',
    reservationsOpen: event.ticketReservation.enabled,
    price: priceToInput(event.priceCents),
    currencyLabel: event.ticketReservation.currencyLabel,
    maxPerReservation:
      event.ticketReservation.maxPerReservation == null
        ? ''
        : String(event.ticketReservation.maxPerReservation),
    whatsappNumber: event.ticketReservation.whatsappNumber,
    reservationNotes: event.ticketReservation.notes ?? '',
  }
}

const EMPTY_FORM: FormState = {
  title: '',
  shortTitle: '',
  status: 'draft',
  bannerText: '',
  startsAt: '',
  endsAt: '',
  locationName: '',
  locationAddress: '',
  locationMapsUrl: '',
  description: '',
  highlights: '',
  memberPerk: '',
  reservationsOpen: true,
  price: '',
  currencyLabel: 'R$',
  maxPerReservation: '',
  whatsappNumber: '',
  reservationNotes: '',
}

function toLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function toPayload(form: FormState): EventInput | { error: string } {
  const startsAt = fromLocalInput(form.startsAt)
  if (!form.title.trim()) return { error: 'Dê um título ao evento.' }
  if (!startsAt) return { error: 'Informe a data e a hora de início.' }

  const endsAt = fromLocalInput(form.endsAt)
  if (form.endsAt && !endsAt) return { error: 'Data de término inválida.' }
  if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
    return { error: 'O término precisa ser depois do início.' }
  }

  const max = form.maxPerReservation.trim()
  return {
    title: form.title.trim(),
    shortTitle: form.shortTitle.trim() || form.title.trim(),
    status: form.status,
    bannerText: form.bannerText.trim(),
    startsAt,
    endsAt,
    locationName: form.locationName.trim(),
    locationAddress: form.locationAddress.trim(),
    locationMapsUrl: form.locationMapsUrl.trim() || null,
    description: toLines(form.description),
    highlights: toLines(form.highlights),
    memberPerk: form.memberPerk.trim() || null,
    reservationsOpen: form.reservationsOpen,
    priceCents: inputToPriceCents(form.price),
    currencyLabel: form.currencyLabel.trim() || 'R$',
    maxPerReservation: max ? Number(max) : null,
    whatsappNumber: form.whatsappNumber.replace(/\D/g, ''),
    reservationNotes: form.reservationNotes.trim() || null,
  }
}

const FIELD_CLASS =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

export function EventConfigTab() {
  const confirm = useConfirm()
  const [events, setEvents] = useState<EventConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EventConfig | null>(null)
  /** True while the create form is open. */
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try {
      setEvents(await listEvents())
    } catch (error) {
      logger.error('Error loading events:', error)
      toast.error('Erro ao carregar os eventos')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void fetchEvents()
  }, [fetchEvents])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  function openCreate() {
    setForm(EMPTY_FORM)
    setEditing(null)
    setCreating(true)
  }

  function openEdit(event: EventConfig) {
    setForm(toForm(event))
    setEditing(event)
    setCreating(false)
  }

  function closeForm() {
    setEditing(null)
    setCreating(false)
  }

  async function handleSave() {
    const payload = toPayload(form)
    if ('error' in payload) {
      toast.error(payload.error)
      return
    }

    setSaving(true)
    try {
      if (editing) {
        const saved = await updateEvent(editing.id, payload)
        setEvents((prev) => prev.map((e) => (e.id === saved.id ? saved : e)))
        setEditing(saved)
        toast.success('Evento salvo')
      } else {
        // Stay on the form, now in edit mode: the banner can only be uploaded
        // after the event has an id, and that is the next thing she wants.
        const created = await createEvent(payload)
        setEditing(created)
        setCreating(false)
        setForm(toForm(created))
        await fetchEvents()
        toast.success('Evento criado — agora dá para enviar o banner')
      }
    } catch (error) {
      logger.error('Error saving event:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar o evento')
    }
    setSaving(false)
  }

  async function handleStatus(event: EventConfig, status: EventStatus) {
    try {
      const saved = await updateEvent(event.id, { status })
      setEvents((prev) => prev.map((e) => (e.id === saved.id ? saved : e)))
      if (editing?.id === saved.id) setEditing(saved)
      toast.success(
        status === 'published' ? 'Evento publicado — já está no ar' : `Evento: ${STATUS_LABEL[status]}`
      )
    } catch (error) {
      logger.error('Error changing event status:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao mudar o status')
    }
  }

  async function handleDuplicate(event: EventConfig) {
    try {
      const copy = await duplicateEvent(event.id)
      await fetchEvents()
      openEdit(copy)
      toast.success('Cópia criada como rascunho — ajuste data e local')
    } catch (error) {
      logger.error('Error duplicating event:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao duplicar o evento')
    }
  }

  async function handleDelete(event: EventConfig) {
    const ok = await confirm({
      title: 'Excluir evento',
      description: `"${event.title}" será removido. Eventos com reservas não podem ser excluídos — arquive-os.`,
      confirmText: 'Excluir',
      variant: 'destructive',
    })
    if (!ok) return

    try {
      await deleteEvent(event.id)
      setEvents((prev) => prev.filter((e) => e.id !== event.id))
      if (editing?.id === event.id) closeForm()
      toast.success('Evento excluído')
    } catch (error) {
      logger.error('Error deleting event:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir o evento')
    }
  }

  async function handleBanner(file: File) {
    if (!editing) return
    if (file.size > BANNER_MAX_BYTES) {
      toast.error('Imagem acima de 8 MB. Reduza antes de enviar.')
      return
    }

    setUploading(true)
    try {
      const saved = await uploadEventBanner(editing.id, file)
      setEditing(saved)
      setEvents((prev) => prev.map((e) => (e.id === saved.id ? saved : e)))
      toast.success('Banner atualizado')
    } catch (error) {
      logger.error('Error uploading event banner:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar o banner')
    }
    setUploading(false)
    if (bannerInputRef.current) bannerInputRef.current.value = ''
  }

  async function handleRemoveBanner() {
    if (!editing) return
    try {
      const saved = await updateEvent(editing.id, { bannerImageUrl: null })
      setEditing(saved)
      setEvents((prev) => prev.map((e) => (e.id === saved.id ? saved : e)))
      toast.success('Banner removido')
    } catch (error) {
      logger.error('Error removing event banner:', error)
      toast.error('Erro ao remover o banner')
    }
  }

  if (creating || editing) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={closeForm}>
            <ArrowLeft className="h-4 w-4" />
            Voltar aos eventos
          </Button>
          <div className="flex items-center gap-2">
            {editing && editing.status !== 'published' && (
              <Button variant="outline" size="sm" onClick={() => handleStatus(editing, 'published')}>
                Publicar
              </Button>
            )}
            {editing && editing.status === 'published' && (
              <Button variant="outline" size="sm" onClick={() => handleStatus(editing, 'archived')}>
                Encerrar
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loading size="sm" /> : editing ? 'Salvar' : 'Criar evento'}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{editing ? 'Editar evento' : 'Novo evento'}</CardTitle>
            <CardDescription>
              Só o evento <strong>publicado</strong> aparece na loja e no site. Rascunho fica
              invisível até você publicar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ev-title">Título</Label>
                <Input
                  id="ev-title"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="Photocard Trading + Dança Livre de K-pop"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-short">Título curto</Label>
                <Input
                  id="ev-short"
                  value={form.shortTitle}
                  onChange={(e) => set('shortTitle', e.target.value)}
                  placeholder="Photocard Trading"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-status">Status</Label>
                <select
                  id="ev-status"
                  className={FIELD_CLASS + ' h-10'}
                  value={form.status}
                  onChange={(e) => set('status', e.target.value as EventStatus)}
                >
                  <option value="draft">Rascunho — invisível no site</option>
                  <option value="published">Publicado — no ar</option>
                  <option value="archived">Arquivado — evento passado</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ev-banner-text">Texto da faixa no topo da loja</Label>
                <Input
                  id="ev-banner-text"
                  value={form.bannerText}
                  onChange={(e) => set('bannerText', e.target.value)}
                  placeholder="🎉 Photocard Trading · domingo 20/set, 14h–18h · Entrada R$ 20"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ev-start">Início</Label>
                <Input
                  id="ev-start"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => set('startsAt', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-end">Término</Label>
                <Input
                  id="ev-end"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => set('endsAt', e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ev-place">Local</Label>
                <Input
                  id="ev-place"
                  value={form.locationName}
                  onChange={(e) => set('locationName', e.target.value)}
                  placeholder="Mar Palace Copacabana Hotel"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-maps">Link do Google Maps</Label>
                <Input
                  id="ev-maps"
                  value={form.locationMapsUrl}
                  onChange={(e) => set('locationMapsUrl', e.target.value)}
                  placeholder="https://maps.google.com/?q=..."
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ev-address">Endereço</Label>
                <Input
                  id="ev-address"
                  value={form.locationAddress}
                  onChange={(e) => set('locationAddress', e.target.value)}
                  placeholder="Avenida Nossa Senhora de Copacabana, 552 — Copacabana, Rio de Janeiro — RJ"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ev-desc">Descrição — um parágrafo por linha</Label>
                <textarea
                  id="ev-desc"
                  rows={6}
                  className={FIELD_CLASS}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-high">Destaques — um por linha</Label>
                <textarea
                  id="ev-high"
                  rows={6}
                  className={FIELD_CLASS}
                  value={form.highlights}
                  onChange={(e) => set('highlights', e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ev-perk">Vantagem do membro do Clube</Label>
                <Input
                  id="ev-perk"
                  value={form.memberPerk}
                  onChange={(e) => set('memberPerk', e.target.value)}
                  placeholder="Membros do Clube: 50% de desconto na entrada"
                />
              </div>
            </div>

            {/* Banner only after create: upload needs the event id. */}
            {editing && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
                <Label>Banner / flyer</Label>
                {editing.bannerImageUrl ? (
                  <div className="flex flex-wrap items-start gap-4">
                    <img
                      src={editing.bannerImageUrl}
                      alt="Banner do evento"
                      className="max-h-48 rounded-lg border border-border object-contain"
                    />
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => bannerInputRef.current?.click()}
                        disabled={uploading}
                      >
                        <ImageUp className="h-4 w-4" />
                        Trocar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-destructive"
                        onClick={handleRemoveBanner}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => bannerInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <Loading size="sm" /> : <ImageUp className="h-4 w-4" />}
                    Enviar imagem
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  JPG, PNG ou WebP, até 8 MB. Aparece na página do evento e no card da loja.
                </p>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept={BANNER_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleBanner(file)
                  }}
                />
              </div>
            )}

            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <Ticket className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Ingressos</span>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={form.reservationsOpen}
                  onChange={(e) => set('reservationsOpen', e.target.checked)}
                />
                Aceitar novas reservas
                <span className="text-xs text-muted-foreground">
                  (desmarque para fechar sem esconder os ingressos já emitidos)
                </span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ev-price">Entrada inteira</Label>
                  <Input
                    id="ev-price"
                    inputMode="decimal"
                    value={form.price}
                    onChange={(e) => set('price', e.target.value)}
                    placeholder="20,00"
                  />
                  <p className="text-[11px] text-muted-foreground">Vazio = gratuito / a combinar</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-currency">Moeda</Label>
                  <Input
                    id="ev-currency"
                    value={form.currencyLabel}
                    onChange={(e) => set('currencyLabel', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-max">Máx. por reserva</Label>
                  <Input
                    id="ev-max"
                    inputMode="numeric"
                    value={form.maxPerReservation}
                    onChange={(e) => set('maxPerReservation', e.target.value)}
                    placeholder="sem limite"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-whats">WhatsApp da loja</Label>
                  <Input
                    id="ev-whats"
                    value={form.whatsappNumber}
                    onChange={(e) => set('whatsappNumber', e.target.value)}
                    placeholder="5511914662881"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-notes">Observações mostradas na reserva</Label>
                <textarea
                  id="ev-notes"
                  rows={3}
                  className={FIELD_CLASS}
                  value={form.reservationNotes}
                  onChange={(e) => set('reservationNotes', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ─── Lista ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-lg font-semibold">Eventos</h2>
          <p className="text-sm text-muted-foreground">
            O evento publicado aparece na loja e no site institucional.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Novo evento
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex justify-center py-12">
            <Loading />
          </CardContent>
        </Card>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum evento cadastrado. Crie o primeiro em “Novo evento”.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <Card key={event.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 py-5">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_VARIANT[event.status]}>
                      {STATUS_LABEL[event.status]}
                    </Badge>
                    <span className="font-heading font-semibold">{event.title}</span>
                    {!event.ticketReservation.enabled && (
                      <Badge variant="outline" className="text-[10px]">
                        reservas fechadas
                      </Badge>
                    )}
                  </div>
                  <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 capitalize">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatEventDateRange(event.startsAt, event.endsAt)}
                    </span>
                    {event.location.name && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {event.location.name}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(event)}>
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleDuplicate(event)}
                    title="Criar o próximo evento a partir deste"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicar
                  </Button>
                  {event.status === 'published' ? (
                    <Button variant="ghost" size="sm" onClick={() => handleStatus(event, 'archived')}>
                      Encerrar
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => handleStatus(event, 'published')}>
                      Publicar
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleDelete(event)}
                    title="Só é possível excluir eventos sem reservas"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default EventConfigTab
