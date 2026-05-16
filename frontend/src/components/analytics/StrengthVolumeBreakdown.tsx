import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useStrengthVolumeByTag } from '../../lib/analyticsApi'

const TAG_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
]

function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function StrengthVolumeBreakdown() {
  const { data, isLoading } = useStrengthVolumeByTag(12)

  if (isLoading) {
    return <div className="h-52 bg-slate-50 rounded-lg animate-pulse" />
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-8">
        No strength volume data yet.
      </p>
    )
  }

  const tagSet = new Set<string>()
  const weekSet = new Set<string>()
  data.forEach((p) => {
    tagSet.add(p.tag)
    weekSet.add(p.week_start)
  })

  const tags = Array.from(tagSet).sort((a, b) => {
    if (a === 'untagged') return 1
    if (b === 'untagged') return -1
    return a.localeCompare(b)
  })
  const weeks = Array.from(weekSet).sort()

  const pivotMap = new Map<string, Record<string, number>>()
  for (const w of weeks) {
    pivotMap.set(w, {})
  }
  data.forEach((p) => {
    pivotMap.get(p.week_start)![p.tag] = p.total_volume
  })

  const chartData = weeks.map((w) => ({
    week: formatWeekLabel(w),
    ...pivotMap.get(w)!,
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          unit=" kg"
          width={55}
        />
        <Tooltip formatter={(value: number) => `${Math.round(value)} kg`} />
        <Legend />
        {tags.map((tag, i) => (
          <Bar
            key={tag}
            dataKey={tag}
            stackId="volume"
            fill={TAG_COLORS[i % TAG_COLORS.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
