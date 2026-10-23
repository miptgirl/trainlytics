import { useEffect, useId, useRef, useState, type Ref } from 'react'
import type { SetFormValues } from '../ExerciseEntryBlock'
import {
  boldTextWidth,
  currentSetIndex,
  formatSetList,
  formatSetShort,
  sanitizeDecimal,
  setTabLabel,
  stepValue,
  stepWeight,
  type WeightScale,
} from '../../lib/workoutMode'
import { CheckIcon, ChevronRightIcon, PlusIcon, TrashIcon } from './icons'

const stepReps = (value: string, direction: 1 | -1) => stepValue(value, direction)

// The stepper input's width on a 375px screen (iPhone SE and mini, see Stepper); wider phones only gain slack
const STEPPER_INPUT_PX = 56
// Largest first; iOS zooms into an input whose text is under 16px, so 1rem is the floor
const STEPPER_FONTS = [
  [24, 'text-[1.5rem]!'],
  [20, 'text-[1.25rem]!'],
  [16, 'text-[1rem]!'],
] as const

/**
 * One value: label, then [−] value [+]. Two sit side by side in the editor:
 * on a 375px screen the panel's content is 315px (375 − 32 page padding − 4
 * border − 24 padding), so each column is 151px and the input 56px between
 * 44px buttons. The value is 1.5rem while it fits ("60", "57.5"), then 1.25rem
 * ("102.5" is 60.6px in Montserrat Bold at 1.5rem), then 1rem ("102.75"; two
 * decimals are legal on an increment scale). Proportional figures: tabular
 * ones would clip sooner.
 */
function Stepper({
  label,
  unit,
  value,
  step,
  stepLabel,
  inputMode,
  setNumber,
  inputRef,
  onChange,
}: {
  label: string
  unit?: string
  value: string
  step: (value: string, direction: 1 | -1) => string
  /** Names the step for screen readers ("by 1"). */
  stepLabel?: string
  inputMode: 'numeric' | 'decimal'
  setNumber: number
  inputRef?: Ref<HTMLInputElement>
  onChange: (value: string) => void
}) {
  const stepBtn =
    'h-12 w-11 shrink-0 rounded-xl border border-border bg-surface text-[22px] font-medium text-text active:bg-primary-tint'
  const name = label.toLowerCase()
  const by = stepLabel ? ` ${stepLabel}` : ''
  const clean = (raw: string) => (inputMode === 'numeric' ? raw.replace(/\D/g, '') : sanitizeDecimal(raw))
  // A value too long even at 1rem (seven digits and more) scrolls inside the input, as any text field does
  const font = (STEPPER_FONTS.find(([px]) => boldTextWidth(value, px) <= STEPPER_INPUT_PX) ?? STEPPER_FONTS[2])[1]
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-text-muted-strong mb-1">
        {label}
        {unit ? ` (${unit})` : ''}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(step(value, -1))}
          aria-label={`Decrease ${name}${by}`}
          className={stepBtn}
        >
          −
        </button>
        <input
          ref={inputRef}
          type="text"
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(clean(e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="0"
          aria-label={`${label} for set ${setNumber}`}
          className={`flex-1 min-w-0 w-full h-12 px-0 text-center ${font} leading-none font-bold bg-transparent text-text border-0 border-b-2 border-dashed border-border-strong rounded-none focus:outline-none focus:border-primary-dark`}
        />
        <button
          type="button"
          onClick={() => onChange(step(value, 1))}
          aria-label={`Increase ${name}${by}`}
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
  // Chips cover 5–10; a value typed elsewhere (1–4) shows in the label with a Clear.
  const offChip = value !== '' && !RPE_CHIPS.includes(value)
  return (
    <div>
      {offChip ? (
        <div className="flex items-center gap-1 mb-1">
          <p className="text-xs font-medium text-text-muted-strong">
            RPE · <span className="font-semibold text-text">{value}</span>
          </p>
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={`Clear RPE for set ${setNumber}`}
            className="min-h-11 px-2 text-sm font-medium text-primary-dark"
          >
            Clear
          </button>
        </div>
      ) : (
        <p className="text-xs font-medium text-text-muted-strong mb-1">RPE</p>
      )}
      <div className="flex gap-1">
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
                  ? 'border-primary-dark bg-primary-dark text-white font-semibold'
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

const primaryBtn = 'min-h-14 rounded-xl bg-primary-dark text-white text-[17px] font-semibold active:opacity-90'
const outlinedBtn =
  'min-h-[52px] rounded-xl border border-primary-dark bg-surface text-primary-dark text-base font-semibold flex items-center justify-center gap-2'

/** The selected set's editor; its top border meets the selected tab, so the two read as one shape. */
function SetEditor({
  set,
  setNumber,
  editing,
  focusReps,
  weightScale,
  onChange,
  onComplete,
  onCancel,
  onSave,
  onDelete,
}: {
  set: SetFormValues
  setNumber: number
  /** Editing a done set (Cancel / Save) instead of logging one. */
  editing: boolean
  /** The set was just added (One more set, Add a set): move focus to its Reps. */
  focusReps: boolean
  weightScale?: WeightScale | null
  onChange: (patch: Partial<SetFormValues>) => void
  onComplete: () => void
  onCancel: () => void
  onSave: () => void
  onDelete: () => void
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const showNote = noteOpen || set.notes !== ''
  const repsRef = useRef<HTMLInputElement>(null)
  // The button that added this set is gone; Reps is the next thing to type
  useEffect(() => {
    if (focusReps) repsRef.current?.focus()
  }, [focusReps])
  return (
    <section
      aria-label={`Set ${setNumber} editor`}
      className="rounded-2xl border-2 border-primary-light bg-primary-tint px-3 pt-1 pb-3 flex flex-col gap-2.5"
    >
      <div className="flex items-center gap-2">
        {showNote ? (
          <label className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-xs font-medium text-text-muted-strong">Note</span>
            <input
              type="text"
              value={set.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              autoFocus={noteOpen}
              placeholder="e.g. slow negatives"
              className="flex-1 min-w-0 min-h-11 rounded-sm border border-border-strong bg-surface px-3 text-base text-text focus:outline-none focus:border-primary-dark"
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
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete set ${setNumber}`}
          className="ml-auto -mr-2 min-h-11 min-w-11 flex items-center justify-center rounded-lg text-error-text"
        >
          <TrashIcon />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stepper
          label="Reps"
          value={set.reps}
          step={stepReps}
          stepLabel="by 1"
          inputMode="numeric"
          setNumber={setNumber}
          inputRef={repsRef}
          onChange={(reps) => onChange({ reps })}
        />
        <Stepper
          label="Weight"
          unit="kg"
          value={set.weight}
          step={(value, direction) => stepWeight(value, direction, weightScale)}
          inputMode="decimal"
          setNumber={setNumber}
          onChange={(weight) => onChange({ weight })}
        />
      </div>
      <RpeChips value={set.rpe} setNumber={setNumber} onChange={(rpe) => onChange({ rpe })} />
      {editing ? (
        <div className="mt-0.5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-14 rounded-xl border border-border bg-surface text-base font-medium text-text"
          >
            Cancel
          </button>
          <button type="button" onClick={onSave} className={`flex-1 ${primaryBtn}`}>
            Save
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onComplete}
          className={`mt-0.5 w-full flex items-center justify-center gap-2 ${primaryBtn}`}
        >
          <CheckIcon />
          Complete set
        </button>
      )}
    </section>
  )
}

// Largest first; a value that fits none of these on one line wraps after the ×
const TAB_FONTS = [
  [14, 'text-sm'],
  [12, 'text-xs'],
  [11, 'text-[11px]'],
] as const

/**
 * One set as a 68px tab: done (surface, check), pending (dashed) or selected
 * (tinted, taller, no bottom border; its 2px overhang covers the editor's top
 * border, joining the two).
 */
function SetTab({
  set,
  setNumber,
  total,
  selected,
  onSelect,
}: {
  set: SetFormValues
  setNumber: number
  total: number
  selected: boolean
  onSelect: () => void
}) {
  const text = formatSetShort(set)
  // Room for the value: 68px less the border (2px when selected), less the 12px
  // check and 3px gap on a done set. Beside the check "10×102.5" takes 12px
  // (11px when selected); "12×102.75" fits no size, so it takes two lines
  // ("12×" / "102.75"), which the 52px tab holds with the RPE line under them
  const room = (selected ? 64 : 66) - (set.done ? 15 : 0)
  const font = TAB_FONTS.find(([px]) => boldTextWidth(text, px) <= room)
  const [reps, weight] = text.split('×')
  const look = selected
    ? 'min-h-[62px] -mb-0.5 pb-2 rounded-t-xl border-2 border-b-0 border-primary-light bg-primary-tint text-primary-dark font-bold'
    : set.done
      ? 'min-h-[52px] mb-2 rounded-xl border border-border bg-surface text-text font-semibold'
      : 'min-h-[52px] mb-2 rounded-xl border border-dashed border-border-strong text-text-muted-strong font-medium'
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={setTabLabel(set, setNumber, total)}
      // min-h: a value too long even for two lines makes the tab taller rather than spilling out of it
      className={`w-[68px] shrink-0 flex flex-col items-center justify-center gap-0.5 whitespace-nowrap ${look}`}
    >
      <span className={`max-w-full flex items-center gap-[3px] ${font ? font[1] : 'text-[11px] leading-tight'}`}>
        {set.done && <CheckIcon size={12} strokeWidth={3} className="text-success-text" />}
        {/* Breaks anywhere only as a last resort, for a value too long even split at the × */}
        <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
          {font || weight === undefined ? (
            text
          ) : (
            <>
              {reps}×<wbr />
              {weight}
            </>
          )}
        </span>
      </span>
      {set.rpe && <span className="text-xs font-medium text-text-muted-strong">RPE {set.rpe}</span>}
    </button>
  )
}

/** Where "Next" on the done card goes. */
export interface NextExercise {
  name: string
  /** 1-based position in the workout, and the workout's exercise count. */
  position: number
  total: number
}

/** Every set of the exercise is done: one more set, or move on (or finish). */
function DoneCard({
  name,
  today,
  next,
  autoFocus,
  onOneMore,
  onNext,
  onFinish,
}: {
  name: string | null
  today: string | null
  next: NextExercise | null
  /** Right after the last set was completed: move focus to Next / Finish workout. */
  autoFocus: boolean
  onOneMore: () => void
  onNext: () => void
  onFinish: () => void
}) {
  const headingId = useId()
  const primaryRef = useRef<HTMLButtonElement>(null)
  // The Complete set button that had focus is gone; hand focus to the likely next tap
  useEffect(() => {
    if (autoFocus) primaryRef.current?.focus()
  }, [autoFocus])

  return (
    <section
      aria-labelledby={headingId}
      className="mt-0.5 rounded-2xl border border-border bg-surface px-3 pt-4 pb-3 flex flex-col gap-4"
    >
      <div className="flex items-center gap-3 px-1">
        <span className="w-11 h-11 shrink-0 rounded-full bg-primary-tint text-primary-dark flex items-center justify-center">
          <CheckIcon size={22} strokeWidth={2.6} />
        </span>
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold leading-tight break-words">
            {name ?? 'This exercise'} done
          </h2>
          {today && <p className="mt-0.5 text-[13px] text-text-muted-strong">Today: {today}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onOneMore} className={outlinedBtn}>
          <PlusIcon />
          One more set
        </button>
        {next ? (
          <button
            ref={primaryRef}
            type="button"
            onClick={onNext}
            aria-label={`Next: ${next.name}, ${next.position} of ${next.total}`}
            className={`${primaryBtn} flex items-center gap-3 px-4 text-left`}
          >
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-xs font-medium text-white/90">
                Next, {next.position} of {next.total}
              </span>
              <span className="truncate">{next.name}</span>
            </span>
            <ChevronRightIcon size={22} />
          </button>
        ) : (
          <button ref={primaryRef} type="button" onClick={onFinish} className={primaryBtn}>
            Finish workout
          </button>
        )}
      </div>
    </section>
  )
}

/** The exercise has no sets left: add one, or take the exercise out. */
function EmptyState({
  name,
  canRemove,
  addSetRef,
  onAddSet,
  onRemove,
}: {
  name: string | null
  canRemove: boolean
  addSetRef?: Ref<HTMLButtonElement>
  onAddSet: () => void
  onRemove: () => void
}) {
  const headingId = useId()
  const label = name ?? 'this exercise'
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-border bg-surface px-3 pt-4 pb-3 flex flex-col gap-4"
    >
      <div className="px-1">
        <h2 id={headingId} className="text-lg font-semibold leading-tight">
          No sets left
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-text-muted-strong break-words">
          {/* The only exercise can't be removed, so don't offer it */}
          {canRemove ? `Add a set to keep ${label}, or take it out of this workout.` : `Add a set to keep ${label}.`}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <button ref={addSetRef} type="button" onClick={onAddSet} className={outlinedBtn}>
          <PlusIcon />
          Add a set
        </button>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="min-h-12 rounded-xl text-[15px] font-semibold text-error-text flex items-center justify-center gap-2 break-words"
          >
            <TrashIcon size={18} />
            Remove {label}
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * The current exercise's sets as a row of tabs over one editor. The editor
 * opens on the first set not done; tapping a tab opens that set instead (a
 * done one with Cancel / Save). With every set done, a card offers One more
 * set or Next; with no sets, Add a set or Remove. The page remounts this on
 * every structural change (delete, undo, exercise switch), which drops a tab
 * that now points elsewhere; focus after a remount is the page's to move.
 */
export function SetTabs({
  sets,
  weightScale,
  exerciseName,
  next,
  canRemoveExercise,
  addSetRef,
  onUpdateSet,
  onCompleteSet,
  onDeleteSet,
  onAddSet,
  onNext,
  onFinish,
  onRemoveExercise,
}: {
  sets: SetFormValues[]
  /** The exercise's weight steps; null or undefined for the default 10 lb stack. */
  weightScale?: WeightScale | null
  /** Null for an entry without an exercise. */
  exerciseName: string | null
  /** Where Next goes once every set is done; null when nothing else is left (Finish workout instead). */
  next: NextExercise | null
  /** False for the workout's only exercise. */
  canRemoveExercise: boolean
  /** The empty state's Add a set button. */
  addSetRef?: Ref<HTMLButtonElement>
  onUpdateSet: (setIndex: number, patch: Partial<SetFormValues>) => void
  onCompleteSet: (setIndex: number) => void
  onDeleteSet: (setIndex: number) => void
  onAddSet: () => void
  onNext: () => void
  onFinish: () => void
  onRemoveExercise: () => void
}) {
  // A tab opened by hand instead of the default; `snapshot` holds a done set's values from before, for Cancel
  const [picked, setPicked] = useState<{ index: number; snapshot: SetFormValues | null } | null>(null)
  // The last action removed the focused button: after Complete set the done card
  // that may follow takes focus, after One more set / Add a set the new set's
  // Reps does. Only an action sets it, so a mount or a draft restore moves nothing
  const [handoff, setHandoff] = useState<'completed' | 'added' | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  const open = picked && picked.index < sets.length ? picked : null
  const selected = open?.index ?? currentSetIndex({ exercise_id: '', sets })

  // Keep the selected tab in view when there are more tabs than fit; only the row scrolls, never the page
  useEffect(() => {
    const row = rowRef.current
    const tab = row?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!row || !tab) return
    const pad = 12
    if (tab.offsetLeft - pad < row.scrollLeft) row.scrollLeft = tab.offsetLeft - pad
    else if (tab.offsetLeft + tab.offsetWidth + pad > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = tab.offsetLeft + tab.offsetWidth + pad - row.clientWidth
    }
  }, [selected, sets.length])

  function addSet() {
    setPicked(null)
    setHandoff('added')
    onAddSet()
  }

  if (sets.length === 0) {
    return (
      <EmptyState
        name={exerciseName}
        canRemove={canRemoveExercise}
        addSetRef={addSetRef}
        onAddSet={addSet}
        onRemove={onRemoveExercise}
      />
    )
  }

  function pick(choice: typeof picked) {
    setHandoff(null)
    setPicked(choice)
  }

  function selectTab(i: number) {
    if (i === selected) return
    // Switching away from an edit keeps its changes, as Save would
    pick({ index: i, snapshot: sets[i].done ? { ...sets[i] } : null })
  }

  const joined = selected !== -1
  return (
    <div>
      <div
        ref={rowRef}
        role="group"
        aria-label="Sets"
        // pb-0.5 keeps the selected tab's 2px overhang inside the scroll box; -mb-0.5 lays it over the editor's border.
        // No scrollbar: desktop browsers would draw one between the tabs and the editor
        className={`flex items-end gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-3 pb-0.5 ${
          joined ? 'relative z-10 -mb-0.5' : ''
        }`}
      >
        {sets.map((set, i) => (
          <SetTab
            key={i}
            set={set}
            setNumber={i + 1}
            total={sets.length}
            selected={i === selected}
            onSelect={() => selectTab(i)}
          />
        ))}
        {/* With every set done, the card's One more set does this */}
        {joined && (
          <button
            type="button"
            onClick={() => {
              pick(null)
              onAddSet()
            }}
            aria-label="Add set"
            className="w-11 h-[52px] mb-2 shrink-0 rounded-xl border border-dashed border-border-strong text-primary-dark flex items-center justify-center"
          >
            <PlusIcon />
          </button>
        )}
      </div>
      {joined ? (
        <SetEditor
          key={selected}
          set={sets[selected]}
          setNumber={selected + 1}
          editing={open?.snapshot != null}
          focusReps={handoff === 'added'}
          weightScale={weightScale}
          onChange={(patch) => onUpdateSet(selected, patch)}
          onComplete={() => {
            setPicked(null)
            setHandoff('completed')
            onCompleteSet(selected)
          }}
          onCancel={() => {
            if (open?.snapshot) onUpdateSet(selected, open.snapshot)
            pick(null)
          }}
          onSave={() => pick(null)}
          onDelete={() => {
            // Undo brings back the set as saved, not the unsaved edit
            if (open?.snapshot) onUpdateSet(selected, open.snapshot)
            pick(null)
            onDeleteSet(selected)
          }}
        />
      ) : (
        <DoneCard
          name={exerciseName}
          today={formatSetList(sets.filter((s) => s.done))}
          next={next}
          autoFocus={handoff === 'completed'}
          onOneMore={addSet}
          onNext={onNext}
          onFinish={onFinish}
        />
      )}
    </div>
  )
}
