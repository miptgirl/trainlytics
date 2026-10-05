import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, afterEach } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { PlannedSessionCard } from '../components/plan/PlannedSessionCard'
import type { PlannedSessionOut } from '../lib/planApi'

const strengthSession: PlannedSessionOut = {
  id: 11,
  planned_date: '2026-10-05',
  session_type: 'strength',
  template_id: 3,
  activity_type_id: null,
  title: 'Leg day',
  notes: null,
  skip_note: null,
  display_order: 0,
  segments: [],
  status: 'planned',
  matched_session_id: null,
}

function Where() {
  const loc = useLocation()
  return <p data-testid="location">{loc.pathname + loc.search}</p>
}

function renderCard(session: PlannedSessionOut) {
  const qc = new QueryClient()
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/plan']}>
        <Routes>
          <Route
            path="/plan"
            element={
              <PlannedSessionCard session={session} weekStart="2026-10-05" activityTypeMap={new Map()} onEdit={() => {}} />
            }
          />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function setViewport(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 767px)' && width <= 767,
    media: query,
  }))
}

describe('Plan card Start on a strength session', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('opens workout mode at 390px', async () => {
    setViewport(390)
    renderCard(strengthSession)
    await userEvent.click(screen.getByRole('button', { name: /Start/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/workout?type=strength&templateId=3')
  })

  it('opens the full form at 1280px', async () => {
    setViewport(1280)
    renderCard(strengthSession)
    await userEvent.click(screen.getByRole('button', { name: /Start/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/log?type=strength&templateId=3')
  })

  it('keeps the skipped-session date and cardio routing unchanged', async () => {
    setViewport(390)
    renderCard({ ...strengthSession, status: 'skipped' })
    await userEvent.click(screen.getByRole('button', { name: /Start/ }))
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/workout?type=strength&templateId=3&date=2026-10-05T10:00',
    )
  })

  it('cardio Start still opens the full form on a phone', async () => {
    setViewport(390)
    renderCard({ ...strengthSession, session_type: 'cardio', template_id: null, activity_type_id: 1 })
    await userEvent.click(screen.getByRole('button', { name: /Start/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/log?type=cardio&plannedSessionId=11&weekStart=2026-10-05')
  })
})
