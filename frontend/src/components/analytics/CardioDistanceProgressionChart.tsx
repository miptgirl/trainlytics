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
import { useCardioDistanceProgression } from '../../lib/analyticsApi'

const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
]

function formatMonthLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}

export function CardioDistanceProgressionChart() {
  const { data, isLoading } = useCardioDistanceProgression()
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  if (isLoading) {
    return <div className="h-52 bg-slate-50 rounded-lg animate-pulse" />
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-8">
        No distance data recorded yet.
      </p>
    )
  }

  const activityTypes = [...new Set(data.map((p) => p.activity_type))]
  const monthSet = [...new Set(data.map((p) => p.month_start))].sort()

  const pivoted = monthSet.map((month) => {
    const row: Record<string, string | number> = { month: formatMonthLabel(month) }
    data
      .filter((p) => p.month_start === month)
      .forEach((p) => {
        row[p.activity_type] = p.cumulative_distance_km
      })
    return row
  })

  function handleLegendClick(entry: { value: string }) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(entry.value)) next.delete(entry.value)
      else next.add(entry.value)
      return next
    })
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={pivoted} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <YAxis
          tickFormatter={(v) => `${v}km`}
          tick={{ fontSize: 12, fill: '#94a3b8' }}
        />
        <Tooltip formatter={(v: number) => [`${v.toFixed(1)} km`]} />
        <Legend onClick={handleLegendClick} style={{ cursor: 'pointer' }} />
        {activityTypes.map((type, i) => (
          <Line
            key={type}
            type="monotone"
            dataKey={type}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={false}
            hide={hidden.has(type)}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
