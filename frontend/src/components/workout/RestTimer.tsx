import { useEffect, useRef, useState } from 'react'
import { formatClock, restRemaining } from '../../lib/workoutMode'

/**
 * Rest countdown. The end time is the source of truth and the display is
 * recomputed from `Date.now()`, so it stays right after the tab sleeps or
 * reloads. Vibrates once when a running timer reaches zero.
 */
export function RestTimer({
  endsAt,
  lengthSeconds,
  onReset,
  onAddThirty,
  onSkip,
}: {
  endsAt: number | null
  lengthSeconds: number
  onReset: () => void
  onAddThirty: () => void
  onSkip: () => void
}) {
  // The interval only forces a re-render; the time is read fresh on every
  // render, so a Reset or +30s after expiry never shows a stale value
  const [, setTick] = useState(0)
  const remaining = endsAt === null ? null : restRemaining(endsAt, Date.now())
  const expired = remaining === 0

  useEffect(() => {
    if (endsAt === null || expired) return
    const id = setInterval(() => setTick((t) => t + 1), 250)
    return () => clearInterval(id)
  }, [endsAt, expired])

  const previous = useRef(remaining)
  useEffect(() => {
    if (remaining === 0 && previous.current !== null && previous.current > 0) {
      navigator.vibrate?.([200, 100, 200])
    }
    previous.current = remaining
  }, [remaining])

  const label = remaining === null ? 'Rest' : expired ? 'Rest done' : 'Resting'
  const clock = formatClock(remaining ?? lengthSeconds)
  const btn =
    'min-h-11 min-w-11 px-3 rounded-lg border border-border bg-surface text-sm font-medium text-text disabled:opacity-40'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <span className="text-sm text-text-muted-strong">{label}</span>
        <span
          data-testid="rest-clock"
          className={`text-2xl font-semibold tabular-nums ${
            remaining === null ? 'text-text-muted' : expired ? 'text-success-text' : 'text-text'
          }`}
        >
          {clock}
        </span>
        <span className="sr-only" aria-live="polite">
          {expired ? 'Rest over' : ''}
        </span>
      </div>
      <button type="button" onClick={onReset} className={btn} aria-label="Restart rest timer">
        Reset
      </button>
      <button type="button" onClick={onAddThirty} className={btn} aria-label="Add 30 seconds of rest">
        +30s
      </button>
      <button type="button" onClick={onSkip} disabled={endsAt === null} className={btn} aria-label="Skip rest">
        Skip
      </button>
    </div>
  )
}
