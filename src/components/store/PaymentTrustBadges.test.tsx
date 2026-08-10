import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PaymentTrustBadges } from './PaymentTrustBadges'

describe('PaymentTrustBadges', () => {
  it('mentions payment methods or shipping trust', () => {
    render(<PaymentTrustBadges />)
    const text = document.body.textContent || ''
    expect(/PIX|Visa|Master|Correios|Elo/i.test(text)).toBe(true)
  })
})
