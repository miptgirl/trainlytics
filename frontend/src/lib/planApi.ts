import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

export interface PlannedCardioSegmentOut {
  id: number
  segment_order: number
  title: string | null
  duration_secs: number | null
  distance_metres: number | null
  pace_secs_per_km: number | null
  notes: string | null
}

export interface PlannedSessionOut {
  id: number
  planned_date: string
  session_type: 'strength' | 'cardio'
  template_id: number | null
  activity_type_id: number | null
  title: string | null
  notes: string | null
  skip_note: string | null
  display_order: number
  segments: PlannedCardioSegmentOut[]
  status: 'planned' | 'done' | 'skipped'
  matched_session_id: number | null
}

export interface WeekPlanOut {
  plan_id: number
  week_start: string
  sessions: PlannedSessionOut[]
}

export interface PlannedCardioSegmentIn {
  segment_order: number
  title?: string | null
  duration_secs?: number | null
  distance_metres?: number | null
  pace_secs_per_km?: number | null
  notes?: string | null
}

export interface PlannedSessionIn {
  planned_date: string
  session_type: 'strength' | 'cardio'
  template_id?: number | null
  activity_type_id?: number | null
  title?: string | null
  notes?: string | null
  display_order?: number
  segments?: PlannedCardioSegmentIn[]
}

export function useWeekPlan(weekStart: string) {
  return useQuery<WeekPlanOut>({
    queryKey: ['plans', weekStart],
    queryFn: () => api.get<WeekPlanOut>(`/plans/${weekStart}`),
  })
}

export function useAddPlannedSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ weekStart, body }: { weekStart: string; body: PlannedSessionIn }) =>
      api.post<PlannedSessionOut>(`/plans/${weekStart}/sessions`, body),
    onSuccess: (_data, { weekStart }) => {
      qc.invalidateQueries({ queryKey: ['plans', weekStart] })
    },
  })
}

export function useUpdatePlannedSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      weekStart,
      sessionId,
      body,
    }: {
      weekStart: string
      sessionId: number
      body: Partial<PlannedSessionIn>
    }) => api.put<PlannedSessionOut>(`/plans/${weekStart}/sessions/${sessionId}`, body),
    onSuccess: (_data, { weekStart }) => {
      qc.invalidateQueries({ queryKey: ['plans', weekStart] })
    },
  })
}

export function useDeletePlannedSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ weekStart, sessionId }: { weekStart: string; sessionId: number }) =>
      api.delete(`/plans/${weekStart}/sessions/${sessionId}`),
    onSuccess: (_data, { weekStart }) => {
      qc.invalidateQueries({ queryKey: ['plans', weekStart] })
    },
  })
}

export function useUpdateSkipNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      weekStart,
      sessionId,
      skip_note,
    }: {
      weekStart: string
      sessionId: number
      skip_note: string | null
    }) =>
      api.patch(`/plans/${weekStart}/sessions/${sessionId}/skip-note`, { skip_note }),
    onSuccess: (_data, { weekStart }) => {
      qc.invalidateQueries({ queryKey: ['plans', weekStart] })
    },
  })
}

export function useCopyFromLastWeek() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (weekStart: string) =>
      api.post<WeekPlanOut>(`/plans/${weekStart}/copy-from-last-week`),
    onSuccess: (_data, weekStart) => {
      qc.invalidateQueries({ queryKey: ['plans', weekStart] })
    },
  })
}

export interface WeeklySummaryTotals {
  cardio_distance_km: number
  cardio_duration_min: number
  strength_exercise_count: number
  strength_volume_kg_reps: number
}

export interface WeeklySummaryOut {
  planned: WeeklySummaryTotals
  actual: WeeklySummaryTotals
}

export function useWeeklySummary(weekStart: string) {
  return useQuery<WeeklySummaryOut>({
    queryKey: ['plan-weekly-summary', weekStart],
    queryFn: () =>
      api.get<WeeklySummaryOut>(`/plan/weekly-summary?week_start=${weekStart}`),
  })
}
