import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useCardioWalkSegments } from '../../lib/analyticsApi'
import { axisColor, chartColor, gridColor } from '../../lib/chartPalette'

function formatDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function WalkSegmentsTrendChart() {
  const { data, isLoading } = useCardioWalkSegments()

  if (isLoading) {
    return <div className="h-52 bg-bg rounded-lg animate-pulse" />
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-text-muted-strong text-sm text-center py-8">
        No cardio sessions logged yet.
      </p>
    )
  }

  const chartData = data.map((p) => ({
    date: formatDateLabel(p.date),
    label: p.session_title ?? formatDateLabel(p.date),
    'Walk segments': p.walk_segment_count,
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor()} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: axisColor() }}
          interval="preserveStartEnd"
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: axisColor() }} />
        <Tooltip
          labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
          formatter={(v: number) => [v, 'Walk segments']}
        />
        <Bar dataKey="Walk segments" fill={chartColor('chart-walking')} radius={[3, 3, 0, 0]} minPointSize={2} />
      </BarChart>
    </ResponsiveContainer>
  )
}
