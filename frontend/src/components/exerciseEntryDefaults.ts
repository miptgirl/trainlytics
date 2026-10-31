import type { ExerciseEntryFormValues, SetFormValues } from './ExerciseEntryBlock'

export const emptySet = (): SetFormValues => ({ reps: '', duration: '', weight: '', notes: '', rpe: '', done: false })
export const emptyEntry = (): ExerciseEntryFormValues => ({
  exercise_id: '',
  sets: [emptySet()],
})
