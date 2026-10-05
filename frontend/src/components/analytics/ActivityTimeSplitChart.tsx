import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { useCardioTimeSplit } from '../../lib/analyticsApi'
import { formatCompact } from '../../lib/chartUtils'
import { activityColor, axisColor, gridColor } from '../../lib/chartPalette'

const PERIODS = [
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '180d', value: 180 },
  { label: 'All', value: 36500 },
]

export function ActivityTimeSplitChart() {
  const [period, setPeriod] = useState(90)
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar')
  const { data, isLoading } = useCardioTimeSplit(period)

  if (isLoading) {
    return <div className="h-52 bg-bg rounded-lg animate-pulse" />
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-text-muted-strong text-sm text-center py-8">
        No cardio data for this period.
      </p>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 max-md:min-h-11 max-md:min-w-11 max-md:px-4 text-xs rounded-sm font-medium transition-colors ${
                period === p.value
                  ? 'bg-primary-dark text-white border border-primary-dark'
                  : 'bg-surface border border-border-strong text-text-muted-strong hover:bg-bg'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setChartType('bar')}
            className={`px-3 py-1 max-md:min-h-11 max-md:min-w-11 max-md:px-4 text-xs rounded-sm font-medium transition-colors ${
              chartType === 'bar'
                ? 'bg-primary-tint text-primary-dark border border-primary-dark'
                : 'bg-surface border border-border-strong text-text-muted-strong hover:bg-bg'
            }`}
          >
            Bar
          </button>
          <button
            onClick={() => setChartType('pie')}
            className={`px-3 py-1 max-md:min-h-11 max-md:min-w-11 max-md:px-4 text-xs rounded-sm font-medium transition-colors ${
              chartType === 'pie'
                ? 'bg-primary-tint text-primary-dark border border-primary-dark'
                : 'bg-surface border border-border-strong text-text-muted-strong hover:bg-bg'
            }`}
          >
            Pie
          </button>
        </div>
      </div>

      {chartType === 'bar' ? (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor()} />
            <XAxis dataKey="activity_type" tick={{ fontSize: 12, fill: axisColor() }} />
            <YAxis
              tickFormatter={formatCompact}
              tick={{ fontSize: 12, fill: axisColor() }}
              width={40}
            />
            <Tooltip formatter={(v: number) => [`${v} min`, 'Total minutes']} />
            <Bar dataKey="total_minutes" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={activityColor(entry.activity_type, i)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={data}
              dataKey="total_minutes"
              nameKey="activity_type"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={({ name, percent }: { name?: string; percent?: number }) =>
                `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
              }
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={activityColor(entry.activity_type, i)} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => [`${v} min`, 'Total minutes']} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
