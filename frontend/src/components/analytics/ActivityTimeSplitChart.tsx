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
    return <div className="h-52 bg-slate-50 rounded-lg animate-pulse" />
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-8">
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
              className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                period === p.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setChartType('bar')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              chartType === 'bar'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Bar
          </button>
          <button
            onClick={() => setChartType('pie')}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
              chartType === 'pie'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Pie
          </button>
        </div>
      </div>

      {chartType === 'bar' ? (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="activity_type" tick={{ fontSize: 12, fill: '#94a3b8' }} />
            <YAxis
              tickFormatter={(v) => `${v}m`}
              tick={{ fontSize: 12, fill: '#94a3b8' }}
            />
            <Tooltip formatter={(v: number) => [`${v} min`, 'Total minutes']} />
            <Bar dataKey="total_minutes" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
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
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
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
