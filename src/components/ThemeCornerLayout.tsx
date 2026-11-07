import { Outlet } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'

/**
 * Public member pages without a header of their own: theme toggle pinned to
 * the top-right corner of the page (scrolls away with it, never covers a form).
 */
export function ThemeCornerLayout() {
  return (
    <div className="relative">
      <div className="absolute right-3 top-3 z-20">
        <ThemeToggle variant="icon" />
      </div>
      <Outlet />
    </div>
  )
}
