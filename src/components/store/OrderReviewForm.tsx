import { useState } from 'react'
import { toast } from 'sonner'
import type { OrderItem } from '../../types'
import { submitOrderReviews } from '../../lib/reviews'
import { StarRating } from './StarRating'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { formatCurrency } from '../../lib/utils'

interface OrderReviewFormProps {
  orderId: string
  items: OrderItem[]
  alreadyReviewedProductIds: Set<string>
  rewardAmount: number
  onDone: (creditAwarded: number) => void
}

interface Draft {
  rating: number
  title: string
  body: string
}

export function OrderReviewForm({
  orderId,
  items,
  alreadyReviewedProductIds,
  rewardAmount,
  onDone,
}: OrderReviewFormProps) {
  const reviewable = items.filter(
    (it) => it.productId && !alreadyReviewedProductIds.has(it.productId)
  )

  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const init: Record<string, Draft> = {}
    for (const it of reviewable) {
      if (it.productId) init[it.productId] = { rating: 5, title: '', body: '' }
    }
    return init
  })
  const [submitting, setSubmitting] = useState(false)

  if (reviewable.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Você já avaliou os produtos deste pedido. Obrigado!
      </p>
    )
  }

  function setDraft(productId: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], ...patch },
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const reviews = reviewable
      .filter((it) => it.productId && drafts[it.productId!]?.rating >= 1)
      .map((it) => {
        const d = drafts[it.productId!]
        return {
          productId: it.productId!,
          rating: d.rating,
          title: d.title.trim() || undefined,
          body: d.body.trim() || undefined,
        }
      })

    if (!reviews.length) {
      toast.error('Dê uma nota a pelo menos um produto.')
      return
    }

    setSubmitting(true)
    try {
      const res = await submitOrderReviews(orderId, reviews)
      if (res.creditAwarded > 0) {
        toast.success(
          `Avaliação enviada! Você ganhou ${formatCurrency(res.creditAwarded)} de crédito.`
        )
      } else {
        toast.success('Avaliação enviada. Obrigado!')
      }
      onDone(res.creditAwarded)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar avaliação')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Avalie sua compra e ganhe{' '}
        <strong className="text-primary">{formatCurrency(rewardAmount)}</strong> de crédito na
        próxima compra (uma vez por pedido).
      </p>

      {reviewable.map((item) => {
        const pid = item.productId!
        const d = drafts[pid] || { rating: 5, title: '', body: '' }
        return (
          <div key={item.id} className="rounded-lg border p-3 space-y-3">
            <div className="flex gap-3">
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-12 w-12 rounded object-cover bg-muted"
                />
              )}
              <div>
                <p className="text-sm font-medium">{item.productName}</p>
                <StarRating
                  value={d.rating}
                  onChange={(n) => setDraft(pid, { rating: n })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`title-${pid}`} className="text-xs">
                Título (opcional)
              </Label>
              <Input
                id={`title-${pid}`}
                value={d.title}
                onChange={(e) => setDraft(pid, { title: e.target.value })}
                maxLength={120}
                placeholder="Resumo da experiência"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`body-${pid}`} className="text-xs">
                Comentário (opcional)
              </Label>
              <textarea
                id={`body-${pid}`}
                rows={2}
                value={d.body}
                onChange={(e) => setDraft(pid, { body: e.target.value })}
                maxLength={2000}
                placeholder="O que achou do produto?"
                disabled={submitting}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        )
      })}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Enviando…' : 'Enviar avaliação'}
      </Button>
    </form>
  )
}
