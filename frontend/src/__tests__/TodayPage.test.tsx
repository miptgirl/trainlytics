import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ token: 't', username: 'demo', logout: vi.fn(), isLoading: false }),
}))

import { api } from '../lib/api'
import TodayPage from '../pages/TodayPage'
import { Dashboard } from '../App'

const mockGet = vi.mocked(api.get)

// Wednesday 7 Oct 2026; week starts Mon 5 Oct
const TODAY = '2026-10-07'
const WEEK = '2026-10-05'

function session(over: Record<string, unknown>) {
  return {
    id: 1,
    planned_date: TODAY,
    session_type: 'strength',
    template_id: 4,
    activity_type_id: null,
    title: 'Upper body',
    notes: null,
    skip_note: null,
    display_order: 0,
    segments: [],
    status: 'planned',
    matched_session_id: null,
    ...over,
  }
}

function mockPlan(sessions: unknown[]) {
  mockGet.mockImplementation((url: string) => {
    if (url === `/plans/${WEEK}`) return Promise.resolve({ plan_id: 1, week_start: WEEK, sessions })
    if (url === '/cardio-types') return Promise.resolve([{ id: 2, name: 'Running' }])
    return Promise.reject(new Error(`unexpected ${url}`))
  })
}

function renderToday() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/today']}>
        <Routes>
          <Route path="/today" element={<TodayPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TodayPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 7, 9, 0))
    localStorage.clear()
    mockGet.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('renders today sessions with a Start link and the week summary', async () => {
    mockPlan([
      session({}),
      session({ id: 2, planned_date: '2026-10-05', status: 'done', title: 'Run', session_type: 'cardio' }),
      session({ id: 3, planned_date: '2026-10-09', title: 'Long run', session_type: 'cardio', template_id: null }),
    ])
    renderToday()
    expect(await screen.findByText('Upper body')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start' })).toHaveAttribute(
      'href',
      '/log?type=strength&templateId=4',
    )
    expect(screen.getByText(/of 3 sessions done/)).toBeInTheDocument()
    expect(screen.getByText(/Next: Long run/)).toBeInTheDocument()
    const quick = within(screen.getByRole('region', { name: 'Quick log' }))
    expect(quick.getByRole('link', { name: 'Cardio' })).toHaveAttribute('href', '/log?type=cardio')
    expect(quick.getByRole('link', { name: 'Steps' })).toHaveAttribute('href', '/steps')
  })

  it('shows the empty state but keeps Quick log', async () => {
    mockPlan([])
    renderToday()
    expect(await screen.findByText('Nothing planned today.')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Quick log' })).getByRole('link', { name: 'Strength' }),
    ).toHaveAttribute('href', '/log?type=strength')
  })

  it('shows a Resume card when a strength draft exists', async () => {
    localStorage.setItem('trainlytics_draft_strength', JSON.stringify({ exercises: [] }))
    mockPlan([])
    renderToday()
    const link = await screen.findByRole('link', { name: /resume strength workout/i })
    expect(link).toHaveAttribute('href', '/log?type=strength')
  })

  it('shows no Resume card without a draft', async () => {
    mockPlan([])
    renderToday()
    await screen.findByText('Nothing planned today.')
    expect(screen.queryByText(/resume/i)).not.toBeInTheDocument()
  })

  it('opens the skip note modal', async () => {
    mockPlan([session({})])
    renderToday()
    await screen.findByText('Upper body')
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByRole('heading', { name: 'Skip note' })).toBeInTheDocument()
  })

  it('moves a session to tomorrow via the plan API', async () => {
    mockPlan([session({})])
    vi.mocked(api.put).mockResolvedValue({})
    renderToday()
    await screen.findByText('Upper body')
    await userEvent.click(screen.getByRole('button', { name: 'Move to tomorrow' }))
    expect(api.put).toHaveBeenCalledWith(
      `/plans/${WEEK}/sessions/1`,
      expect.objectContaining({ planned_date: '2026-10-08' }),
    )
  })

  it('opens the menu sheet with all links', async () => {
    mockPlan([])
    renderToday()
    await screen.findByText('Nothing planned today.')
    const buttons = screen.getAllByRole('button', { name: 'Open menu' })
    await userEvent.click(buttons[buttons.length - 1])
    const dialog = screen.getByRole('dialog', { name: 'Menu' })
    for (const name of ['Templates', 'Steps', 'Profile', 'Settings']) {
      expect(within(dialog).getByRole('link', { name })).toBeInTheDocument()
    }
    expect(within(dialog).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
})

describe('root redirect', () => {
  it('sends / to /today', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/today" element={<p>today route</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('today route')).toBeInTheDocument()
  })
})
