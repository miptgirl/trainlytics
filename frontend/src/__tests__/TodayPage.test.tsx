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

function setPhone(phone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: phone && query.includes('max-width: 767px'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
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
    setPhone(false)
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

  it('resumes a strength draft in workout mode on phones', async () => {
    setPhone(true)
    localStorage.setItem(
      'trainlytics_draft_strength',
      JSON.stringify({
        version: 2,
        title: 'Upper body A',
        date: '2026-10-07T08:00',
        templateId: 4,
        exercises: [{ exercise_id: '1', sets: [{ reps: '5', weight: '50', notes: '', done: true }, { reps: '5', weight: '50', notes: '', done: false }] }],
        workout: { startedAt: new Date(2026, 9, 7, 8, 30).getTime() },
      }),
    )
    mockPlan([])
    renderToday()
    const link = await screen.findByRole('link', { name: /resume strength workout/i })
    expect(link).toHaveAttribute('href', '/workout?type=strength&templateId=4&resume=1')
    expect(link).toHaveTextContent('Upper body A')
    expect(link).toHaveTextContent('1 of 2 sets done')
    expect(link).toHaveTextContent('Started 30 min ago')
  })

  it('resumes a strength draft in the full form from 768px', async () => {
    localStorage.setItem('trainlytics_draft_strength', JSON.stringify({ version: 2, templateId: 4, exercises: [] }))
    mockPlan([])
    renderToday()
    expect(await screen.findByRole('link', { name: /resume strength workout/i })).toHaveAttribute(
      'href',
      '/log?type=strength&templateId=4&resume=1',
    )
  })

  it('opens workout mode from Start and Quick log on phones, the form on desktop', async () => {
    setPhone(true)
    mockPlan([session({})])
    const { unmount } = renderToday()
    await screen.findByText('Upper body')
    expect(screen.getByRole('link', { name: 'Start' })).toHaveAttribute(
      'href',
      '/workout?type=strength&templateId=4',
    )
    expect(screen.getByRole('link', { name: 'Strength' })).toHaveAttribute('href', '/workout?type=strength')
    unmount()
    setPhone(false)
    renderToday()
    await screen.findByText('Upper body')
    expect(screen.getByRole('link', { name: 'Start' })).toHaveAttribute(
      'href',
      '/log?type=strength&templateId=4',
    )
    expect(screen.getByRole('link', { name: 'Strength' })).toHaveAttribute('href', '/log?type=strength')
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
    // Skipping needs a reason: the note is what marks the session skipped
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('shows a Skipped card without Start after skipping, and Undo skip clears the note', async () => {
    mockPlan([session({ skip_note: 'Knee pain' })])
    vi.mocked(api.patch).mockResolvedValue({})
    renderToday()
    expect(await screen.findByText('✗ Skipped')).toBeInTheDocument()
    expect(screen.getByText(/Knee pain/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Start' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move to tomorrow' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo skip' }))
    expect(api.patch).toHaveBeenCalledWith(`/plans/${WEEK}/sessions/1/skip-note`, { skip_note: null })
  })

  it('saves the skip note through the plan API', async () => {
    mockPlan([session({})])
    vi.mocked(api.patch).mockResolvedValue({})
    renderToday()
    await screen.findByText('Upper body')
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await userEvent.type(screen.getByPlaceholderText(/knee pain/i), 'Travel')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(api.patch).toHaveBeenCalledWith(`/plans/${WEEK}/sessions/1/skip-note`, { skip_note: 'Travel' })
  })

  it('hides Move to tomorrow on Sunday (tomorrow is next week)', async () => {
    vi.setSystemTime(new Date(2026, 9, 11, 9, 0))
    mockPlan([session({ planned_date: '2026-10-11' })])
    renderToday()
    await screen.findByText('Upper body')
    expect(screen.getByRole('link', { name: 'Start' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move to tomorrow' })).not.toBeInTheDocument()
  })

  it('shows a done session without Start but with a link to it', async () => {
    mockPlan([session({ status: 'done', matched_session_id: 55 })])
    renderToday()
    await screen.findByText('Upper body')
    expect(screen.queryByRole('link', { name: 'Start' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view session/i })).toHaveAttribute('href', '/sessions/55')
  })

  it('shows both Resume cards, with the draft age, when both drafts exist', async () => {
    localStorage.setItem('trainlytics_draft_strength', JSON.stringify({ date: '2026-10-05T09:00' }))
    localStorage.setItem('trainlytics_draft_cardio', JSON.stringify({ exercises: [] }))
    mockPlan([])
    renderToday()
    const strength = await screen.findByRole('link', { name: /resume strength workout/i })
    expect(strength).toHaveTextContent('Started 2 days ago')
    expect(screen.getByRole('link', { name: /resume cardio workout/i })).toHaveAttribute(
      'href',
      '/log?type=cardio',
    )
  })

  it('counts the week exactly like the Plan overview', async () => {
    mockPlan([
      session({ id: 1 }),
      session({ id: 2, planned_date: '2026-10-05', status: 'done' }),
      session({ id: 3, planned_date: '2026-10-06', status: 'skipped' }),
      session({ id: 4, planned_date: '2026-10-05', status: 'done' }),
    ])
    renderToday()
    await screen.findByText(/of 4 sessions done/)
    const week = within(screen.getByRole('region', { name: 'This week' }))
    expect(week.getByText(/1 planned · 1 skipped · 67% completion/)).toBeInTheDocument()
  })

  it('shows empty and error states for the week card', async () => {
    mockPlan([])
    const { unmount } = renderToday()
    expect(await screen.findByText('No sessions planned this week.')).toBeInTheDocument()
    unmount()
    mockGet.mockImplementation((url: string) =>
      url === '/cardio-types' ? Promise.resolve([]) : Promise.reject(new Error('boom')),
    )
    renderToday()
    expect(await screen.findByText("Couldn't load this week.")).toBeInTheDocument()
  })

  it('rolls over to the new day when the app returns to the foreground', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === `/plans/${WEEK}`)
        return Promise.resolve({
          plan_id: 1,
          week_start: WEEK,
          sessions: [session({ title: 'Wed run' }), session({ id: 2, planned_date: '2026-10-08', title: 'Thu lift' })],
        })
      return Promise.resolve([])
    })
    renderToday()
    expect(await screen.findByText('Wed run')).toBeInTheDocument()
    vi.setSystemTime(new Date(2026, 9, 8, 7, 0))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(await screen.findByText('Thu lift')).toBeInTheDocument()
    expect(screen.queryByText('Wed run')).not.toBeInTheDocument()
    expect(screen.getByText('Thursday, October 8')).toBeInTheDocument()
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
