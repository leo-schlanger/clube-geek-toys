import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LazyImage, LazyAvatar } from './lazy-image'

describe('LazyImage', () => {
  it('should render an img element', () => {
    render(<LazyImage src="/test.jpg" alt="Test image" />)
    const img = screen.getByAltText('Test image')
    expect(img).toBeInTheDocument()
    expect(img.tagName).toBe('IMG')
  })

  it('should have loading="lazy" attribute', () => {
    render(<LazyImage src="/test.jpg" alt="Test image" />)
    expect(screen.getByAltText('Test image')).toHaveAttribute('loading', 'lazy')
  })

  it('should have decoding="async" attribute', () => {
    render(<LazyImage src="/test.jpg" alt="Test image" />)
    expect(screen.getByAltText('Test image')).toHaveAttribute('decoding', 'async')
  })

  it('should show skeleton placeholder by default', () => {
    const { container } = render(<LazyImage src="/test.jpg" alt="Test" />)
    const skeleton = container.querySelector('[aria-hidden="true"]')
    expect(skeleton).toBeInTheDocument()
  })

  it('should not show skeleton when showSkeleton is false', () => {
    const { container } = render(
      <LazyImage src="/test.jpg" alt="Test" showSkeleton={false} />
    )
    const skeleton = container.querySelector('[aria-hidden="true"]')
    expect(skeleton).not.toBeInTheDocument()
  })

  it('should hide skeleton after image loads', () => {
    const { container } = render(<LazyImage src="/test.jpg" alt="Test" />)
    fireEvent.load(screen.getByAltText('Test'))
    const skeleton = container.querySelector('[aria-hidden="true"]')
    expect(skeleton).not.toBeInTheDocument()
  })

  it('should switch to fallbackSrc on error', () => {
    render(<LazyImage src="/broken.jpg" alt="Test" fallbackSrc="/fallback.jpg" />)
    fireEvent.error(screen.getByAltText('Test'))
    expect(screen.getByAltText('Test')).toHaveAttribute('src', '/fallback.jpg')
  })

  it('should use /placeholder.svg as default fallback', () => {
    render(<LazyImage src="/broken.jpg" alt="Test" />)
    fireEvent.error(screen.getByAltText('Test'))
    expect(screen.getByAltText('Test')).toHaveAttribute('src', '/placeholder.svg')
  })

  it('should apply custom className to img', () => {
    render(<LazyImage src="/test.jpg" alt="Test" className="custom-class" />)
    expect(screen.getByAltText('Test')).toHaveClass('custom-class')
  })

  it('should apply containerClassName to wrapper div', () => {
    const { container } = render(
      <LazyImage src="/test.jpg" alt="Test" containerClassName="wrapper-class" />
    )
    expect(container.firstChild).toHaveClass('wrapper-class')
  })

  it('should start with opacity-0 and switch to opacity-100 after load', () => {
    render(<LazyImage src="/test.jpg" alt="Test" />)
    const img = screen.getByAltText('Test')
    expect(img).toHaveClass('opacity-0')
    fireEvent.load(img)
    expect(img).toHaveClass('opacity-100')
  })
})

describe('LazyAvatar', () => {
  it('should render img when src is provided', () => {
    render(<LazyAvatar src="/avatar.jpg" alt="User Avatar" />)
    const img = screen.getByAltText('User Avatar')
    expect(img).toBeInTheDocument()
    expect(img.tagName).toBe('IMG')
  })

  it('should render initials when src is null', () => {
    render(<LazyAvatar src={null} alt="John Doe" />)
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('should render initials when src is undefined', () => {
    render(<LazyAvatar alt="Jane Smith" />)
    expect(screen.getByText('JS')).toBeInTheDocument()
  })

  it('should render custom fallback text', () => {
    render(<LazyAvatar src={null} alt="John Doe" fallback="AB" />)
    expect(screen.getByText('AB')).toBeInTheDocument()
  })

  it('should show initials on image error', () => {
    render(<LazyAvatar src="/broken.jpg" alt="John Doe" />)
    fireEvent.error(screen.getByAltText('John Doe'))
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('should apply default md size class', () => {
    render(<LazyAvatar src="/avatar.jpg" alt="User" />)
    expect(screen.getByAltText('User')).toHaveClass('h-10', 'w-10')
  })

  it('should apply sm size class', () => {
    render(<LazyAvatar src="/avatar.jpg" alt="User" size="sm" />)
    expect(screen.getByAltText('User')).toHaveClass('h-8', 'w-8')
  })

  it('should apply lg size class', () => {
    render(<LazyAvatar src="/avatar.jpg" alt="User" size="lg" />)
    expect(screen.getByAltText('User')).toHaveClass('h-12', 'w-12')
  })

  it('should apply xl size class', () => {
    render(<LazyAvatar src="/avatar.jpg" alt="User" size="xl" />)
    expect(screen.getByAltText('User')).toHaveClass('h-16', 'w-16')
  })

  it('should apply custom className', () => {
    render(<LazyAvatar src="/avatar.jpg" alt="User" className="custom" />)
    expect(screen.getByAltText('User')).toHaveClass('custom')
  })

  it('should have rounded-full on image', () => {
    render(<LazyAvatar src="/avatar.jpg" alt="User" />)
    expect(screen.getByAltText('User')).toHaveClass('rounded-full')
  })

  it('should have aria-label on initials fallback', () => {
    render(<LazyAvatar src={null} alt="John Doe" />)
    expect(screen.getByLabelText('John Doe')).toBeInTheDocument()
  })

  it('should take at most 2 initials', () => {
    render(<LazyAvatar src={null} alt="John Michael Doe Smith" />)
    expect(screen.getByText('JM')).toBeInTheDocument()
  })
})
