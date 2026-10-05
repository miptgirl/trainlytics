/**
 * Workout mode (`/workout`): a full-screen logger for one set at a time.
 * Uses the same useStrengthSessionForm as the full form, so both views share
 * the draft and build the same POST body.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DiffModal } from '../components/DiffModal'
import { BottomSheet } from '../components/workout/BottomSheet'
import { ChooseExerciseSheet } from '../components/workout/ChooseExerciseSheet'
import { FinishSheet } from '../components/workout/FinishSheet'
import { RestTimer } from '../components/workout/RestTimer'
import { WorkoutSetList } from '../components/workout/WorkoutSetList'
import { api } from '../lib/api'
import { fetchLastSessionDefaults, useLastSessionDefaults } from '../lib/hooks/useLastSessionDefaults'
import { useStrengthSessionForm } from '../lib/hooks/useStrengthSessionForm'
import { useWakeLock } from '../lib/hooks/useWakeLock'
import { describeDraft, emptyStrengthDefaults, setSetDone, strengthViewUrl, type TemplateSummary, type WorkoutModeState } from '../lib/strengthSession'
import {
  REST_LENGTHS,
  allExercisesDone,
  clampIndex,
  exerciseAfterCompletion,
  formatLastTime,
  isBlankEntry,
  isExerciseDone,
  loadRestLength,
  newExerciseSets,
  nextUnfinishedIndex,
  exerciseProgress,
  saveErrorMessage,
  saveRestLength,
  sessionProgress,
} from '../lib/workoutMode'

type Sheet = 'exercises' | 'add-exercise' | 'finish' | 'options' | 'templates' | null

/** Undo toast: what was removed and how to put it back. */
interface UndoAction {
  label: string
  undo: () => void
}

const UNDO_MS = 5000

/** Remove the current exercise; asks first when it has completed sets (Undo still follows). */
function RemoveExerciseButton({ name, doneSets, onRemove }: { name: string; doneSets: number; onRemove: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const btn = 'flex-1 min-h-12 rounded-xl border border-border bg-surface text-base font-medium'
  if (confirming) {
    return (
      <div className="space-y-2" role="group" aria-label={`Remove ${name}?`}>
        <p className="text-sm text-text">
          Remove {name} and its {doneSets} completed {doneSets === 1 ? 'set' : 'sets'}?
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setConfirming(false)} className={`${btn} text-text`}>
            Keep
          </button>
          <button type="button" onClick={onRemove} className={`${btn} text-error-text`}>
            Remove
          </button>
        </div>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => (doneSets > 0 ? setConfirming(true) : onRemove())}
      className={`w-full ${btn} text-error-text`}
    >
      Remove {name}
    </button>
  )
}

export default function WorkoutModePage() {
  const s = useStrengthSessionForm()
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  useWakeLock()

  const [sheet, setSheet] = useState<Sheet>(null)
  const [restLength, setRestLength] = useState(loadRestLength)
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null)
  const [guardError, setGuardError] = useState<string | null>(null)
  // Bumped on every structural change (delete, undo, remove) so the set list
  // remounts and drops an in-progress "Edit set" that now points elsewhere
  const [listVersion, setListVersion] = useState(0)
  // Index of an entry without an exercise that "Choose an exercise" fills
  const [fillIndex, setFillIndex] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)

  const exercises = s.values.exercises ?? []
  const exIndex = clampIndex(s.workout.currentExerciseIndex, exercises.length)
  const entry = exercises[exIndex]
  const names = new Map(s.exerciseLibrary.map((e) => [String(e.id), e.name]))
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

  // ── Actions ───────────────────────────────────────────────────────────────

  function completeSet(setIndex: number) {
    const after = setSetDone(exercises, exIndex, setIndex, true)
    s.setSetDone(exIndex, setIndex)
    s.updateWorkout({
      // No rest after the very last set of the workout
      restEndsAt: allExercisesDone(after) ? null : Date.now() + restLength * 1000,
      currentExerciseIndex: exerciseAfterCompletion(after, exIndex),
    })
  }

  function deleteSet(setIndex: number) {
    const at = exIndex
    const set = s.deleteSet(at, setIndex)
    if (!set) return
    setListVersion((v) => v + 1)
    setUndoAction({
      label: `Set ${setIndex + 1} deleted`,
      undo: () => {
        s.insertSet(at, setIndex, set)
        s.updateWorkout({ currentExerciseIndex: at })
      },
    })
  }

  function removeCurrentExercise() {
    const at = exIndex
    const removed = s.removeExercise(at)
    if (!removed) return
    setListVersion((v) => v + 1)
    s.updateWorkout({ currentExerciseIndex: Math.min(at, exercises.length - 2) })
    setSheet(null)
    setUndoAction({
      label: `${nameOf(removed.exercise_id)} removed`,
      undo: () => {
        s.insertExercise(at, removed)
        s.updateWorkout({ currentExerciseIndex: at })
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

  function chooseRestLength(seconds: number) {
    setRestLength(seconds)
    saveRestLength(seconds)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const iconBtn = 'min-h-11 min-w-11 flex items-center justify-center rounded-lg text-text-muted-strong'
  const barBtn = 'min-h-12 rounded-xl text-base font-medium px-3'

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
          <button type="button" onClick={() => setSheet('options')}
            disabled={s.isLoadingTemplate}
            aria-label="Workout options"
            className={`${iconBtn} text-xl disabled:opacity-50`}>
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

      <main className="flex-1 w-full max-w-xl mx-auto px-4 pt-4 pb-[calc(9.5rem+env(safe-area-inset-bottom))] space-y-4">
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
            {allDone && (
              <div className="rounded-[20px] bg-primary-tint p-4 space-y-3">
                <p className="text-base font-semibold text-primary-dark">All exercises done</p>
                <button
                  type="button"
                  onClick={openFinish}
                  className="w-full min-h-12 rounded-xl bg-primary-dark text-white font-semibold"
                >
                  Finish workout
                </button>
              </div>
            )}

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
              <section aria-labelledby="current-exercise" className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-text-muted-strong">
                  Exercise {exIndex + 1} of {exercises.length}
                </p>
                <h2 id="current-exercise" className="text-xl font-semibold break-words">
                  {nameOf(entry.exercise_id)}
                </h2>
                {!entry.exercise_id && (
                  <button
                    type="button"
                    onClick={() => openAddExercise(exIndex)}
                    className="min-h-11 text-sm font-medium text-primary-dark"
                  >
                    Choose an exercise
                  </button>
                )}
                {formatLastTime(lastByExercise.get(entry.exercise_id)) && (
                  <p className="text-sm text-text-muted-strong">
                    Last time: {formatLastTime(lastByExercise.get(entry.exercise_id))}
                  </p>
                )}
              </section>
            ) : (
              <button
                type="button"
                onClick={() => openAddExercise(null, true)}
                className="w-full min-h-12 rounded-xl border border-border bg-surface font-medium text-primary-dark"
              >
                + Add exercise
              </button>
            )}

            {entry && (
              <WorkoutSetList
                key={`${exIndex}-${listVersion}`}
                sets={entry.sets}
                onUpdateSet={(setIndex, patch) => s.updateSet(exIndex, setIndex, patch)}
                onCompleteSet={completeSet}
                onDeleteSet={deleteSet}
                onAddSet={() => s.addSet(exIndex)}
              />
            )}
          </>
        )}
      </main>

      {undoAction && (
        <div className="fixed inset-x-0 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
          <div role="status" className="flex items-center gap-3 rounded-xl bg-text text-surface pl-4 pr-1 shadow-md">
            <span className="text-sm">{undoAction.label}</span>
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSheet('exercises')}
                className={`${barBtn} border border-border bg-surface text-text`}
              >
                Choose exercise
              </button>
              {/* Secondary: "Complete set" stays the one primary action on screen */}
              {nextIndex !== -1 ? (
                <button
                  type="button"
                  onClick={() => selectExercise(nextIndex)}
                  className={`${barBtn} flex-1 min-w-0 border border-primary-dark bg-surface text-primary-dark flex items-center justify-between gap-2`}
                >
                  <span className="truncate">Next: {nameOf(exercises[nextIndex].exercise_id)}</span>
                  <span aria-hidden="true">›</span>
                </button>
              ) : allDone ? (
                <button type="button" onClick={openFinish} className={`${barBtn} flex-1 bg-primary-dark text-white`}>
                  Finish ›
                </button>
              ) : (
                <span className={`${barBtn} flex-1 flex items-center justify-center text-text-muted-strong`}>Last exercise</span>
              )}
            </div>
          </div>
        </div>
      )}

      {(sheet === 'exercises' || sheet === 'add-exercise') && (
        <ChooseExerciseSheet
          entries={exercises}
          currentIndex={exIndex}
          exerciseNames={names}
          lastByExercise={lastByExercise}
          library={s.exerciseLibrary}
          startInAddMode={sheet === 'add-exercise'}
          busy={adding}
          onSelect={selectExercise}
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
            {exercises.length > 1 && entry && (
              <RemoveExerciseButton
                name={entry.exercise_id ? nameOf(entry.exercise_id) : 'this exercise'}
                doneSets={exerciseProgress(entry).done}
                onRemove={removeCurrentExercise}
              />
            )}
            <fieldset>
              <legend className="text-sm font-medium text-text-muted-strong mb-2">Rest timer</legend>
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
          errorMessage={s.saveMutation.isError ? saveErrorMessage(s.saveMutation.error) : null}
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
