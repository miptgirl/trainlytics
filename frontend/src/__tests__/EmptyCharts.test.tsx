import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'

const overview = vi.fn()
const adherence = vi.fn()
vi.mock('../lib/analyticsApi', () => ({
  useOverviewTrends: () => overview(),
  usePlanAdherence: () => adherence(),
}))

import { OverviewTrendsChart } from '../components/analytics/OverviewTrendsChart'
import { PlanAdherenceChart } from '../components/analytics/PlanAdherenceChart'

describe('empty chart states', () => {
  it('Overview treats zero-filled weeks as no data', () => {
    overview.mockReturnValue({
      isLoading: false,
      data: [
        { week_start: '2026-09-21', session_count: 0, total_minutes: 0, total_volume: 0 },
        { week_start: '2026-09-28', session_count: 0, total_minutes: 0, total_volume: 0 },
      ],
    })
    render(<OverviewTrendsChart />)
    expect(screen.getByText('No data yet')).toBeInTheDocument()
  })

  it('Overview draws charts once any week has data', () => {
    overview.mockReturnValue({
      isLoading: false,
      data: [
        { week_start: '2026-09-21', session_count: 0, total_minutes: 0, total_volume: 0 },
        { week_start: '2026-09-28', session_count: 3, total_minutes: 120, total_volume: 5000 },
      ],
    })
    render(<OverviewTrendsChart />)
    expect(screen.queryByText('No data yet')).not.toBeInTheDocument()
    expect(screen.getByText('Sessions per week')).toBeInTheDocument()
  })

  it('Plan adherence shows its empty message for all-null rows', () => {
    adherence.mockReturnValue({
      isLoading: false,
      data: [
        { week_start: '2026-09-21', completion_pct: null, strength_volume_delta: null, cardio_distance_delta: null },
        { week_start: '2026-09-28', completion_pct: null, strength_volume_delta: 0, cardio_distance_delta: 0 },
      ],
    })
    render(<PlanAdherenceChart />)
    expect(screen.getByText(/no plan adherence data yet/i)).toBeInTheDocument()
  })
})
