import { useState } from 'react'
import type { SetFormValues } from '../ExerciseEntryBlock'
import { currentSetIndex, formatSet, sanitizeDecimal, stepValue } from '../../lib/workoutMode'

const REPS_STEP = 1
const WEIGHT_STEP = 2.5

const deleteBtn =
  'min-h-11 min-w-11 flex items-center justify-center rounded-lg text-text-muted hover:text-error-text shrink-0'

function DeleteButton({ setNumber, onClick }: { setNumber: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Delete set ${setNumber}`} className={deleteBtn}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-4 h-4"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  )
}

/** One value row: label, then [−] value [+] with 52px buttons and a wide typed input. */
function Stepper({
  label,
  unit,
  value,
  step,
  inputMode,
  setNumber,
  onChange,
}: {
  label: string
  unit?: string
  value: string
  step: number
  inputMode: 'numeric' | 'decimal'
  setNumber: number
  onChange: (value: string) => void
}) {
  const stepBtn =
    'h-[52px] w-[52px] shrink-0 rounded-xl border border-border bg-surface text-2xl font-medium text-text active:bg-primary-tint'
  const name = label.toLowerCase()
  const clean = (raw: string) => (inputMode === 'numeric' ? raw.replace(/\D/g, '') : sanitizeDecimal(raw))
  return (
    <div>
      <p className="text-xs font-medium text-text-muted-strong mb-1">
        {label}
        {unit ? ` (${unit})` : ''}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(stepValue(value, -step))}
          aria-label={`Decrease ${name} by ${step}`}
          className={stepBtn}
        >
          −
        </button>
        <input
          type="text"
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(clean(e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="0"
          aria-label={`${label} for set ${setNumber}`}
          className="w-28 min-w-0 h-[52px] px-1 text-center text-[2rem]! leading-none font-bold tabular-nums bg-transparent text-text border-0 border-b-2 border-dashed border-border-strong focus:outline-none focus:border-primary-dark"
        />
        <button
          type="button"
          onClick={() => onChange(stepValue(value, step))}
          aria-label={`Increase ${name} by ${step}`}
          className={stepBtn}
        >
          +
        </button>
      </div>
    </div>
  )
}

const RPE_CHIPS = ['5', '6', '7', '8', '9', '10']

/** "RPE" label and chips 5–10; tapping the selected chip clears it. */
function RpeChips({
  value,
  setNumber,
  onChange,
}: {
  value: string
  setNumber: number
  onChange: (value: string) => void
}) {
  return (
    <div>
      <p className="text-xs font-medium text-text-muted-strong mb-1">RPE</p>
      <div className="flex gap-1.5">
        {RPE_CHIPS.map((chip) => {
          const selected = value === chip
          return (
            <button
              key={chip}
              type="button"
              onClick={() => onChange(selected ? '' : chip)}
              aria-pressed={selected}
              aria-label={`RPE ${chip} for set ${setNumber}`}
              className={`flex-1 min-h-11 rounded-xl border text-base tabular-nums transition-colors ${
                selected
                  ? 'border-primary bg-primary-tint text-primary-dark font-semibold'
                  : 'border-border bg-surface text-text'
              }`}
            >
              {chip}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SetEditor({
  set,
  setNumber,
  editing,
  canDelete,
  onChange,
  onComplete,
  onCancel,
  onSave,
  onDelete,
}: {
  set: SetFormValues
  setNumber: number
  /** Editing a done set (Cancel / Save) instead of logging the current one. */
  editing: boolean
  canDelete: boolean
  onChange: (patch: Partial<SetFormValues>) => void
  onComplete: () => void
  onCancel: () => void
  onSave: () => void
  onDelete: () => void
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const showNote = noteOpen || set.notes !== ''
  const primary = 'flex-1 min-h-12 rounded-xl bg-primary-dark text-white text-base font-semibold active:opacity-90'
  return (
    <div
      className="rounded-xl border-2 border-primary bg-primary-tint p-3 space-y-3"
      aria-label={`Set ${setNumber} editor`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-primary-dark">
          {editing ? `Edit set ${setNumber}` : `Set ${setNumber}`}
        </h3>
        {canDelete && <DeleteButton setNumber={setNumber} onClick={onDelete} />}
      </div>
      <div className="space-y-3">
        <Stepper
          label="Reps"
          value={set.reps}
          step={REPS_STEP}
          inputMode="numeric"
          setNumber={setNumber}
          onChange={(reps) => onChange({ reps })}
        />
        <Stepper
          label="Weight"
          unit="kg"
          value={set.weight}
          step={WEIGHT_STEP}
          inputMode="decimal"
          setNumber={setNumber}
          onChange={(weight) => onChange({ weight })}
        />
        <RpeChips value={set.rpe} setNumber={setNumber} onChange={(rpe) => onChange({ rpe })} />
      </div>
      {showNote ? (
        <label className="block">
          <span className="text-xs font-medium text-text-muted-strong">Note</span>
          <input
            type="text"
            value={set.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            autoFocus={noteOpen}
            placeholder="e.g. slow negatives, paused reps"
            className="mt-1 w-full min-h-11 rounded-sm border border-border-strong bg-surface px-3 text-base text-text focus:outline-none focus:border-primary-dark"
          />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="min-h-11 px-1 text-sm font-medium text-primary-dark"
        >
          + Add note
        </button>
      )}
      {editing ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-12 rounded-xl border border-border bg-surface text-base font-medium text-text"
          >
            Cancel
          </button>
          <button type="button" onClick={onSave} className={primary}>
            Save set {setNumber}
          </button>
        </div>
      ) : (
        <div className="flex">
          <button type="button" onClick={onComplete} className={primary}>
            Complete set
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The current exercise's sets: done sets as compact rows (tap to edit), the
 * first unfinished set as the editor, later sets as muted rows, then Add set.
 */
export function WorkoutSetList({
  sets,
  onUpdateSet,
  onCompleteSet,
  onDeleteSet,
  onAddSet,
}: {
  sets: SetFormValues[]
  onUpdateSet: (setIndex: number, patch: Partial<SetFormValues>) => void
  onCompleteSet: (setIndex: number) => void
  onDeleteSet: (setIndex: number) => void
  onAddSet: () => void
}) {
  // A done set opened for editing, with its values from before for Cancel
  const [editing, setEditing] = useState<{ index: number; snapshot: SetFormValues } | null>(null)
  const current = currentSetIndex({ exercise_id: '', sets })
  const editorIndex = editing?.index ?? current
  const canDelete = sets.length > 1

  function handleDelete(index: number) {
    setEditing(null)
    onDeleteSet(index)
  }

  return (
    <section aria-label="Sets" className="rounded-xl border border-border bg-surface p-3 space-y-2">
      {sets.length === 0 && <p className="text-sm text-text-muted-strong px-1 py-2">No sets yet.</p>}
      {sets.map((set, i) => {
        const n = i + 1
        if (i === editorIndex) {
          return (
            <SetEditor
              key={`editor-${i}`}
              set={set}
              setNumber={n}
              editing={editing !== null}
              canDelete={canDelete}
              onChange={(patch) => onUpdateSet(i, patch)}
              onComplete={() => onCompleteSet(i)}
              onCancel={() => {
                if (editing) onUpdateSet(i, editing.snapshot)
                setEditing(null)
              }}
              onSave={() => setEditing(null)}
              onDelete={() => handleDelete(i)}
            />
          )
        }
        if (set.done) {
          return (
            <div key={i} className="flex items-center gap-1 rounded-xl bg-primary-tint">
              <button
                type="button"
                onClick={() => setEditing({ index: i, snapshot: { ...set } })}
                aria-label={`Edit set ${n}, ${formatSet(set)}, done`}
                className="flex-1 min-w-0 min-h-11 px-3 py-2 text-left"
              >
                <span className="flex items-center gap-3">
                  <span className="text-xs text-text-muted-strong w-10 shrink-0">Set {n}</span>
                  <span className="flex-1 text-base font-medium text-text tabular-nums">{formatSet(set)}</span>
                  <span className="text-success-text text-lg leading-none" aria-hidden="true">
                    ✓
                  </span>
                </span>
                {set.notes && (
                  <span className="block pl-13 text-sm text-text-muted-strong break-words">{set.notes}</span>
                )}
              </button>
              {canDelete && <DeleteButton setNumber={n} onClick={() => handleDelete(i)} />}
            </div>
          )
        }
        return (
          <div key={i} className="flex items-center gap-1 rounded-xl px-3">
            <span className="text-xs text-text-muted-strong w-10 shrink-0">Set {n}</span>
            <span className="flex-1 text-base text-text-muted-strong tabular-nums">{formatSet(set)}</span>
            {canDelete && <DeleteButton setNumber={n} onClick={() => handleDelete(i)} />}
          </div>
        )
      })}
      <button
        type="button"
        onClick={onAddSet}
        className="w-full min-h-11 rounded-xl border border-dashed border-border text-sm font-medium text-primary-dark"
      >
        + Add set
      </button>
    </section>
  )
}
