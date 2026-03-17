import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Progress, ProgressCircle } from './progress'

describe('Progress', () => {
  it('should render with progressbar role', () => {
    render(<Progress value={50} />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('should show correct progress percentage', () => {
    const { container } = render(<Progress value={50} max={100} />)
    const progressBar = container.querySelector('[style*="width"]')
    expect(progressBar).toHaveStyle({ width: '50%' })
  })

  it('should handle value greater than max', () => {
    const { container } = render(<Progress value={150} max={100} />)
    const progressBar = container.querySelector('[style*="width"]')
    expect(progressBar).toHaveStyle({ width: '100%' })
  })

  it('should handle negative value', () => {
    const { container } = render(<Progress value={-10} max={100} />)
    const progressBar = container.querySelector('[style*="width"]')
    expect(progressBar).toHaveStyle({ width: '0%' })
  })

  it('should render indeterminate state', () => {
    const { container } = render(<Progress indeterminate />)
    const progressBar = container.querySelector('.animate-progress-indeterminate')
    expect(progressBar).toBeInTheDocument()
  })

  it('should have aria attributes', () => {
    render(<Progress value={75} max={100} />)
    const progressbar = screen.getByRole('progressbar')
    expect(progressbar).toHaveAttribute('aria-valuenow', '75')
    expect(progressbar).toHaveAttribute('aria-valuemax', '100')
  })

  it('should not have aria-valuenow when indeterminate', () => {
    render(<Progress indeterminate />)
    const progressbar = screen.getByRole('progressbar')
    expect(progressbar).not.toHaveAttribute('aria-valuenow')
  })

  it('should apply custom className', () => {
    render(<Progress className="custom-class" />)
    expect(screen.getByRole('progressbar')).toHaveClass('custom-class')
  })

  it('should forward ref', () => {
    const ref = { current: null }
    render(<Progress ref={ref as React.RefObject<HTMLDivElement>} />)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })
})

describe('ProgressCircle', () => {
  it('should render SVG element', () => {
    const { container } = render(<ProgressCircle value={50} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('should render with default size', () => {
    const { container } = render(<ProgressCircle />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '48')
    expect(svg).toHaveAttribute('height', '48')
  })

  it('should render with custom size', () => {
    const { container } = render(<ProgressCircle size={100} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '100')
    expect(svg).toHaveAttribute('height', '100')
  })

  it('should render two circles (background and progress)', () => {
    const { container } = render(<ProgressCircle />)
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(2)
  })

  it('should show value when showValue is true', () => {
    render(<ProgressCircle value={75} showValue />)
    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('should not show value by default', () => {
    render(<ProgressCircle value={75} />)
    expect(screen.queryByText('75%')).not.toBeInTheDocument()
  })

  it('should handle value greater than max', () => {
    render(<ProgressCircle value={150} max={100} showValue />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('should handle negative value', () => {
    render(<ProgressCircle value={-10} max={100} showValue />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    const { container } = render(<ProgressCircle className="custom-class" />)
    expect(container.querySelector('svg')).toHaveClass('custom-class')
  })

  it('should forward ref', () => {
    const ref = { current: null }
    render(<ProgressCircle ref={ref as React.RefObject<SVGSVGElement>} />)
    expect(ref.current).toBeInstanceOf(SVGSVGElement)
  })
})
