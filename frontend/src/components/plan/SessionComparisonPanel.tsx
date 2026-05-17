import { useSessionComparison } from '../../lib/planApi'

interface Props {
  plannedSessionId: number
  sessionType: 'cardio' | 'strength'
}

function fmt(val: number | null, unit: string): string {
  if (val == null) return '—'
  return `${val.toFixed(unit === 'kg' ? 0 : 1)} ${unit}`
}

function fmtSet(reps: number | null, weight: number | null): string {
  if (reps == null && weight == null) return '—'
  const r = reps != null ? `${reps}` : '—'
  const w = weight != null ? `${weight} kg` : '—'
  return `${r} × ${w}`
}

export function SessionComparisonPanel({ plannedSessionId, sessionType }: Props) {
  const { data, isLoading, isError } = useSessionComparison(plannedSessionId)

  if (isLoading) {
    return <p className="text-slate-400 text-xs">Loading…</p>
  }

  if (isError || !data) {
    return <p className="text-slate-400 text-xs italic">Planned data not available.</p>
  }

  if (sessionType === 'cardio' && data.cardio) {
    const c = data.cardio
    return (
      <table className="text-xs w-full">
        <thead>
          <tr className="text-slate-500">
            <th className="text-left font-medium pb-1 w-1/3"></th>
            <th className="text-right font-medium pb-1">Planned</th>
            <th className="text-right font-medium pb-1">Actual</th>
          </tr>
        </thead>
        <tbody className="text-slate-700">
          <tr>
            <td className="py-0.5 text-slate-500">Distance</td>
            <td className="text-right py-0.5">{fmt(c.planned_distance_km, 'km')}</td>
            <td className="text-right py-0.5">{fmt(c.actual_distance_km, 'km')}</td>
          </tr>
          <tr>
            <td className="py-0.5 text-slate-500">Duration</td>
            <td className="text-right py-0.5">{fmt(c.planned_duration_min, 'min')}</td>
            <td className="text-right py-0.5">{fmt(c.actual_duration_min, 'min')}</td>
          </tr>
        </tbody>
      </table>
    )
  }

  if (sessionType === 'strength' && data.strength) {
    const s = data.strength
    return (
      <div className="space-y-3">
        {s.exercises.map((ex, ei) => (
          <div key={ei}>
            <p className="text-xs font-semibold text-slate-700 mb-1">
              {ex.exercise_name}
              {ex.source === 'planned_only' && (
                <span className="text-slate-400 font-normal ml-1">(not logged)</span>
              )}
              {ex.source === 'actual_only' && (
                <span className="text-slate-400 font-normal ml-1">(added)</span>
              )}
            </p>
            <table className="text-xs w-full">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left font-medium pb-0.5 w-8">Set</th>
                  <th className="text-right font-medium pb-0.5">Planned</th>
                  <th className="text-right font-medium pb-0.5">Actual</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {ex.sets.map((row, si) => (
                  <tr key={si}>
                    <td className="py-0.5 text-slate-400">{si + 1}</td>
                    <td className="text-right py-0.5">
                      {fmtSet(row.planned_reps, row.planned_weight_kg)}
                    </td>
                    <td className="text-right py-0.5">
                      {fmtSet(row.actual_reps, row.actual_weight_kg)}
                    </td>
                  </tr>
                ))}
                <tr className="italic text-slate-500">
                  <td className="pt-1">Volume</td>
                  <td className="text-right pt-1">{ex.planned_volume.toFixed(0)} kg</td>
                  <td className="text-right pt-1">{ex.actual_volume.toFixed(0)} kg</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
        <div className="border-t border-slate-200 pt-1">
          <table className="text-xs w-full">
            <tbody>
              <tr className="font-semibold text-slate-700">
                <td>Total volume</td>
                <td className="text-right">{s.planned_total_volume.toFixed(0)} kg</td>
                <td className="text-right">{s.actual_total_volume.toFixed(0)} kg</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return <p className="text-slate-400 text-xs italic">Planned data not available.</p>
}
