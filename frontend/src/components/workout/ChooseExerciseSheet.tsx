import { useMemo, useState } from 'react'
import type { ExerciseEntryFormValues, ExerciseOption } from '../ExerciseEntryBlock'
import type { LastSessionDefaults } from '../../lib/strengthSession'
import { exerciseProgress, formatLastTime, isExerciseDone } from '../../lib/workoutMode'
import { BottomSheet } from './BottomSheet'

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 18
  const c = 2 * Math.PI * r
  const frac = total > 0 ? done / total : 0
  return (
    <span className="relative inline-flex w-11 h-11 shrink-0 items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-border" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          className="stroke-primary-dark"
        />
      </svg>
      <span className="relative text-xs font-semibold tabular-nums text-text">
        {done}/{total}
      </span>
    </span>
  )
}

/**
 * "Choose exercise" sheet: To do (unfinished, in list order) and Done, plus
 * Add exercise with a search over the exercise library.
 */
export function ChooseExerciseSheet({
  entries,
  currentIndex,
  exerciseNames,
  lastByExercise,
  library,
  startInAddMode = false,
  busy = false,
  onSelect,
  onAdd,
  onClose,
}: {
  entries: ExerciseEntryFormValues[]
  currentIndex: number
  exerciseNames: Map<string, string>
  lastByExercise: Map<string, LastSessionDefaults>
  library: ExerciseOption[]
  startInAddMode?: boolean
  /** An exercise is being added: further picks are ignored. */
  busy?: boolean
  onSelect: (index: number) => void
  onAdd: (exerciseId: string) => void
  onClose: () => void
}) {
  const [adding, setAdding] = useState(startInAddMode)
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...library]
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 50)
  }, [library, query])

  const rows = entries.map((entry, index) => ({ entry, index, done: isExerciseDone(entry) }))
  const todo = rows.filter((r) => !r.done)
  const done = rows.filter((r) => r.done)

  function row({ entry, index, done: isDone }: (typeof rows)[number]) {
    const { done: d, total: t } = exerciseProgress(entry)
    const name = exerciseNames.get(entry.exercise_id) ?? (entry.exercise_id ? 'Exercise' : 'No exercise chosen')
    const last = formatLastTime(lastByExercise.get(entry.exercise_id))
    const isCurrent = index === currentIndex
    return (
      <li key={index}>
        <button
          type="button"
          onClick={() => onSelect(index)}
          aria-current={isCurrent ? 'true' : undefined}
          className={`w-full min-h-16 flex items-center gap-3 px-4 py-2 text-left ${
            isCurrent ? 'bg-primary-tint' : ''
          } ${isDone ? 'opacity-60' : ''}`}
        >
          <ProgressRing done={d} total={t} />
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2">
              <span className="text-base font-medium text-text break-words">{name}</span>
              {isCurrent && (
                <span className="shrink-0 rounded-full bg-primary-dark px-2 py-0.5 text-xs font-semibold text-white">
                  Current
                </span>
              )}
            </span>
            <span className="block text-sm text-text-muted-strong">
              {d} of {t} sets{last ? ` · last ${last}` : ''}
            </span>
          </span>
        </button>
      </li>
    )
  }

  if (adding) {
    return (
      <BottomSheet key="add" title="Add exercise" onClose={onClose}>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-text-muted-strong">Search exercises</span>
            <input
              type="search"
              data-autofocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Squat"
              className="mt-1 w-full min-h-11 rounded-lg border border-border bg-surface px-3 text-base text-text focus:outline-none focus:border-primary-dark"
            />
          </label>
          {!startInAddMode && (
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="min-h-11 text-sm font-medium text-primary-dark"
            >
              ‹ Back to list
            </button>
          )}
        </div>
        <ul className="divide-y divide-border">
          {results.length === 0 && <li className="px-4 py-3 text-sm text-text-muted">No matching exercises.</li>}
          {results.map((ex) => (
            <li key={ex.id}>
              <button
                type="button"
                onClick={() => onAdd(String(ex.id))}
                disabled={busy}
                className="w-full min-h-16 px-4 py-2 text-left text-base text-text break-words disabled:opacity-50"
              >
                {ex.name}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet
      key="list"
      title="Choose exercise"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full min-h-12 rounded-xl border border-border bg-surface text-base font-medium text-primary-dark"
        >
          + Add exercise
        </button>
      }
    >
      <h3 className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted-strong">To do</h3>
      {todo.length === 0 ? (
        <p className="px-4 pb-2 text-sm text-text-muted">Everything is done.</p>
      ) : (
        <ul className="divide-y divide-border">{todo.map(row)}</ul>
      )}
      {done.length > 0 && (
        <>
          <h3 className="px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted-strong">Done</h3>
          <ul className="divide-y divide-border">{done.map(row)}</ul>
        </>
      )}
    </BottomSheet>
  )
}
