import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared before importing the component
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn()
const mockSearchParams = new URLSearchParams()
const mockSetSearchParams = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}))

const mockSignOut = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}))

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

const mockGetAllMembers = vi.fn()
const mockUpdateMember = vi.fn()
vi.mock('../lib/members', () => ({
  getAllMembers: (...args: unknown[]) => mockGetAllMembers(...args),
  updateMember: (...args: unknown[]) => mockUpdateMember(...args),
}))

vi.mock('../lib/logs', () => ({
  getRecentLogs: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/reports', () => ({
  getMonthlyReport: vi.fn().mockResolvedValue([]),
  getRevenueByPlan: vi.fn().mockResolvedValue([]),
  getChurnRate: vi.fn().mockResolvedValue([]),
}))

vi.mock('../lib/api-client', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    patch: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('../lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/utils')>()
  return {
    ...actual,
    formatCurrency: (v: number) => `R$ ${v.toFixed(2)}`,
  }
})

vi.mock('../lib/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
  sendRenewalReminderEmail: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
  }),
}))

vi.mock('lucide-react', () => {
  const icon = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>
  return {
    Users: icon,
    CreditCard: icon,
    TrendingUp: icon,
    Star: icon,
    RefreshCw: icon,
    ShoppingCart: icon,
    AlertCircle: icon,
  }
})

// Lazy-loaded tab components — render as simple stubs
vi.mock('../components/admin/MembersTab', () => ({
  MembersTab: () => <div data-testid="members-tab">Members Tab</div>,
}))

vi.mock('../components/admin/UsersTab', () => ({
  UsersTab: () => <div data-testid="users-tab">Users Tab</div>,
}))

vi.mock('../components/admin/LogsTab', () => ({
  LogsTab: () => <div data-testid="logs-tab">Logs Tab</div>,
}))

vi.mock('../components/admin/ReportsTab', () => ({
  ReportsTab: () => <div data-testid="reports-tab">Reports Tab</div>,
}))

vi.mock('../components/admin/SettingsTab', () => ({
  SettingsTab: () => <div data-testid="settings-tab">Settings Tab</div>,
}))

vi.mock('../components/admin/RealtimeMetrics', () => ({
  RealtimeMetrics: () => <div data-testid="realtime-metrics">Realtime Metrics</div>,
}))

vi.mock('../components/admin/AdminSidebar', () => ({
  AdminSidebar: ({ activeTab, onTabChange, onSignOut }: { activeTab: string; onTabChange: (t: string) => void; onSignOut: () => void }) => (
    <nav data-testid="admin-sidebar">
      <span data-testid="active-tab">{activeTab}</span>
      <button data-testid="tab-dashboard" onClick={() => onTabChange('dashboard')}>Dashboard</button>
      <button data-testid="tab-members" onClick={() => onTabChange('members')}>Members</button>
      <button data-testid="tab-users" onClick={() => onTabChange('users')}>Users</button>
      <button data-testid="tab-logs" onClick={() => onTabChange('logs')}>Logs</button>
      <button data-testid="tab-reports" onClick={() => onTabChange('reports')}>Reports</button>
      <button data-testid="tab-settings" onClick={() => onTabChange('settings')}>Settings</button>
      <button data-testid="sidebar-signout" onClick={onSignOut}>Sign Out</button>
    </nav>
  ),
}))

vi.mock('../components/MemberModal', () => ({
  MemberModal: () => <div data-testid="member-modal" />,
}))

vi.mock('../components/UserModal', () => ({
  UserModal: () => <div data-testid="user-modal" />,
}))

// Import after all mocks
import AdminDashboard from './AdminDashboard'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams.delete('tab')
    mockGetAllMembers.mockResolvedValue([])
  })

  // ─── Loading ────────────────────────────────────────────────

  it('shows skeleton loading UI initially', () => {
    // getAllMembers never resolves → stays in loading state
    mockGetAllMembers.mockReturnValue(new Promise(() => {}))
    const { container } = render(<AdminDashboard />)
    // The skeleton sidebar should be visible
    expect(container.querySelector('.min-h-screen')).toBeInTheDocument()
  })

  // ─── Dashboard tab (default) ───────────────────────────────

  it('renders dashboard tab after loading', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    })
  })

  it('renders the PDV card on dashboard tab', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Ponto de Venda (PDV)')).toBeInTheDocument()
    })
  })

  it('renders description text under Dashboard heading', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Visão geral do sistema')).toBeInTheDocument()
    })
  })

  it('renders the refresh button', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Atualizar')).toBeInTheDocument()
    })
  })

  it('navigates to /pdv when Abrir PDV is clicked', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Abrir PDV')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Abrir PDV'))
    expect(mockNavigate).toHaveBeenCalledWith('/pdv')
  })

  // ─── Quick Links ───────────────────────────────────────────

  it('renders quick link buttons on dashboard', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Ver Membros')).toBeInTheDocument()
      expect(screen.getByText('Relatórios')).toBeInTheDocument()
      expect(screen.getByText('Configurações')).toBeInTheDocument()
    })
  })

  // ─── Tab switching ─────────────────────────────────────────

  it('switches to members tab via sidebar', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('tab-members'))

    await waitFor(() => {
      expect(screen.getByText('Membros')).toBeInTheDocument()
      expect(screen.getByText('Gerencie os membros do clube')).toBeInTheDocument()
    })
  })

  it('switches to users tab', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('tab-users'))

    await waitFor(() => {
      expect(screen.getByText('Gerencie usuários do sistema')).toBeInTheDocument()
    })
  })

  it('switches to logs tab', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('tab-logs'))

    await waitFor(() => {
      expect(screen.getByText('Logs de Auditoria')).toBeInTheDocument()
    })
  })

  it('switches to settings tab', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('tab-settings'))

    await waitFor(() => {
      expect(screen.getByText('Configure o sistema')).toBeInTheDocument()
    })
  })

  // ─── Pending payments alert ────────────────────────────────

  it('shows pending payments alert when there are pending members', async () => {
    mockGetAllMembers.mockResolvedValue([
      {
        id: 'm1',
        fullName: 'Test Pending',
        cpf: '12345678901',
        email: 'pending@test.com',
        phone: '',
        plan: 'club',
        status: 'pending',
        paymentType: 'annual',
        startDate: '2026-01-01',
        expiryDate: '2026-12-31',
        paymentCount: 0,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        userId: 'u1',
      },
    ])

    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByText(/1 pagamento aguardando confirmação/)).toBeInTheDocument()
    })
  })

  it('shows Confirmar Pagamento button for pending members', async () => {
    mockGetAllMembers.mockResolvedValue([
      {
        id: 'm1',
        fullName: 'Pending User',
        cpf: '12345678901',
        email: 'p@test.com',
        phone: '',
        plan: 'club',
        status: 'pending',
        paymentType: 'annual',
        startDate: '2026-01-01',
        expiryDate: '2026-12-31',
        paymentCount: 0,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        userId: 'u1',
      },
    ])

    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirmar Pagamento' })).toBeInTheDocument()
    })
  })

  // ─── Sidebar ───────────────────────────────────────────────

  it('renders the admin sidebar', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    })
  })

  // ─── Tab content rendering ────────────────────────────────

  it('renders MembersTab when members tab is active', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('tab-members'))
    await waitFor(() => {
      expect(screen.getByTestId('members-tab')).toBeInTheDocument()
    })
  })

  it('renders UsersTab when users tab is active', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('tab-users'))
    await waitFor(() => {
      expect(screen.getByTestId('users-tab')).toBeInTheDocument()
    })
  })

  it('renders LogsTab when logs tab is active', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('tab-logs'))
    await waitFor(() => {
      expect(screen.getByTestId('logs-tab')).toBeInTheDocument()
    })
  })

  it('renders ReportsTab when reports tab is active', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('tab-reports'))
    await waitFor(() => {
      expect(screen.getByTestId('reports-tab')).toBeInTheDocument()
    })
  })

  it('renders SettingsTab when settings tab is active', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('tab-settings'))
    await waitFor(() => {
      expect(screen.getByTestId('settings-tab')).toBeInTheDocument()
    })
  })

  // ─── RealtimeMetrics on dashboard ─────────────────────────

  it('renders RealtimeMetrics component on dashboard tab', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('realtime-metrics')).toBeInTheDocument()
    })
  })

  // ─── Tab headings and descriptions ────────────────────────

  it('shows correct heading for reports tab', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('tab-reports'))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Relatórios' })).toBeInTheDocument()
      expect(screen.getByText('Métricas e análises')).toBeInTheDocument()
    })
  })

  // ─── Quick links navigate to tabs ─────────────────────────

  it('clicking "Ver Membros" quick link switches to members tab', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Ver Membros')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Ver Membros'))
    await waitFor(() => {
      expect(screen.getByTestId('members-tab')).toBeInTheDocument()
    })
  })

  it('clicking "Relatórios" quick link switches to reports tab', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Relatórios')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Relatórios'))
    await waitFor(() => {
      expect(screen.getByTestId('reports-tab')).toBeInTheDocument()
    })
  })

  it('clicking "Configurações" quick link switches to settings tab', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Configurações')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Configurações'))
    await waitFor(() => {
      expect(screen.getByTestId('settings-tab')).toBeInTheDocument()
    })
  })

  // ─── URL search param sync ────────────────────────────────

  it('updates search params when switching tabs', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('tab-members'))
    await waitFor(() => {
      expect(mockSetSearchParams).toHaveBeenCalled()
    })
  })

  it('initializes with tab from search params', async () => {
    mockSearchParams.set('tab', 'settings')
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Configurações' })).toBeInTheDocument()
    })
  })

  it('defaults to dashboard tab for invalid search param', async () => {
    mockSearchParams.set('tab', 'nonexistent')
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    })
  })

  // ─── Error state (data fetch failure) ─────────────────────

  it('shows error toast on data fetch failure', async () => {
    const { toast } = await import('sonner')
    mockGetAllMembers.mockRejectedValue(new Error('Network error'))
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Erro ao carregar dados')
    })
  })

  // ─── Refresh button behavior ──────────────────────────────

  it('calls fetchData when refresh button is clicked', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Atualizar')).toBeInTheDocument()
    })
    mockGetAllMembers.mockResolvedValue([])
    fireEvent.click(screen.getByText('Atualizar'))
    // fetchData is called once on mount plus once on click
    await waitFor(() => {
      expect(mockGetAllMembers).toHaveBeenCalledTimes(2)
    })
  })

  // ─── Pending members with multiple entries ────────────────

  it('shows plural text for multiple pending members', async () => {
    mockGetAllMembers.mockResolvedValue([
      {
        id: 'm1',
        fullName: 'Pending One',
        cpf: '11111111111',
        email: 'p1@test.com',
        phone: '',
        plan: 'club',
        status: 'pending',
        paymentType: 'annual',
        startDate: '2026-01-01',
        expiryDate: '2026-12-31',
        paymentCount: 0,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        userId: 'u1',
      },
      {
        id: 'm2',
        fullName: 'Pending Two',
        cpf: '22222222222',
        email: 'p2@test.com',
        phone: '',
        plan: 'club',
        status: 'pending',
        paymentType: 'annual',
        startDate: '2026-01-01',
        expiryDate: '2026-12-31',
        paymentCount: 0,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        userId: 'u2',
      },
    ])

    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByText(/2 pagamentos aguardando confirmação/)).toBeInTheDocument()
    })
  })

  it('displays pending member name and plan info in alert', async () => {
    mockGetAllMembers.mockResolvedValue([
      {
        id: 'm1',
        fullName: 'Alice Pending',
        cpf: '12345678901',
        email: 'alice@test.com',
        phone: '',
        plan: 'club',
        status: 'pending',
        paymentType: 'annual',
        startDate: '2026-01-01',
        expiryDate: '2026-12-31',
        paymentCount: 0,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        userId: 'u1',
      },
    ])

    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Alice Pending')).toBeInTheDocument()
      expect(screen.getByText(/Clube GeekPop & Toys/)).toBeInTheDocument()
      expect(screen.getByText(/R\$ 149.99/)).toBeInTheDocument()
    })
  })

  it('does not show pending alert when no members are pending', async () => {
    mockGetAllMembers.mockResolvedValue([
      {
        id: 'm1',
        fullName: 'Active User',
        cpf: '12345678901',
        email: 'active@test.com',
        phone: '',
        plan: 'club',
        status: 'active',
        paymentType: 'annual',
        startDate: '2026-01-01',
        expiryDate: '2026-12-31',
        paymentCount: 2,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        userId: 'u1',
      },
    ])

    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    })
    expect(screen.queryByText(/pagamento.*aguardando/)).not.toBeInTheDocument()
  })

  // ─── Quick activate flow ──────────────────────────────────

  it('calls confirm dialog when Confirmar Pagamento is clicked', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    mockGetAllMembers.mockResolvedValue([
      {
        id: 'm1',
        fullName: 'Test User',
        cpf: '12345678901',
        email: 'test@test.com',
        phone: '',
        plan: 'club',
        status: 'pending',
        paymentType: 'annual',
        startDate: '2026-01-01',
        expiryDate: '2026-12-31',
        paymentCount: 0,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        userId: 'u1',
      },
    ])

    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirmar Pagamento' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Pagamento' }))
    expect(confirmSpy).toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('activates member via PIX payment confirm when confirm is accepted', async () => {
    const { api } = await import('../lib/api-client')
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(api.get).mockResolvedValue({ data: [{ id: 'pay1', status: 'pending', method: 'pix' }] })
    vi.mocked(api.post).mockResolvedValue({})

    mockGetAllMembers.mockResolvedValue([
      {
        id: 'm1',
        fullName: 'PIX Member',
        cpf: '12345678901',
        email: 'pix@test.com',
        phone: '',
        plan: 'club',
        status: 'pending',
        paymentType: 'annual',
        startDate: '2026-01-01',
        expiryDate: '2026-12-31',
        paymentCount: 0,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        userId: 'u1',
      },
    ])

    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirmar Pagamento' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Pagamento' }))
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/payments/pay1/confirm')
    })
    confirmSpy.mockRestore()
  })

  it('activates member manually when no pending PIX payment exists', async () => {
    const { api } = await import('../lib/api-client')
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(api.get).mockResolvedValue({ data: [] })

    mockGetAllMembers.mockResolvedValue([
      {
        id: 'm1',
        fullName: 'Manual Member',
        cpf: '12345678901',
        email: 'manual@test.com',
        phone: '',
        plan: 'club',
        status: 'pending',
        paymentType: 'annual',
        startDate: '2026-01-01',
        expiryDate: '2026-12-31',
        paymentCount: 0,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        userId: 'u1',
      },
    ])

    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirmar Pagamento' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Pagamento' }))
    await waitFor(() => {
      expect(mockUpdateMember).toHaveBeenCalledWith('m1', { status: 'active' })
    })
    confirmSpy.mockRestore()
  })

  // ─── Sign out via sidebar ─────────────────────────────────

  it('calls signOut when sidebar sign out button is clicked', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-signout')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('sidebar-signout'))
    expect(mockSignOut).toHaveBeenCalled()
  })

  // ─── Dashboard not showing other tabs content ─────────────

  it('does not render members tab content on dashboard', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    })
    expect(screen.queryByTestId('members-tab')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-tab')).not.toBeInTheDocument()
  })

  // ─── PDV card content ─────────────────────────────────────

  it('displays PDV card description', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Registre compras e dê pontos aos membros')).toBeInTheDocument()
    })
  })

  // ─── Switching back to dashboard ──────────────────────────

  it('can switch back to dashboard from another tab', async () => {
    render(<AdminDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('tab-settings'))
    await waitFor(() => {
      expect(screen.getByTestId('settings-tab')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('tab-dashboard'))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
      expect(screen.getByText('Ponto de Venda (PDV)')).toBeInTheDocument()
    })
  })
})
