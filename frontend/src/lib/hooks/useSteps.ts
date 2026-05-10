import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

export interface StepEntry {
  id: number
  user_id: number
  date: string
  steps: number
  created_at: string
  updated_at: string
}

export function useSteps(startDate?: string, endDate?: string) {
  const queryKey = ['steps', startDate ?? 'all', endDate ?? 'all']
  const queryFn = () => api.get<StepEntry[]>(`/steps?start_date=${startDate ?? ''}&end_date=${endDate ?? ''}`)
  const q = useQuery<StepEntry[]>({ queryKey, queryFn })
  return q
}

export function useUpsertStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { date: string; steps: number }) => api.post<StepEntry>('/steps', body),
    onSuccess: (data) => {
      // invalidate recent steps queries so lists refresh
      qc.invalidateQueries({ queryKey: ['steps'] })
      // also invalidate any 12-week trends/training queries that may include steps
      qc.invalidateQueries({ queryKey: ['training-trends'] })
      return data
    },
  })
}
