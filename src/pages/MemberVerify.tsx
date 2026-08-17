import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { verifyMemberCard, type MemberCardPublic } from '../lib/members'
import { LoadingPage } from '../components/ui/loading'

function formatExpiry(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

export default function MemberVerify() {
  const { id } = useParams<{ id: string }>()
  const [card, setCard] = useState<MemberCardPublic | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!id) {
        setError('Carteirinha inválida')
        setLoading(false)
        return
      }
      try {
        const data = await verifyMemberCard(id)
        if (cancelled) return
        if (!data) {
          setError('Carteirinha não encontrada')
        } else {
          setCard(data)
        }
      } catch {
        if (!cancelled) setError('Não foi possível verificar a carteirinha')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  if (loading) return <LoadingPage />

  const isCurrent = card?.isCurrent === true

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-6">
        <img src="/logo-vip.png" alt="Clube GeekPop & Toys" className="h-16 mx-auto" />

        {error || !card ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-8 space-y-3">
            <XCircle className="h-16 w-16 mx-auto text-destructive" />
            <h1 className="font-heading text-2xl font-bold">Não encontrada</h1>
            <p className="text-sm text-muted-foreground">{error || 'Carteirinha não encontrada'}</p>
          </div>
        ) : (
          <div
            className={`rounded-2xl border-2 p-8 space-y-4 ${
              isCurrent
                ? 'border-green-500 bg-green-500/10'
                : 'border-red-500 bg-red-500/10'
            }`}
          >
            {isCurrent ? (
              <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
            ) : (
              <AlertTriangle className="h-16 w-16 mx-auto text-red-500" />
            )}
            <p
              className={`text-3xl font-heading font-extrabold tracking-wide ${
                isCurrent ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {isCurrent ? 'EM DIA' : 'NÃO ESTÁ EM DIA'}
            </p>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Membro</p>
              <h1 className="font-heading text-xl font-bold uppercase">{card.fullName}</h1>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-background/60 p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Válido até</p>
                <p className="font-semibold">{formatExpiry(card.expiryDate)}</p>
              </div>
              <div className="rounded-lg bg-background/60 p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Desconto</p>
                <p className="font-semibold">{card.discountPercent}%</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{card.planName}</p>
          </div>
        )}
      </div>
    </div>
  )
}
