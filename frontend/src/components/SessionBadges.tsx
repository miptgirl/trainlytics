import type { ReactNode } from 'react'

/**
 * Badge convention: TYPE (strength / cardio) is an outline pill with a dot in
 * the activity colour; STATUS (planned / done / skipped) is a filled tint pill.
 * They never share a fill, so a type can't be mistaken for a status.
 */

const TYPE_DOT = {
  strength: 'bg-chart-strength',
  cardio: 'bg-chart-running',
} as const

export function TypeBadge({
  type,
  children,
  className = '',
}: {
  type: 'strength' | 'cardio'
  children?: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium border border-border bg-surface text-text ${className}`}
    >
      <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[type]}`} />
      {children ?? (type === 'strength' ? 'Strength' : 'Cardio')}
    </span>
  )
}

const STATUS_CLASS = {
  planned: 'bg-bg border border-border text-text-muted-strong',
  done: 'bg-success/10 border border-success/40 text-success-text',
  skipped: 'bg-warning/10 border border-warning/40 text-warning-text',
} as const

const STATUS_LABEL = {
  planned: '○ Planned',
  done: '✓ Done',
  skipped: '✗ Skipped',
} as const

export function StatusBadge({ status }: { status: 'planned' | 'done' | 'skipped' }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}
