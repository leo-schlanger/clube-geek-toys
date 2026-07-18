import { useQuery } from '@tanstack/react-query'

/**
 * Hook leve pra consumir o "agora tocando" da Rádio GeekPop & Toys (AzuraCast).
 *
 * Usa o endpoint estático (`nowplaying_static`), que é um JSON cacheado
 * servido direto pelo nginx da rádio — ~10x mais leve que o dinâmico e
 * cobre nosso caso (rádio auto-DJ em shuffle, sem shows ao vivo).
 *
 * Refetch a cada 15s, pausa automaticamente quando a aba está em background.
 * CORS já liberado pela AzuraCast (`Access-Control-Allow-Origin: *`).
 */

const API_URL =
  'https://radio.geeketoys.com.br/api/nowplaying_static/geek_e_toys.json'

export interface NowPlayingSong {
  title: string
  artist: string
  album: string
  art: string
}

export interface NowPlayingState {
  song: NowPlayingSong | null
  listeners: number
  streamUrl: string
  loading: boolean
}

interface AzuraResponse {
  now_playing?: {
    song?: {
      title?: string
      artist?: string
      album?: string
      art?: string
    }
  }
  listeners?: {
    current?: number
  }
  station?: {
    listen_url?: string
  }
}

export function useNowPlaying(): NowPlayingState {
  const { data, isLoading } = useQuery({
    queryKey: ['geek-toys-nowplaying'],
    queryFn: async (): Promise<AzuraResponse> => {
      const res = await fetch(API_URL, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  })

  const rawSong = data?.now_playing?.song
  const song: NowPlayingSong | null =
    rawSong && rawSong.title && rawSong.artist
      ? {
          title: rawSong.title,
          artist: rawSong.artist,
          album: rawSong.album ?? '',
          art: rawSong.art ?? '',
        }
      : null

  return {
    song,
    listeners: data?.listeners?.current ?? 0,
    streamUrl:
      data?.station?.listen_url ??
      'https://radio.geeketoys.com.br/listen/geek_e_toys/radio.mp3',
    loading: isLoading,
  }
}
