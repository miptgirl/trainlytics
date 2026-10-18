import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import logoCompact from '../assets/logo-compact.svg'

/** The rail marks Log Workout on the log form. Workout mode has its own shell and does not render Layout. */
function isLogForm(pathname: string): boolean {
  return pathname === '/log' || pathname.startsWith('/log/')
}

/** Phone tab bar hides on the log form and on workout mode. */
function hidesTabBar(pathname: string): boolean {
  return (
    pathname === '/workout' ||
    pathname.startsWith('/workout/') ||
    isLogForm(pathname)
  )
}

type TabKey = 'today' | 'plan' | 'stats'

function activeTab(pathname: string): TabKey | null {
  if (pathname === '/today') return 'today'
  if (pathname === '/plan') return 'plan'
  if (pathname === '/stats' || pathname.startsWith('/sessions/')) return 'stats'
  return null
}

const iconProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  className: 'h-6 w-6',
  fill: 'none',
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const TABS: { key: TabKey; to: string; label: string; icon: ReactNode }[] = [
  {
    key: 'today',
    to: '/today',
    label: 'Today',
    icon: (
      <svg {...iconProps}>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9" />
      </svg>
    ),
  },
  {
    key: 'plan',
    to: '/plan',
    label: 'Plan',
    icon: (
      <svg {...iconProps}>
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    key: 'stats',
    to: '/stats',
    label: 'Stats',
    icon: (
      <svg {...iconProps}>
        <path d="M5 20V11M12 20V4M19 20v-6" />
      </svg>
    ),
  },
]

const MENU_LINKS = [
  { to: '/templates', label: 'Templates' },
  { to: '/steps', label: 'Steps' },
  { to: '/profile', label: 'Profile' },
  { to: '/settings', label: 'Settings' },
]

export const MENU_SHEET_ID = 'menu-sheet'

const FOCUSABLE = 'a[href], button:not([disabled])'

/** Profile menu as a modal bottom sheet (below md): focus is trapped, body scroll locked. */
export function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { username, logout } = useAuth()
  const { pathname } = useLocation()
  const sheetRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Close on navigation
  useEffect(() => {
    onCloseRef.current()
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const trigger = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !sheetRef.current) return
      const items = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !sheetRef.current.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !sheetRef.current.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      trigger?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className="lg:hidden fixed inset-0 z-50 flex items-end bg-text/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={sheetRef}
        id={MENU_SHEET_ID}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="w-full bg-surface rounded-t-[20px] shadow-md pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-border">
          <span className="text-sm font-medium text-text-muted-strong">{username}</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex items-center justify-center min-h-11 min-w-11 -mr-2 text-text-muted-strong text-xl leading-none"
          >
            ✕
          </button>
        </div>
        <nav className="flex flex-col py-1">
          <AccountLinks
            linkClass={(active) =>
              `flex items-center min-h-12 px-4 text-base ${
                active ? 'text-primary-dark font-semibold bg-primary-tint' : 'text-text'
              }`
            }
            signOutClass="flex items-center min-h-12 px-4 text-base text-left text-error-text border-t border-border"
            onNavigate={onClose}
            onSignOut={() => {
              onClose()
              logout()
            }}
          />
        </nav>
      </div>
    </div>
  )
}

export function ProfileButton({
  onClick,
  expanded = false,
  className = '',
}: {
  onClick: () => void
  expanded?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open menu"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-controls={MENU_SHEET_ID}
      className={`flex items-center justify-center min-h-11 min-w-11 rounded-full text-text-muted-strong hover:text-primary-dark hover:bg-primary-tint transition-colors ${className}`}
    >
      <svg {...iconProps}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
      </svg>
    </button>
  )
}

const sideLinkClass = (active: boolean) =>
  `flex items-center min-h-10 px-3 rounded-lg text-sm transition-colors ${
    active
      ? 'text-primary-dark font-semibold bg-primary-tint'
      : 'text-text-muted-strong hover:text-primary-dark hover:bg-primary-tint'
  }`

function PrimaryLinks({
  current,
  variant,
}: {
  current: TabKey | null
  variant: 'rail' | 'tabs'
}) {
  return TABS.map((t) => {
    const active = current === t.key
    if (variant === 'tabs') {
      return (
        <li key={t.key} className="flex-1">
          <Link
            to={t.to}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 h-full text-xs font-medium ${
              active ? 'text-primary-dark' : 'text-text-muted-strong'
            }`}
          >
            {t.icon}
            {t.label}
          </Link>
        </li>
      )
    }
    return (
      <Link
        key={t.key}
        to={t.to}
        aria-current={active ? 'page' : undefined}
        className={sideLinkClass(active)}
      >
        {t.label}
      </Link>
    )
  })
}

function AccountLinks({
  linkClass,
  signOutClass,
  onNavigate,
  onSignOut,
}: {
  linkClass: (active: boolean) => string
  signOutClass: string
  onNavigate?: () => void
  onSignOut: () => void
}) {
  return (
    <>
      {MENU_LINKS.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end
          onClick={onNavigate}
          className={({ isActive }) => linkClass(isActive)}
        >
          {l.label}
        </NavLink>
      ))}
      <button type="button" onClick={onSignOut} className={signOutClass}>
        Sign out
      </button>
    </>
  )
}

function DesktopSidebar({ current, logging }: { current: TabKey | null; logging: boolean }) {
  const { username, logout } = useAuth()

  return (
    <aside className="hidden lg:flex w-56 shrink-0 sticky top-0 h-dvh flex-col overflow-y-auto border-r border-border bg-surface pt-[calc(1rem+env(safe-area-inset-top))] pr-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pl-[calc(0.75rem+env(safe-area-inset-left))]">
      <Link to="/today" className="flex items-center px-2 mb-4">
        <img src={logoCompact} alt="Trainlytics" className="h-8 w-auto" />
      </Link>

      <nav aria-label="Sidebar" className="flex flex-col gap-0.5">
        <PrimaryLinks current={current} variant="rail" />
        <Link
          to="/log"
          aria-current={logging ? 'page' : undefined}
          className={`mt-3 flex items-center justify-center min-h-10 px-3 rounded-lg bg-primary-dark text-white text-sm font-medium hover:brightness-95 ${
            logging ? 'ring-2 ring-primary-light ring-offset-2 ring-offset-surface' : ''
          }`}
        >
          Log Workout
        </Link>
      </nav>

      <div className="mt-auto border-t border-border pt-3">
        <div className="px-3 pb-1 text-sm font-medium text-text-muted-strong">{username}</div>
        <nav aria-label="Account" className="flex flex-col gap-0.5">
          <AccountLinks
            linkClass={sideLinkClass}
            signOutClass={`${sideLinkClass(false)} text-left`}
            onSignOut={logout}
          />
        </nav>
      </div>
    </aside>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const logging = isLogForm(pathname)
  const showTabBar = !hidesTabBar(pathname)
  const current = activeTab(pathname)

  return (
    <div className="min-h-screen flex bg-bg">
      <DesktopSidebar current={current} logging={logging} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden bg-surface border-b border-border shadow-sm sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
          <div className="px-4 h-12 flex items-center justify-between">
            <Link to="/today" className="flex items-center shrink-0">
              <img src={logoCompact} alt="Trainlytics" className="h-9 w-auto" />
            </Link>

            <ProfileButton
              onClick={() => setMenuOpen(true)}
              expanded={menuOpen}
              className={`-mr-2 ${pathname === '/today' ? 'invisible' : ''}`}
            />
          </div>
        </header>
        <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
        <main
          className={`flex-1 max-w-5xl w-full mx-auto px-4 py-6 ${
            showTabBar ? 'max-lg:pb-[calc(5.5rem+env(safe-area-inset-bottom))]' : ''
          }`}
        >
          {children}
        </main>

        {showTabBar && (
          <nav
            aria-label="Primary"
            className="lg:hidden fixed bottom-0 inset-x-0 z-20 bg-surface border-t border-border pb-[env(safe-area-inset-bottom)]"
          >
            <ul className="flex h-16">
              <PrimaryLinks current={current} variant="tabs" />
            </ul>
          </nav>
        )}
      </div>
    </div>
  )
}
