import { describe, it, expect } from 'vitest'
import { parseVideoUrl, youtubeId, embedUrl, videoThumbnail, videoKindLabel } from './product-video'

describe('youtubeId', () => {
  it('lê as formas que o YouTube usa', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('sobrevive a parâmetros extras na URL', () => {
    expect(youtubeId('https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ&t=30s')).toBe(
      'dQw4w9WgXcQ'
    )
  })

  it('devolve null quando não é YouTube', () => {
    expect(youtubeId('https://example.com/video.mp4')).toBeNull()
  })
})

describe('parseVideoUrl', () => {
  it('classifica YouTube, Instagram e MP4', () => {
    const yt = parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')
    expect(yt.ok && yt.video.kind).toBe('youtube')

    const ig = parseVideoUrl('https://www.instagram.com/reel/CxYzAbCdEfG/')
    expect(ig.ok && ig.video.kind).toBe('instagram')

    const mp4 = parseVideoUrl('https://cdn.example.com/demo.mp4')
    expect(mp4.ok && mp4.video.kind).toBe('file')
  })

  it('recusa link vazio ou sem protocolo', () => {
    expect(parseVideoUrl('')).toMatchObject({ ok: false })
    expect(parseVideoUrl('youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({ ok: false })
  })

  it('recusa link de YouTube sem id reconhecível', () => {
    const result = parseVideoUrl('https://www.youtube.com/feed/subscriptions')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/YouTube/i)
  })

  it('recusa link genérico que a loja não sabe exibir', () => {
    const result = parseVideoUrl('https://vimeo.com/12345')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/YouTube|Instagram|mp4/i)
  })

  it('anexa o título quando informado', () => {
    const result = parseVideoUrl('https://youtu.be/dQw4w9WgXcQ', 'Unboxing')
    expect(result.ok && result.video.title).toBe('Unboxing')
  })
})

describe('embedUrl', () => {
  it('usa o domínio nocookie do YouTube', () => {
    const url = embedUrl({ kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' })
    expect(url).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })

  it('normaliza reel do Instagram para permalink /p/ + embed', () => {
    const url = embedUrl({ kind: 'instagram', url: 'https://www.instagram.com/reel/CxYzAbCdEfG/' })
    expect(url).toBe('https://www.instagram.com/p/CxYzAbCdEfG/embed')
  })

  it('devolve null para MP4 — toca no <video> nativo', () => {
    expect(embedUrl({ kind: 'file', url: 'https://cdn.example.com/demo.mp4' })).toBeNull()
  })
})

describe('videoThumbnail / videoKindLabel', () => {
  it('gera miniatura só para YouTube', () => {
    expect(videoThumbnail({ kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' })).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
    )
    expect(videoThumbnail({ kind: 'file', url: 'https://cdn.example.com/a.mp4' })).toBeNull()
  })

  it('rotula cada origem', () => {
    expect(videoKindLabel('youtube')).toBe('YouTube')
    expect(videoKindLabel('instagram')).toBe('Instagram')
    expect(videoKindLabel('file')).toBe('MP4')
  })
})
