import type { ReactNode } from 'react'
import { useQueries } from '@tanstack/react-query'
import {
  useOverviewTrends,
  useReadinessCorrelation,
  useStrengthRecords,
  type StrengthProgressionPoint,
} from '../../lib/analyticsApi'
import { api } from '../../lib/api'
import { useWeekPlan } from '../../lib/planApi'
import { useQuery } from '@tanstack/react-query'
import { useMediaQuery } from '../../lib/hooks/useMediaQuery'
import { summarizeWeek } from '../../lib/planStats'
import { formatShortDate, getMondayOfCurrentWeek, toLocalDateStr } from '../../lib/dateUtils'
import { formatMinutes } from '../../lib/timeFormat'

const CARD = 'bg-surface rounded-xl border border-border p-4'
const LABEL = 'text-xs font-semibold uppercase tracking-wide text-text-muted-strong'
const MAX_PR_LOOKUPS = 30
const PR_STALE_MS = 5 * 60 * 1000

interface CardioListItem {
  total_distance_meters: number | null
}

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
  // All cardio sessions this week (planned or not): the plan summary only counts plan-matched ones
  const cardio = useQuery({
    queryKey: ['sessions', 'glance-week-cardio', weekStart],
    queryFn: () =>
      api.get<{ items: CardioListItem[] }>(
        `/sessions?type=cardio&date_from=${weekStart}&page_size=100`,
      ),
  })
  const trends = useOverviewTrends()

  if (plan.isLoading || cardio.isLoading || trends.isLoading) return <Skeleton label="This week" />
  if (plan.isError || cardio.isError || trends.isError) return <ErrorCard label="This week" />

  // Same status semantics as WeeklyOverviewCard; "planned" total = every session on the plan
  const { planned, done, skipped } = summarizeWeek(plan.data?.sessions ?? [])
  const total = planned + done + skipped
  const minutes = trends.data?.find((p) => p.week_start === weekStart)?.total_minutes ?? 0
  const km =
    (cardio.data?.items ?? []).reduce((sum, c) => sum + (c.total_distance_meters ?? 0), 0) / 1000

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
          <p className="text-xs text-text-muted-strong mt-0.5">cardio</p>
        </div>
      </div>
    </Card>
  )
}

/**
 * The records endpoint has no date, so the PR date comes from each exercise's
 * progression series (same query key as ExerciseProgressionChart): the first
 * day its max weight reached the record weight. Looks at the first
 * MAX_PR_LOOKUPS exercises, so "latest" is approximate beyond that until the
 * records endpoint returns dates. Renders the best PR known so far instead of
 * waiting for the slowest request.
 */
function LatestPrCard() {
  const records = useStrengthRecords()

  const exercises = new Map<number, { name: string; weight: number; reps: number }>()
  for (const group of records.data ?? []) {
    for (const r of group.records) {
      if (r.heaviest_weight <= 0) continue // bodyweight records have no weight to date
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
      staleTime: PR_STALE_MS,
    })),
  })

  let best: { name: string; weight: number; reps: number; date: string } | null = null
  progressions.forEach((q, i) => {
    const ex = exercises.get(ids[i])
    const hit = q.data?.find((p) => p.max_weight >= (ex?.weight ?? Infinity))
    if (ex && hit && (!best || hit.date > best.date)) best = { ...ex, date: hit.date }
  })
  const pr = best as { name: string; weight: number; reps: number; date: string } | null

  const anyResolved = progressions.some((q) => q.isSuccess)
  if (records.isLoading || (!pr && ids.length > 0 && progressions.some((q) => q.isLoading) && !anyResolved)) {
    return <Skeleton label="Latest personal record" />
  }
  if (!pr) return null

  return (
    <section className="bg-surface rounded-xl border border-border p-4 flex items-start gap-3" data-testid="glance-pr">
      <span
        className="shrink-0 w-10 h-10 rounded-full bg-accent-light flex items-center justify-center text-accent-text"
        aria-hidden="true"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M6 2h8v2h3v2.5a4 4 0 0 1-3.4 3.96A4.5 4.5 0 0 1 11 12.9V15h2.5v2h-7v-2H9v-2.1a4.5 4.5 0 0 1-2.6-2.44A4 4 0 0 1 3 6.5V4h3V2zm-1 4v.5c0 .8.5 1.5 1.1 1.8A9 9 0 0 1 6 6H5zm10 0h-1c0 .9-.04 1.7-.1 2.3.6-.3 1.1-1 1.1-1.8V6z" />
        </svg>
      </span>
      <div className="min-w-0">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-accent-text mb-1">
          Latest personal record
        </h3>
        <p className="text-lg font-bold text-text">{pr.name}</p>
        <p className="text-sm text-text-muted-strong">
          {pr.weight} kg × {pr.reps} · {formatShortDate(pr.date)}
        </p>
      </div>
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
  // Average over completed weeks only: the current week is partial and would drag it down
  const completed = weeks.slice(0, -1)
  const avg = completed.length
    ? Math.round(completed.reduce((s, w) => s + w.total_minutes, 0) / completed.length)
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
        <span className="font-semibold text-text">{formatMinutes(avg)}</span> weekly average (excl. this week)
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
  // Gate on the media query, not just CSS, so desktop never fires these requests
  const isMobile = useMediaQuery('(max-width: 767px)')
  if (!isMobile) return null
  return (
    <div className="space-y-3" data-testid="stats-glance">
      <ThisWeekCard />
      <LatestPrCard />
      <TrainingTimeCard />
      <ReadinessCard />
    </div>
  )
}
