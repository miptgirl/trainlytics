import { useState } from 'react'
import type { SetFormValues } from '../../components/ExerciseEntryBlock'
import { setKind, type Measure, type SetKind } from '../workoutMode'

/**
 * `inputKind` for an input that stays on screen while it is edited: a set
 * shows the input for the value it holds, else the exercise's measure; once it
 * has held a value it keeps that input while mounted. So clearing a duration
 * logged when the exercise was timed (now measured in reps) leaves the Time
 * input in place for the new value, instead of swapping to Reps mid-edit.
 * Remount (new set, other exercise) to start over.
 */
export function useSetInputKind(set: Partial<Pick<SetFormValues, 'reps' | 'duration'>>, measure?: Measure | null): SetKind {
  const own = setKind(set)
  const [held, setHeld] = useState<SetKind | null>(own)
  // Adjusting state to the values during render, as React recommends over an effect
  if (own !== null && own !== held) setHeld(own)
  return own ?? held ?? measure ?? 'reps'
}
