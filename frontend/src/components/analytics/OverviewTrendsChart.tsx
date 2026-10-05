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
import { formatCompact } from '../../lib/chartUtils'
import { axisColor, chartColor, gridColor } from '../../lib/chartPalette'

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
      <p className="text-xs font-medium text-text-muted-strong mb-2">{label}</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor()} />
          <XAxis dataKey="week" tick={{ fontSize: 10, fill: axisColor() }} />
          <YAxis
            tick={{ fontSize: 10, fill: axisColor() }}
            width={40}
            tickFormatter={formatCompact}
            allowDecimals={false}
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
          <div key={i} className="h-48 bg-bg rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  // The API zero-fills empty weeks, so "no data" means every week is all zeros
  const isEmpty =
    !data ||
    data.every((p) => p.session_count === 0 && p.total_minutes === 0 && p.total_volume === 0)
  if (!data || isEmpty) {
    return (
      <p className="text-text-muted-strong text-sm text-center py-8">No data yet</p>
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
        color={chartColor('chart-strength')}
        label="Sessions per week"
      />
      <MiniChart
        data={chartData}
        dataKey="minutes"
        color={chartColor('chart-running')}
        label="Training time per week (min)"
        unit=" min"
        tickFormatter={(v) => String(Math.round(v))}
      />
      <MiniChart
        data={chartData}
        dataKey="volume"
        color={chartColor('chart-swimming')}
        label="Volume per week (kg)"
        tickFormatter={formatCompact}
        unit=" kg"
      />
    </div>
  )
}
