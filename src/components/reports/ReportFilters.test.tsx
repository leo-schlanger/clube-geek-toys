import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: Record<string, unknown>) => (
    <span {...props}>{children as string}</span>
  )
  return { Calendar: icon, RefreshCw: icon }
})

import { ReportFilters } from './ReportFilters'

const defaultProps = {
  selectedPeriod: 6,
  onPeriodChange: vi.fn(),
  onRefresh: vi.fn(),
  refreshing: false,
}

describe('ReportFilters', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the three period buttons', () => {
    render(<ReportFilters {...defaultProps} />)

    expect(screen.getByRole('button', { name: /3 meses/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /6 meses/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /12 meses/i })).toBeInTheDocument()
  })

  it('renders the refresh button', () => {
    render(<ReportFilters {...defaultProps} />)

    expect(screen.getByRole('button', { name: /atualizar/i })).toBeInTheDocument()
  })

  it('calls onPeriodChange when a period button is clicked', async () => {
    const user = userEvent.setup()
    render(<ReportFilters {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /3 meses/i }))
    expect(defaultProps.onPeriodChange).toHaveBeenCalledWith(3)

    await user.click(screen.getByRole('button', { name: /12 meses/i }))
    expect(defaultProps.onPeriodChange).toHaveBeenCalledWith(12)
  })

  it('calls onRefresh when refresh button is clicked', async () => {
    const user = userEvent.setup()
    render(<ReportFilters {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /atualizar/i }))
    expect(defaultProps.onRefresh).toHaveBeenCalledTimes(1)
  })

  it('disables refresh button when refreshing', () => {
    render(<ReportFilters {...defaultProps} refreshing />)

    expect(screen.getByRole('button', { name: /atualizar/i })).toBeDisabled()
  })
})
