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

function fmtVol(setCount: number, vol: number): string {
  if (setCount === 0) return '—'
  return `${setCount} set${setCount !== 1 ? 's' : ''} · ${vol.toFixed(0)} kg`
}

function diffText(planned: number | null, actual: number | null): { text: string; cls: string } {
  if (planned == null || actual == null || planned === 0) return { text: '—', cls: 'text-slate-400' }
  const pct = ((actual - planned) / planned) * 100
  const sign = pct > 0 ? '+' : ''
  const cls = pct > 1 ? 'text-emerald-600' : pct < -1 ? 'text-red-500' : 'text-slate-500'
  return { text: `${sign}${pct.toFixed(0)}%`, cls }
}

function DiffCell({ planned, actual, className = '' }: {
  planned: number | null
  actual: number | null
  className?: string
}) {
  const { text, cls } = diffText(planned, actual)
  return <td className={`text-right tabular-nums ${cls} ${className}`}>{text}</td>
}

// Shared colgroup so every exercise table has identical column widths.
// Set: 20px · Planned: ~39% · Actual: ~39% · Diff: 44px
function StrengthCols() {
  return (
    <colgroup>
      <col style={{ width: 20 }} />
      <col />
      <col />
      <col style={{ width: 44 }} />
    </colgroup>
  )
}

export function SessionComparisonPanel({ plannedSessionId, sessionType }: Props) {
  const { data, isLoading, isError } = useSessionComparison(plannedSessionId)

  if (isLoading) return <p className="text-slate-400 text-xs">Loading…</p>
  if (isError || !data) return <p className="text-slate-400 text-xs italic">Planned data not available.</p>

  // ── Cardio ────────────────────────────────────────────────────────────────
  if (sessionType === 'cardio' && data.cardio) {
    const c = data.cardio
    return (
      <table className="text-xs w-full table-fixed">
        <colgroup>
          <col style={{ width: '30%' }} />
          <col />
          <col />
          <col style={{ width: 44 }} />
        </colgroup>
        <thead>
          <tr className="text-slate-500">
            <th className="text-left font-medium pb-1" />
            <th className="text-right font-medium pb-1">Planned</th>
            <th className="text-right font-medium pb-1">Actual</th>
            <th className="text-right font-medium pb-1">Diff</th>
          </tr>
        </thead>
        <tbody className="text-slate-700">
          <tr>
            <td className="py-0.5 text-slate-500">Distance</td>
            <td className="text-right py-0.5 tabular-nums">{fmt(c.planned_distance_km, 'km')}</td>
            <td className="text-right py-0.5 tabular-nums">{fmt(c.actual_distance_km, 'km')}</td>
            <DiffCell planned={c.planned_distance_km} actual={c.actual_distance_km} className="py-0.5" />
          </tr>
          <tr>
            <td className="py-0.5 text-slate-500">Duration</td>
            <td className="text-right py-0.5 tabular-nums">{fmt(c.planned_duration_min, 'min')}</td>
            <td className="text-right py-0.5 tabular-nums">{fmt(c.actual_duration_min, 'min')}</td>
            <DiffCell planned={c.planned_duration_min} actual={c.actual_duration_min} className="py-0.5" />
          </tr>
        </tbody>
      </table>
    )
  }

  // ── Strength ──────────────────────────────────────────────────────────────
  if (sessionType === 'strength' && data.strength) {
    const s = data.strength

    const totalPlannedSets = s.exercises.reduce(
      (acc, ex) => acc + ex.sets.filter(r => r.planned_reps != null || r.planned_weight_kg != null).length,
      0
    )
    const totalActualSets = s.exercises.reduce(
      (acc, ex) => acc + ex.sets.filter(r => r.actual_reps != null || r.actual_weight_kg != null).length,
      0
    )

    return (
      <div className="space-y-3">
        {s.exercises.map((ex, ei) => {
          const plannedSets = ex.sets.filter(r => r.planned_reps != null || r.planned_weight_kg != null).length
          const actualSets  = ex.sets.filter(r => r.actual_reps  != null || r.actual_weight_kg  != null).length

          return (
            <div key={ei}>
              <p className="text-xs font-semibold text-slate-700 mb-1">
                {ex.exercise_name}
                {ex.source === 'planned_only' && <span className="text-slate-400 font-normal ml-1">(not logged)</span>}
                {ex.source === 'actual_only'  && <span className="text-slate-400 font-normal ml-1">(added)</span>}
              </p>
              <table className="text-xs w-full table-fixed">
                <StrengthCols />
                <thead>
                  <tr className="text-slate-400">
                    <th className="text-left font-normal pb-0.5">Set</th>
                    <th className="text-right font-normal pb-0.5">Planned</th>
                    <th className="text-right font-normal pb-0.5">Actual</th>
                    <th className="text-right font-normal pb-0.5">Diff</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {ex.sets.map((row, si) => (
                    <tr key={si}>
                      <td className="py-0.5 text-slate-400">{si + 1}</td>
                      <td className="text-right py-0.5 tabular-nums">{fmtSet(row.planned_reps, row.planned_weight_kg)}</td>
                      <td className="text-right py-0.5 tabular-nums">{fmtSet(row.actual_reps, row.actual_weight_kg)}</td>
                      <td className="text-right py-0.5 text-slate-300">—</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-100 text-slate-500">
                    <td className="pt-1 text-slate-400 italic text-[11px]">Vol.</td>
                    <td className="text-right pt-1 tabular-nums">{fmtVol(plannedSets, ex.planned_volume)}</td>
                    <td className="text-right pt-1 tabular-nums">{fmtVol(actualSets,  ex.actual_volume)}</td>
                    <DiffCell planned={ex.planned_volume} actual={ex.actual_volume} className="pt-1 font-medium" />
                  </tr>
                </tbody>
              </table>
            </div>
          )
        })}

        <div className="border-t border-slate-200 pt-2">
          <table className="text-xs w-full table-fixed">
            <StrengthCols />
            <tbody>
              <tr className="font-semibold text-slate-700">
                <td className="w-auto">Total volume</td>
                <td className="text-right tabular-nums">{fmtVol(totalPlannedSets, s.planned_total_volume)}</td>
                <td className="text-right tabular-nums">{fmtVol(totalActualSets,  s.actual_total_volume)}</td>
                <DiffCell planned={s.planned_total_volume} actual={s.actual_total_volume} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return <p className="text-slate-400 text-xs italic">Planned data not available.</p>
}
