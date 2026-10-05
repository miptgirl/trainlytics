import type { PlannedSessionOut } from './planApi'

export interface WeekCounts {
  planned: number
  done: number
  skipped: number
  /** done / (done + skipped) as a whole percent; null until something is done or skipped */
  completionPct: number | null
}

/** Week counts shared by the Plan overview card and the Today "This week" card. */
export function summarizeWeek(sessions: PlannedSessionOut[]): WeekCounts {
  const planned = sessions.filter((s) => s.status === 'planned').length
  const done = sessions.filter((s) => s.status === 'done').length
  const skipped = sessions.filter((s) => s.status === 'skipped').length
  const denominator = done + skipped
  return {
    planned,
    done,
    skipped,
    completionPct: denominator > 0 ? Math.round((done / denominator) * 100) : null,
  }
}
