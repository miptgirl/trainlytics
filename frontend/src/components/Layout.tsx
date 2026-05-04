import { useState } from 'react'
import { type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import logo from '../assets/logo.svg'

export function Layout({ children }: { children: ReactNode }) {
  const { username, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close menu on navigation
  const handleNavClick = () => setMenuOpen(false)

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? 'text-blue-600 font-semibold border-b-2 border-blue-600 pb-0.5'
      : 'text-slate-600 hover:text-blue-600 transition-colors'

  const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? 'block px-4 py-3 text-blue-600 font-semibold bg-blue-50'
      : 'block px-4 py-3 text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors'

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center shrink-0" onClick={handleNavClick}>
            <img src={logo} alt="Trainlytics" className="h-14 w-auto" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-5 text-sm">
            <NavLink to="/history" className={navLinkClass}>History</NavLink>
            <NavLink to="/log" className={navLinkClass}>Log Workout</NavLink>
            <NavLink to="/templates" className={navLinkClass}>Templates</NavLink>
            <NavLink to="/settings" className={navLinkClass}>Settings</NavLink>
          </nav>

          {/* Desktop user / sign out */}
          <div className="hidden md:flex items-center gap-3 text-sm">
            <span className="text-slate-500 font-medium">{username}</span>
            <button
              onClick={logout}
              className="text-slate-500 hover:text-blue-600 transition-colors"
            >
              Sign out
            </button>
          </div>

          {/* Hamburger button (mobile only) */}
          <button
            className="md:hidden flex items-center justify-center p-2 rounded text-slate-600 hover:text-blue-600 hover:bg-slate-100 transition-colors"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
          >
            {menuOpen ? (
              // X icon
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              // Hamburger icon
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white text-sm">
            <nav className="flex flex-col">
              <NavLink to="/history" className={mobileNavLinkClass} onClick={handleNavClick}>History</NavLink>
              <NavLink to="/log" className={mobileNavLinkClass} onClick={handleNavClick}>Log Workout</NavLink>
              <NavLink to="/templates" className={mobileNavLinkClass} onClick={handleNavClick}>Templates</NavLink>
              <NavLink to="/settings" className={mobileNavLinkClass} onClick={handleNavClick}>Settings</NavLink>
            </nav>
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <span className="text-slate-500 font-medium">{username}</span>
              <button
                onClick={() => { setMenuOpen(false); logout() }}
                className="text-slate-500 hover:text-blue-600 transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
