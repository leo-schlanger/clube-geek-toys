import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallbackMessage?: string
}

interface State {
  hasError: boolean
}

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            {this.props.fallbackMessage || 'Erro ao carregar esta secao'}
          </p>
          <button
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => this.setState({ hasError: false })}
          >
            Tentar novamente
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
