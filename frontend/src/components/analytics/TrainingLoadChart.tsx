import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useTrainingLoad } from '../../lib/analyticsApi'

function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function TrainingLoadChart() {
  const { data, isLoading } = useTrainingLoad()
  const [metric, setMetric] = useState<'minutes' | 'distance'>('minutes')

  if (isLoading) {
    return <div className="h-52 bg-slate-50 rounded-lg animate-pulse" />
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-8">
        Not enough data for training load analysis.
      </p>
    )
  }

  const win4 = data.find((w) => w.window === 4)?.data ?? []
  const win8 = data.find((w) => w.window === 8)?.data ?? []

  const weekSet = new Set([
    ...win4.map((p) => p.week_start),
    ...win8.map((p) => p.week_start),
  ])
  const weeks = [...weekSet].sort()

  const win4Map = Object.fromEntries(win4.map((p) => [p.week_start, p]))
  const win8Map = Object.fromEntries(win8.map((p) => [p.week_start, p]))

  const chartData = weeks.map((week) => {
    const p4 = win4Map[week]
    const p8 = win8Map[week]
    return {
      week: formatWeekLabel(week),
      '4-week': metric === 'minutes' ? (p4?.total_minutes ?? null) : (p4?.total_distance_km ?? null),
      '8-week': metric === 'minutes' ? (p8?.total_minutes ?? null) : (p8?.total_distance_km ?? null),
    }
  })

  const unit = metric === 'minutes' ? 'min' : 'km'

  return (
    <div>
      <div className="flex items-center gap-1 mb-4">
        <button
          onClick={() => setMetric('minutes')}
          className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
            metric === 'minutes'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Minutes
        </button>
        <button
          onClick={() => setMetric('distance')}
          className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
            metric === 'distance'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Distance
        </button>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => `${v}${unit}`}
            tick={{ fontSize: 12, fill: '#94a3b8' }}
          />
          <Tooltip formatter={(v: number) => [`${v} ${unit}`]} />
          <Legend />
          <Line
            type="monotone"
            dataKey="4-week"
            name="4-week rolling"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="8-week"
            name="8-week rolling"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 3"
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
