import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import type { DotItemDotProps } from 'recharts'
import { api } from '../../lib/api'
import { useStrengthProgression } from '../../lib/analyticsApi'
import { formatCompact } from '../../lib/chartUtils'
import { axisColor, chartColor, gridColor } from '../../lib/chartPalette'

interface Exercise {
  id: number
  name: string
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function ExerciseProgressionChart() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showVolume, setShowVolume] = useState(false)

  const { data: exercises = [] } = useQuery<Exercise[]>({
    queryKey: ['exercises'],
    queryFn: () => api.get<Exercise[]>('/exercises'),
  })

  const { data: progression, isLoading } = useStrengthProgression(selectedId)

  const maxWeight = progression && progression.length > 0
    ? Math.max(...progression.map((p) => p.max_weight))
    : null

  const chartData = progression?.map((p) => ({
    date: formatDateLabel(p.date),
    'Max Weight (kg)': p.max_weight,
    'Volume (kg)': p.total_volume,
    _raw_weight: p.max_weight,
  }))

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          value={selectedId ?? ''}
          onChange={(e) => {
            setSelectedId(e.target.value ? Number(e.target.value) : null)
            setShowVolume(false)
          }}
          className="text-sm border border-border rounded-sm px-3 py-1.5 text-text bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Select exercise…</option>
          {exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name}
            </option>
          ))}
        </select>

        {selectedId !== null && (
          <button
            onClick={() => setShowVolume((v) => !v)}
            className={`text-xs px-3 py-1.5 max-md:min-h-11 max-md:min-w-11 rounded-lg font-medium transition-colors ${
              showVolume
                ? 'bg-primary-tint text-primary-dark'
                : 'bg-bg text-text-muted-strong'
            }`}
          >
            {showVolume ? 'Hide Volume' : 'Show Volume'}
          </button>
        )}
      </div>

      {selectedId === null ? (
        <p className="text-text-muted-strong text-sm text-center py-8">
          Select an exercise to see progression.
        </p>
      ) : isLoading ? (
        <div className="h-52 flex items-center justify-center">
          <p className="text-text-muted-strong text-sm">Loading…</p>
        </div>
      ) : !chartData || chartData.length === 0 ? (
        <p className="text-text-muted-strong text-sm text-center py-8">
          No data logged for this exercise yet.
        </p>
      ) : (
        <>
          {maxWeight !== null && (
            <p className="text-xs text-text-muted-strong mb-3">
              <span className="inline-block w-3 h-3 rounded-full bg-warning mr-1 align-middle" />
              Gold dot marks all-time PR ({maxWeight} kg)
            </p>
          )}
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor()} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: axisColor() }} />
              <YAxis
                yAxisId="weight"
                tick={{ fontSize: 11, fill: axisColor() }}
                tickFormatter={formatCompact}
                width={40}
              />
              {showVolume && (
                <YAxis
                  yAxisId="volume"
                  orientation="right"
                  tick={{ fontSize: 11, fill: axisColor() }}
                  tickFormatter={formatCompact}
                  width={40}
                />
              )}
              <Tooltip />
              <Legend />
              <Line
                yAxisId="weight"
                type="monotone"
                dataKey="Max Weight (kg)"
                stroke={chartColor('chart-strength')}
                strokeWidth={2}
                dot={(props: DotItemDotProps) => {
                  const { cx, cy, payload } = props
                  if (payload['_raw_weight'] === maxWeight) {
                    return (
                      <circle
                        key={`pr-${cx}-${cy}`}
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill={chartColor('warning')}
                        stroke={chartColor('surface')}
                        strokeWidth={2}
                      />
                    )
                  }
                  return (
                    <circle
                      key={`dot-${cx}-${cy}`}
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill={chartColor('chart-strength')}
                    />
                  )
                }}
              />
              {showVolume && (
                <Line
                  yAxisId="volume"
                  type="monotone"
                  dataKey="Volume (kg)"
                  stroke={chartColor('chart-swimming')}
                  strokeWidth={2}
                  dot={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
