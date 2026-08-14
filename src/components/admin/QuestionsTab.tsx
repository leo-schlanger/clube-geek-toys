import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Loading } from '../ui/loading'
import { Pagination } from '../ui/pagination'
import { logger } from '../../lib/logger'
import { toast } from 'sonner'
import {
  adminListQuestions,
  answerQuestion,
  setQuestionStatus,
  type ProductQuestion,
} from '../../lib/questions'
import { HelpCircle, EyeOff, Eye, Send, ExternalLink } from 'lucide-react'

const PAGE_SIZE = 20

type FilterId = 'pending' | 'answered' | 'all'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'pending', label: 'Aguardando' },
  { id: 'answered', label: 'Respondidas' },
  { id: 'all', label: 'Todas' },
]

function filterToParam(filter: FilterId): boolean | undefined {
  if (filter === 'pending') return false
  if (filter === 'answered') return true
  return undefined
}

export function QuestionsTab() {
  const [questions, setQuestions] = useState<ProductQuestion[]>([])
  const [total, setTotal] = useState(0)
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterId>('pending')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)

  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [sending, setSending] = useState<string | null>(null)

  const fetchQuestions = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adminListQuestions({
        answered: filterToParam(filter),
        page,
        limit: pageSize,
      })
      setQuestions(result.questions)
      setTotal(result.total)
      setPending(result.pending)
    } catch (error) {
      logger.error('Error fetching questions:', error)
      toast.error('Erro ao carregar perguntas')
    }
    setLoading(false)
  }, [filter, page, pageSize])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/filter change
    fetchQuestions()
  }, [fetchQuestions])

  const handleAnswer = useCallback(
    async (question: ProductQuestion) => {
      const answer = (drafts[question.id] ?? '').trim()
      if (!answer) {
        toast.error('Escreva a resposta')
        return
      }

      setSending(question.id)
      try {
        const updated = await answerQuestion(question.id, answer)
        if (!updated) {
          toast.error('Erro ao enviar a resposta')
          return
        }
        setQuestions((prev) => prev.map((q) => (q.id === question.id ? updated : q)))
        setDrafts((prev) => {
          const rest = { ...prev }
          delete rest[question.id]
          return rest
        })
        setPending((p) => Math.max(0, p - 1))
        toast.success('Resposta publicada — o cliente foi notificado')
      } catch (error) {
        logger.error('Error answering question:', error)
        toast.error('Erro ao enviar a resposta')
      }
      setSending(null)
    },
    [drafts]
  )

  const handleToggleStatus = useCallback(async (question: ProductQuestion) => {
    const next = question.status === 'published' ? 'hidden' : 'published'
    try {
      const updated = await setQuestionStatus(question.id, next)
      if (!updated) {
        toast.error('Erro ao alterar a visibilidade')
        return
      }
      setQuestions((prev) => prev.map((q) => (q.id === question.id ? updated : q)))
      toast.success(next === 'hidden' ? 'Pergunta escondida da loja' : 'Pergunta publicada')
    } catch (error) {
      logger.error('Error changing question status:', error)
      toast.error('Erro ao alterar a visibilidade')
    }
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Perguntas
            </CardTitle>
            <CardDescription>
              A pergunta aparece na loja assim que é feita. Responda aqui — o cliente recebe aviso
              no perfil e por e-mail.
            </CardDescription>
          </div>
          {pending > 0 && (
            <Badge variant="destructive">{pending} aguardando resposta</Badge>
          )}
        </div>

        <div className="mt-4 flex gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.id}
              type="button"
              size="sm"
              variant={filter === f.id ? 'default' : 'outline'}
              onClick={() => {
                setFilter(f.id)
                setPage(1)
              }}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loading />
          </div>
        ) : questions.length === 0 ? (
          <div className="py-12 text-center">
            <HelpCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="font-medium text-muted-foreground">
              {filter === 'pending' ? 'Nenhuma pergunta aguardando' : 'Nenhuma pergunta'}
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {questions.map((q) => (
              <li key={q.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {q.productName}
                      {q.productSlug && (
                        <a
                          href={`https://shop.geeketoys.com.br/produto/${q.productSlug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          title="Abrir na loja"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {q.status === 'hidden' && <Badge variant="outline">Escondida</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {q.authorName || 'Cliente'} ·{' '}
                      {new Date(q.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleStatus(q)}
                    title={q.status === 'published' ? 'Esconder da loja' : 'Publicar na loja'}
                    aria-label={q.status === 'published' ? 'Esconder pergunta' : 'Publicar pergunta'}
                  >
                    {q.status === 'published' ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <p className="mt-2 whitespace-pre-line rounded-md bg-muted/40 p-2 text-sm">
                  {q.body}
                </p>

                {q.answerBody ? (
                  <div className="mt-2 rounded-md border-l-2 border-primary bg-muted/20 p-2">
                    <p className="text-xs font-medium text-primary">
                      Respondida em{' '}
                      {q.answeredAt ? new Date(q.answeredAt).toLocaleString('pt-BR') : '—'}
                    </p>
                    <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">
                      {q.answerBody}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <textarea
                      rows={2}
                      maxLength={2000}
                      placeholder="Escreva a resposta..."
                      value={drafts[q.id] ?? ''}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Resposta para a pergunta de ${q.authorName || 'cliente'}`}
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => handleAnswer(q)}
                        disabled={sending === q.id || !(drafts[q.id] ?? '').trim()}
                      >
                        {sending === q.id ? (
                          <Loading size="sm" />
                        ) : (
                          <>
                            <Send className="h-4 w-4" />
                            Responder
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {total > 0 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
            pageSizeOptions={[10, 20, 50]}
          />
        )}
      </CardContent>
    </Card>
  )
}
