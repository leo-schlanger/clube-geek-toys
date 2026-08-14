import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HelpCircle, Clock } from 'lucide-react'
import { listProductQuestions, askQuestion, type ProductQuestion } from '../../lib/questions'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'

interface ProductQuestionsProps {
  productSlug: string
  productId: string
}

const MAX_LENGTH = 1000

/**
 * Bloco de perguntas na PDP. A pergunta entra publicada na hora (modelo
 * Mercado Livre), marcada como "aguardando resposta" até a loja responder.
 */
export function ProductQuestions({ productSlug, productId }: ProductQuestionsProps) {
  const { user } = useAuth()
  const isAuthenticated = Boolean(user)
  const [questions, setQuestions] = useState<ProductQuestion[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) setLoading(true)
    })
    listProductQuestions(productSlug, { limit: 10 })
      .then((res) => {
        if (!active) return
        setQuestions(res.questions)
        setTotal(res.total)
      })
      .catch(() => {
        if (active) setQuestions([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [productSlug])

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (body.length < 5) {
      toast.error('Escreva a pergunta com pelo menos 5 caracteres')
      return
    }

    setSending(true)
    const result = await askQuestion(productId, body)
    setSending(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setQuestions((prev) => [result.question, ...prev])
    setTotal((t) => t + 1)
    setDraft('')
    toast.success('Pergunta enviada! Você recebe um aviso quando respondermos.')
  }

  return (
    <section className="mt-10 border-t pt-8">
      <h2 className="mb-4 flex items-center gap-2 font-heading text-xl font-bold">
        <HelpCircle className="h-5 w-5 text-primary" />
        Perguntas
        {total > 0 && <span className="text-sm font-normal text-muted-foreground">({total})</span>}
      </h2>

      {isAuthenticated ? (
        <form onSubmit={handleAsk} className="mb-6 space-y-2">
          <textarea
            rows={2}
            maxLength={MAX_LENGTH}
            placeholder="Pergunte sobre tamanho, prazo, disponibilidade..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Sua pergunta sobre o produto"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Sua pergunta fica visível para outros clientes. Não inclua dados pessoais.
            </p>
            <Button type="submit" size="sm" disabled={sending || draft.trim().length < 5}>
              {sending ? 'Enviando…' : 'Perguntar'}
            </Button>
          </div>
        </form>
      ) : (
        <p className="mb-6 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <Link to="/entrar" className="font-medium text-primary underline">
            Entre na sua conta
          </Link>{' '}
          para perguntar. A resposta chega como aviso no seu perfil.
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma pergunta ainda. Seja a primeira pessoa a perguntar!
        </p>
      ) : (
        <ul className="space-y-4">
          {questions.map((q) => (
            <li key={q.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{q.body}</p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {q.authorName || 'Cliente'} ·{' '}
                  {new Date(q.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </div>

              {q.answerBody ? (
                <div className="mt-2 rounded-md border-l-2 border-primary bg-muted/40 p-2">
                  <p className="text-xs font-medium text-primary">GeekPop &amp; Toys respondeu</p>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">
                    {q.answerBody}
                  </p>
                </div>
              ) : (
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Aguardando resposta
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
