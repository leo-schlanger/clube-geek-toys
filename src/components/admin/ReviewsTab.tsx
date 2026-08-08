import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Loading } from '../ui/loading'
import { adminListReviews, adminSetReviewStatus, type ProductReview } from '../../lib/reviews'
import { StarRating } from '../store/StarRating'
import { toast } from 'sonner'
import { logger } from '../../lib/logger'
import { Eye, EyeOff, Star } from 'lucide-react'

export function ReviewsTab() {
  const [reviews, setReviews] = useState<ProductReview[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const fetchReviews = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminListReviews(
        statusFilter === 'all' ? {} : { status: statusFilter }
      )
      setReviews(res.reviews)
    } catch (err) {
      logger.error('Error loading reviews', err)
      toast.error('Erro ao carregar avaliações')
    }
    setLoading(false)
  }, [statusFilter])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on filter
    fetchReviews()
  }, [fetchReviews])

  async function setStatus(id: string, status: 'published' | 'hidden') {
    try {
      const updated = await adminSetReviewStatus(id, status)
      if (updated) {
        toast.success(status === 'hidden' ? 'Avaliação ocultada' : 'Avaliação publicada')
        fetchReviews()
      } else {
        toast.error('Erro ao atualizar')
      }
    } catch (err) {
      logger.error('Error updating review status', err)
      toast.error('Erro ao atualizar')
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-accent" />
              Avaliações
            </CardTitle>
            <CardDescription>
              Moderação de avaliações da loja. Recompensa de crédito é creditada na avaliação.
            </CardDescription>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">Todos</option>
            <option value="published">Publicadas</option>
            <option value="hidden">Ocultas</option>
            <option value="pending">Pendentes</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loading />
          </div>
        ) : reviews.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Nenhuma avaliação.</p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li
                key={r.id}
                className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StarRating value={r.rating} size="sm" />
                    <Badge variant={r.status === 'published' ? 'success' : 'secondary'}>
                      {r.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-sm font-medium">
                    {r.productName || r.productId}
                    {r.productSlug && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        ({r.productSlug})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.authorName}</p>
                  {r.title && <p className="text-sm font-medium">{r.title}</p>}
                  {r.body && (
                    <p className="text-sm text-muted-foreground line-clamp-3">{r.body}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  {r.status !== 'published' && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(r.id, 'published')}>
                      <Eye className="h-4 w-4" />
                      Publicar
                    </Button>
                  )}
                  {r.status !== 'hidden' && (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, 'hidden')}>
                      <EyeOff className="h-4 w-4" />
                      Ocultar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
