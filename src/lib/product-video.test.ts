import { describe, it, expect } from 'vitest'
import { parseVideoUrl, youtubeId, embedUrl, videoThumbnail, videoKindLabel } from './product-video'

describe('youtubeId', () => {
  it('reads every URL shape YouTube uses', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('survives extra query parameters', () => {
    expect(youtubeId('https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ&t=30s')).toBe(
      'dQw4w9WgXcQ'
    )
  })

  it('returns null when the URL is not YouTube', () => {
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

  it('rejects an empty link, or one without a protocol', () => {
    expect(parseVideoUrl('')).toMatchObject({ ok: false })
    expect(parseVideoUrl('youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({ ok: false })
  })

  it('rejects a YouTube link with no recognisable id', () => {
    const result = parseVideoUrl('https://www.youtube.com/feed/subscriptions')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/YouTube/i)
  })

  it('rejects a generic link the storefront cannot display', () => {
    const result = parseVideoUrl('https://vimeo.com/12345')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/YouTube|Instagram|mp4/i)
  })

  it('attaches the title when given', () => {
    const result = parseVideoUrl('https://youtu.be/dQw4w9WgXcQ', 'Unboxing')
    expect(result.ok && result.video.title).toBe('Unboxing')
  })
})

describe('embedUrl', () => {
  it('uses the YouTube nocookie domain', () => {
    const url = embedUrl({ kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' })
    expect(url).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
  })

  it('normalises an Instagram reel to a /p/ permalink and embed', () => {
    const url = embedUrl({ kind: 'instagram', url: 'https://www.instagram.com/reel/CxYzAbCdEfG/' })
    expect(url).toBe('https://www.instagram.com/p/CxYzAbCdEfG/embed')
  })

  it('returns null for MP4, which plays in a native <video>', () => {
    expect(embedUrl({ kind: 'file', url: 'https://cdn.example.com/demo.mp4' })).toBeNull()
  })
})

describe('videoThumbnail / videoKindLabel', () => {
  it('produces a thumbnail only for YouTube', () => {
    expect(videoThumbnail({ kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' })).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
    )
    expect(videoThumbnail({ kind: 'file', url: 'https://cdn.example.com/a.mp4' })).toBeNull()
  })

  it('labels each source', () => {
    expect(videoKindLabel('youtube')).toBe('YouTube')
    expect(videoKindLabel('instagram')).toBe('Instagram')
    expect(videoKindLabel('file')).toBe('MP4')
  })
})
