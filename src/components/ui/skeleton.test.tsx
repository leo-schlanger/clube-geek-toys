import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton, SkeletonCard, SkeletonTable, SkeletonMemberCard, SkeletonStats } from './skeleton'

describe('Skeleton', () => {
  it('should render base skeleton', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstChild).toHaveClass('animate-pulse')
    expect(container.firstChild).toHaveClass('rounded-md')
    expect(container.firstChild).toHaveClass('bg-muted')
  })

  it('should apply custom className', () => {
    const { container } = render(<Skeleton className="h-10 w-40" />)
    expect(container.firstChild).toHaveClass('h-10')
    expect(container.firstChild).toHaveClass('w-40')
  })

  it('should pass through additional props', () => {
    const { container } = render(<Skeleton data-testid="skeleton" />)
    expect(container.querySelector('[data-testid="skeleton"]')).toBeInTheDocument()
  })
})

describe('SkeletonCard', () => {
  it('should render card skeleton with inner elements', () => {
    const { container } = render(<SkeletonCard />)
    expect(container.firstChild).toHaveClass('space-y-3')
    // Has a rounded-xl skeleton inside
    expect(container.querySelector('.rounded-xl')).toBeInTheDocument()
    // Has pulse animations
    const pulses = container.querySelectorAll('.animate-pulse')
    expect(pulses.length).toBeGreaterThanOrEqual(2)
  })

  it('should apply custom className', () => {
    const { container } = render(<SkeletonCard className="custom-class" />)
    expect(container.firstChild).toHaveClass('custom-class')
  })
})

describe('SkeletonTable', () => {
  it('should render table skeleton with default 5 rows', () => {
    const { container } = render(<SkeletonTable />)
    // 1 header skeleton + 5 row skeletons = 6 animate-pulse divs
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBe(6)
  })

  it('should render custom number of rows', () => {
    const { container } = render(<SkeletonTable rows={3} />)
    // 1 header + 3 rows = 4 animate-pulse divs
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBe(4)
  })
})

describe('SkeletonMemberCard', () => {
  it('should render member card skeleton', () => {
    const { container } = render(<SkeletonMemberCard />)
    expect(container.querySelector('.rounded-xl')).toBeInTheDocument()
    expect(container.querySelector('.rounded-full')).toBeInTheDocument() // Avatar
  })
})

describe('SkeletonStats', () => {
  it('should render 4 skeleton cards', () => {
    const { container } = render(<SkeletonStats />)
    // 4 SkeletonCard, each has space-y-3 wrapper
    const cards = container.querySelectorAll('.space-y-3')
    expect(cards.length).toBe(4)
  })

  it('should use grid layout', () => {
    const { container } = render(<SkeletonStats />)
    expect(container.firstChild).toHaveClass('grid')
    expect(container.firstChild).toHaveClass('grid-cols-2')
  })
})
