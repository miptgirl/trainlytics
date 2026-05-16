import { useStrengthRecords, type PersonalRecord } from '../../lib/analyticsApi'

function PRCard({
  value,
  label,
  colorClass,
}: {
  value: string
  label: string
  colorClass: string
}) {
  return (
    <div className={`rounded-lg p-2 text-center ${colorClass}`}>
      <p className="text-sm font-bold">{value}</p>
      <p className="text-xs mt-0.5 opacity-70">{label}</p>
    </div>
  )
}

function ExerciseRow({ rec }: { rec: PersonalRecord }) {
  return (
    <div className="py-2.5">
      <p className="text-sm font-medium text-slate-800 mb-1.5">{rec.exercise_name}</p>
      <div className="grid grid-cols-3 gap-2">
        <PRCard
          value={`${rec.heaviest_weight} kg`}
          label="Heaviest"
          colorClass="bg-blue-50 text-blue-700"
        />
        <PRCard
          value={String(rec.best_reps_at_heaviest)}
          label="Reps at max"
          colorClass="bg-emerald-50 text-emerald-700"
        />
        <PRCard
          value={`${Math.round(rec.best_single_set_volume)} kg`}
          label="Best vol"
          colorClass="bg-amber-50 text-amber-700"
        />
      </div>
    </div>
  )
}

export function PersonalRecordsPanel() {
  const { data: groups, isLoading } = useStrengthRecords()

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 bg-slate-100 rounded-lg" />
        ))}
      </div>
    )
  }

  if (!groups || groups.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-4">
        No strength sessions logged yet.
      </p>
    )
  }

  const sorted = [...groups].sort((a, b) => {
    if (a.tag === 'untagged') return 1
    if (b.tag === 'untagged') return -1
    return a.tag.localeCompare(b.tag)
  })

  return (
    <div className="space-y-6">
      {sorted.map((group) => (
        <div key={group.tag}>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
            {group.tag === 'untagged' ? 'Untagged' : group.tag}
          </h3>
          <div className="divide-y divide-slate-100">
            {group.records.map((rec) => (
              <ExerciseRow key={rec.exercise_id} rec={rec} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
