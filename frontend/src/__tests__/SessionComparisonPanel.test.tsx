import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { api } from '../lib/api'
import { SessionComparisonPanel } from '../components/plan/SessionComparisonPanel'

const mockGet = vi.mocked(api.get)

const row = (
  planned: [number | null, number | null, number | null],
  actual: [number | null, number | null, number | null],
) => ({
  planned_reps: planned[0],
  planned_weight_kg: planned[1],
  planned_duration_seconds: planned[2],
  actual_reps: actual[0],
  actual_weight_kg: actual[1],
  actual_duration_seconds: actual[2],
})

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SessionComparisonPanel plannedSessionId={9} sessionType="strength" />
    </QueryClientProvider>,
  )
}

describe('SessionComparisonPanel: timed sets', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({
      session_type: 'strength',
      cardio: null,
      strength: {
        planned_total_volume: 500,
        actual_total_volume: 500,
        exercises: [
          {
            exercise_id: 1,
            exercise_name: 'Squat',
            source: 'both',
            planned_volume: 500,
            actual_volume: 500,
            sets: [row([5, 100, null], [5, 100, null])],
          },
          {
            exercise_id: 7,
            exercise_name: 'Plank',
            source: 'both',
            planned_volume: 0,
            actual_volume: 0,
            // A bodyweight hold has only its duration
            sets: [row([null, null, 45], [null, null, 75])],
          },
          {
            exercise_id: 8,
            exercise_name: "Farmer's carry",
            source: 'actual_only',
            planned_volume: 0,
            actual_volume: 0,
            sets: [row([null, null, null], [null, 24, 40])],
          },
        ],
      },
    } as never)
  })

  it('shows the hold in the reps place and counts a duration-only row as a set', async () => {
    renderPanel()
    const plank = (await screen.findByText('Plank')).nextElementSibling as HTMLElement
    const [, setRow, volRow] = within(plank).getAllByRole('row')
    expect(within(setRow).getByText('45 s')).toBeInTheDocument()
    expect(within(setRow).getByText('1:15')).toBeInTheDocument()
    // One planned and one actual set, no kg volume
    expect(within(volRow).getAllByText('1 set · 0 kg')).toHaveLength(2)

    const carry = screen.getByText("Farmer's carry").closest('div') as HTMLElement
    expect(within(carry).getByText('40 s × 24 kg')).toBeInTheDocument()

    // Totals count the holds too: Squat 1 + Plank 1 planned; Squat 1 + Plank 1 + carry 1 actual
    const total = screen.getByText('Total volume').closest('tr') as HTMLElement
    expect(within(total).getByText('2 sets · 500 kg')).toBeInTheDocument()
    expect(within(total).getByText('3 sets · 500 kg')).toBeInTheDocument()
  })
})
