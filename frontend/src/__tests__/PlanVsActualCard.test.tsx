import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '../lib/api'
import { PlanVsActualCard } from '../components/plan/PlanVsActualCard'

const mockGet = vi.mocked(api.get)

const ZERO_TOTALS = {
  cardio_distance_km: 0,
  cardio_duration_min: 0,
  strength_exercise_count: 0,
  strength_volume_kg_reps: 0,
}

function renderCard(weekStart = '2026-05-11') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <PlanVsActualCard weekStart={weekStart} />
    </QueryClientProvider>,
  )
}

describe('PlanVsActualCard', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('renders planned and actual cardio distance from API data', async () => {
    mockGet.mockResolvedValue({
      planned: { ...ZERO_TOTALS, cardio_distance_km: 5.0, cardio_duration_min: 30 },
      actual: { ...ZERO_TOTALS, cardio_distance_km: 6.0, cardio_duration_min: 35 },
    })

    renderCard()

    // Distance row: planned 5.0 km, actual 6.0 km
    expect(await screen.findByText('5.0 km')).toBeInTheDocument()
    expect(screen.getByText('6.0 km')).toBeInTheDocument()
  })

  it('renders planned and actual strength volume', async () => {
    mockGet.mockResolvedValue({
      planned: { ...ZERO_TOTALS, strength_volume_kg_reps: 500, strength_exercise_count: 3 },
      actual: { ...ZERO_TOTALS, strength_volume_kg_reps: 400, strength_exercise_count: 3 },
    })

    renderCard()

    expect(await screen.findByText('500')).toBeInTheDocument()
    expect(screen.getByText('400')).toBeInTheDocument()
  })

  it('renders nothing when data is not available', () => {
    // Never resolves — simulates loading with data=undefined after loading
    mockGet.mockResolvedValue(undefined as never)
    renderCard()
    // Card returns null when data is falsy — no "Plan vs. Actual" heading
    expect(screen.queryByText(/plan vs\. actual/i)).not.toBeInTheDocument()
  })

  it('uses the provided weekStart in the API request', async () => {
    mockGet.mockResolvedValue({ planned: ZERO_TOTALS, actual: ZERO_TOTALS })
    renderCard('2026-05-04')
    await screen.findByText(/plan vs\. actual/i)
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('week_start=2026-05-04'),
    )
  })
})
