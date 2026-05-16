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

function formatDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function WalkSegmentsTrendChart() {
  const { data, isLoading } = useCardioWalkSegments()

  if (isLoading) {
    return <div className="h-52 bg-slate-50 rounded-lg animate-pulse" />
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-8">
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
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          interval="preserveStartEnd"
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
        <Tooltip
          labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
          formatter={(v: number) => [v, 'Walk segments']}
        />
        <Bar dataKey="Walk segments" fill="#10b981" radius={[3, 3, 0, 0]} minPointSize={2} />
      </BarChart>
    </ResponsiveContainer>
  )
}
