/** Draft start time: `startedAt` if the draft stored one, else its `date` field (datetime-local). */
export function draftStartedAt(draft: object | null): Date | null {
  if (!draft) return null
  const d = draft as { startedAt?: unknown; date?: unknown }
  for (const v of [d.startedAt, d.date]) {
    if (typeof v === 'string' || typeof v === 'number') {
      const t = new Date(v)
      if (!Number.isNaN(t.getTime())) return t
    }
  }
  return null
}

export function formatDraftAge(startedAt: Date, now: Date): string {
  const mins = Math.floor((now.getTime() - startedAt.getTime()) / 60000)
  if (mins < 1) return 'Started just now'
  if (mins < 60) return `Started ${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Started ${hours} h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Started yesterday' : `Started ${days} days ago`
}
