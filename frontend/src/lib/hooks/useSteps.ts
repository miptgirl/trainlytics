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
  const queryFn = () => {
    const params = new URLSearchParams()
    if (startDate) params.set('start_date', startDate)
    if (endDate) params.set('end_date', endDate)
    const qs = params.toString()
    const url = qs ? `/steps?${qs}` : '/steps'
    return api.get<StepEntry[]>(url)
  }
  const q = useQuery<StepEntry[]>({ queryKey, queryFn })
  return q
}

export function useDeleteStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/steps/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['steps'] })
      qc.invalidateQueries({ queryKey: ['training-trends'] })
    },
  })
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
