import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useOverviewTrends } from '../../lib/analyticsApi'

function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function MiniChart({
  data,
  dataKey,
  color,
  label,
  unit,
  tickFormatter,
}: {
  data: { week: string; [key: string]: number | string }[]
  dataKey: string
  color: string
  label: string
  unit?: string
  tickFormatter?: (v: number) => string
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-2">{label}</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <YAxis
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            width={44}
            tickFormatter={tickFormatter}
            unit={unit}
          />
          <Tooltip formatter={(v: number) => (tickFormatter ? tickFormatter(v) : v) + (unit ?? '')} />
          <Bar dataKey={dataKey} fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function OverviewTrendsChart() {
  const { data, isLoading } = useOverviewTrends()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-48 bg-slate-50 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-8">No training data yet.</p>
    )
  }

  const chartData = data.map((p) => ({
    week: formatWeekLabel(p.week_start),
    sessions: p.session_count,
    minutes: p.total_minutes,
    volume: Math.round(p.total_volume),
  }))

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
      <MiniChart
        data={chartData}
        dataKey="sessions"
        color="#3b82f6"
        label="Sessions per week"
        tickFormatter={(v) => String(v)}
      />
      <MiniChart
        data={chartData}
        dataKey="minutes"
        color="#10b981"
        label="Training time per week"
        unit=" min"
        tickFormatter={(v) => String(Math.round(v))}
      />
      <MiniChart
        data={chartData}
        dataKey="volume"
        color="#8b5cf6"
        label="Volume per week"
        tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
        unit=" kg"
      />
    </div>
  )
}
