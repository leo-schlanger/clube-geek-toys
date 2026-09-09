import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { toast } from 'sonner'
import { Truck, Loader2, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react'
import {
  getMelhorEnvioStatus,
  startMelhorEnvioAuthorization,
  type MelhorEnvioStatus,
} from '../../lib/shipping-oauth'

/**
 * Melhor Envio authorization.
 *
 * This card exists because it did not: the API had the whole OAuth flow and the
 * panel had no way to start it. When the stored token turned out to lack the
 * label scopes, every attempt failed with "reauthorize in Settings" — and
 * Settings had nothing to press. The admin retried the label six times in
 * twelve minutes and gave up.
 *
 * So the state it reports is deliberately three-way. "Connected" is not the
 * question; "can it buy a label right now" is, and a token from before the
 * scope list was widened answers yes to the first and no to the second.
 */
export function MelhorEnvioCard() {
  const [status, setStatus] = useState<MelhorEnvioStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  // Bumped by "check again", which is how the admin closes the loop after
  // authorizing in the other tab without reloading the whole panel.
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const data = await getMelhorEnvioStatus()
      if (!cancelled) {
        setStatus(data)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloads])

  async function handleAuthorize() {
    setStarting(true)
    try {
      const url = await startMelhorEnvioAuthorization()
      // A new tab, not a redirect: the panel keeps its place, and coming back
      // is one tab-close instead of a fresh login.
      window.open(url, '_blank', 'noopener')
      toast.info('Autorize na aba que abriu e volte aqui.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível iniciar a autorização.')
    }
    setStarting(false)
  }

  const ok = status?.canBuyLabel === true
  const connectedButLimited = status?.authorized === true && status.canBuyLabel === false

  return (
    <Card className={connectedButLimited ? 'border-amber-500/50 bg-amber-500/5' : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          Melhor Envio
        </CardTitle>
        <CardDescription>
          Autorização da conta da loja para cotar frete e comprar etiqueta. É um clique, e o
          cliente nunca participa disso.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Consultando…
          </p>
        ) : !status ? (
          <p className="text-sm text-muted-foreground">Não foi possível consultar o estado.</p>
        ) : !status.credentialsConfigured ? (
          <p className="text-sm text-muted-foreground">
            Falta configurar <code>MELHOR_ENVIO_CLIENT_ID</code> e{' '}
            <code>MELHOR_ENVIO_CLIENT_SECRET</code> no servidor.
          </p>
        ) : (
          <>
            <p className="flex items-start gap-2 text-sm">
              {ok ? (
                <>
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>
                    Conectado e com permissão para comprar etiqueta.
                    {status.expiresAt && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Vale até {new Date(status.expiresAt).toLocaleDateString('pt-BR')}.
                      </span>
                    )}
                  </span>
                </>
              ) : connectedButLimited ? (
                <>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span>
                    <strong>Conectado, mas sem permissão para comprar etiqueta.</strong>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      A autorização é anterior à compra automática de etiqueta, então só dá para
                      cotar frete. Reautorizar resolve — a conta é a mesma.
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span>Ainda não autorizado.</span>
                </>
              )}
            </p>

            {status.sandbox && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Em modo sandbox: nada é cobrado e nenhuma etiqueta vale para postagem.
              </p>
            )}

            <Button onClick={handleAuthorize} disabled={starting} className="w-full sm:w-auto">
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              {status.authorized ? 'Reautorizar' : 'Autorizar'}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReloads((n) => n + 1)}
              className="w-full sm:w-auto"
            >
              Já autorizei — verificar de novo
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
