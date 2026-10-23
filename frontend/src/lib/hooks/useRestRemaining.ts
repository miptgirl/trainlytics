import { useEffect, useState } from 'react'
import { restRemaining } from '../workoutMode'

/**
 * Whole seconds left on a rest that ends at `endsAt` (epoch ms), or null when
 * no rest runs. Re-renders four times a second until it reaches zero. The time
 * is read fresh on every render, so a new end time (Reset, +30s after expiry)
 * shows at once instead of waiting for the next tick.
 */
export function useRestRemaining(endsAt: number | null): number | null {
  const [, setTick] = useState(0)
  const remaining = endsAt === null ? null : restRemaining(endsAt, Date.now())
  const expired = remaining === 0

  useEffect(() => {
    if (endsAt === null || expired) return
    const id = setInterval(() => setTick((t) => t + 1), 250)
    return () => clearInterval(id)
  }, [endsAt, expired])

  return remaining
}
