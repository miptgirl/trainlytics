import { type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function Layout({ children }: { children: ReactNode }) {
  const { username, logout } = useAuth()

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="font-bold text-gray-900">
              Trainlytics
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <NavLink
                to="/exercises"
                className={({ isActive }) =>
                  isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'
                }
              >
                Exercises
              </NavLink>
              <NavLink
                to="/cardio-types"
                className={({ isActive }) =>
                  isActive ? 'text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'
                }
              >
                Activity Types
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">{username}</span>
            <button
              onClick={logout}
              className="text-gray-600 hover:text-gray-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
