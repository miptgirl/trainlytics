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
import { axisColor, chartColor, gridColor } from '../../lib/chartPalette'

function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function ReadinessTrendsChart() {
  const { data, isLoading } = useReadinessTrends()

  if (isLoading) {
    return <div className="h-52 bg-bg rounded-lg animate-pulse" />
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-text-muted-strong text-sm text-center py-8">
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
      <LineChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor()} />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 11, fill: axisColor() }}
          interval="preserveStartEnd"
        />
        {/* Wellbeing is 1–5 (left), session RPE 1–10 (right) */}
        <YAxis
          yAxisId="wellbeing"
          domain={[1, 5]}
          ticks={[1, 2, 3, 4, 5]}
          tick={{ fontSize: 12, fill: axisColor() }}
        />
        <YAxis
          yAxisId="rpe"
          orientation="right"
          domain={[0, 10]}
          ticks={[0, 2, 4, 6, 8, 10]}
          tick={{ fontSize: 12, fill: axisColor() }}
        />
        <Tooltip formatter={(v: number) => v.toFixed(1)} />
        <Legend />
        <Line
          type="monotone"
          yAxisId="wellbeing"
          dataKey="wellbeing"
          name="Avg Wellbeing (1–5)"
          stroke={chartColor('success')}
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
        <Line
          type="monotone"
          yAxisId="rpe"
          dataKey="rpe"
          name="Avg RPE (1–10)"
          stroke={chartColor('warning')}
          strokeWidth={2}
          dot={false}
          strokeDasharray="5 3"
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
