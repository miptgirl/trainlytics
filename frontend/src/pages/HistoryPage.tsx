import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ComposedChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Layout } from '../components/Layout'
import { WeeklyInsightsCard } from '../components/WeeklyInsightsCard'
import { api } from '../lib/api'
import { useSteps, type StepEntry } from '../lib/hooks/useSteps'
import { usePaceTrends } from '../lib/hooks/usePaceTrends'
import { formatSessionDateTime, toLocalDateStr } from '../lib/dateUtils'
import { metresToKm, secPerKmToMinPerKm } from '../lib/unitUtils'
import {
  formatStrengthSession,
  formatCardioSession,
  type StrengthSession,
  type CardioSession,
} from '../lib/exportUtils'

interface SessionSummary {
  id: number
  type: 'cardio' | 'strength'
  date: string
  notes: string | null
  title: string | null
  calories: number | null
  created_at: string
  // cardio
  total_duration_seconds: number | null
  total_distance_meters: number | null
  // strength
  total_sets: number | null
  exercise_count: number | null
  total_volume: number | null
  duration_seconds: number | null
}

interface SessionListOut {
  items: SessionSummary[]
  total: number
  page: number
  page_size: number
}

interface WeeklyActivitySummary {
  minutes: number
  calories: number
}

interface WeeklySummaryOut {
  cardio: WeeklyActivitySummary
  strength: WeeklyActivitySummary
}

interface TrainingTrendPoint {
  week_start: string
  cardio_minutes: number
  strength_minutes: number
  cardio_calories: number
  strength_calories: number
}

const PACE_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
]

function getMonday(d: Date): string {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return toLocalDateStr(date)
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatDistance(meters: number): string {
  return `${metresToKm(meters).toFixed(2)} km`
}

function formatPace(secPerKm: number): string {
  return secPerKmToMinPerKm(secPerKm)
}

function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`
  return `${Math.round(kg)} kg`
}

function formatWeekLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ── Weekly Summary Card ────────────────────────────────────────────────────────

function WeeklySummaryCard() {
  const weekStart = getMonday(new Date())
  const { data, isLoading } = useQuery<WeeklySummaryOut>({
    queryKey: ['weekly-summary', weekStart],
    queryFn: () => api.get<WeeklySummaryOut>(`/sessions/weekly-summary?week_start=${weekStart}`),
  })

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-5">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
        This Week
      </h2>
      {isLoading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : data ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-emerald-50 rounded-xl p-4">
            <p className="text-xs font-medium text-emerald-600 mb-2">🏃 Cardio</p>
            <p className="text-2xl font-bold text-emerald-700">{data.cardio.minutes}<span className="text-sm font-normal ml-1">min</span></p>
            <p className="text-sm text-emerald-600 mt-1">{data.cardio.calories} kcal</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-xs font-medium text-blue-600 mb-2">🏋️ Strength</p>
            <p className="text-2xl font-bold text-blue-700">{data.strength.minutes}<span className="text-sm font-normal ml-1">min</span></p>
            <p className="text-sm text-blue-600 mt-1">{data.strength.calories} kcal</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ── Training Trends Chart ──────────────────────────────────────────────────────

function TrainingTrendsChart() {
  const [view, setView] = useState<'minutes' | 'calories'>('minutes')

  const { data, isLoading } = useQuery<TrainingTrendPoint[]>({
    queryKey: ['training-trends'],
    queryFn: () => api.get<TrainingTrendPoint[]>('/sessions/training-trends?weeks=12&skip_empty_weeks=true'),
  })

  // derive weekStarts from the training-trends data (ISO week_start strings)
  const weekStarts = data ? [...new Set(data.map((p) => p.week_start))].sort() : []

  // helper: add n days to an ISO date (YYYY-MM-DD)
  function addDaysIso(iso: string, n: number) {
    const d = new Date(iso + 'T00:00:00')
    d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  }

  // fetch steps covering the same span as the chart (start of first week to end of last week)
  const startDate = weekStarts.length > 0 ? weekStarts[0] : undefined
  const endDate = weekStarts.length > 0 ? addDaysIso(weekStarts[weekStarts.length - 1], 6) : undefined
  const { data: stepsEntries } = useSteps(startDate, endDate)

  // aggregate daily steps into weekly totals keyed by week_start (null if no data in that week)
  const stepsByDate = new Map<string, number>()
  ;(stepsEntries ?? []).forEach((e: StepEntry) => {
    stepsByDate.set(e.date, (stepsByDate.get(e.date) ?? 0) + e.steps)
  })

  const weeklyStepsMap = new Map<string, number | null>()
  for (const w of weekStarts) {
    let total = 0
    let count = 0
    for (let i = 0; i < 7; i++) {
      const d = addDaysIso(w, i)
      const v = stepsByDate.get(d)
      if (v != null) {
        total += v
        count += 1
      }
    }
    weeklyStepsMap.set(w, count > 0 ? total : null)
  }

  const chartData = data?.map((p) => ({
    week: formatWeekLabel(p.week_start),
    Cardio: view === 'minutes' ? p.cardio_minutes : p.cardio_calories,
    Strength: view === 'minutes' ? p.strength_minutes : p.strength_calories,
    Steps: weeklyStepsMap.get(p.week_start) ?? null,
  }))

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          12-Week Trends (incl. this week)
        </h2>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setView('minutes')}
            className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
              view === 'minutes'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Minutes
          </button>
          <button
            onClick={() => setView('calories')}
            className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
              view === 'calories'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Calories
          </button>
        </div>
      </div>
      {isLoading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : chartData ? (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={chartData} margin={{ top: 0, right: 20, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCardio" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="colorStrength" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
            {/* Right-side axis for steps (only shown if any weekly step data exists) */}
            {Array.from(weeklyStepsMap.values()).some((v) => v != null) && (
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
            )}
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="Cardio" stackId="1" stroke="#10b981" strokeWidth={2} fill="url(#colorCardio)" />
            <Area type="monotone" dataKey="Strength" stackId="1" stroke="#3b82f6" strokeWidth={2} fill="url(#colorStrength)" />
            {/* Steps line on the secondary axis — dashed and neutral colour; gaps are preserved via nulls */}
            {Array.from(weeklyStepsMap.values()).some((v) => v != null) && (
              <Line type="monotone" dataKey="Steps" yAxisId="right" stroke="#94a3b8" strokeWidth={2} dot={false} strokeDasharray="4 4" connectNulls={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  )
}

// ── Pace Trends Chart ──────────────────────────────────────────────────────────

function PaceTrendsChart() {
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())

  const { data, isLoading } = usePaceTrends()

  const allActivityTypes = useMemo(() => {
    if (!data) return []
    return [...new Set(data.map((d) => d.activity_type))].sort()
  }, [data])

  // One entry per unique (activity_type, segment_label) pair, excluding hidden types
  const lineKeys = useMemo(() => {
    if (!data) return []
    const seen = new Set<string>()
    const result: Array<{ key: string; actType: string; segLabel: string }> = []
    for (const d of data) {
      if (hiddenTypes.has(d.activity_type)) continue
      const key = `${d.activity_type} · ${d.segment_label}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push({ key, actType: d.activity_type, segLabel: d.segment_label })
      }
    }
    return result
  }, [data, hiddenTypes])

  // Pivot: one row per week_start, one column per line key (null = gap)
  const chartData = useMemo(() => {
    if (!data) return []
    const weeks = [...new Set(data.map((d) => d.week_start))].sort()
    return weeks.map((week) => {
      const row: Record<string, string | number | null> = { week: formatWeekLabel(week) }
      for (const { key, actType, segLabel } of lineKeys) {
        const point = data.find(
          (d) => d.week_start === week && d.activity_type === actType && d.segment_label === segLabel,
        )
        row[key] = point != null ? point.avg_pace_sec_per_km : null
      }
      return row
    })
  }, [data, lineKeys])

  function toggleType(type: string) {
    setHiddenTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const cardBody = () => {
    if (isLoading) return <p className="text-slate-400 text-sm">Loading…</p>
    if (!data || data.length === 0)
      return (
        <p className="text-slate-400 text-sm">
          No cardio sessions with distance and duration logged yet.
        </p>
      )
    return (
      <>
        {allActivityTypes.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {allActivityTypes.map((type) => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`text-xs px-3 py-1 rounded-full font-medium border transition-colors ${
                  !hiddenTypes.has(type)
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        )}
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickFormatter={(v: number) => {
                const m = Math.floor(v / 60)
                const s = Math.round(v % 60)
                return `${m}:${String(s).padStart(2, '0')}`
              }}
            />
            <Tooltip
              formatter={(value: unknown, name: unknown) => {
                const label = String(name ?? '')
                if (typeof value !== 'number') return [String(value ?? '-'), label] as [string, string]
                return [secPerKmToMinPerKm(value), label] as [string, string]
              }}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {lineKeys.map(({ key }, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={PACE_COLORS[i % PACE_COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-6">
      {cardBody()}
    </div>
  )
}

// ── Session Row Stats ─────────────────────────────────────────────────────────

function CardioStats({ s }: { s: SessionSummary }) {
  const parts: string[] = []
  if (s.total_distance_meters != null) parts.push(formatDistance(s.total_distance_meters))
  if (s.total_duration_seconds != null) parts.push(formatDuration(s.total_duration_seconds))
  if (
    s.total_duration_seconds != null &&
    s.total_distance_meters != null &&
    s.total_distance_meters > 0
  ) {
    const paceSecPerKm = s.total_duration_seconds / (s.total_distance_meters / 1000)
    parts.push(formatPace(paceSecPerKm))
  }
  if (parts.length === 0) return null
  return <span>{parts.join(' · ')}</span>
}

function StrengthStats({ s }: { s: SessionSummary }) {
  const parts: string[] = []
  if (s.exercise_count != null) parts.push(`${s.exercise_count} exercise${s.exercise_count !== 1 ? 's' : ''}`)
  if (s.total_volume != null && s.total_volume > 0) parts.push(formatVolume(s.total_volume))
  if (s.duration_seconds != null) parts.push(formatDuration(s.duration_seconds))
  if (parts.length === 0) return null
  return <span>{parts.join(' · ')}</span>
}

// ── Copy Row Button ───────────────────────────────────────────────────────────

function CopyRowButton({ session }: { session: SessionSummary }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'copied' | 'error'>('idle')

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (status !== 'idle') return
    setStatus('loading')
    try {
      const full = await api.get<StrengthSession | CardioSession>(`/sessions/${session.id}`)
      const text =
        session.type === 'strength'
          ? formatStrengthSession(full as StrengthSession)
          : formatCardioSession(full as CardioSession)
      await navigator.clipboard.writeText(text)
      setStatus('copied')
    } catch {
      setStatus('error')
    }
    setTimeout(() => setStatus('idle'), 2000)
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === 'loading'}
      className="shrink-0 px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 text-slate-500 transition-colors"
      aria-label="Copy session summary"
    >
      {status === 'loading' ? '…' : status === 'copied' ? 'Copied!' : status === 'error' ? 'Failed' : 'Copy'}
    </button>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [chartTab, setChartTab] = useState<'trends' | 'pace'>('trends')
  const [type, setType] = useState<'all' | 'cardio' | 'strength'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data: profile } = useQuery<{ has_anthropic_key: boolean; has_openai_key: boolean }>({
    queryKey: ['profile'],
    queryFn: () => api.get('/profile'),
  })
  const hasApiKey = !!(profile?.has_anthropic_key || profile?.has_openai_key)

  const params = new URLSearchParams()
  if (type !== 'all') params.set('type', type)
  if (dateFrom) params.set('date_from', dateFrom)
  if (dateTo) params.set('date_to', dateTo)
  params.set('page', String(page))
  params.set('page_size', String(pageSize))

  const { data, isLoading } = useQuery<SessionListOut>({
    queryKey: ['sessions', type, dateFrom, dateTo, page],
    queryFn: () => api.get<SessionListOut>(`/sessions?${params.toString()}`),
  })

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1

  function handleFilterChange() {
    setPage(1)
  }

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-slate-900 mb-5">Workout History</h1>

      <WeeklySummaryCard />

      <WeeklyInsightsCard hasApiKey={hasApiKey} />

      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-4 w-fit">
        <button
          onClick={() => setChartTab('trends')}
          className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
            chartTab === 'trends'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Trends
        </button>
        <button
          onClick={() => setChartTab('pace')}
          className={`text-xs px-3 py-1 rounded-md font-medium transition-colors ${
            chartTab === 'pace'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Pace
        </button>
      </div>
      {chartTab === 'trends' ? <TrainingTrendsChart /> : <PaceTrendsChart />}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as 'all' | 'cardio' | 'strength')
            handleFilterChange()
          }}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All types</option>
          <option value="cardio">Cardio</option>
          <option value="strength">Strength</option>
        </select>

        <div className="flex items-center gap-1.5">
          <label className="text-sm text-slate-600">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              handleFilterChange()
            }}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-sm text-slate-600">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              handleFilterChange()
            }}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {(type !== 'all' || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setType('all')
              setDateFrom('')
              setDateTo('')
              setPage(1)
            }}
            className="text-sm text-slate-500 hover:text-blue-600 underline transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-slate-400 text-sm">No sessions found.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {data.items.map((s) => (
              <li key={s.id} className="flex items-center bg-white border border-slate-200 rounded-xl hover:border-blue-400 hover:shadow-sm transition-all">
                <Link
                  to={`/sessions/${s.id}`}
                  className="flex flex-1 items-center justify-between px-4 py-3 min-w-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`shrink-0 inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        s.type === 'cardio'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {s.type === 'cardio' ? '🏃 Cardio' : '🏋️ Strength'}
                    </span>
                    <div className="min-w-0">
                      {s.title ? (
                        <span className="font-medium text-slate-900 truncate block">{s.title}</span>
                      ) : null}
                      <span className={`text-slate-${s.title ? '500' : '900'} ${s.title ? 'text-sm' : 'font-medium'}`}>
                        {formatSessionDateTime(s.date)}
                      </span>
                    </div>
                    {s.notes && !s.title && (
                      <span className="text-sm text-slate-500 truncate">{s.notes}</span>
                    )}
                  </div>
                  <div className="shrink-0 text-sm text-slate-500 ml-3 text-right">
                    {s.type === 'cardio' ? (
                      <CardioStats s={s} />
                    ) : (
                      <StrengthStats s={s} />
                    )}
                  </div>
                </Link>
                <div className="shrink-0 pr-3">
                  <CopyRowButton session={s} />
                </div>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 text-sm text-slate-600">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages} · {data.total} session{data.total !== 1 ? 's' : ''}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </Layout>
  )
}
