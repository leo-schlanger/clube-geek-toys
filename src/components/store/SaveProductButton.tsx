import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { saveProduct, unsaveProduct, loadSavedIds, markSavedInCache } from '../../lib/profile'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

/**
 * Botão de "salvar para depois" — alimenta as compras salvas do perfil.
 *
 * Salvar exige conta (o salvo pertence a alguém), então para visitante o botão
 * leva ao cadastro em vez de sumir: é justamente o gancho que faz a pessoa
 * criar perfil sem precisar assinar o clube.
 */

export interface SaveProductButtonProps {
  productId: string
  productName: string
  /** `icon` para o card do catálogo; `full` para a página do produto. */
  variant?: 'icon' | 'full'
  className?: string
}

export function SaveProductButton({
  productId,
  productName,
  variant = 'icon',
  className,
}: SaveProductButtonProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) {
      setSaved(false)
      return
    }
    let active = true
    loadSavedIds().then((ids) => {
      if (active) setSaved(ids.has(productId))
    })
    return () => {
      active = false
    }
  }, [user, productId])

  async function handleClick() {
    if (!user) {
      toast.info('Crie uma conta para salvar produtos.')
      navigate('/cadastro')
      return
    }

    // Otimista: o coração responde na hora e reverte se o servidor recusar.
    const next = !saved
    setSaved(next)
    setBusy(true)
    try {
      const ok = next ? await saveProduct(productId) : await unsaveProduct(productId)
      if (ok) {
        markSavedInCache(productId, next)
        if (next) toast.success('Salvo! Veja em Meu perfil.')
      } else {
        setSaved(!next)
        toast.error('Não foi possível salvar agora.')
      }
    } finally {
      setBusy(false)
    }
  }

  const label = saved ? `Remover ${productName} dos salvos` : `Salvar ${productName}`

  if (variant === 'full') {
    return (
      <Button
        type="button"
        variant="outline"
        size="lg"
        aria-label={label}
        aria-pressed={saved}
        disabled={busy}
        onClick={handleClick}
        className={className}
      >
        <Heart className={cn('h-5 w-5', saved && 'fill-primary text-primary')} />
        {saved ? 'Salvo' : 'Salvar'}
      </Button>
    )
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={saved}
      disabled={busy}
      onClick={(e) => {
        // O card inteiro é um link: salvar não pode navegar para o produto.
        e.preventDefault()
        e.stopPropagation()
        handleClick()
      }}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full bg-background/80 backdrop-blur transition hover:bg-background',
        className
      )}
    >
      <Heart className={cn('h-4 w-4', saved ? 'fill-primary text-primary' : 'text-muted-foreground')} />
    </button>
  )
}
