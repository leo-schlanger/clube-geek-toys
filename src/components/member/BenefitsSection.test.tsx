import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BenefitsSection } from './BenefitsSection'

describe('BenefitsSection', () => {
  it('lists club benefits including 15%', () => {
    render(<BenefitsSection />)
    expect(screen.getByText(/Benefícios/i)).toBeInTheDocument()
    expect(screen.getByText(/15%/)).toBeInTheDocument()
  })
})
