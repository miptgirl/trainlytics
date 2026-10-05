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
import { formatCompact } from '../../lib/chartUtils'
import { axisColor, chartColor, gridColor } from '../../lib/chartPalette'

function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function TrainingLoadChart() {
  const { data, isLoading } = useTrainingLoad()
  const [metric, setMetric] = useState<'minutes' | 'distance'>('minutes')

  if (isLoading) {
    return <div className="h-52 bg-bg rounded-lg animate-pulse" />
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-text-muted-strong text-sm text-center py-8">
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
          className={`px-3 py-1 max-md:min-h-11 max-md:min-w-11 max-md:px-4 text-xs rounded-sm font-medium transition-colors ${
            metric === 'minutes'
              ? 'bg-primary-dark text-white border border-primary-dark'
              : 'bg-surface border border-border-strong text-text-muted-strong hover:bg-bg'
          }`}
        >
          Minutes
        </button>
        <button
          onClick={() => setMetric('distance')}
          className={`px-3 py-1 max-md:min-h-11 max-md:min-w-11 max-md:px-4 text-xs rounded-sm font-medium transition-colors ${
            metric === 'distance'
              ? 'bg-primary-dark text-white border border-primary-dark'
              : 'bg-surface border border-border-strong text-text-muted-strong hover:bg-bg'
          }`}
        >
          Distance
        </button>
        <span className="ml-auto text-xs text-text-muted-strong">Rolling total ({unit})</span>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor()} />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 11, fill: axisColor() }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={formatCompact}
            tick={{ fontSize: 12, fill: axisColor() }}
            width={40}
          />
          <Tooltip formatter={(v: number) => [`${v} ${unit}`]} />
          <Legend />
          <Line
            type="monotone"
            dataKey="4-week"
            name="4-week rolling"
            stroke={chartColor('chart-strength')}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="8-week"
            name="8-week rolling"
            stroke={chartColor('warning')}
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
