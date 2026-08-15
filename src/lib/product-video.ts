import type { ProductVideo } from '../types'

/**
 * Vídeos de produto: link de YouTube/Instagram, ou MP4 hospedado no próprio
 * volume /uploads.
 */

export const MAX_PRODUCT_VIDEOS = 5
export const PRODUCT_VIDEO_MAX_BYTES = 100 * 1024 * 1024
export const PRODUCT_VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/*'

/** Extrai o id do vídeo das formas que o YouTube usa (watch, youtu.be, shorts, embed). */
export function youtubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

function instagramPermalink(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([\w-]+)/)
  return match?.[1] ? `https://www.instagram.com/p/${match[1]}/` : null
}

export type ParsedVideo = { ok: true; video: ProductVideo } | { ok: false; error: string }

/** Classifica a URL colada pelo admin. Só aceita o que a loja sabe exibir. */
export function parseVideoUrl(raw: string, title?: string): ParsedVideo {
  const url = raw.trim()
  if (!url) return { ok: false, error: 'Cole o link do vídeo.' }
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'Link inválido (use http/https).' }
  }

  if (/youtube\.com|youtu\.be/i.test(url)) {
    if (!youtubeId(url)) {
      return { ok: false, error: 'Link do YouTube não reconhecido. Copie da barra de endereço.' }
    }
    return { ok: true, video: { kind: 'youtube', url, ...(title ? { title } : {}) } }
  }

  if (/instagram\.com/i.test(url)) {
    if (!instagramPermalink(url)) {
      return { ok: false, error: 'Link do Instagram precisa ser de um post ou reel.' }
    }
    return { ok: true, video: { kind: 'instagram', url, ...(title ? { title } : {}) } }
  }

  if (/\.(mp4|mov|m4v)(\?|$)/i.test(url)) {
    return { ok: true, video: { kind: 'file', url, ...(title ? { title } : {}) } }
  }

  return {
    ok: false,
    error: 'Use um link do YouTube, do Instagram ou um arquivo .mp4.',
  }
}

/** URL de embed para o iframe; null quando o vídeo toca em <video> nativo. */
export function embedUrl(video: ProductVideo): string | null {
  if (video.kind === 'youtube') {
    const id = youtubeId(video.url)
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
  }
  if (video.kind === 'instagram') {
    const permalink = instagramPermalink(video.url)
    return permalink ? `${permalink}embed` : null
  }
  return null
}

/** Miniatura para a faixa da galeria; null cai no placeholder de vídeo. */
export function videoThumbnail(video: ProductVideo): string | null {
  if (video.kind === 'youtube') {
    const id = youtubeId(video.url)
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
  }
  return null
}

export function videoKindLabel(kind: ProductVideo['kind']): string {
  switch (kind) {
    case 'youtube':
      return 'YouTube'
    case 'instagram':
      return 'Instagram'
    case 'file':
    default:
      return 'MP4'
  }
}
