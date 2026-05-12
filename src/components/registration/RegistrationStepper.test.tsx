import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RegistrationStepper } from './RegistrationStepper'

describe('RegistrationStepper', () => {
  it('should render 3 steps', () => {
    render(<RegistrationStepper currentStep={1} completedSteps={new Set()} />)
    const list = screen.getByRole('list')
    const items = screen.getAllByRole('listitem')
    expect(list).toBeInTheDocument()
    expect(items).toHaveLength(3)
  })

  it('should show correct step labels', () => {
    render(<RegistrationStepper currentStep={1} completedSteps={new Set()} />)
    expect(screen.getByText('Cadastro')).toBeInTheDocument()
    expect(screen.getByText('Contrato')).toBeInTheDocument()
    expect(screen.getByText('Pagamento')).toBeInTheDocument()
  })

  it('should highlight the current step with primary styling', () => {
    const { container } = render(
      <RegistrationStepper currentStep={2} completedSteps={new Set()} />
    )
    const labels = container.querySelectorAll('span')
    // Step labels: Cadastro (pending), Contrato (active), Pagamento (pending)
    const contrato = Array.from(labels).find((l) => l.textContent === 'Contrato')
    expect(contrato).toHaveClass('text-primary')
    // Other steps should be muted
    const cadastro = Array.from(labels).find((l) => l.textContent === 'Cadastro')
    expect(cadastro).toHaveClass('text-muted-foreground')
    const pagamento = Array.from(labels).find((l) => l.textContent === 'Pagamento')
    expect(pagamento).toHaveClass('text-muted-foreground')
  })

  it('should apply active styling to the current step circle', () => {
    const { container } = render(
      <RegistrationStepper currentStep={1} completedSteps={new Set()} />
    )
    const items = container.querySelectorAll('li')
    // First step circle should have primary classes
    const firstCircle = items[0].querySelector('.border-primary')
    expect(firstCircle).toBeInTheDocument()
    // Second and third should have muted classes
    const secondCircle = items[1].querySelector('.border-muted')
    expect(secondCircle).toBeInTheDocument()
    const thirdCircle = items[2].querySelector('.border-muted')
    expect(thirdCircle).toBeInTheDocument()
  })

  it('should show completed steps with check icon and green styling', () => {
    const { container } = render(
      <RegistrationStepper currentStep={3} completedSteps={new Set([1, 2])} />
    )
    const items = container.querySelectorAll('li')
    // Steps 1 and 2 are completed — circles should have green border
    const firstCircle = items[0].querySelector('.border-green-500')
    expect(firstCircle).toBeInTheDocument()
    const secondCircle = items[1].querySelector('.border-green-500')
    expect(secondCircle).toBeInTheDocument()
    // Step 3 is active, not completed
    const thirdCircle = items[2].querySelector('.border-primary')
    expect(thirdCircle).toBeInTheDocument()
    expect(items[2].querySelector('.border-green-500')).not.toBeInTheDocument()
  })

  it('should show green label text for completed steps', () => {
    const { container } = render(
      <RegistrationStepper currentStep={3} completedSteps={new Set([1, 2])} />
    )
    const labels = container.querySelectorAll('span')
    const cadastro = Array.from(labels).find((l) => l.textContent === 'Cadastro')
    expect(cadastro).toHaveClass('text-green-500')
    const contrato = Array.from(labels).find((l) => l.textContent === 'Contrato')
    expect(contrato).toHaveClass('text-green-500')
    const pagamento = Array.from(labels).find((l) => l.textContent === 'Pagamento')
    expect(pagamento).toHaveClass('text-primary')
  })

  it('should render the nav with accessible label', () => {
    render(<RegistrationStepper currentStep={1} completedSteps={new Set()} />)
    const nav = screen.getByRole('navigation', { name: 'Etapas do cadastro' })
    expect(nav).toBeInTheDocument()
  })

  it('should render connecting lines between steps', () => {
    const { container } = render(
      <RegistrationStepper currentStep={1} completedSteps={new Set()} />
    )
    // There should be 2 connecting lines (between step 1-2 and step 2-3)
    const lines = container.querySelectorAll('.bg-muted.h-0\\.5')
    expect(lines).toHaveLength(2)
  })

  it('should show all steps as completed when all are in completedSteps', () => {
    const { container } = render(
      <RegistrationStepper currentStep={3} completedSteps={new Set([1, 2, 3])} />
    )
    const items = container.querySelectorAll('li')
    // Steps 1 and 2 are completed (not active) — green border
    expect(items[0].querySelector('.border-green-500')).toBeInTheDocument()
    expect(items[1].querySelector('.border-green-500')).toBeInTheDocument()
    // Step 3 is both completed and active — active styling wins via tailwind-merge
    const thirdCircle = items[2].querySelector('.border-primary')
    expect(thirdCircle).toBeInTheDocument()
  })
})
