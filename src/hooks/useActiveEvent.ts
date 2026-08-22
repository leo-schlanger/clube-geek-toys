import { useQuery } from '@tanstack/react-query'
import { getActiveEvent } from '../lib/events'
import { FALLBACK_EVENT, isEventVisible, type EventConfig } from '../data/event'

/** Chave compartilhada — banner, header, card e página do evento leem o mesmo cache. */
export const ACTIVE_EVENT_QUERY_KEY = ['events', 'active'] as const

/**
 * O evento em cartaz, vindo do banco.
 *
 * `placeholderData` é o evento embutido no bundle: o banner aparece no primeiro
 * paint em vez de piscar, e a resposta da API substitui em seguida. Como o
 * fallback pode estar desatualizado, `isPlaceholder` avisa quem precisar
 * distinguir (a página do evento não redireciona antes da resposta chegar).
 */
export function useActiveEvent(): {
  event: EventConfig
  visible: boolean
  loading: boolean
  isPlaceholder: boolean
} {
  const { data, isLoading, isPlaceholderData } = useQuery<EventConfig | null>({
    queryKey: ACTIVE_EVENT_QUERY_KEY,
    queryFn: getActiveEvent,
    placeholderData: FALLBACK_EVENT,
    staleTime: 1000 * 60 * 5,
  })

  // `event` nunca é nulo, para quem renderiza não precisar de guarda; quem diz
  // se há algo em cartaz é `visible`. `data === null` = a admin arquivou tudo.
  return {
    event: data ?? FALLBACK_EVENT,
    visible: data != null && isEventVisible(data),
    loading: isLoading,
    isPlaceholder: isPlaceholderData,
  }
}
