import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NonoMascot } from './NonoMascot'

describe('NonoMascot', () => {
  it('renders the waving pose by default, lazy and with fixed dimensions', () => {
    render(<NonoMascot size={100} />)
    const img = screen.getByAltText('Nono, o tigre da GeekPop, acenando')
    expect(img).toHaveAttribute('src', '/mascot/nono-wave.webp')
    expect(img).toHaveAttribute('srcset', '/mascot/nono-wave-160.webp 160w, /mascot/nono-wave.webp 320w')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('width', '100')
    // 332/320 aspect ratio, so the layout reserves the right height before load
    expect(img).toHaveAttribute('height', '104')
  })

  it('renders the heart pose', () => {
    render(<NonoMascot pose="heart" />)
    expect(screen.getByAltText(/abraçando um coração/)).toHaveAttribute('src', '/mascot/nono-heart.webp')
  })
})
