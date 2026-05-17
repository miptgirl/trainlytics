import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { usePlanAdherence } from '../../lib/analyticsApi'

function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function PlanAdherenceChart() {
  const { data, isLoading } = usePlanAdherence(12)

  if (isLoading) {
    return <div className="h-52 bg-slate-50 rounded-lg animate-pulse" />
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-8">
        No plan adherence data yet. Start planning sessions to track adherence.
      </p>
    )
  }

  const chartData = data.map((p) => ({
    week: formatWeekLabel(p.week_start),
    completion: p.completion_pct != null ? Math.round(p.completion_pct * 100) : null,
    volumeDelta: p.strength_volume_delta != null ? Math.round(p.strength_volume_delta) : null,
    distanceDelta:
      p.cardio_distance_delta != null
        ? Math.round(p.cardio_distance_delta * 10) / 10
        : null,
  }))

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-slate-500 mb-2">Completion % (Done ÷ Done+Skipped)</p>
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              domain={[0, 100]}
              width={36}
              unit="%"
            />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Bar dataKey="completion" name="Completion" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            <ReferenceLine y={100} stroke="#10b981" strokeDasharray="4 4" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 mb-2">
          Strength volume delta (actual − planned, kg·reps)
        </p>
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              width={52}
              tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              unit=" kg"
            />
            <Tooltip formatter={(v: number) => `${v > 0 ? '+' : ''}${Math.round(v)} kg·reps`} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Bar
              dataKey="volumeDelta"
              name="Volume delta"
              fill="#8b5cf6"
              radius={[2, 2, 0, 0]}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 mb-2">
          Cardio distance delta (actual − planned, km)
        </p>
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              width={40}
              unit=" km"
            />
            <Tooltip formatter={(v: number) => `${v > 0 ? '+' : ''}${v} km`} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Bar
              dataKey="distanceDelta"
              name="Distance delta"
              fill="#10b981"
              radius={[2, 2, 0, 0]}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
