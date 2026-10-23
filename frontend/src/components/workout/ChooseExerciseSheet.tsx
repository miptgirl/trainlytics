import { useId, useMemo, useState } from 'react'
import type { ExerciseEntryFormValues, ExerciseOption } from '../ExerciseEntryBlock'
import { useRestRemaining } from '../../lib/hooks/useRestRemaining'
import type { LastSessionDefaults } from '../../lib/strengthSession'
import { exerciseProgress, exerciseSummary, formatClock, isExerciseDone } from '../../lib/workoutMode'
import { BottomSheet } from './BottomSheet'
import { CheckIcon, TrashIcon } from './icons'

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 17
  const c = 2 * Math.PI * r
  const complete = total > 0 && done === total
  return (
    <span className="relative inline-flex w-10 h-10 shrink-0 items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className={complete ? 'stroke-primary' : 'stroke-border'} />
        {!complete && done > 0 && (
          <circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - done / total)}
            className="stroke-primary"
          />
        )}
      </svg>
      {complete ? (
        <CheckIcon size={20} strokeWidth={2.6} className="relative text-success-text" />
      ) : (
        <span className="relative text-[11px] font-semibold tabular-nums text-text">
          {done}/{total}
        </span>
      )}
    </span>
  )
}

/** The running rest in the sheet's header, which covers the timer in the dock. */
function RestingClock({ endsAt }: { endsAt: number | null }) {
  const remaining = useRestRemaining(endsAt)
  if (!remaining) return null
  return (
    <span className="whitespace-nowrap text-[13px] text-text-muted-strong">
      Resting <span className="font-semibold text-text tabular-nums">{formatClock(remaining)}</span>
    </span>
  )
}

/**
 * "Choose exercise" sheet: To do (unfinished, in list order) and Done, plus
 * Add exercise with a search over the exercise library. An exercise with no
 * completed sets can be removed from its row (except the only one).
 */
export function ChooseExerciseSheet({
  entries,
  currentIndex,
  nameOf,
  lastByExercise,
  library,
  restEndsAt,
  startInAddMode = false,
  busy = false,
  onSelect,
  onRemove,
  onAdd,
  onClose,
}: {
  entries: ExerciseEntryFormValues[]
  currentIndex: number
  /** The page's names, so a row and the page agree before the library loads. */
  nameOf: (exerciseId: string) => string
  lastByExercise: Map<string, LastSessionDefaults>
  library: ExerciseOption[]
  /** End of the running rest (epoch ms), or null. */
  restEndsAt: number | null
  startInAddMode?: boolean
  /** An exercise is being added: further picks are ignored. */
  busy?: boolean
  onSelect: (index: number) => void
  onRemove: (index: number) => void
  onAdd: (exerciseId: string) => void
  onClose: () => void
}) {
  const [adding, setAdding] = useState(startInAddMode)
  const [query, setQuery] = useState('')
  const listId = useId()

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
  const resting = restEndsAt === null ? undefined : <RestingClock endsAt={restEndsAt} />

  function row({ entry, index, done: isDone }: (typeof rows)[number]) {
    const { done: d, total: t } = exerciseProgress(entry)
    const name = nameOf(entry.exercise_id)
    const isCurrent = index === currentIndex
    const summaryId = `${listId}-${index}`
    const progress = t === 0 ? 'no sets' : isDone ? `all ${t} sets done` : `${d} of ${t} sets done`
    // Nothing logged yet, so nothing is lost; the last exercise always stays
    const removable = d === 0 && entries.length > 1
    return (
      <li key={index} className={`flex items-center gap-0.5 pr-2 ${isCurrent ? 'bg-primary-tint' : ''}`}>
        <button
          type="button"
          onClick={() => onSelect(index)}
          aria-current={isCurrent ? 'true' : undefined}
          aria-label={`${name}${isCurrent ? ', current' : ''}, ${progress}`}
          aria-describedby={summaryId}
          className={`flex-1 min-w-0 min-h-[68px] flex items-center gap-3 py-2 pl-4 pr-2 text-left ${
            isDone ? 'opacity-60' : ''
          }`}
        >
          <ProgressRing done={d} total={t} />
          <span className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <span className="min-w-0 text-base font-semibold leading-tight text-text break-words">{name}</span>
              {isCurrent && (
                <span className="shrink-0 rounded-full bg-primary-dark px-2 py-0.5 text-[11px] font-semibold text-white">
                  Current
                </span>
              )}
            </span>
            <span id={summaryId} className="text-xs text-text-muted-strong break-words">
              {exerciseSummary(entry, lastByExercise.get(entry.exercise_id))}
            </span>
          </span>
        </button>
        {removable && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label={`Remove ${entry.exercise_id ? name : 'the entry without an exercise'} from this workout`}
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-error-text"
          >
            <TrashIcon size={18} />
          </button>
        )}
      </li>
    )
  }

  if (adding) {
    return (
      <BottomSheet key="add" title="Add exercise" aside={resting} onClose={onClose}>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-text-muted-strong">Search exercises</span>
            <input
              type="search"
              data-autofocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Squat"
              className="mt-1 w-full min-h-11 rounded-sm border border-border-strong bg-surface px-3 text-base text-text focus:outline-none focus:border-primary-dark"
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
          {results.length === 0 && <li className="px-4 py-3 text-sm text-text-muted-strong">No matching exercises.</li>}
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
      aside={resting}
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
      <h3 className="px-4 pt-3 pb-1 text-xs font-semibold text-text-muted-strong">To do</h3>
      {todo.length === 0 ? (
        <p className="px-4 pb-2 text-sm text-text-muted-strong">Everything is done.</p>
      ) : (
        <ul>{todo.map(row)}</ul>
      )}
      {done.length > 0 && (
        <>
          <h3 className="px-4 pt-3 pb-1 text-xs font-semibold text-text-muted-strong">Done</h3>
          <ul>{done.map(row)}</ul>
        </>
      )}
    </BottomSheet>
  )
}
