import { useWeeklySummary } from '../../lib/planApi'

interface Props {
  weekStart: string
}

function fmtNum(v: number, digits: number): string {
  return digits > 0 ? v.toFixed(digits) : Math.round(v).toLocaleString()
}

interface RowProps {
  label: string
  planned: number
  actual: number
  unit: string
  digits: number
}

function MetricRow({ label, planned, actual, unit, digits }: RowProps) {
  const delta = actual - planned
  const planStr = `${fmtNum(planned, digits)}${unit}`
  const actStr = `${fmtNum(actual, digits)}${unit}`
  const deltaStr =
    delta === 0
      ? '—'
      : `${delta > 0 ? '+' : '−'}${fmtNum(Math.abs(delta), digits)}${unit}`
  const deltaClass =
    delta > 0 ? 'text-success-text' : delta < 0 ? 'text-error-text' : 'text-text-muted-strong'

  return (
    <div className="flex items-center text-sm">
      <div className="flex-1 min-w-0 text-text-muted-strong pr-1">{label}</div>
      <div className="w-16 text-right tabular-nums text-text-muted shrink-0 whitespace-nowrap">{planStr}</div>
      <div className="w-16 text-right tabular-nums font-medium text-text ml-2 shrink-0 whitespace-nowrap">
        {actStr}
      </div>
      <div className={`w-[4.5rem] sm:w-20 text-right tabular-nums ml-2 shrink-0 whitespace-nowrap ${deltaClass}`}>
        {deltaStr}
      </div>
    </div>
  )
}

export function PlanVsActualCard({ weekStart }: Props) {
  const { data, isLoading } = useWeeklySummary(weekStart)

  if (isLoading) {
    return (
      <div className="bg-surface rounded-xl border border-border shadow-sm p-4 animate-pulse">
        <div className="h-3 bg-border rounded w-32 mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 bg-bg rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const { planned, actual } = data

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
      <h3 className="text-xs font-semibold text-text-muted-strong uppercase tracking-wide mb-3">
        Plan vs. Actual
      </h3>

      <div className="flex text-xs text-text-muted-strong mb-2">
        <div className="flex-1" />
        <div className="w-16 text-right shrink-0">Plan</div>
        <div className="w-16 text-right ml-2 shrink-0">Actual</div>
        <div className="w-[4.5rem] sm:w-20 text-right ml-2 shrink-0">Δ</div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-text-muted-strong uppercase tracking-wide mb-1.5">
            Cardio
          </p>
          <div className="space-y-1.5">
            <MetricRow
              label="Distance"
              planned={planned.cardio_distance_km}
              actual={actual.cardio_distance_km}
              unit=" km"
              digits={1}
            />
            <MetricRow
              label="Duration"
              planned={planned.cardio_duration_min}
              actual={actual.cardio_duration_min}
              unit=" min"
              digits={0}
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-text-muted-strong uppercase tracking-wide mb-1.5">
            Strength
          </p>
          <div className="space-y-1.5">
            <MetricRow
              label="Exercises"
              planned={planned.strength_exercise_count}
              actual={actual.strength_exercise_count}
              unit=""
              digits={0}
            />
            <MetricRow
              label="Volume (kg·r)"
              planned={planned.strength_volume_kg_reps}
              actual={actual.strength_volume_kg_reps}
              unit=""
              digits={0}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
