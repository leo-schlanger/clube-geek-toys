import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProductImageViewer, HoverZoom } from './ProductImageZoom'

/**
 * The viewer is how a customer inspects a photocard before paying for it, so
 * what is pinned here is the behaviour that makes it usable rather than the
 * markup: the zoom has bounds, a new photo starts unzoomed, and the page
 * underneath cannot be left scroll-locked when the viewer closes.
 */

describe('ProductImageViewer', () => {
  const images = ['/a.jpg', '/b.jpg', '/c.jpg']

  beforeEach(() => {
    document.body.style.overflow = ''
  })

  function setup(over: Partial<Parameters<typeof ProductImageViewer>[0]> = {}) {
    const onClose = vi.fn()
    const onIndexChange = vi.fn()
    const utils = render(
      <ProductImageViewer
        images={images}
        index={0}
        alt="Photocard"
        onIndexChange={onIndexChange}
        onClose={onClose}
        {...over}
      />
    )
    return { onClose, onIndexChange, ...utils }
  }

  it('opens at 1x and steps the zoom up to the cap', () => {
    setup()
    expect(screen.getByText('1.0x')).toBeInTheDocument()

    const zoomIn = screen.getByLabelText('Aumentar zoom')
    for (let i = 0; i < 10; i++) fireEvent.click(zoomIn)

    // 4x is the ceiling; past it the button stops responding instead of
    // scaling the image into mush.
    expect(screen.getByText('4.0x')).toBeInTheDocument()
    expect(zoomIn).toBeDisabled()
  })

  it('cannot zoom below the frame', () => {
    setup()
    const zoomOut = screen.getByLabelText('Diminuir zoom')
    expect(zoomOut).toBeDisabled()
    fireEvent.click(zoomOut)
    expect(screen.getByText('1.0x')).toBeInTheDocument()
  })

  it('walks the photos with the arrow keys and wraps around', () => {
    const { onIndexChange } = setup({ index: 2 })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onIndexChange).toHaveBeenCalledWith(0)

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(onIndexChange).toHaveBeenCalledWith(1)
  })

  it('closes on Escape', () => {
    const { onClose } = setup()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('resets the zoom when the photo changes', () => {
    const { rerender, onIndexChange } = setup()
    fireEvent.click(screen.getByLabelText('Aumentar zoom'))
    expect(screen.getByText('1.5x')).toBeInTheDocument()

    rerender(
      <ProductImageViewer
        images={images}
        index={1}
        alt="Photocard"
        onIndexChange={onIndexChange}
        onClose={vi.fn()}
      />
    )

    // Otherwise the next photo opens already panned into a corner of nothing.
    expect(screen.getByText('1.0x')).toBeInTheDocument()
  })

  it('locks the page scroll only while it is open', () => {
    const { unmount } = setup()
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('hides the counter and the arrows for a single photo', () => {
    setup({ images: ['/only.jpg'], index: 0 })
    expect(screen.queryByLabelText('Próxima foto')).not.toBeInTheDocument()
    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument()
  })
})

describe('HoverZoom', () => {
  it('magnifies at the pointer and returns to rest on leave', () => {
    render(<HoverZoom src="/a.jpg" alt="Photocard" />)
    const img = screen.getByAltText('Photocard')

    expect(img).toHaveStyle({ transform: 'scale(1)' })

    // jsdom reports a zero-sized rect, so the origin lands on NaN unless the
    // component is fed a real one — what matters here is that hovering scales.
    vi.spyOn(img, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
    } as DOMRect)
    fireEvent.mouseMove(img, { clientX: 50, clientY: 100 })

    expect(img).toHaveStyle({ transform: 'scale(2.2)' })
    expect(img.style.transformOrigin).toBe('25% 50%')

    fireEvent.mouseLeave(img)
    expect(img).toHaveStyle({ transform: 'scale(1)' })
  })
})
