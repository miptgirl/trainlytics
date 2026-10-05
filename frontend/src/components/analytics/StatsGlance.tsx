import type { ReactNode } from 'react'
import { useQueries } from '@tanstack/react-query'
import {
  useOverviewTrends,
  useReadinessCorrelation,
  useStrengthRecords,
  type StrengthProgressionPoint,
} from '../../lib/analyticsApi'
import { api } from '../../lib/api'
import { useWeekPlan, useWeeklySummary } from '../../lib/planApi'
import { summarizeWeek } from '../../lib/planStats'
import { formatShortDate, getMondayOfCurrentWeek, toLocalDateStr } from '../../lib/dateUtils'
import { formatMinutes } from '../../lib/timeFormat'

const CARD = 'bg-surface rounded-xl border border-border p-4'
const LABEL = 'text-xs font-semibold uppercase tracking-wide text-text-muted-strong'
const MAX_PR_LOOKUPS = 30

function Card({
  label,
  children,
  className = '',
  testId,
}: {
  label: string
  children: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <section className={`${CARD} ${className}`} data-testid={testId}>
      <h3 className={`${LABEL} mb-2`}>{label}</h3>
      {children}
    </section>
  )
}

function Skeleton({ label }: { label: string }) {
  return (
    <Card label={label}>
      <div className="animate-pulse space-y-2" data-testid="glance-skeleton">
        <div className="h-8 w-28 bg-primary-tint rounded" />
        <div className="h-3 w-40 bg-primary-tint rounded" />
      </div>
    </Card>
  )
}

function ErrorCard({ label }: { label: string }) {
  return (
    <Card label={label}>
      <p className="text-sm text-text-muted-strong">Couldn&apos;t load this right now.</p>
    </Card>
  )
}

function Big({ children, unit }: { children: ReactNode; unit?: string }) {
  return (
    <span className="text-3xl font-bold text-text">
      {children}
      {unit && <span className="text-base font-medium text-text-muted-strong ml-1">{unit}</span>}
    </span>
  )
}

function ThisWeekCard() {
  const weekStart = getMondayOfCurrentWeek()
  const plan = useWeekPlan(weekStart)
  const summary = useWeeklySummary(weekStart)
  const trends = useOverviewTrends()

  if (plan.isLoading || summary.isLoading || trends.isLoading) return <Skeleton label="This week" />
  if (plan.isError || summary.isError || trends.isError) return <ErrorCard label="This week" />

  // Same status semantics as WeeklyOverviewCard; "planned" total = every session on the plan
  const { planned, done, skipped } = summarizeWeek(plan.data?.sessions ?? [])
  const total = planned + done + skipped
  const minutes = trends.data?.find((p) => p.week_start === weekStart)?.total_minutes ?? 0
  const km = summary.data?.actual.cardio_distance_km ?? 0

  return (
    <Card label="This week" testId="glance-week">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Big>
            {done}
            <span className="text-text-muted-strong"> / {total}</span>
          </Big>
          <p className="text-xs text-text-muted-strong mt-0.5">sessions</p>
        </div>
        <div>
          <Big>{formatMinutes(minutes)}</Big>
          <p className="text-xs text-text-muted-strong mt-0.5">training</p>
        </div>
        <div>
          <Big unit="km">{km.toFixed(1)}</Big>
          <p className="text-xs text-text-muted-strong mt-0.5">run</p>
        </div>
      </div>
    </Card>
  )
}

/**
 * The records endpoint has no date, so the PR date comes from each exercise's
 * progression series (same query key as ExerciseProgressionChart): the first
 * day its max weight reached the record weight.
 */
function LatestPrCard() {
  const records = useStrengthRecords()

  const exercises = new Map<number, { name: string; weight: number; reps: number }>()
  for (const group of records.data ?? []) {
    for (const r of group.records) {
      exercises.set(r.exercise_id, {
        name: r.exercise_name,
        weight: r.heaviest_weight,
        reps: r.best_reps_at_heaviest,
      })
    }
  }
  const ids = [...exercises.keys()].slice(0, MAX_PR_LOOKUPS)

  const progressions = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['analytics', 'strength', 'progression', id],
      queryFn: () =>
        api.get<StrengthProgressionPoint[]>(`/analytics/strength/progression?exercise_id=${id}`),
    })),
  })

  if (records.isLoading || (ids.length > 0 && progressions.some((q) => q.isLoading))) {
    return <Skeleton label="Latest personal record" />
  }

  let best: { name: string; weight: number; reps: number; date: string } | null = null
  progressions.forEach((q, i) => {
    const ex = exercises.get(ids[i])
    const hit = q.data?.find((p) => p.max_weight >= (ex?.weight ?? Infinity))
    if (ex && hit && (!best || hit.date > best.date)) best = { ...ex, date: hit.date }
  })
  const pr = best as { name: string; weight: number; reps: number; date: string } | null
  if (!pr) return null

  return (
    <section className="bg-accent-light rounded-xl border border-border p-4" data-testid="glance-pr">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-accent-text mb-2">
        Latest personal record
      </h3>
      <p className="text-lg font-bold text-text">{pr.name}</p>
      <p className="text-sm text-accent-text">
        {pr.weight} kg × {pr.reps} · {formatShortDate(pr.date)}
      </p>
    </section>
  )
}

function TrainingTimeCard() {
  const { data, isLoading, isError } = useOverviewTrends()
  if (isLoading) return <Skeleton label="Training time, last 12 weeks" />
  if (isError) return <ErrorCard label="Training time, last 12 weeks" />

  // The API returns 13 zero-filled weeks (12 back + current); keep the latest 12
  const weeks = (data ?? []).slice(-12)
  const max = Math.max(1, ...weeks.map((w) => w.total_minutes))
  const avg = weeks.length
    ? Math.round(weeks.reduce((s, w) => s + w.total_minutes, 0) / weeks.length)
    : 0
  const currentIdx = weeks.length - 1

  return (
    <Card label="Training time, last 12 weeks" testId="glance-12w">
      <div className="flex items-end gap-1 h-16" aria-hidden="true">
        {weeks.map((w, i) => (
          <div
            key={w.week_start}
            data-testid="glance-bar"
            className={`flex-1 rounded-sm ${i === currentIdx ? 'bg-primary-light' : 'bg-primary'}`}
            style={{ height: `${Math.max(4, (w.total_minutes / max) * 100)}%` }}
          />
        ))}
      </div>
      <p className="text-sm text-text-muted-strong mt-2">
        <span className="font-semibold text-text">{formatMinutes(avg)}</span> weekly average
      </p>
    </Card>
  )
}

function ReadinessCard() {
  const { data, isLoading, isError } = useReadinessCorrelation()
  if (isLoading) return <Skeleton label="Readiness, last 7 days" />
  if (isError) return null

  const today = new Date()
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)
  const fromStr = toLocalDateStr(from)
  const toStr = toLocalDateStr(today)
  const recent = (data ?? []).filter((p) => p.date >= fromStr && p.date <= toStr)
  if (recent.length === 0) return null

  const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)

  return (
    <Card label="Readiness, last 7 days" testId="glance-readiness">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Big unit="/5">{avg(recent.map((p) => p.wellbeing))}</Big>
          <p className="text-xs text-text-muted-strong mt-0.5">feeling</p>
        </div>
        <div>
          <Big unit="/5">{avg(recent.map((p) => p.rpe))}</Big>
          <p className="text-xs text-text-muted-strong mt-0.5">effort</p>
        </div>
      </div>
    </Card>
  )
}

export function StatsGlance() {
  return (
    <div className="space-y-3 md:hidden" data-testid="stats-glance">
      <ThisWeekCard />
      <LatestPrCard />
      <TrainingTimeCard />
      <ReadinessCard />
    </div>
  )
}
