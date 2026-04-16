import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Music, Pause, Play, Radio, Users, Volume2, VolumeX, X } from 'lucide-react'
import { useNowPlaying } from '../hooks/useNowPlaying'

// Backoff pra reconexão após drop do stream (ms)
const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000]

/**
 * Mini-player flutuante (dock) pra Rádio Geek & Toys.
 *
 * Pensado pra landing page de conversão: fica visível sem invadir o espaço
 * do CTA principal. Três estados:
 *   - hidden      → nunca renderizado (ex.: usuário fechou)
 *   - collapsed   → pílula discreta no bottom-right com play + "Ouça a rádio"
 *   - expanded    → card com cover, título, artista, play/pause, volume
 *
 * Começa colapsado. Ao dar play o card expande automaticamente. Pode ser
 * minimizado sem parar o stream (áudio continua tocando em background).
 */
export default function RadioMiniPlayer() {
  const { song, listeners, streamUrl, loading } = useNowPlaying()
  const [isExpanded, setIsExpanded] = useState(false)
  const [isHidden, setIsHidden] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [volume, setVolume] = useState(70)
  const [isMuted, setIsMuted] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const isPlayingRef = useRef(false)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const userActionRef = useRef(false)
  // Ref estável pra attemptReconnect — evita recursão direta, que
  // dispara a regra react-hooks/immutability do ESLint.
  const attemptReconnectRef = useRef<() => void>(() => {})

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100
    }
  }, [volume, isMuted])

  const clearReconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }

  const attemptReconnect = useCallback(() => {
    if (!audioRef.current || !isPlayingRef.current) return
    const attempt = reconnectAttemptsRef.current
    if (attempt >= RECONNECT_BACKOFF_MS.length) {
      setIsBuffering(false)
      setIsPlaying(false)
      reconnectAttemptsRef.current = 0
      return
    }
    reconnectAttemptsRef.current = attempt + 1
    setIsBuffering(true)
    clearReconnect()
    reconnectTimeoutRef.current = setTimeout(async () => {
      reconnectTimeoutRef.current = null
      if (!audioRef.current || !isPlayingRef.current) return
      try {
        audioRef.current.src = streamUrl
        audioRef.current.load()
        await audioRef.current.play()
      } catch {
        // Chamada via ref pra evitar recursão direta no useCallback
        attemptReconnectRef.current()
      }
    }, RECONNECT_BACKOFF_MS[attempt])
  }, [streamUrl])

  // Mantém a ref apontando pra versão atual do callback
  useEffect(() => {
    attemptReconnectRef.current = attemptReconnect
  }, [attemptReconnect])

  // Listeners do <audio> pra reconexão automática e sync de pause externo
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onPlaying = () => {
      reconnectAttemptsRef.current = 0
      clearReconnect()
      setIsBuffering(false)
    }
    const onWaiting = () => {
      if (isPlayingRef.current) setIsBuffering(true)
    }
    const onError = () => {
      if (isPlayingRef.current) attemptReconnect()
    }
    const onStalled = () => {
      if (isPlayingRef.current) attemptReconnect()
    }
    const onEnded = () => {
      // Livestream não deveria "terminar" — tratar como drop
      if (isPlayingRef.current) attemptReconnect()
    }
    const onPause = () => {
      if (userActionRef.current) {
        userActionRef.current = false
        return
      }
      // Pause externo (chamada, perda de foco mobile) → sincroniza estado
      if (isPlayingRef.current) {
        setIsPlaying(false)
        setIsBuffering(false)
        clearReconnect()
        reconnectAttemptsRef.current = 0
      }
    }

    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('error', onError)
    audio.addEventListener('stalled', onStalled)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('pause', onPause)

    return () => {
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('stalled', onStalled)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('pause', onPause)
    }
  }, [attemptReconnect])

  useEffect(() => () => clearReconnect(), [])

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      userActionRef.current = true
      audio.pause()
      setIsPlaying(false)
      setIsBuffering(false)
      clearReconnect()
      reconnectAttemptsRef.current = 0
      return
    }

    try {
      if (!audio.currentSrc || audio.error) {
        audio.src = streamUrl
        audio.load()
      }
      await audio.play()
      setIsPlaying(true)
      setIsExpanded(true) // dar play abre o card
      reconnectAttemptsRef.current = 0
    } catch {
      setIsPlaying(false)
    }
  }

  if (isHidden) return null

  return (
    <>
      {/* Audio element persiste mesmo com card colapsado — não interrompe playback */}
      <audio
        ref={audioRef}
        src={streamUrl}
        preload="none"
        aria-label="Stream da Rádio Geek & Toys"
      />

      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 pointer-events-none">
        <AnimatePresence mode="wait">
          {isExpanded ? (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto"
            >
              <div className="relative w-[320px] sm:w-[360px] glass rounded-2xl border border-primary/30 shadow-2xl shadow-black/40 overflow-hidden">
                {/* Art background blur */}
                {song?.art && (
                  <div className="absolute inset-0 pointer-events-none">
                    <img
                      src={song.art}
                      alt=""
                      aria-hidden
                      className="w-full h-full object-cover scale-150 blur-3xl opacity-30"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/85 to-background/95" />
                  </div>
                )}

                <div className="relative z-10 p-4">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-primary/15 border border-primary/25">
                        <Radio className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                          Rádio Geek &amp; Toys
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            Ao Vivo
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-2.5 h-2.5" />
                            <span className="tabular-nums">{listeners}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setIsExpanded(false)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                        aria-label="Minimizar"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setIsHidden(true)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                        aria-label="Fechar player"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Song info + art */}
                  <div className="flex items-center gap-3 mb-3">
                    <button
                      onClick={togglePlay}
                      aria-label={isPlaying ? 'Pausar' : 'Tocar'}
                      className="relative w-16 h-16 rounded-xl overflow-hidden border border-border/60 shadow-lg flex-shrink-0 group"
                    >
                      {song?.art ? (
                        <img
                          src={song.art}
                          alt={`${song.title} — ${song.artist}`}
                          className="w-full h-full object-cover"
                          decoding="async"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/30 to-amber-600/20 flex items-center justify-center">
                          <Music className="w-6 h-6 text-primary/80" />
                        </div>
                      )}
                      <div
                        className={`absolute inset-0 flex items-center justify-center transition-colors ${
                          isPlaying
                            ? 'bg-black/0 group-hover:bg-black/50'
                            : 'bg-black/50'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all ${
                            isPlaying
                              ? 'bg-white/0 group-hover:bg-gradient-to-r group-hover:from-yellow-500 group-hover:to-amber-600 text-transparent group-hover:text-black'
                              : 'bg-gradient-to-r from-yellow-500 to-amber-600 text-black'
                          }`}
                        >
                          {isPlaying ? (
                            <Pause className="w-4 h-4" fill="currentColor" />
                          ) : (
                            <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                          )}
                        </div>
                      </div>
                    </button>

                    <div className="flex-1 min-w-0">
                      {loading ? (
                        <>
                          <div className="h-4 bg-muted/50 rounded w-3/4 animate-pulse mb-1.5" />
                          <div className="h-3 bg-muted/30 rounded w-1/2 animate-pulse" />
                        </>
                      ) : isBuffering && isPlaying ? (
                        <>
                          <p className="text-sm font-semibold truncate">
                            Conectando…
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Preparando stream
                          </p>
                        </>
                      ) : song ? (
                        <>
                          <p
                            className="text-sm font-semibold truncate"
                            title={song.title}
                          >
                            {song.title}
                          </p>
                          <p
                            className="text-xs text-muted-foreground truncate"
                            title={song.artist}
                          >
                            {song.artist}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-semibold truncate">
                            Rádio Geek &amp; Toys
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isPlaying ? 'No ar' : 'Clique para ouvir'}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Volume */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsMuted((m) => !m)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                      aria-label={
                        isMuted || volume === 0 ? 'Ativar som' : 'Silenciar'
                      }
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-3.5 h-3.5" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        setVolume(v)
                        if (v > 0 && isMuted) setIsMuted(false)
                      }}
                      aria-label="Volume"
                      className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.button
              key="collapsed"
              onClick={() => setIsExpanded(true)}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto flex items-center gap-2 px-3 py-2.5 glass rounded-full border border-primary/40 shadow-lg shadow-black/30 hover:border-primary/80 hover:shadow-primary/20 transition-all group"
              aria-label="Abrir player da rádio"
            >
              <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-yellow-500 to-amber-600 text-black shadow-md">
                {isPlaying ? (
                  <Pause className="w-4 h-4" fill="currentColor" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                )}
                {isPlaying && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
                  </span>
                )}
              </span>
              <span className="flex flex-col items-start pr-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary leading-none">
                  Rádio
                </span>
                <span className="text-xs text-foreground/90 truncate max-w-[140px] leading-tight">
                  {isPlaying && song
                    ? `${song.artist}`
                    : 'Ouça a rádio geek'}
                </span>
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
