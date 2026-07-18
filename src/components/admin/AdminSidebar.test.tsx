import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn()
const mockLocationPathname = vi.fn().mockReturnValue('/admin')
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockLocationPathname() }),
}))

const mockUseAuth = vi.fn().mockReturnValue({
  user: { email: 'admin@test.com' },
  role: 'admin',
})
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../../lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: Record<string, unknown>) => (
    <span {...props}>{children as string}</span>
  )
  return {
    LayoutDashboard: icon, Users: icon, UserCog: icon,
    FileText: icon, BarChart3: icon, Settings: icon, ShoppingCart: icon,
    LogOut: icon, Menu: icon, Package: icon, ClipboardList: icon,
  }
})

vi.mock('../ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-content">{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { AdminSidebar } from './AdminSidebar'

// ─── Helpers ────────────────────────────────────────────────────────────────

const defaultProps = {
  activeTab: 'dashboard' as const,
  onTabChange: vi.fn(),
  onSignOut: vi.fn(),
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AdminSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocationPathname.mockReturnValue('/admin')
  })

  it('renders all navigation menu items in the desktop sidebar', () => {
    render(<AdminSidebar {...defaultProps} />)

    // Each menu item appears at least twice (mobile + desktop)
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Membros').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/usu/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Logs').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/relat/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/configura/i).length).toBeGreaterThanOrEqual(1)
  })

  it('renders the PDV button', () => {
    render(<AdminSidebar {...defaultProps} />)

    expect(screen.getAllByText(/abrir pdv/i).length).toBeGreaterThanOrEqual(1)
  })

  it('renders the sign out button', () => {
    render(<AdminSidebar {...defaultProps} />)

    expect(screen.getAllByText('Sair').length).toBeGreaterThanOrEqual(1)
  })

  it('calls onTabChange when a menu item is clicked', async () => {
    const user = userEvent.setup()
    render(<AdminSidebar {...defaultProps} />)

    // Click on "Membros" — there may be multiple (mobile + desktop), click the first
    const membrosButtons = screen.getAllByText('Membros')
    await user.click(membrosButtons[0])

    expect(defaultProps.onTabChange).toHaveBeenCalledWith('members')
  })

  it('navigates to /pdv when PDV button is clicked', async () => {
    const user = userEvent.setup()
    render(<AdminSidebar {...defaultProps} />)

    const pdvButtons = screen.getAllByText(/abrir pdv/i)
    await user.click(pdvButtons[0])

    expect(mockNavigate).toHaveBeenCalledWith('/pdv')
  })

  it('calls onSignOut when sign out button is clicked', async () => {
    const user = userEvent.setup()
    render(<AdminSidebar {...defaultProps} />)

    const signOutButtons = screen.getAllByText('Sair')
    await user.click(signOutButtons[0])

    expect(defaultProps.onSignOut).toHaveBeenCalledTimes(1)
  })

  it('displays user email and role in footer', () => {
    render(<AdminSidebar {...defaultProps} />)

    expect(screen.getAllByText('admin@test.com').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('admin').length).toBeGreaterThanOrEqual(1)
  })

  it('navigates to /admin when clicking tab while on different page', async () => {
    mockLocationPathname.mockReturnValue('/pdv')
    const user = userEvent.setup()
    render(<AdminSidebar {...defaultProps} />)

    const dashboardButtons = screen.getAllByText('Dashboard')
    await user.click(dashboardButtons[0])

    expect(mockNavigate).toHaveBeenCalledWith('/admin')
  })

  it('renders user initial avatar', () => {
    render(<AdminSidebar {...defaultProps} />)

    // First char of admin@test.com is 'A'
    expect(screen.getAllByText('A').length).toBeGreaterThanOrEqual(1)
  })
})
