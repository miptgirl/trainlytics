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
import { formatCompact } from '../../lib/chartUtils'
import { activityColor, axisColor, gridColor } from '../../lib/chartPalette'

function formatMonthLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}

export function CardioDistanceProgressionChart() {
  const { data, isLoading } = useCardioDistanceProgression()
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  if (isLoading) {
    return <div className="h-52 bg-bg rounded-lg animate-pulse" />
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-text-muted-strong text-sm text-center py-8">
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
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor()} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: axisColor() }} />
        <YAxis
          tickFormatter={formatCompact}
          tick={{ fontSize: 12, fill: axisColor() }}
          width={40}
        />
        <Tooltip formatter={(v: number) => [`${v.toFixed(1)} km`]} />
        <Legend onClick={handleLegendClick} style={{ cursor: 'pointer' }} />
        {activityTypes.map((type, i) => (
          <Line
            key={type}
            type="monotone"
            dataKey={type}
            stroke={activityColor(type, i)}
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
