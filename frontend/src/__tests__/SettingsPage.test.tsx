import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock the api module so that all useQuery calls return empty arrays/objects
// instead of hitting the network.
vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}))

// Import after mocks
import SettingsPage from '../pages/SettingsPage'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SettingsPage — Settings cleanup (plan 6.6)', () => {
  it('does not render any "Manage Data" text or heading', () => {
    renderPage()
    expect(screen.queryByText(/manage data/i)).not.toBeInTheDocument()
  })

  it('does not contain a link to /steps', () => {
    renderPage()
    const stepsLinks = screen
      .queryAllByRole('link')
      .filter((el) => el.getAttribute('href') === '/steps')
    expect(stepsLinks).toHaveLength(0)
  })

  it('renders the expected management sections (Activity Types, Exercise Types, Exercises)', () => {
    renderPage()
    expect(screen.getByText(/activity types/i)).toBeInTheDocument()
    expect(screen.getByText(/exercise types/i)).toBeInTheDocument()
    expect(screen.getByText(/exercises/i)).toBeInTheDocument()
  })
})
