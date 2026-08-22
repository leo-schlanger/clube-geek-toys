import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  User,
  MapPin,
  Heart,
  Package,
  Ticket,
  Camera,
  Trash2,
  Save,
  ShieldCheck,
  Loader2,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchProfile,
  updateProfile,
  uploadProfilePhoto,
  removeProfilePhoto,
  fetchSavedProducts,
  unsaveProduct,
} from '../../lib/profile'
import { lookupCep, maskCep } from '../../lib/shipping'
import { formatCurrency } from '../../lib/utils'
import { GENDERS, GENDER_LABELS, type CustomerProfile, type Gender, type SavedProduct } from '../../types'
import { ShopHeader } from '../../components/store/ShopHeader'
import { SeoHead } from '../../components/store/SeoHead'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Loading } from '../../components/ui/loading'
import { LazyImage } from '../../components/ui/lazy-image'
import { availableStock } from '../../lib/products'
import {
  getMyReservations,
  RESERVATION_STATUS_LABEL,
  type PublicReservation,
} from '../../lib/event-tickets'

/**
 * Shop profile, for any account with or without a subscription.
 *
 * Saves per section rather than per page: the PATCH carries only the keys of
 * the section touched, so saving the address cannot clear the birth date.
 */
export default function ShopProfile() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [reservations, setReservations] = useState<PublicReservation[]>([])

  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingPersonal, setSavingPersonal] = useState(false)
  const [savingAddress, setSavingAddress] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Dados pessoais
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [marketingConsent, setMarketingConsent] = useState(false)

  // Address
  const [cep, setCep] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [complement, setComplement] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('')
  const [uf, setUf] = useState('')

  // Salvos
  const [saved, setSaved] = useState<SavedProduct[]>([])
  const [savedLoading, setSavedLoading] = useState(true)

  const hydrate = useCallback((data: CustomerProfile) => {
    setProfile(data)
    setFullName(data.fullName ?? '')
    setPhone(data.phone ?? '')
    setBirthDate(data.birthDate ?? '')
    setGender(data.gender ?? '')
    setMarketingConsent(data.marketingConsent)
    if (data.address) {
      setCep(maskCep(data.address.cep ?? ''))
      setStreet(data.address.street ?? '')
      setNumber(data.address.number ?? '')
      setComplement(data.address.complement ?? '')
      setNeighborhood(data.address.neighborhood ?? '')
      setCity(data.address.city ?? '')
      setUf(data.address.state ?? '')
    }
  }, [])

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/entrar', { replace: true })
    }
  }, [authLoading, user, navigate])

  useEffect(() => {
    if (!user) return
    let active = true
    ;(async () => {
      try {
        const data = await fetchProfile()
        if (active) hydrate(data)
      } catch (err) {
        if (active) toast.error(err instanceof Error ? err.message : 'Erro ao carregar perfil.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [user, hydrate])

  useEffect(() => {
    if (!user) return
    let active = true
    ;(async () => {
      try {
        const list = await getMyReservations()
        if (active) setReservations(list)
      } catch {
        if (active) setReservations([])
      }
    })()
    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    let active = true
    ;(async () => {
      const items = await fetchSavedProducts()
      if (active) {
        setSaved(items)
        setSavedLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [user])

  async function handleSavePersonal(e: React.FormEvent) {
    e.preventDefault()
    setSavingPersonal(true)
    try {
      // An empty string becomes null: that means clear, not leave alone.
      const updated = await updateProfile({
        fullName: fullName.trim() || null,
        phone: phone.trim() || null,
        birthDate: birthDate || null,
        gender: gender || null,
        marketingConsent,
      })
      hydrate(updated)
      toast.success('Dados salvos!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSavingPersonal(false)
    }
  }

  const handleCepBlur = useCallback(async () => {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const data = await lookupCep(digits)
      setStreet(data.street || '')
      setNeighborhood(data.neighborhood || '')
      setCity(data.city)
      setUf(data.state)
      setCep(maskCep(data.cep))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'CEP não encontrado')
    } finally {
      setCepLoading(false)
    }
  }, [cep])

  async function handleSaveAddress(e: React.FormEvent) {
    e.preventDefault()

    // Address is all-or-nothing: half an address neither delivers nor
    // prefills the checkout. Entirely empty means clear it.
    const filled = [cep, street, number, neighborhood, city, uf].some((v) => v.trim())
    if (!filled) {
      setSavingAddress(true)
      try {
        hydrate(await updateProfile({ address: null }))
        toast.success('Endereço removido.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível salvar.')
      } finally {
        setSavingAddress(false)
      }
      return
    }

    if (cep.replace(/\D/g, '').length !== 8) {
      toast.error('Informe um CEP válido.')
      return
    }
    if (!street.trim() || !number.trim() || !neighborhood.trim() || !city.trim() || uf.length !== 2) {
      toast.error('Preencha rua, número, bairro, cidade e UF.')
      return
    }

    setSavingAddress(true)
    try {
      const updated = await updateProfile({
        address: {
          cep: maskCep(cep),
          street: street.trim(),
          number: number.trim(),
          ...(complement.trim() ? { complement: complement.trim() } : {}),
          neighborhood: neighborhood.trim(),
          city: city.trim(),
          state: uf.toUpperCase(),
        },
      })
      hydrate(updated)
      toast.success('Endereço salvo!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSavingAddress(false)
    }
  }

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite reenviar o mesmo arquivo
    if (!file) return

    setPhotoBusy(true)
    try {
      const result = await uploadProfilePhoto(file)
      if (result.ok) {
        hydrate(result.profile)
        toast.success('Foto atualizada!')
      } else {
        toast.error(result.error)
      }
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handlePhotoRemove() {
    setPhotoBusy(true)
    try {
      hydrate(await removeProfilePhoto())
      toast.success('Foto removida.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível remover.')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleUnsave(productId: string) {
    // Optimistic: the heart clears at once and returns if the server refuses.
    const previous = saved
    setSaved((items) => items.filter((i) => i.productId !== productId))
    const ok = await unsaveProduct(productId)
    if (!ok) {
      setSaved(previous)
      toast.error('Não foi possível remover.')
    }
  }

  if (authLoading || loading) return <Loading />
  if (!user || !profile) return null

  const initial = (profile.fullName || profile.email).charAt(0).toUpperCase()

  return (
    <div className="min-h-screen bg-background">
      <SeoHead title="Meu perfil" path="/perfil" noIndex />
      <ShopHeader isMember={profile.isMember} />

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <h1 className="font-heading text-2xl font-bold">Meu perfil</h1>

        {/* ─── Foto ─────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            {profile.photoUrl ? (
              <img
                src={profile.photoUrl}
                alt="Foto de perfil"
                className="h-20 w-20 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary/15 text-2xl font-heading font-bold text-primary">
                {initial}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{profile.fullName || 'Sem nome'}</p>
              <p className="truncate text-sm text-muted-foreground">{profile.email}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoPick}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={photoBusy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {photoBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                  {profile.photoUrl ? 'Trocar foto' : 'Adicionar foto'}
                </Button>
                {profile.photoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={photoBusy}
                    onClick={handlePhotoRemove}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover
                  </Button>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Foto é opcional. JPEG, PNG ou WEBP, até 8 MB.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ─── Dados pessoais ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-primary" />
              Dados pessoais
            </CardTitle>
            <CardDescription>Tudo opcional — preencha só o que quiser.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSavePersonal}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    placeholder="(21) 99999-8888"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="birthDate">Data de nascimento</Label>
                  <Input
                    id="birthDate"
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">Gênero</Label>
                <select
                  id="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as Gender | '')}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Prefiro não informar agora</option>
                  {GENDERS.map((value) => (
                    <option key={value} value={value}>
                      {GENDER_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <span className="text-muted-foreground">
                  Quero receber novidades e promoções por e-mail.
                </span>
              </label>

              <Button type="submit" disabled={savingPersonal}>
                <Save className="h-4 w-4" />
                {savingPersonal ? 'Salvando...' : 'Salvar dados'}
              </Button>
            </CardContent>
          </form>
        </Card>

        {/* ─── Endereço ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="h-5 w-5 text-primary" />
              Endereço
            </CardTitle>
            <CardDescription>Usado para pré-preencher o frete no checkout.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSaveAddress}>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="cep">CEP</Label>
                  <div className="relative">
                    <Input
                      id="cep"
                      inputMode="numeric"
                      placeholder="22041-001"
                      value={cep}
                      onChange={(e) => setCep(maskCep(e.target.value))}
                      onBlur={handleCepBlur}
                    />
                    {cepLoading && (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="street">Rua</Label>
                  <Input id="street" value={street} onChange={(e) => setStreet(e.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="number">Número</Label>
                  <Input id="number" value={number} onChange={(e) => setNumber(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="complement">Complemento</Label>
                  <Input
                    id="complement"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="neighborhood">Bairro</Label>
                <Input
                  id="neighborhood"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="uf">UF</Label>
                  <Input
                    id="uf"
                    maxLength={2}
                    value={uf}
                    onChange={(e) => setUf(e.target.value.toUpperCase())}
                  />
                </div>
              </div>

              <Button type="submit" disabled={savingAddress}>
                <Save className="h-4 w-4" />
                {savingAddress ? 'Salvando...' : 'Salvar endereço'}
              </Button>
            </CardContent>
          </form>
        </Card>

        {/* ─── Compras salvas ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Heart className="h-5 w-5 text-primary" />
              Compras salvas
            </CardTitle>
            <CardDescription>Produtos que você guardou para comprar depois.</CardDescription>
          </CardHeader>
          <CardContent>
            {savedLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : saved.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Você ainda não salvou nenhum produto.
                </p>
                <Button variant="outline" size="sm" asChild className="mt-3">
                  <Link to="/">Explorar a loja</Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {saved.map((item) => (
                  <li key={item.productId} className="flex items-center gap-3 py-3">
                    <Link to={`/produto/${item.slug}`} className="shrink-0">
                      {item.imageUrl ? (
                        <LazyImage
                          src={item.imageUrl}
                          alt={item.name}
                          className="h-14 w-14 rounded object-cover"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded bg-muted" />
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/produto/${item.slug}`}
                        className="line-clamp-2 text-sm font-medium hover:underline"
                      >
                        {item.name}
                      </Link>
                      <p className="text-sm text-primary">{formatCurrency(item.price)}</p>
                      {(!item.active || availableStock(item) === 0) && (
                        <p className="text-xs text-muted-foreground">
                          {item.active ? 'Sem estoque no momento' : 'Indisponível'}
                        </p>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remover ${item.name} dos salvos`}
                      onClick={() => handleUnsave(item.productId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ─── Ingressos ────────────────────────────────────────────── */}
        {reservations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="h-5 w-5 text-primary" />
                Meus ingressos
              </CardTitle>
              <CardDescription>
                Reservas de evento. Pendente = falta o pagamento cair; abra para pagar por PIX.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {reservations.map((reservation) => (
                  <li
                    key={reservation.code}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {reservation.tickets[0]?.event.title ?? 'Evento GeekPop & Toys'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {reservation.quantity} ingresso(s) ·{' '}
                        {formatCurrency(reservation.totalCents / 100)} ·{' '}
                        <span
                          className={
                            reservation.status === 'pending'
                              ? 'font-medium text-yellow-600'
                              : reservation.status === 'confirmed'
                                ? 'font-medium text-green-600'
                                : 'text-muted-foreground'
                          }
                        >
                          {RESERVATION_STATUS_LABEL[reservation.status]}
                        </span>
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">{reservation.code}</p>
                    </div>
                    <Button
                      variant={reservation.status === 'pending' ? 'default' : 'outline'}
                      size="sm"
                      asChild
                    >
                      <Link to={`/ingressos/${reservation.code}`}>
                        {reservation.status === 'pending' ? 'Pagar' : 'Ver ingressos'}
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* ─── Histórico ────────────────────────────────────────────── */}
        <Card>
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Meus pedidos</p>
                <p className="text-sm text-muted-foreground">
                  Histórico completo de compras e rastreio.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/minhas-compras">Ver pedidos</Link>
            </Button>
          </CardContent>
        </Card>

        <p className="flex items-start gap-2 pb-4 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Seus dados são usados só para atender seus pedidos e, se você autorizar,
            enviar novidades. Você pode editar ou apagar tudo quando quiser — veja a{' '}
            <Link to="/privacidade" className="underline">
              Política de Privacidade
            </Link>
            .
          </span>
        </p>
      </main>
    </div>
  )
}
