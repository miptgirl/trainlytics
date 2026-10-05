import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { usePlanAdherence } from '../../lib/analyticsApi'
import { formatCompact } from '../../lib/chartUtils'
import { axisColor, chartColor, gridColor } from '../../lib/chartPalette'

function formatWeekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function PlanAdherenceChart() {
  const { data, isLoading } = usePlanAdherence(12)

  if (isLoading) {
    return <div className="h-52 bg-bg rounded-lg animate-pulse" />
  }

  // Weeks without a plan come back as null/zero rows; all of those means nothing to chart
  const isEmpty =
    !data ||
    data.every(
      (p) =>
        p.completion_pct == null && !p.strength_volume_delta && !p.cardio_distance_delta,
    )
  if (!data || isEmpty) {
    return (
      <p className="text-text-muted-strong text-sm text-center py-8">
        No plan adherence data yet. Start planning sessions to track adherence.
      </p>
    )
  }

  const chartData = data.map((p) => ({
    week: formatWeekLabel(p.week_start),
    completion: p.completion_pct != null ? Math.round(p.completion_pct * 100) : null,
    volumeDelta: p.strength_volume_delta != null ? Math.round(p.strength_volume_delta) : null,
    distanceDelta:
      p.cardio_distance_delta != null
        ? Math.round(p.cardio_distance_delta * 10) / 10
        : null,
  }))

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-text-muted-strong mb-2">Completion % (Done ÷ Done+Skipped)</p>
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor()} />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: axisColor() }} />
            <YAxis
              tick={{ fontSize: 10, fill: axisColor() }}
              domain={[0, 100]}
              width={36}
              unit="%"
            />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Bar dataKey="completion" name="Completion" fill={chartColor('primary')} radius={[2, 2, 0, 0]} />
            <ReferenceLine y={100} stroke={chartColor('primary-dark')} strokeDasharray="4 4" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="text-xs font-medium text-text-muted-strong mb-2">
          Strength volume delta (actual − planned, kg·reps)
        </p>
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor()} />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: axisColor() }} />
            <YAxis
              tick={{ fontSize: 10, fill: axisColor() }}
              width={40}
              tickFormatter={formatCompact}
            />
            <Tooltip formatter={(v: number) => `${v > 0 ? '+' : ''}${Math.round(v)} kg·reps`} />
            <ReferenceLine y={0} stroke={axisColor()} />
            <Bar
              dataKey="volumeDelta"
              name="Volume delta"
              fill={chartColor('chart-strength')}
              radius={[2, 2, 0, 0]}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="text-xs font-medium text-text-muted-strong mb-2">
          Cardio distance delta (actual − planned, km)
        </p>
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor()} />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: axisColor() }} />
            <YAxis
              tick={{ fontSize: 10, fill: axisColor() }}
              width={40}
              tickFormatter={formatCompact}
            />
            <Tooltip formatter={(v: number) => `${v > 0 ? '+' : ''}${v} km`} />
            <ReferenceLine y={0} stroke={axisColor()} />
            <Bar
              dataKey="distanceDelta"
              name="Distance delta"
              fill={chartColor('chart-running')}
              radius={[2, 2, 0, 0]}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
