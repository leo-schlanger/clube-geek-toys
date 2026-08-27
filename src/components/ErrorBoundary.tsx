import { Component, type ReactNode } from 'react'
import { Button } from './ui/button'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { logger } from '../lib/logger'
import { ErrorTracker } from '../lib/error-tracking'
import {
  hasAttemptedStaleBundleRecovery,
  isStaleBundleError,
  recoverFromStaleBundle,
} from '../lib/stale-bundle'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  /** A stale-build reload is already on its way; show progress, not a failure. */
  recovering: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, recovering: false }
  }

  static getDerivedStateFromError(error: Error): Pick<State, 'hasError' | 'error'> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('ErrorBoundary caught an error:', error, errorInfo)

    // `logger` is a no-op in production, so this used to be the end of the
    // line: the panel died and nothing about it ever reached error_logs.
    ErrorTracker.captureException(error, {
      context: 'react.error_boundary',
      componentStack: errorInfo.componentStack,
      staleBundle: isStaleBundleError(error),
    })

    // A build that no longer exists on the server is not something the person
    // in front of the screen can act on — clear the old worker and reload.
    if (isStaleBundleError(error) && !hasAttemptedStaleBundleRecovery()) {
      this.setState({ recovering: true })
      void recoverFromStaleBundle()
    }
  }

  handleReload = () => {
    // Always the full clear, not a plain reload: a plain reload is answered by
    // the same service worker that served the broken shell in the first place.
    void recoverFromStaleBundle()
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.recovering) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center max-w-md">
            <RefreshCw className="h-10 w-10 mx-auto mb-4 animate-spin text-primary" />
            <h1 className="text-xl font-bold mb-2">Atualizando o painel…</h1>
            <p className="text-muted-foreground text-sm">
              Saiu uma versão nova. Estamos recarregando — não feche a página.
            </p>
          </div>
        </div>
      )
    }

    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const stale = isStaleBundleError(this.state.error)

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="text-center max-w-md">
            <div className="mx-auto mb-6 p-4 bg-red-500/10 rounded-full w-fit">
              <AlertTriangle className="h-16 w-16 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold mb-2">
              {stale ? 'Versão desatualizada' : 'Algo deu errado'}
            </h1>
            <p className="text-muted-foreground mb-4">
              {stale
                ? 'Seu navegador está com uma versão antiga do painel. Toque em "Atualizar" para baixar a versão nova.'
                : 'Ocorreu um erro inesperado. Tente recarregar a página ou voltar para o início.'}
            </p>
            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  Detalhes do erro
                </summary>
                <pre className="mt-2 p-3 bg-muted rounded-md text-xs overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <Button onClick={this.handleReload} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                {stale ? 'Atualizar' : 'Recarregar'}
              </Button>
              <Button variant="outline" onClick={this.handleGoHome} className="gap-2">
                <Home className="h-4 w-4" />
                Início
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
