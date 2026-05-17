import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export interface AnalyticsSummary {
  total_sessions: number
  total_minutes: number
  total_distance_km: number
}

export interface StrengthProgressionPoint {
  date: string
  max_weight: number
  total_volume: number
}

export interface PersonalRecord {
  exercise_id: number
  exercise_name: string
  heaviest_weight: number
  best_reps_at_heaviest: number
  best_single_set_volume: number
}

export interface RecordsGroup {
  tag: string
  records: PersonalRecord[]
}

export interface VolumeByTagPoint {
  week_start: string
  tag: string
  total_volume: number
}

export interface CardioTimeSplitPoint {
  activity_type: string
  total_minutes: number
}

export interface WalkSegmentsPoint {
  date: string
  session_title: string | null
  walk_segment_count: number
}

export interface DistanceProgressionPoint {
  month_start: string
  activity_type: string
  cumulative_distance_km: number
}

export interface TrainingLoadPoint {
  week_start: string
  total_minutes: number
  total_distance_km: number
}

export interface TrainingLoadWindow {
  window: 4 | 8
  data: TrainingLoadPoint[]
}

export interface ReadinessTrendPoint {
  week_start: string
  avg_wellbeing: number | null
  avg_rpe: number | null
}

export interface ReadinessCorrelationPoint {
  date: string
  wellbeing: number
  rpe: number
  type: string
}

export interface HeatmapDay {
  date: string
  session_types: ('strength' | 'cardio')[]
}

export function useAnalyticsSummary() {
  return useQuery<AnalyticsSummary>({
    queryKey: ['analytics', 'summary'],
    queryFn: () => api.get<AnalyticsSummary>('/analytics/summary'),
  })
}

export function useStrengthProgression(exerciseId: number | null) {
  return useQuery<StrengthProgressionPoint[]>({
    queryKey: ['analytics', 'strength', 'progression', exerciseId],
    queryFn: () =>
      api.get<StrengthProgressionPoint[]>(
        `/analytics/strength/progression?exercise_id=${exerciseId}`,
      ),
    enabled: exerciseId !== null,
  })
}

export function useStrengthRecords() {
  return useQuery<RecordsGroup[]>({
    queryKey: ['analytics', 'strength', 'records'],
    queryFn: () => api.get<RecordsGroup[]>('/analytics/strength/records'),
  })
}

export function useStrengthVolumeByTag(weeks = 12) {
  return useQuery<VolumeByTagPoint[]>({
    queryKey: ['analytics', 'strength', 'volume-by-tag', weeks],
    queryFn: () =>
      api.get<VolumeByTagPoint[]>(`/analytics/strength/volume-by-tag?weeks=${weeks}`),
  })
}

export function useCardioTimeSplit(period = 90) {
  return useQuery<CardioTimeSplitPoint[]>({
    queryKey: ['analytics', 'cardio', 'time-split', period],
    queryFn: () =>
      api.get<CardioTimeSplitPoint[]>(`/analytics/cardio/time-split?period=${period}`),
  })
}

export function useCardioWalkSegments() {
  return useQuery<WalkSegmentsPoint[]>({
    queryKey: ['analytics', 'cardio', 'walk-segments'],
    queryFn: () => api.get<WalkSegmentsPoint[]>('/analytics/cardio/walk-segments'),
  })
}

export function useCardioDistanceProgression() {
  return useQuery<DistanceProgressionPoint[]>({
    queryKey: ['analytics', 'cardio', 'distance-progression'],
    queryFn: () =>
      api.get<DistanceProgressionPoint[]>('/analytics/cardio/distance-progression'),
  })
}

export function useTrainingLoad() {
  return useQuery<TrainingLoadWindow[]>({
    queryKey: ['analytics', 'training-load'],
    queryFn: () => api.get<TrainingLoadWindow[]>('/analytics/training-load'),
  })
}

export function useReadinessTrends() {
  return useQuery<ReadinessTrendPoint[]>({
    queryKey: ['analytics', 'readiness', 'trends'],
    queryFn: () => api.get<ReadinessTrendPoint[]>('/analytics/readiness/trends'),
  })
}

export function useReadinessCorrelation() {
  return useQuery<ReadinessCorrelationPoint[]>({
    queryKey: ['analytics', 'readiness', 'correlation'],
    queryFn: () => api.get<ReadinessCorrelationPoint[]>('/analytics/readiness/correlation'),
  })
}

export function useAnalyticsHeatmap() {
  return useQuery<HeatmapDay[]>({
    queryKey: ['analytics', 'heatmap'],
    queryFn: () => api.get<HeatmapDay[]>('/analytics/heatmap'),
  })
}

export interface OverviewTrendPoint {
  week_start: string
  session_count: number
  total_minutes: number
  total_volume: number
}

export interface ExercisesByTypePoint {
  week_start: string
  muscle_group_tag: string
  exercise_count: number
}

export interface PlanAdherencePoint {
  week_start: string
  completion_pct: number | null
  strength_volume_delta: number | null
  cardio_distance_delta: number | null
}

export function useOverviewTrends() {
  return useQuery<OverviewTrendPoint[]>({
    queryKey: ['analytics', 'overview-trends'],
    queryFn: () => api.get<OverviewTrendPoint[]>('/analytics/overview-trends'),
  })
}

export function useExercisesByType(weeks = 12) {
  return useQuery<ExercisesByTypePoint[]>({
    queryKey: ['analytics', 'strength', 'exercises-by-type', weeks],
    queryFn: () =>
      api.get<ExercisesByTypePoint[]>(`/analytics/strength/exercises-by-type?weeks=${weeks}`),
  })
}

export function usePlanAdherence(weeks = 12) {
  return useQuery<PlanAdherencePoint[]>({
    queryKey: ['analytics', 'plan-adherence', weeks],
    queryFn: () =>
      api.get<PlanAdherencePoint[]>(`/analytics/plan-adherence?weeks=${weeks}`),
  })
}
