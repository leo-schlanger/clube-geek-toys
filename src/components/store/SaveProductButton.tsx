import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { saveProduct, unsaveProduct, loadSavedIds, markSavedInCache } from '../../lib/profile'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

/**
 * "Save for later", which feeds the saved products on the profile.
 *
 * Saving requires an account, so for a visitor the button leads to signup
 * rather than disappearing: that is the hook which gets someone to create a
 * profile without subscribing.
 */

export interface SaveProductButtonProps {
  productId: string
  productName: string
  /** `icon` for the catalogue card; `full` for the product page. */
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

    // Optimistic: the heart responds at once and reverts if the server refuses.
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
        // The whole card is a link; saving must not navigate to the product.
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
