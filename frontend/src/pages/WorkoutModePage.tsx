/**
 * Workout mode (`/workout`): a full-screen logger for one set at a time.
 * Uses the same useStrengthSessionForm as the full form, so both views share
 * the draft and build the same POST body. The current exercise and the rest
 * timer live in a dock at the bottom, so neither scrolls out of reach.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DiffModal } from '../components/DiffModal'
import { BottomSheet } from '../components/workout/BottomSheet'
import { ChooseExerciseSheet } from '../components/workout/ChooseExerciseSheet'
import { FinishSheet } from '../components/workout/FinishSheet'
import { RestTimer } from '../components/workout/RestTimer'
import { SetTabs } from '../components/workout/SetTabs'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '../components/workout/icons'
import type { SetFormValues } from '../components/ExerciseEntryBlock'
import { api } from '../lib/api'
import { fetchLastSessionDefaults, useLastSessionDefaults } from '../lib/hooks/useLastSessionDefaults'
import { useRestLength } from '../lib/hooks/useRestLength'
import { useStrengthSessionForm } from '../lib/hooks/useStrengthSessionForm'
import { useWakeLock } from '../lib/hooks/useWakeLock'
import {
  describeDraft,
  emptyStrengthDefaults,
  findInvalidSetRpe,
  setSetDone,
  strengthViewUrl,
  type TemplateSummary,
  type WorkoutModeState,
} from '../lib/strengthSession'
import {
  REST_LENGTHS,
  allExercisesDone,
  clampIndex,
  formatClock,
  formatLastTime,
  isBlankEntry,
  isExerciseDone,
  isPresetRestLength,
  newExerciseSets,
  nextUnfinishedIndex,
  saveErrorMessage,
  sessionProgress,
} from '../lib/workoutMode'

type Sheet = 'exercises' | 'add-exercise' | 'finish' | 'options' | 'templates' | null

/** Undo toast: what was removed and how to put it back. */
interface UndoAction {
  label: string
  undo: () => void
}

const UNDO_MS = 5000

export default function WorkoutModePage() {
  const s = useStrengthSessionForm()
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  useWakeLock()

  const [sheet, setSheet] = useState<Sheet>(null)
  const { restLength, chooseRestLength, saveError: restSaveError } = useRestLength()
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null)
  const [guardError, setGuardError] = useState<string | null>(null)
  // Bumped on every structural change (delete, undo, remove) so the set tabs
  // remount and drop an open tab that now points elsewhere
  const [listVersion, setListVersion] = useState(0)
  // Index of an entry without an exercise that "Choose an exercise" fills
  const [fillIndex, setFillIndex] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  // Where focus goes after an action that removed the focused button and
  // remounted the set tabs: deleting the only set (→ Add a set), removing the
  // exercise from its empty state (→ the dock's exercise button). Set by those
  // actions only, used once, so a mount or a draft restore never moves focus
  const focusAfter = useRef<'add-set' | 'exercise' | null>(null)
  const addSetRef = useRef<HTMLButtonElement>(null)
  const exerciseButtonRef = useRef<HTMLButtonElement>(null)

  const exercises = s.values.exercises ?? []
  const exIndex = clampIndex(s.workout.currentExerciseIndex, exercises.length)
  const entry = exercises[exIndex]
  const names = new Map(s.exerciseLibrary.map((e) => [String(e.id), e.name]))
  const scaleOf = (id: string) => s.exerciseLibrary.find((e) => String(e.id) === id)?.weight_scale
  const lastByExercise = useLastSessionDefaults(exercises.map((e) => e.exercise_id))
  const progress = sessionProgress(exercises)
  const nextIndex = nextUnfinishedIndex(exercises, exIndex)
  const allDone = allExercisesDone(exercises)
  const decided = s.pendingDraft === null
  // Applying a template resets the whole form, so it is only offered while
  // nothing is entered: blank entries, no template, scalar fields at defaults.
  // Latched: once the session has been touched (or a template picked) the entry
  // is gone for this mount, even if the user later clears a field.
  const [templateOffered, setTemplateOffered] = useState(true)
  const defaults = emptyStrengthDefaults()
  const pristine =
    s.selectedTemplateId === null &&
    exercises.every(isBlankEntry) &&
    (s.values.notes ?? '') === defaults.notes &&
    (s.values.calories ?? '') === defaults.calories &&
    (s.values.wellbeing ?? null) === defaults.wellbeing &&
    (s.values.rpe ?? null) === defaults.rpe &&
    (s.values.duration_seconds ?? null) === defaults.duration_seconds
  if (templateOffered && decided && !pristine) setTemplateOffered(false)
  const { data: templates = [] } = useQuery({
    queryKey: ['templates', 'strength'],
    queryFn: () => api.get<TemplateSummary[]>('/templates/strength'),
    enabled: templateOffered && decided && pristine,
  })
  // Rendered only in the branch without a draft question, loading or error
  const canPickTemplate = templateOffered && pristine && templates.length > 0
  const nameOf = (id: string) => names.get(id) ?? (id ? '…' : 'No exercise chosen')

  // Once the draft question is settled: stamp the start time and make a reload
  // of this URL resume the draft instead of asking again.
  useEffect(() => {
    if (!decided) return
    if (s.workout.startedAt === null) {
      // First time in workout mode for this session (fresh, or handed over by the
      // full form): start the clock and skip past exercises that are already done
      const patch: Partial<WorkoutModeState> = { startedAt: Date.now() }
      if (entry && isExerciseDone(entry)) {
        const next = nextUnfinishedIndex(exercises, exIndex)
        if (next !== -1) patch.currentExerciseIndex = next
      }
      s.updateWorkout(patch)
    }
    if (!s.params.resume) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('resume', '1')
          return next
        },
        { replace: true },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decided, s.workout.startedAt, s.params.resume])

  useEffect(() => {
    if (!undoAction) return
    const t = setTimeout(() => setUndoAction(null), UNDO_MS)
    return () => clearTimeout(t)
  }, [undoAction])

  // After every render, but it only acts on the render that commits the action's result
  useEffect(() => {
    const target = focusAfter.current
    if (!target) return
    focusAfter.current = null
    ;(target === 'add-set' ? addSetRef : exerciseButtonRef).current?.focus()
  })

  // ── Actions ───────────────────────────────────────────────────────────────

  function completeSet(setIndex: number) {
    const after = setSetDone(exercises, exIndex, setIndex, true)
    s.setSetDone(exIndex, setIndex)
    // Stays on this exercise even after its last set: the done card offers
    // One more set or Next. No rest after the very last set of the workout.
    s.updateWorkout({ restEndsAt: allExercisesDone(after) ? null : Date.now() + restLength * 1000 })
  }

  function deleteSet(setIndex: number) {
    const at = exIndex
    // From the form, not this render: deleting an edited done set first wrote its saved values back
    const sets = s.form.getValues('exercises')?.[at]?.sets ?? []
    let set: SetFormValues | null
    if (sets.length === 1 && setIndex === 0) {
      // s.deleteSet keeps an exercise's last set (the full form never empties
      // one). Here the only set may go too, leaving the empty state with Add a
      // set and Remove, so the list is cleared directly
      set = sets[0]
      s.replaceExercise(at, exercises[at].exercise_id, [])
      focusAfter.current = 'add-set'
    } else {
      set = s.deleteSet(at, setIndex)
    }
    if (!set) return
    setListVersion((v) => v + 1)
    setUndoAction({
      label: 'Set deleted',
      undo: () => {
        s.insertSet(at, setIndex, set)
        s.updateWorkout({ currentExerciseIndex: at })
      },
    })
  }

  function addSet() {
    if (!entry) return
    if (entry.sets.length === 0) {
      // Nothing to copy: start from last session's first set, as a newly added exercise does (blank without history)
      s.insertSet(exIndex, 0, newExerciseSets(lastByExercise.get(entry.exercise_id))[0])
    } else {
      s.addSet(exIndex)
    }
  }

  /** Removes an exercise with Undo; the current one stays current, or its neighbour takes over when it was removed. */
  function removeExercise(index: number) {
    const before = exIndex
    const removed = s.removeExercise(index)
    if (!removed) return
    setListVersion((v) => v + 1)
    // `exercises` is still the list from before the removal
    const current = index < before ? before - 1 : index === before ? Math.min(index, exercises.length - 2) : before
    s.updateWorkout({ currentExerciseIndex: current })
    // Indices after `index` moved; a pending fill target would point at the wrong entry
    setFillIndex(null)
    setSheet(null)
    setUndoAction({
      label: `${removed.exercise_id ? nameOf(removed.exercise_id) : 'Exercise'} removed`,
      undo: () => {
        s.insertExercise(index, removed)
        s.updateWorkout({ currentExerciseIndex: before })
      },
    })
  }

  function runUndo() {
    if (!undoAction) return
    undoAction.undo()
    setListVersion((v) => v + 1)
    setUndoAction(null)
  }

  async function startFromTemplate(id: number) {
    setSheet(null)
    // The undo targets the old list; the pick replaces it
    setUndoAction(null)
    await s.selectTemplate(id, { claimDraft: true })
  }

  function continueWithoutTemplate() {
    s.dismissTemplateError()
    setUndoAction(null)
    // Drop a URL template too, or a reload would load it (and fail) again
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('templateId')
        return next
      },
      { replace: true },
    )
    // A 404 means the cached list still has the deleted template
    void qc.invalidateQueries({ queryKey: ['templates', 'strength'] })
  }

  function selectExercise(index: number) {
    s.updateWorkout({ currentExerciseIndex: index })
    setSheet(null)
  }

  /** `fill`: index of an entry without an exercise to fill; otherwise the pick is appended. */
  function openAddExercise(fill: number | null, addMode = true) {
    setFillIndex(fill)
    setSheet(addMode ? 'add-exercise' : 'exercises')
  }

  async function addExercise(exerciseId: string) {
    if (adding) return
    setAdding(true)
    try {
      const sets = newExerciseSets(await fetchLastSessionDefaults(qc, exerciseId))
      const list = s.form.getValues('exercises') ?? []
      const current = clampIndex(s.workout.currentExerciseIndex, list.length)
      // An entry without an exercise is filled rather than left behind: the one
      // "Choose an exercise" was tapped for, else an untouched current placeholder
      const target =
        fillIndex !== null && list[fillIndex] && !list[fillIndex].exercise_id
          ? fillIndex
          : list[current] && isBlankEntry(list[current])
            ? current
            : null
      if (target !== null) {
        // Keep sets the user already filled in; replace an untouched placeholder's
        s.replaceExercise(target, exerciseId, isBlankEntry(list[target]) ? sets : undefined)
        s.updateWorkout({ currentExerciseIndex: target })
      } else {
        s.addExercise({ exercise_id: exerciseId, sets })
        s.updateWorkout({ currentExerciseIndex: list.length })
      }
      setListVersion((v) => v + 1)
      setFillIndex(null)
      setSheet(null)
    } finally {
      setAdding(false)
    }
  }

  function openFinish() {
    const missing = exercises.findIndex((e) => !e.exercise_id)
    if (missing !== -1) {
      setGuardError(`Exercise ${missing + 1} has no exercise chosen. Pick one before finishing.`)
      s.updateWorkout({ currentExerciseIndex: missing })
      return
    }
    // Saved with no sets, it would wipe the exercise's "Last time" and, from a
    // template, offer to update the template to an exercise without sets
    const empty = exercises.findIndex((e) => e.sets.length === 0)
    if (empty !== -1) {
      // Before the library loads, the position names it, as the RPE check below does
      const name = names.get(exercises[empty].exercise_id) ?? `Exercise ${empty + 1}`
      setGuardError(`${name} has no sets. Add a set or remove it before finishing.`)
      s.updateWorkout({ currentExerciseIndex: empty })
      return
    }
    const badRpe = findInvalidSetRpe(exercises, (id) => names.get(id))
    if (badRpe) {
      setGuardError(badRpe.message)
      s.updateWorkout({ currentExerciseIndex: badRpe.exerciseIndex })
      return
    }
    setGuardError(null)
    // Refresh the elapsed time on every open, unless the user typed a duration
    const { startedAt, autoDurationSeconds } = s.workout
    const duration = s.values.duration_seconds
    if (startedAt !== null && (duration == null || duration === autoDurationSeconds)) {
      // Nearest whole minute, at least one, so a short workout never leaves the field empty
      const elapsed = Math.max(60, Math.round((Date.now() - startedAt) / 60_000) * 60)
      if (elapsed !== duration) {
        s.setField('duration_seconds', elapsed)
        s.updateWorkout({ autoDurationSeconds: elapsed })
      }
    }
    setSheet('finish')
  }

  function close() {
    s.flushDraft()
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/plan')
  }

  function openFullForm() {
    const resume = s.pendingDraft === null
    if (resume) s.persistDraft()
    // replace: Back from the full form must not land on a stale workout-mode entry
    navigate(strengthViewUrl('log', s.params, { resume }), { replace: true })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const iconBtn = 'min-h-11 min-w-11 flex items-center justify-center rounded-lg text-text-muted-strong'
  const stepBtn =
    'h-14 w-11 shrink-0 flex items-center justify-center rounded-xl border border-border bg-surface text-primary-dark disabled:opacity-40'
  const prevEntry = exIndex > 0 ? exercises[exIndex - 1] : undefined
  const nextEntry = exercises[exIndex + 1]
  const lastTime = entry ? formatLastTime(lastByExercise.get(entry.exercise_id)) : null
  const sets = entry?.sets ?? []
  const setsDone = sets.filter((set) => set.done).length
  const dockName = entry ? nameOf(entry.exercise_id) : 'No exercises'
  // Names what a tap opens: the chooser, or the exercise search for an entry without an exercise
  const dockLabel = entry
    ? `Exercise ${exIndex + 1} of ${exercises.length}, ${dockName}, ${
        sets.length === 0 ? 'no sets' : `${setsDone} of ${sets.length} sets done`
      }. ${entry.exercise_id ? 'Choose exercise' : 'Add exercise'}`
    : 'No exercises. Add exercise'

  return (
    <div className="min-h-dvh bg-bg text-text flex flex-col">
      <header className="sticky top-0 z-20 bg-surface border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="max-w-xl mx-auto flex items-center gap-1 px-1 py-1">
          <button type="button" onClick={close} aria-label="Close workout (keeps your progress)" className={`${iconBtn} text-xl`}>
            ✕
          </button>
          <div className="flex-1 min-w-0 px-1">
            <h1 className="text-base font-semibold leading-tight break-words">{s.values.title || 'Workout'}</h1>
            <p className="text-xs text-text-muted-strong tabular-nums">
              {progress.doneSets} of {progress.totalSets} sets · {progress.doneExercises} of {progress.totalExercises}{' '}
              exercises
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSheet('options')}
            disabled={s.isLoadingTemplate}
            aria-label="Workout options"
            className={`${iconBtn} text-xl disabled:opacity-50`}
          >
            ⋯
          </button>
          <button
            type="button"
            onClick={openFinish}
            disabled={!decided || s.isLoadingTemplate}
            // Filled only once everything is done; until then "Complete set" is the primary action
            className={`min-h-11 px-4 rounded-lg text-sm font-semibold disabled:opacity-50 ${
              allDone ? 'bg-primary-dark text-white' : 'border border-border bg-surface text-primary-dark'
            }`}
          >
            Finish
          </button>
        </div>
      </header>

      {/* Bottom padding clears the dock (125px) and the undo toast above it (to 184px), so scrolling reveals everything */}
      <main className="flex-1 w-full max-w-xl mx-auto px-4 pt-3 pb-[calc(12rem+env(safe-area-inset-bottom))] space-y-3">
        {guardError && (
          <p role="alert" className="rounded-xl bg-error/10 text-error-text text-sm px-3 py-2">
            {guardError}
          </p>
        )}

        {s.pendingDraft !== null ? (
          <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
            <p className="text-base font-medium">You have an unsaved Strength draft.</p>
            <p className="text-sm font-medium text-text">{describeDraft(s.pendingDraft)}</p>
            <p className="text-sm text-text-muted-strong">Continue it, or discard it and start this workout fresh.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void s.restoreDraft()}
                className="flex-1 min-h-12 rounded-xl bg-primary-dark text-white font-semibold"
              >
                Restore
              </button>
              <button
                type="button"
                onClick={s.discardDraft}
                className="flex-1 min-h-12 rounded-xl border border-border bg-surface font-medium"
              >
                Discard
              </button>
            </div>
          </div>
        ) : s.templateError ? (
          <div role="alert" className="rounded-xl border border-border bg-surface p-4 space-y-3">
            <p className="text-base font-medium">{s.templateError}</p>
            <button
              type="button"
              onClick={s.retryTemplate}
              className="w-full min-h-12 rounded-xl bg-primary-dark text-white font-semibold"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={continueWithoutTemplate}
              className="w-full min-h-12 rounded-xl border border-border bg-surface font-medium"
            >
              Continue without template
            </button>
          </div>
        ) : !decided || s.isLoadingTemplate ? (
          <p className="text-sm text-text-muted-strong">Loading…</p>
        ) : (
          <>
            {canPickTemplate && (
              <button
                type="button"
                onClick={() => setSheet('templates')}
                className="w-full min-h-12 rounded-xl border border-border bg-surface font-medium text-primary-dark"
              >
                Start from template
              </button>
            )}

            {entry ? (
              <>
                {!entry.exercise_id && (
                  <button
                    type="button"
                    onClick={() => openAddExercise(exIndex)}
                    className="w-full min-h-12 rounded-xl border border-border bg-surface font-medium text-primary-dark"
                  >
                    Choose an exercise
                  </button>
                )}
                {lastTime && <p className="text-sm text-text-muted-strong">Last time: {lastTime}</p>}
                <SetTabs
                  key={`${exIndex}-${listVersion}`}
                  sets={entry.sets}
                  weightScale={scaleOf(entry.exercise_id)}
                  exerciseName={entry.exercise_id ? nameOf(entry.exercise_id) : null}
                  next={
                    nextIndex === -1
                      ? null
                      : {
                          name: nameOf(exercises[nextIndex].exercise_id),
                          position: nextIndex + 1,
                          total: exercises.length,
                        }
                  }
                  canRemoveExercise={exercises.length > 1}
                  addSetRef={addSetRef}
                  onUpdateSet={(setIndex, patch) => s.updateSet(exIndex, setIndex, patch)}
                  onCompleteSet={completeSet}
                  onDeleteSet={deleteSet}
                  onAddSet={addSet}
                  onNext={() => selectExercise(nextIndex)}
                  onFinish={openFinish}
                  onRemoveExercise={() => {
                    focusAfter.current = 'exercise'
                    removeExercise(exIndex)
                  }}
                />
              </>
            ) : (
              <button
                type="button"
                onClick={() => openAddExercise(null, true)}
                className="w-full min-h-12 rounded-xl border border-border bg-surface font-medium text-primary-dark"
              >
                + Add exercise
              </button>
            )}
          </>
        )}
      </main>

      {undoAction && (
        // 15px above the dock: 125px tall (8 + 44 rest row + 8 + 56 exercise row + 8, plus its border)
        <div className="fixed inset-x-0 bottom-[calc(8.75rem+env(safe-area-inset-bottom))] z-30 px-4">
          <div role="status" className="max-w-xl mx-auto flex items-center gap-3 rounded-xl bg-text text-surface pl-4 pr-1 shadow-md">
            <span className="flex-1 min-w-0 text-sm break-words">{undoAction.label}</span>
            <button type="button" onClick={runUndo} className="min-h-11 px-3 text-sm font-semibold text-primary-light">
              Undo
            </button>
          </div>
        </div>
      )}

      {decided && !s.isLoadingTemplate && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-surface border-t border-border pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-xl mx-auto px-3 pt-2 pb-2 space-y-2">
            <RestTimer
              endsAt={s.workout.restEndsAt}
              lengthSeconds={restLength}
              onReset={() => s.updateWorkout({ restEndsAt: Date.now() + restLength * 1000 })}
              onAddThirty={() =>
                s.updateWorkout({ restEndsAt: Math.max(s.workout.restEndsAt ?? 0, Date.now()) + 30_000 })
              }
              onSkip={() => s.updateWorkout({ restEndsAt: null })}
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => selectExercise(exIndex - 1)}
                disabled={!prevEntry}
                aria-label={prevEntry ? `Previous exercise: ${nameOf(prevEntry.exercise_id)}` : 'Previous exercise'}
                className={stepBtn}
              >
                <ChevronLeftIcon />
              </button>
              <button
                ref={exerciseButtonRef}
                type="button"
                // A placeholder has nothing to switch from yet: go straight to picking its exercise
                onClick={() => (entry && entry.exercise_id ? setSheet('exercises') : openAddExercise(entry ? exIndex : null))}
                aria-label={dockLabel}
                className="flex-1 min-w-0 h-14 rounded-xl border border-border bg-surface px-3 flex flex-col items-stretch justify-center gap-1.5 text-text"
              >
                <span className="flex items-center justify-center gap-1.5 min-w-0">
                  <span className="min-w-0 truncate text-[17px] font-bold leading-tight">{dockName}</span>
                  <ChevronDownIcon className="text-text-muted-strong" />
                </span>
                {sets.length > 0 ? (
                  <span aria-hidden="true" className="flex gap-0.5 px-4">
                    {sets.map((set, i) => (
                      <span key={i} className={`h-[3px] flex-1 rounded-full ${set.done ? 'bg-primary' : 'bg-border'}`} />
                    ))}
                  </span>
                ) : (
                  <span className="text-xs text-text-muted-strong text-center">No sets</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => selectExercise(exIndex + 1)}
                disabled={!nextEntry}
                aria-label={nextEntry ? `Next exercise: ${nameOf(nextEntry.exercise_id)}` : 'Next exercise'}
                className={stepBtn}
              >
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      {(sheet === 'exercises' || sheet === 'add-exercise') && (
        <ChooseExerciseSheet
          entries={exercises}
          currentIndex={exIndex}
          nameOf={nameOf}
          lastByExercise={lastByExercise}
          library={s.exerciseLibrary}
          restEndsAt={s.workout.restEndsAt}
          startInAddMode={sheet === 'add-exercise'}
          busy={adding}
          onSelect={selectExercise}
          onRemove={removeExercise}
          onAdd={(id) => void addExercise(id)}
          onClose={() => {
            setFillIndex(null)
            setSheet(null)
          }}
        />
      )}

      {sheet === 'templates' && (
        <BottomSheet title="Start from template" onClose={() => setSheet(null)}>
          <div className="p-4 space-y-2">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => void startFromTemplate(t.id)}
                className="w-full min-h-12 py-2 px-3 rounded-xl border border-border bg-surface text-left text-base font-medium break-words"
              >
                {t.name}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {sheet === 'options' && (
        <BottomSheet title="Workout options" onClose={() => setSheet(null)}>
          <div className="p-4 space-y-5">
            <button
              type="button"
              onClick={openFullForm}
              className="w-full min-h-12 rounded-xl border border-border bg-surface text-base font-medium text-text"
            >
              Full form
            </button>
            <fieldset>
              <legend className="text-sm font-medium text-text-muted-strong mb-2">
                Rest timer
                {/* A custom length from Settings matches no chip */}
                {!isPresetRestLength(restLength) && <span className="tabular-nums"> · {formatClock(restLength)}</span>}
              </legend>
              <div className="grid grid-cols-4 gap-2">
                {REST_LENGTHS.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    aria-pressed={restLength === sec}
                    onClick={() => chooseRestLength(sec)}
                    className={`min-h-11 rounded-lg border text-sm font-medium ${
                      restLength === sec
                        ? 'border-primary-dark bg-primary-tint text-primary-dark'
                        : 'border-border-strong bg-surface text-text'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
              {restSaveError != null && (
                <p role="status" className="mt-2 text-xs text-text-muted-strong">
                  Not saved to your profile yet; this device uses {formatClock(restLength)} and will retry.
                </p>
              )}
            </fieldset>
          </div>
        </BottomSheet>
      )}

      {sheet === 'finish' && (
        <FinishSheet
          values={s.values}
          onField={s.setField}
          onSave={() => void s.submit()}
          isSaving={s.isSaving}
          errorMessage={
            s.validationError ?? (s.saveMutation.isError ? saveErrorMessage(s.saveMutation.error) : null)
          }
          onClose={() => setSheet(null)}
        />
      )}

      {s.diffState && s.templateSnapshot && (
        <DiffModal
          templateName={s.templateSnapshot.name}
          changes={s.diffState.changes}
          onYes={() => void s.confirmTemplateUpdate()}
          onNo={s.keepTemplate}
          onCancel={s.cancelDiff}
          isPending={s.templateMutation.isPending || s.saveMutation.isPending}
          isError={s.templateMutation.isError}
        />
      )}
    </div>
  )
}
