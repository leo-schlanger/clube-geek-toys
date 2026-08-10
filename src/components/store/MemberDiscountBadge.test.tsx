import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemberDiscountBadge } from './MemberDiscountBadge'

describe('MemberDiscountBadge', () => {
  it('shows 15% member label', () => {
    render(<MemberDiscountBadge />)
    expect(screen.getByText(/Membro -15%/)).toBeInTheDocument()
  })
})
