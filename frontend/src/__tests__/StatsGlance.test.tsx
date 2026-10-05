import { render, screen, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { api } from '../lib/api'
import { StatsGlance } from '../components/analytics/StatsGlance'
import { WeeklyOverviewCard } from '../components/plan/WeeklyOverviewCard'

const mockGet = vi.mocked(api.get)

// Wednesday 2026-10-07; current week starts Monday 2026-10-05
const NOW = new Date(2026, 9, 7, 12, 0, 0)
const MONDAY = '2026-10-05'

function session(id: number, status: 'planned' | 'done' | 'skipped') {
  return {
    id,
    planned_date: MONDAY,
    session_type: 'strength',
    template_id: null,
    activity_type_id: null,
    title: null,
    notes: null,
    skip_note: null,
    display_order: id,
    segments: [],
    status,
    matched_session_id: null,
  }
}

const PLAN_SESSIONS = [
  session(1, 'done'),
  session(2, 'done'),
  session(3, 'planned'),
  session(4, 'skipped'),
]

// 13 zero-filled weeks: 2026-07-13 .. 2026-10-05
const TRENDS = Array.from({ length: 13 }, (_, i) => {
  const d = new Date(2026, 6, 13 + i * 7)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    week_start: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    session_count: 1,
    total_minutes: i === 0 ? 600 : 60, // first week (dropped from the 12) must be ignored
    total_volume: 0,
  }
})
TRENDS[12].total_minutes = 125

const RECORDS = [
  {
    tag: 'legs',
    records: [
      { exercise_id: 1, exercise_name: 'Squat', heaviest_weight: 100, best_reps_at_heaviest: 5, best_single_set_volume: 500 },
    ],
  },
  {
    tag: 'push',
    records: [
      { exercise_id: 2, exercise_name: 'Bench Press', heaviest_weight: 80, best_reps_at_heaviest: 6, best_single_set_volume: 480 },
    ],
  },
]

const PROGRESSION: Record<string, unknown[]> = {
  '1': [
    { date: '2026-08-01', max_weight: 90, total_volume: 1 },
    { date: '2026-09-01', max_weight: 100, total_volume: 1 },
  ],
  '2': [
    { date: '2026-09-20', max_weight: 70, total_volume: 1 },
    { date: '2026-10-02', max_weight: 80, total_volume: 1 },
    { date: '2026-10-04', max_weight: 80, total_volume: 1 },
  ],
}

const CORRELATION = [
  { date: '2026-09-20', wellbeing: 1, rpe: 1, type: 'strength' }, // outside 7 days
  { date: '2026-10-02', wellbeing: 4, rpe: 3, type: 'strength' },
  { date: '2026-10-06', wellbeing: 5, rpe: 4, type: 'cardio' },
]

function mockApi(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    [`/plans/${MONDAY}`]: { plan_id: 1, week_start: MONDAY, sessions: PLAN_SESSIONS },
    [`/plan/weekly-summary?week_start=${MONDAY}`]: {
      planned: {},
      actual: { cardio_distance_km: 12.34, cardio_duration_min: 70, strength_exercise_count: 0, strength_volume_kg_reps: 0 },
    },
    '/analytics/overview-trends': TRENDS,
    '/analytics/strength/records': RECORDS,
    '/analytics/readiness/correlation': CORRELATION,
    ...overrides,
  }
  mockGet.mockImplementation(async (url: string) => {
    const m = url.match(/progression\?exercise_id=(\d+)/)
    if (m) return PROGRESSION[m[1]] ?? []
    if (url in responses) return responses[url]
    throw new Error(`unmocked ${url}`)
  })
}

function renderGlance() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <StatsGlance />
    </QueryClientProvider>,
  )
}

describe('StatsGlance', () => {
  beforeEach(() => {
    mockGet.mockReset()
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the this-week card with exact values', async () => {
    mockApi()
    renderGlance()
    const card = await screen.findByTestId('glance-week')
    // 2 done of 4 on the plan; 125 min = 2h 5m; 12.34 km -> 12.3
    expect(await within(card).findByText(/2h 5m/)).toBeInTheDocument()
    expect(card).toHaveTextContent('2 / 4')
    expect(card).toHaveTextContent('12.3km')
  })

  it('renders the latest PR (most recent record date wins)', async () => {
    mockApi()
    renderGlance()
    const card = await screen.findByTestId('glance-pr')
    // Bench reached 80 kg on 2 Oct (first hit), later than Squat on 1 Sep
    expect(card).toHaveTextContent('Bench Press')
    expect(card).toHaveTextContent('80 kg × 6 · Fri, 2 Oct')
  })

  it('hides the PR card when there are no records', async () => {
    mockApi({ '/analytics/strength/records': [] })
    renderGlance()
    await screen.findByTestId('glance-week')
    await screen.findByTestId('glance-12w')
    expect(screen.queryByTestId('glance-pr')).not.toBeInTheDocument()
  })

  it('renders 12 bars with the current week lighter and the average', async () => {
    mockApi()
    renderGlance()
    const card = await screen.findByTestId('glance-12w')
    const bars = within(card).getAllByTestId('glance-bar')
    expect(bars).toHaveLength(12)
    expect(bars[11]).toHaveClass('bg-primary-light')
    expect(bars[0]).toHaveClass('bg-primary')
    // 11 x 60 + 125 = 785 / 12 = 65.4 -> 65 min
    expect(card).toHaveTextContent('1h 5m')
    expect(card).toHaveTextContent('weekly average')
  })

  it('averages feeling and effort over the last 7 days only', async () => {
    mockApi()
    renderGlance()
    const card = await screen.findByTestId('glance-readiness')
    expect(card).toHaveTextContent('4.5/5')
    expect(card).toHaveTextContent('3.5/5')
  })

  it('hides the readiness card when nothing falls in the last 7 days', async () => {
    mockApi({ '/analytics/readiness/correlation': [CORRELATION[0]] })
    renderGlance()
    await screen.findByTestId('glance-week')
    await screen.findByTestId('glance-12w')
    expect(screen.queryByTestId('glance-readiness')).not.toBeInTheDocument()
  })

  it('shows an error card without breaking the rest', async () => {
    mockGet.mockImplementation(async (url: string) => {
      if (url === '/analytics/overview-trends') throw new Error('boom')
      if (url === '/analytics/readiness/correlation') return CORRELATION
      if (url === '/analytics/strength/records') return []
      throw new Error('boom')
    })
    renderGlance()
    await waitFor(() =>
      expect(screen.getAllByText(/Couldn.t load this right now/)).toHaveLength(2),
    )
    expect(await screen.findByTestId('glance-readiness')).toBeInTheDocument()
  })

  it('matches WeeklyOverviewCard week semantics for the same plan data', async () => {
    mockApi()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={qc}>
        <WeeklyOverviewCard sessions={PLAN_SESSIONS as never} isLoading={false} />
      </QueryClientProvider>,
    )
    // Overview card: 1 planned, 2 done, 1 skipped -> glance shows done 2 of 4 total
    expect(container).toHaveTextContent('1 Planned')
    expect(container).toHaveTextContent('2 Done')
    expect(container).toHaveTextContent('1 Skipped')
    renderGlance()
    expect(await screen.findByTestId('glance-week')).toHaveTextContent('2 / 4')
  })
})
