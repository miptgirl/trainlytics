import { type PlannedSessionOut } from '../../lib/planApi'

interface WeeklyOverviewCardProps {
  sessions: PlannedSessionOut[]
  isLoading: boolean
}

export function WeeklyOverviewCard({ sessions, isLoading }: WeeklyOverviewCardProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-48 mb-3" />
        <div className="flex gap-4 mb-3">
          <div className="h-3 bg-slate-200 rounded w-20" />
          <div className="h-3 bg-slate-200 rounded w-16" />
          <div className="h-3 bg-slate-200 rounded w-18" />
          <div className="h-3 bg-slate-200 rounded w-24" />
        </div>
        <div className="h-2 bg-slate-200 rounded-full" />
      </div>
    )
  }

  const planned = sessions.filter((s) => s.status === 'planned').length
  const done = sessions.filter((s) => s.status === 'done').length
  const skipped = sessions.filter((s) => s.status === 'skipped').length
  const completionDenominator = done + skipped
  const completionPct =
    completionDenominator > 0 ? Math.round((done / completionDenominator) * 100) : null

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Week overview
      </h2>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mb-3">
        <span className="text-slate-600">
          <span className="font-semibold text-slate-800">{planned}</span> Planned
        </span>
        <span className="text-slate-600">
          <span className="font-semibold text-emerald-600">{done}</span> Done
        </span>
        <span className="text-slate-600">
          <span className="font-semibold text-amber-500">{skipped}</span> Skipped
        </span>
        {completionPct !== null && (
          <span className="text-slate-600">
            <span className="font-semibold text-blue-600">{completionPct}%</span> Completion
          </span>
        )}
      </div>

      {completionPct !== null ? (
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      ) : (
        <div className="h-2 bg-slate-100 rounded-full" />
      )}
    </div>
  )
}
