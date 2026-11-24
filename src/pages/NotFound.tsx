import { useLocation } from 'react-router-dom'
import { SeoHead } from '../components/store/SeoHead'

/**
 * Unknown path. nginx already answers it with status 404 (an allowlist of the
 * SPA routes per host, server/nginx/conf.d/default.conf); this is the body.
 */
export default function NotFound({ homeHref = '/', homeLabel }: { homeHref?: string; homeLabel: string }) {
  const { pathname } = useLocation()
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <SeoHead title="Página não encontrada" path={pathname} noIndex />
      <div className="text-center max-w-md min-w-0">
        <p className="text-5xl font-bold text-primary mb-2" aria-hidden="true">404</p>
        <h1 className="text-2xl font-bold mb-2">Página não encontrada</h1>
        <p className="text-muted-foreground mb-6">
          Este endereço não existe ou mudou de lugar. Confira o link ou volte ao início.
        </p>
        <a
          href={homeHref}
          className="inline-block px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          {homeLabel}
        </a>
      </div>
    </div>
  )
}
