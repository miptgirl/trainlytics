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
import { useReadinessTrends } from '../../lib/analyticsApi'

function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function ReadinessTrendsChart() {
  const { data, isLoading } = useReadinessTrends()

  if (isLoading) {
    return <div className="h-52 bg-slate-50 rounded-lg animate-pulse" />
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-8">
        No readiness data recorded yet.
      </p>
    )
  }

  const chartData = data.map((point) => ({
    week: formatWeekLabel(point.week_start),
    wellbeing: point.avg_wellbeing,
    rpe: point.avg_rpe,
  }))

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[1, 5]}
          ticks={[1, 2, 3, 4, 5]}
          tick={{ fontSize: 12, fill: '#94a3b8' }}
        />
        <Tooltip formatter={(v: number) => v.toFixed(1)} />
        <Legend />
        <Line
          type="monotone"
          dataKey="wellbeing"
          name="Avg Wellbeing"
          stroke="#10b981"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="rpe"
          name="Avg RPE"
          stroke="#f97316"
          strokeWidth={2}
          dot={false}
          strokeDasharray="5 3"
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
