import type { ExerciseEntryFormValues, SetFormValues } from './ExerciseEntryBlock'

export const emptySet = (): SetFormValues => ({ reps: '', weight: '', notes: '', done: false })
export const emptyEntry = (): ExerciseEntryFormValues => ({
  exercise_id: '',
  sets: [emptySet()],
})
