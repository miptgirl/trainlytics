import { useState } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useReadinessCorrelation } from '../../lib/analyticsApi'

type SessionFilter = 'all' | 'strength' | 'cardio'

function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length
  if (n < 2) return null
  const sumX = points.reduce((s, p) => s + p.x, 0)
  const sumY = points.reduce((s, p) => s + p.y, 0)
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0)
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0)
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return null
  const m = (n * sumXY - sumX * sumY) / denom
  const b = (sumY - m * sumX) / n
  return { m, b }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export function WellbeingCorrelationChart() {
  const { data, isLoading } = useReadinessCorrelation()
  const [filter, setFilter] = useState<SessionFilter>('all')

  if (isLoading) {
    return <div className="h-52 bg-slate-50 rounded-lg animate-pulse" />
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-8">
        No readiness correlation data available.
      </p>
    )
  }

  const visible = filter === 'all' ? data : data.filter((d) => d.type === filter)

  const strengthData = visible
    .filter((d) => d.type === 'strength')
    .map((d) => ({ x: d.wellbeing, y: d.rpe }))

  const cardioData = visible
    .filter((d) => d.type === 'cardio')
    .map((d) => ({ x: d.wellbeing, y: d.rpe }))

  const allPoints = visible.map((d) => ({ x: d.wellbeing, y: d.rpe }))
  const reg = linearRegression(allPoints)
  const trendData = reg
    ? [
        { x: 1, y: clamp(reg.m * 1 + reg.b, 1, 5) },
        { x: 5, y: clamp(reg.m * 5 + reg.b, 1, 5) },
      ]
    : []

  const FILTERS: SessionFilter[] = ['all', 'strength', 'cardio']

  return (
    <div>
      <div className="flex items-center gap-1 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs rounded-full font-medium capitalize transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 4, right: 16, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            type="number"
            dataKey="x"
            name="Wellbeing"
            domain={[0.5, 5.5]}
            ticks={[1, 2, 3, 4, 5]}
            label={{
              value: 'Pre-training Wellbeing',
              position: 'insideBottom',
              offset: -12,
              fontSize: 11,
              fill: '#94a3b8',
            }}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="RPE"
            domain={[0.5, 5.5]}
            ticks={[1, 2, 3, 4, 5]}
            label={{
              value: 'Post-session RPE',
              angle: -90,
              position: 'insideLeft',
              offset: 10,
              fontSize: 11,
              fill: '#94a3b8',
            }}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            formatter={(v: number, name: string) => [v.toFixed(1), name]}
          />
          <Legend />
          {(filter === 'all' || filter === 'strength') && (
            <Scatter name="Strength" data={strengthData} fill="#3b82f6" opacity={0.75} />
          )}
          {(filter === 'all' || filter === 'cardio') && (
            <Scatter name="Cardio" data={cardioData} fill="#10b981" opacity={0.75} />
          )}
          {trendData.length === 2 && (
            <Scatter
              name="Trend"
              data={trendData}
              fill="none"
              line={{ stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '4 2' }}
              shape={() => null as unknown as React.ReactElement}
              legendType="none"
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
