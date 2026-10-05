import type { PlannedSessionOut } from './planApi'
import { strengthViewUrl } from './strengthSession'

export interface StartOptions {
  /** Strength only: workout mode (`/workout`) or the full form (`/log`). Default: form. */
  view?: 'workout' | 'form'
}

/**
 * URL that "Start" opens for a planned session. Pure: callers decide the view
 * (see `prefersWorkoutMode`) so this stays testable. Shared by the Plan cards
 * and the Today page.
 */
export function getStartUrl(
  session: PlannedSessionOut,
  weekStart: string,
  { view = 'form' }: StartOptions = {},
): string {
  if (session.session_type === 'strength') {
    const url = strengthViewUrl(view === 'workout' ? 'workout' : 'log', {
      templateId: session.template_id ?? undefined,
      // A skipped (past) session is logged on its planned day
      date: session.status === 'skipped' ? `${session.planned_date}T10:00` : undefined,
    })
    // ':' is legal in a query and keeps the URL readable (and the existing Plan card contract)
    return url.replace(/%3A/g, ':')
  }
  return `/log?type=cardio&plannedSessionId=${session.id}&weekStart=${weekStart}`
}
