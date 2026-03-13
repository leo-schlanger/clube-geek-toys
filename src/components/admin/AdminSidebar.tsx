import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '../ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet'
import {
  LayoutDashboard,
  Users,
  Star,
  UserCog,
  FileText,
  BarChart3,
  Settings,
  ShoppingCart,
  LogOut,
  Menu,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/utils'

export type AdminTab = 'dashboard' | 'members' | 'points' | 'users' | 'logs' | 'reports' | 'settings'

interface AdminSidebarProps {
  activeTab: AdminTab
  onTabChange: (tab: AdminTab) => void
  onSignOut: () => void
}

const menuItems: { id: AdminTab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'members', label: 'Membros', icon: Users },
  { id: 'points', label: 'Pontos', icon: Star },
  { id: 'users', label: 'Usuários', icon: UserCog },
  { id: 'logs', label: 'Logs', icon: FileText },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'settings', label: 'Configurações', icon: Settings },
]

function NavContent({
  activeTab,
  onTabChange,
  onSignOut,
  onNavigatePDV,
  isPDVActive,
  onClose,
}: {
  activeTab: AdminTab
  onTabChange: (tab: AdminTab) => void
  onSignOut: () => void
  onNavigatePDV: () => void
  isPDVActive: boolean
  onClose?: () => void
}) {
  const handleTabClick = (tab: AdminTab) => {
    onTabChange(tab)
    onClose?.()
  }

  const handlePDVClick = () => {
    onNavigatePDV()
    onClose?.()
  }

  return (
    <div className="flex flex-col h-full">
      {/* PDV Button */}
      <div className="p-3 border-b border-border">
        <Button
          variant={isPDVActive ? 'default' : 'outline'}
          className="w-full justify-start gap-3"
          onClick={handlePDVClick}
        >
          <ShoppingCart className="h-5 w-5" />
          <span>Abrir PDV</span>
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id && !isPDVActive

          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground"
          onClick={() => {
            onSignOut()
            onClose?.()
          }}
        >
          <LogOut className="h-5 w-5" />
          <span>Sair</span>
        </Button>
      </div>
    </div>
  )
}

export function AdminSidebar({ activeTab, onTabChange, onSignOut }: AdminSidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  const isPDVActive = location.pathname === '/pdv'

  const handleNavigatePDV = () => {
    navigate('/pdv')
  }

  const handleTabChange = (tab: AdminTab) => {
    if (location.pathname !== '/admin') {
      navigate('/admin')
    }
    onTabChange(tab)
  }

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-card border-b border-border">
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="p-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <img src="/logo.jpg" alt="Geek & Toys" className="h-10 w-10 rounded" />
                    <div>
                      <SheetTitle className="text-left text-sm">Clube Geek & Toys</SheetTitle>
                      <p className="text-xs text-muted-foreground">Admin</p>
                    </div>
                  </div>
                </SheetHeader>
                <NavContent
                  activeTab={activeTab}
                  onTabChange={handleTabChange}
                  onSignOut={onSignOut}
                  onNavigatePDV={handleNavigatePDV}
                  isPDVActive={isPDVActive}
                  onClose={() => setOpen(false)}
                />
              </SheetContent>
            </Sheet>
            <img src="/logo.jpg" alt="Geek & Toys" className="h-8 rounded" />
            <span className="font-heading font-bold text-sm">Admin</span>
          </div>

          {/* Quick Actions Mobile */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleNavigatePDV}>
              <ShoppingCart className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 bg-card border-r border-border flex-col z-50">
        {/* Logo */}
        <div className="p-4 border-b border-border flex items-center gap-3">
          <img src="/logo.jpg" alt="Geek & Toys" className="h-10 w-10 rounded" />
          <div>
            <h1 className="font-heading font-bold text-sm">Clube Geek & Toys</h1>
            <p className="text-xs text-muted-foreground">Admin</p>
          </div>
        </div>

        <NavContent
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onSignOut={onSignOut}
          onNavigatePDV={handleNavigatePDV}
          isPDVActive={isPDVActive}
        />
      </aside>
    </>
  )
}
