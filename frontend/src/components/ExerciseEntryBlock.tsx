import { useEffect, useRef } from 'react'
import { useFieldArray, useWatch } from 'react-hook-form'

export interface SetFormValues {
  reps: string
  weight: string
  notes: string
  done: boolean
}

export interface ExerciseEntryFormValues {
  exercise_id: string
  sets: SetFormValues[]
}

export interface ExerciseTypeTag {
  id: number
  name: string
}

export interface ExerciseOption {
  id: number
  name: string
  notes?: string | null
  types?: ExerciseTypeTag[]
}

export const emptySet = (): SetFormValues => ({ reps: '', weight: '', notes: '', done: false })
export const emptyEntry = (): ExerciseEntryFormValues => ({
  exercise_id: '',
  sets: [emptySet()],
})

/** Build a list of {label, exercises} groups for the exercise picker. */
function groupExercises(exercises: ExerciseOption[]): { label: string; items: ExerciseOption[] }[] {
  const map = new Map<string, ExerciseOption[]>()
  for (const ex of exercises) {
    const tags = ex.types && ex.types.length > 0 ? ex.types : null
    if (!tags) {
      const bucket = map.get('Uncategorised') ?? []
      bucket.push(ex)
      map.set('Uncategorised', bucket)
    } else {
      for (const tag of tags) {
        const bucket = map.get(tag.name) ?? []
        bucket.push(ex)
        map.set(tag.name, bucket)
      }
    }
  }
  const groups: { label: string; items: ExerciseOption[] }[] = []
  const sorted = [...map.entries()].sort(([a], [b]) => {
    if (a === 'Uncategorised') return 1
    if (b === 'Uncategorised') return -1
    return a.localeCompare(b)
  })
  for (const [label, items] of sorted) {
    groups.push({ label, items: items.sort((a, b) => a.name.localeCompare(b.name)) })
  }
  return groups
}

export function ExerciseEntryBlock({
  exIndex,
  register,
  control,
  exercises,
  canRemove,
  onRemove,
  errors,
  showDone = false,
  isCollapsed = false,
  onToggleCollapse,
  onAutoCollapse,
  onAutoExpand,
}: {
  exIndex: number
  register: any
  control: any
  exercises: ExerciseOption[]
  canRemove: boolean
  onRemove: () => void
  errors: any
  showDone?: boolean
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  onAutoCollapse?: () => void
  onAutoExpand?: () => void
}) {
  const { fields: setFields, append: appendSet, remove: removeSet } = useFieldArray({
    control,
    name: `exercises.${exIndex}.sets`,
  })

  const selectedId = useWatch({ control, name: `exercises.${exIndex}.exercise_id` })
  const selectedExercise = exercises.find((e) => e.id === parseInt(selectedId, 10))

  const setValues = (useWatch({ control, name: `exercises.${exIndex}.sets` }) ?? []) as SetFormValues[]

  const allDone = showDone && setValues.length > 0 && setValues.every(s => s.done)
  const prevAllDoneRef = useRef(false)

  useEffect(() => {
    if (!showDone) return
    if (allDone && !prevAllDoneRef.current) {
      onAutoCollapse?.()
    } else if (!allDone && prevAllDoneRef.current) {
      onAutoExpand?.()
    }
    prevAllDoneRef.current = allDone
  }, [allDone]) // eslint-disable-line react-hooks/exhaustive-deps

  const gridCols = showDone
    ? 'grid-cols-[2rem_1fr_1fr_1fr_2.5rem_2rem]'
    : 'grid-cols-[2rem_1fr_1fr_1fr_2rem]'

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Header — always visible */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="text-gray-400 hover:text-gray-600 shrink-0"
              aria-label={isCollapsed ? 'Expand exercise' : 'Collapse exercise'}
            >
              <span
                className={`inline-block transition-transform duration-150 text-xs ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
              >
                ▼
              </span>
            </button>
          )}
          <span className="text-sm font-medium text-gray-700 truncate">
            Exercise {exIndex + 1}{selectedExercise ? ` — ${selectedExercise.name}` : ''}
          </span>
          {isCollapsed && (
            <span className="text-xs text-gray-400 shrink-0">
              {setFields.length} {setFields.length === 1 ? 'set' : 'sets'}
            </span>
          )}
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:text-red-700 shrink-0 ml-2">
            Remove exercise
          </button>
        )}
      </div>

      {/* Body — hidden when collapsed */}
      {!isCollapsed && (
        <div className="px-4 pb-4">
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">Exercise *</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              {...register(`exercises.${exIndex}.exercise_id`, { required: 'Select an exercise' })}
            >
              <option value="">— select exercise —</option>
              {groupExercises(exercises).map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {errors.exercises?.[exIndex]?.exercise_id && (
              <p className="mt-1 text-xs text-red-600">{errors.exercises[exIndex].exercise_id.message}</p>
            )}
            {selectedExercise?.notes && (
              <p className="mt-1.5 text-xs text-slate-500 italic">📝 {selectedExercise.notes}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Sets</span>
              <button
                type="button"
                onClick={() => appendSet(emptySet())}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                + Add Set
              </button>
            </div>

            <div className={`grid ${gridCols} gap-2 mb-1 px-1`}>
              <span className="text-xs text-gray-400">#</span>
              <span className="text-xs text-gray-500">Reps</span>
              <span className="text-xs text-gray-500">Weight (kg)</span>
              <span className="text-xs text-gray-500">Notes</span>
              {showDone && <span className="text-xs text-gray-500 text-center">Done</span>}
              <span />
            </div>

            <div className="space-y-2">
              {setFields.map((setField, setIndex) => {
                const isDone = showDone && (setValues[setIndex]?.done ?? false)
                return (
                  <div
                    key={setField.id}
                    className={`grid ${gridCols} gap-2 items-center ${isDone ? 'bg-green-50 rounded-lg px-1' : ''}`}
                  >
                    <span className={`text-xs text-center ${isDone ? 'text-green-600' : 'text-gray-400'}`}>{setIndex + 1}</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 10"
                      className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full ${isDone ? 'border-green-200 text-green-700 line-through bg-white' : 'border-gray-300'}`}
                      {...register(`exercises.${exIndex}.sets.${setIndex}.reps`)}
                    />
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 60"
                      className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full ${isDone ? 'border-green-200 text-green-700 line-through bg-white' : 'border-gray-300'}`}
                      {...register(`exercises.${exIndex}.sets.${setIndex}.weight`)}
                    />
                    <input
                      type="text"
                      placeholder="optional"
                      className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full ${isDone ? 'border-green-200 text-green-700 bg-white' : 'border-gray-300'}`}
                      {...register(`exercises.${exIndex}.sets.${setIndex}.notes`)}
                    />
                    {showDone && (
                      <label className="flex items-center justify-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only"
                          {...register(`exercises.${exIndex}.sets.${setIndex}.done`)}
                        />
                        <span
                          className={`text-lg leading-none select-none transition-colors ${isDone ? 'text-green-500' : 'text-gray-300 hover:text-gray-400'}`}
                          aria-label={isDone ? 'Mark undone' : 'Mark done'}
                        >
                          ✓
                        </span>
                      </label>
                    )}
                    {setFields.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeSet(setIndex)}
                        className="text-gray-400 hover:text-red-500 text-sm leading-none"
                        aria-label="Remove set"
                      >
                        ✕
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
