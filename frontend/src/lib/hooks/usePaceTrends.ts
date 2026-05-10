import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

export interface PaceTrendPoint {
  week_start: string
  activity_type: string
  segment_label: string
  avg_pace_sec_per_km: number
}

/**
 * Fetches pace trend data grouped by (week, activity_type, segment_label).
 *
 * @param weeks Number of weeks to include (default: 13, covers 12 completed weeks
 *              plus the current partial week).
 */
export function usePaceTrends(weeks = 13) {
  return useQuery<PaceTrendPoint[]>({
    queryKey: ['pace-trends', weeks],
    queryFn: () => api.get<PaceTrendPoint[]>(`/sessions/pace-trends?weeks=${weeks}`),
  })
}
