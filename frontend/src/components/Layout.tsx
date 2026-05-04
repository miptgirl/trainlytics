import { type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import logo from '../assets/logo.svg'

export function Layout({ children }: { children: ReactNode }) {
  const { username, logout } = useAuth()

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? 'text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5'
      : 'text-slate-600 hover:text-blue-600 transition-colors'

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center shrink-0">
              <img src={logo} alt="Trainlytics" className="h-9 w-auto" />
            </Link>
            <nav className="flex items-center gap-5 text-sm">
              <NavLink to="/history" className={navLinkClass}>History</NavLink>
              <NavLink to="/log" className={navLinkClass}>Log Workout</NavLink>
              <NavLink to="/templates" className={navLinkClass}>Templates</NavLink>
              <NavLink to="/settings" className={navLinkClass}>Settings</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500 font-medium">{username}</span>
            <button
              onClick={logout}
              className="text-slate-500 hover:text-blue-600 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  )

}
