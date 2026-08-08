import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { listProductReviews, type ProductReview } from '../../lib/reviews'
import { StarRating } from './StarRating'
import { Skeleton } from '../ui/skeleton'

interface ProductReviewsProps {
  productSlug: string
  ratingAvg?: number
  ratingCount?: number
}

export function ProductReviews({ productSlug, ratingAvg = 0, ratingCount = 0 }: ProductReviewsProps) {
  const [reviews, setReviews] = useState<ProductReview[]>([])
  const [total, setTotal] = useState(ratingCount)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) setLoading(true)
    })
    listProductReviews(productSlug, { limit: 10 })
      .then((res) => {
        if (!active) return
        setReviews(res.reviews)
        setTotal(res.total)
      })
      .catch(() => {
        if (active) setReviews([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [productSlug])

  return (
    <section className="mt-10 border-t pt-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-xl font-heading font-bold">
          <MessageSquare className="h-5 w-5 text-primary" />
          Avaliações
        </h2>
        {(ratingCount > 0 || total > 0) && (
          <StarRating
            value={ratingAvg || average(reviews)}
            size="sm"
            showValue
            count={total || ratingCount}
          />
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ainda não há avaliações. Compre e avalie para ganhar crédito na próxima compra!
        </p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StarRating value={r.rating} size="sm" />
                <span className="text-xs text-muted-foreground">
                  {r.authorName || 'Cliente'} ·{' '}
                  {new Date(r.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
              {r.title && <p className="mt-1 text-sm font-medium">{r.title}</p>}
              {r.body && (
                <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{r.body}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function average(reviews: ProductReview[]): number {
  if (!reviews.length) return 0
  return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
}
