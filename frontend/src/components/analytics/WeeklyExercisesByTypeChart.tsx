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
import { useExercisesByType } from '../../lib/analyticsApi'

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

export function WeeklyExercisesByTypeChart() {
  const { data, isLoading } = useExercisesByType(12)

  if (isLoading) {
    return <div className="h-52 bg-slate-50 rounded-lg animate-pulse" />
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-8">
        No exercise data yet.
      </p>
    )
  }

  const tagSet = new Set<string>()
  const weekSet = new Set<string>()
  data.forEach((p) => {
    tagSet.add(p.muscle_group_tag)
    weekSet.add(p.week_start)
  })

  const tags = Array.from(tagSet).sort((a, b) => {
    if (a === 'untagged') return 1
    if (b === 'untagged') return -1
    return a.localeCompare(b)
  })
  const weeks = Array.from(weekSet).sort()

  const pivotMap = new Map<string, Record<string, number>>()
  for (const w of weeks) pivotMap.set(w, {})
  data.forEach((p) => {
    pivotMap.get(p.week_start)![p.muscle_group_tag] = p.exercise_count
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
          allowDecimals={false}
          width={32}
        />
        <Tooltip formatter={(value: number) => `${value} exercise${value !== 1 ? 's' : ''}`} />
        <Legend />
        {tags.map((tag, i) => (
          <Bar
            key={tag}
            dataKey={tag}
            stackId="exercises"
            fill={TAG_COLORS[i % TAG_COLORS.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
