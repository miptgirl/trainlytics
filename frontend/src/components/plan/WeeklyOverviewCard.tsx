import { type PlannedSessionOut } from '../../lib/planApi'
import { summarizeWeek } from '../../lib/planStats'

interface WeeklyOverviewCardProps {
  sessions: PlannedSessionOut[]
  isLoading: boolean
}

export function WeeklyOverviewCard({ sessions, isLoading }: WeeklyOverviewCardProps) {
  if (isLoading) {
    return (
      <div className="bg-surface rounded-xl border border-border shadow-sm p-4 animate-pulse">
        <div className="h-4 bg-border rounded w-48 mb-3" />
        <div className="flex gap-4 mb-3">
          <div className="h-3 bg-border rounded w-20" />
          <div className="h-3 bg-border rounded w-16" />
          <div className="h-3 bg-border rounded w-18" />
          <div className="h-3 bg-border rounded w-24" />
        </div>
        <div className="h-2 bg-border rounded-full" />
      </div>
    )
  }

  const { planned, done, skipped, completionPct } = summarizeWeek(sessions)

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
      <h2 className="text-xs font-semibold text-text-muted-strong uppercase tracking-wide mb-3">
        Week overview
      </h2>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mb-3">
        <span className="text-text-muted-strong">
          <span className="font-semibold text-text">{planned}</span> Planned
        </span>
        <span className="text-text-muted-strong">
          <span className="font-semibold text-success-text">{done}</span> Done
        </span>
        <span className="text-text-muted-strong">
          <span className="font-semibold text-warning-text">{skipped}</span> Skipped
        </span>
        {completionPct !== null && (
          <span className="text-text-muted-strong">
            <span className="font-semibold text-primary-dark">{completionPct}%</span> Completion
          </span>
        )}
      </div>

      {completionPct !== null ? (
        <div className="h-2 bg-primary-tint rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      ) : (
        <div className="h-2 bg-primary-tint rounded-full" />
      )}
    </div>
  )
}
