import { useEffect, useRef, useState } from 'react'
import { useFieldArray, useWatch, useController } from 'react-hook-form'
import { api } from '../lib/api'
import { EraserIcon } from './EraserIcon'

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
      const bucket = map.get('Other') ?? []
      bucket.push(ex)
      map.set('Other', bucket)
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
    if (a === 'Other') return 1
    if (b === 'Other') return -1
    return a.localeCompare(b)
  })
  for (const [label, items] of sorted) {
    groups.push({ label, items: items.sort((a, b) => a.name.localeCompare(b.name)) })
  }
  return groups
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom two-level exercise picker
// Level 1: category list with exercise counts
// Level 2: exercises within a selected category (back button returns to level 1)
// ─────────────────────────────────────────────────────────────────────────────

function ExercisePickerDropdown({
  exercises,
  value,
  onChange,
  hasError,
}: {
  exercises: ExerciseOption[]
  value: string
  onChange: (id: string) => void
  hasError: boolean
}) {
  const [open, setOpen] = useState(false)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = exercises.find((e) => String(e.id) === value)
  const groups = groupExercises(exercises)

  // Close on outside click; reset level on close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveGroup(null)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function openDropdown() {
    // When reopening, pre-select the group of the currently selected exercise
    if (!open && value) {
      const group = groups.find((g) => g.items.some((ex) => String(ex.id) === value))
      setActiveGroup(group?.label ?? null)
    } else if (!open) {
      setActiveGroup(null)
    }
    setOpen((o) => !o)
  }

  function select(id: string) {
    onChange(id)
    setOpen(false)
    setActiveGroup(null)
  }

  const borderClass = hasError ? 'border-red-400' : 'border-gray-300'
  const currentGroupItems = activeGroup ? groups.find((g) => g.label === activeGroup)?.items ?? [] : []

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={openDropdown}
        className={`w-full flex items-center justify-between border ${borderClass} rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-left`}
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? selected.name : '— select exercise —'}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 shrink-0 ml-2 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">

          {/* ── Level 1: category list ── */}
          {activeGroup === null && (
            <ul className="py-1">
              {groups.length === 0 && (
                <li className="px-4 py-3 text-sm text-gray-400">No exercises yet.</li>
              )}
              {groups.map((group) => (
                <li key={group.label}>
                  <button
                    type="button"
                    onClick={() => setActiveGroup(group.label)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-800 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  >
                    <span className="font-medium">{group.label}</span>
                    <span className="flex items-center gap-1.5 text-gray-400 text-xs">
                      <span>{group.items.length} {group.items.length === 1 ? 'exercise' : 'exercises'}</span>
                      <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                      </svg>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* ── Level 2: exercises in selected category ── */}
          {activeGroup !== null && (
            <div>
              {/* Back header */}
              <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setActiveGroup(null)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  <svg className="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                  </svg>
                  All categories
                </button>
                <span className="text-xs text-gray-400 mx-1">·</span>
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{activeGroup}</span>
              </div>
              {/* Exercise list */}
              <ul className="py-1 max-h-56 overflow-y-auto">
                {currentGroupItems.map((ex) => (
                  <li key={ex.id}>
                    <button
                      type="button"
                      onClick={() => select(String(ex.id))}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors ${String(ex.id) === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-800'}`}
                    >
                      {ex.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

interface ExerciseDefaults {
  sets: Array<{ set_number: number; reps: number | null; weight: number | null }>
}

interface ExerciseRef {
  id: number
  name: string
}

function SwapModal({
  replacements,
  onSelect,
  onClose,
}: {
  replacements: ExerciseRef[]
  onSelect: (r: ExerciseRef) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-xl flex flex-col max-h-[60vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm">Swap exercise</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded text-lg leading-none">
            ✕
          </button>
        </div>
        <ul className="overflow-y-auto py-2">
          {replacements.map((rep) => (
            <li key={rep.id}>
              <button
                type="button"
                onClick={() => onSelect(rep)}
                className="w-full text-left px-4 py-3 text-sm text-gray-800 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                {rep.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function ExerciseEntryBlock({
  exIndex,
  register,
  control,
  setValue,
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
  setValue?: (name: string, value: any) => void
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
  const { fields: setFields, append: appendSet, remove: removeSet, replace: replaceSets } = useFieldArray({
    control,
    name: `exercises.${exIndex}.sets`,
  })

  const { field: exerciseField } = useController({
    control,
    name: `exercises.${exIndex}.exercise_id`,
    rules: { required: 'Select an exercise' },
  })
  const selectedId = exerciseField.value
  const selectedExercise = exercises.find((e) => e.id === parseInt(selectedId, 10))

  const setValues = (useWatch({ control, name: `exercises.${exIndex}.sets` }) ?? []) as SetFormValues[]

  const allDone = showDone && setValues.length > 0 && setValues.every(s => s.done)
  const prevAllDoneRef = useRef(false)

  const [filledFromSession, setFilledFromSession] = useState(false)
  const prevSelectedIdRef = useRef<string>(selectedId || '')
  const [swapOpen, setSwapOpen] = useState(false)
  const [swapReplacements, setSwapReplacements] = useState<ExerciseRef[]>([])
  const isSwappingRef = useRef(false)

  useEffect(() => {
    if (selectedId === prevSelectedIdRef.current) return
    prevSelectedIdRef.current = selectedId || ''

    if (isSwappingRef.current) {
      isSwappingRef.current = false
      return
    }

    if (!selectedId) {
      setFilledFromSession(false)
      return
    }

    let cancelled = false
    setFilledFromSession(false)

    api.get<ExerciseDefaults>(`/exercises/${selectedId}/last-session-defaults`)
      .then((data) => {
        if (cancelled) return
        if (data.sets.length > 0) {
          replaceSets(data.sets.map((s) => ({
            reps: s.reps !== null ? String(s.reps) : '',
            weight: s.weight !== null ? String(s.weight) : '',
            notes: '',
            done: false,
          })))
          setFilledFromSession(true)
        } else {
          replaceSets([emptySet()])
        }
      })
      .catch(() => {
        if (!cancelled) replaceSets([emptySet()])
      })

    return () => { cancelled = true }
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId) {
      setSwapReplacements([])
      return
    }
    let cancelled = false
    api.get<ExerciseRef[]>(`/exercises/${selectedId}/replacements`)
      .then((data) => { if (!cancelled) setSwapReplacements(data) })
      .catch(() => { if (!cancelled) setSwapReplacements([]) })
    return () => { cancelled = true }
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function swapExercise(replacement: ExerciseRef) {
    setSwapOpen(false)
    isSwappingRef.current = true
    exerciseField.onChange(String(replacement.id))
    setFilledFromSession(false)
    try {
      const data = await api.get<ExerciseDefaults>(`/exercises/${replacement.id}/last-session-defaults`)
      if (data.sets.length > 0) {
        replaceSets(data.sets.map((s) => ({
          reps: s.reps !== null ? String(s.reps) : '',
          weight: s.weight !== null ? String(s.weight) : '',
          notes: '',
          done: false,
        })))
        setFilledFromSession(true)
      } else {
        replaceSets([emptySet()])
      }
    } catch {
      replaceSets([emptySet()])
    }
  }

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
    ? 'grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2rem_1.5rem]'
    : 'grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_1.5rem]'

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Header — always visible */}
      <div className={`flex items-center justify-between px-4 py-3 rounded-t-xl ${allDone ? 'bg-green-50' : ''}`}>
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
          <span className={`text-sm font-medium truncate ${allDone ? 'text-green-700' : 'text-gray-700'}`}>
            Exercise {exIndex + 1}{selectedExercise ? ` — ${selectedExercise.name}` : ''}
          </span>
          {isCollapsed && (
            <span className="text-xs text-gray-400 shrink-0">
              {setFields.length} {setFields.length === 1 ? 'set' : 'sets'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0 ml-2">
          {swapReplacements.length > 0 && selectedId && (
            <button
              type="button"
              onClick={() => setSwapOpen(true)}
              className="p-1 text-gray-400 hover:text-blue-500 rounded"
              aria-label="Swap exercise"
              title="Swap exercise"
            >
              ⇄
            </button>
          )}
          {canRemove && (
            <button type="button" onClick={onRemove} aria-label="Remove exercise" className="p-1 text-gray-400 hover:text-red-500 rounded">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {swapOpen && swapReplacements.length > 0 && (
        <SwapModal
          replacements={swapReplacements}
          onSelect={swapExercise}
          onClose={() => setSwapOpen(false)}
        />
      )}

      {/* Body — hidden when collapsed */}
      {!isCollapsed && (
        <div className="px-4 pb-4">
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">Exercise *</label>
            <ExercisePickerDropdown
              exercises={exercises}
              value={exerciseField.value}
              onChange={exerciseField.onChange}
              hasError={!!errors.exercises?.[exIndex]?.exercise_id}
            />
            {errors.exercises?.[exIndex]?.exercise_id && (
              <p className="mt-1 text-xs text-red-600">{errors.exercises[exIndex].exercise_id.message}</p>
            )}
            {selectedExercise?.notes && (
              <p className="mt-1.5 text-xs text-slate-500 italic">📝 {selectedExercise.notes}</p>
            )}
            {filledFromSession && (
              <p className="mt-1 text-xs text-emerald-600 flex items-center gap-1">
                <span>✓</span>
                <span>Filled from last session</span>
              </p>
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

            <div className={`grid ${gridCols} gap-1.5 mb-1 px-1`}>
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
                    className={`grid ${gridCols} gap-1.5 items-center ${isDone ? 'bg-green-50 rounded-lg px-1' : ''}`}
                  >
                    <span className={`text-xs text-center ${isDone ? 'text-green-600' : 'text-gray-400'}`}>{setIndex + 1}</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="reps"
                      className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full ${isDone ? 'border-green-200 text-green-700 line-through bg-white' : 'border-gray-300'}`}
                      {...register(`exercises.${exIndex}.sets.${setIndex}.reps`)}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="kg"
                      className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full ${isDone ? 'border-green-200 text-green-700 line-through bg-white' : 'border-gray-300'}`}
                      {...register(`exercises.${exIndex}.sets.${setIndex}.weight`)}
                    />
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="note"
                        className={`border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full ${setValues[setIndex]?.notes ? 'pr-6' : ''} ${isDone ? 'border-green-200 text-green-700 bg-white' : 'border-gray-300'}`}
                        {...register(`exercises.${exIndex}.sets.${setIndex}.notes`)}
                      />
                      {setValue && setValues[setIndex]?.notes && (
                        <button
                          type="button"
                          onClick={() => setValue(`exercises.${exIndex}.sets.${setIndex}.notes`, '')}
                          className="absolute right-0.5 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600"
                          aria-label="Clear notes"
                        >
                          <EraserIcon />
                        </button>
                      )}
                    </div>
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
