/**
 * Workout mode (`/workout`): a full-screen logger for one set at a time.
 * Uses the same useStrengthSessionForm as the full form, so both views share
 * the draft and build the same POST body.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { SetFormValues } from '../components/ExerciseEntryBlock'
import { DiffModal } from '../components/DiffModal'
import { BottomSheet } from '../components/workout/BottomSheet'
import { ChooseExerciseSheet } from '../components/workout/ChooseExerciseSheet'
import { FinishSheet } from '../components/workout/FinishSheet'
import { RestTimer } from '../components/workout/RestTimer'
import { WorkoutSetList } from '../components/workout/WorkoutSetList'
import { fetchLastSessionDefaults, useLastSessionDefaults } from '../lib/hooks/useLastSessionDefaults'
import { useStrengthSessionForm } from '../lib/hooks/useStrengthSessionForm'
import { useWakeLock } from '../lib/hooks/useWakeLock'
import { setSetDone, strengthViewUrl, type WorkoutModeState } from '../lib/strengthSession'
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
  saveRestLength,
  sessionProgress,
} from '../lib/workoutMode'

type Sheet = 'exercises' | 'add-exercise' | 'finish' | 'options' | null

interface DeletedSet {
  exIndex: number
  setIndex: number
  set: SetFormValues
}

const UNDO_MS = 5000

export default function WorkoutModePage() {
  const s = useStrengthSessionForm()
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  useWakeLock()

  const [sheet, setSheet] = useState<Sheet>(null)
  const [restLength, setRestLength] = useState(loadRestLength)
  const [deleted, setDeleted] = useState<DeletedSet | null>(null)
  const [guardError, setGuardError] = useState<string | null>(null)

  const exercises = s.values.exercises ?? []
  const exIndex = clampIndex(s.workout.currentExerciseIndex, exercises.length)
  const entry = exercises[exIndex]
  const names = new Map(s.exerciseLibrary.map((e) => [String(e.id), e.name]))
  const lastByExercise = useLastSessionDefaults(exercises.map((e) => e.exercise_id))
  const progress = sessionProgress(exercises)
  const nextIndex = nextUnfinishedIndex(exercises, exIndex)
  const allDone = allExercisesDone(exercises)
  const decided = s.pendingDraft === null && !s.isRestoring
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
    if (!deleted) return
    const t = setTimeout(() => setDeleted(null), UNDO_MS)
    return () => clearTimeout(t)
  }, [deleted])

  // ── Actions ───────────────────────────────────────────────────────────────

  function completeSet(setIndex: number) {
    const after = setSetDone(exercises, exIndex, setIndex, true)
    s.setSetDone(exIndex, setIndex)
    s.updateWorkout({
      restEndsAt: Date.now() + restLength * 1000,
      currentExerciseIndex: exerciseAfterCompletion(after, exIndex),
    })
  }

  function deleteSet(setIndex: number) {
    const set = s.deleteSet(exIndex, setIndex)
    if (set) setDeleted({ exIndex, setIndex, set })
  }

  function undoDelete() {
    if (!deleted) return
    s.insertSet(deleted.exIndex, deleted.setIndex, deleted.set)
    s.updateWorkout({ currentExerciseIndex: deleted.exIndex })
    setDeleted(null)
  }

  function selectExercise(index: number) {
    s.updateWorkout({ currentExerciseIndex: index })
    setSheet(null)
  }

  async function addExercise(exerciseId: string) {
    const sets = newExerciseSets(await fetchLastSessionDefaults(qc, exerciseId))
    const list = s.form.getValues('exercises') ?? []
    const at = clampIndex(s.workout.currentExerciseIndex, list.length)
    if (list[at] && isBlankEntry(list[at])) {
      // Fill the empty placeholder instead of leaving it behind
      s.replaceExercise(at, exerciseId, sets)
      s.updateWorkout({ currentExerciseIndex: at })
    } else {
      s.addExercise({ exercise_id: exerciseId, sets })
      s.updateWorkout({ currentExerciseIndex: list.length })
    }
    setSheet(null)
  }

  function openFinish() {
    const missing = exercises.findIndex((e) => !e.exercise_id)
    if (missing !== -1) {
      setGuardError(`Exercise ${missing + 1} has no exercise chosen. Pick one before finishing.`)
      s.updateWorkout({ currentExerciseIndex: missing })
      return
    }
    setGuardError(null)
    if (s.values.duration_seconds == null && s.workout.startedAt !== null) {
      const elapsed = Math.floor((Date.now() - s.workout.startedAt) / 60_000) * 60
      if (elapsed > 0) s.setField('duration_seconds', elapsed)
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
    navigate(strengthViewUrl('log', s.params, { resume }))
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
          <button type="button" onClick={() => setSheet('options')} aria-label="Workout options" className={`${iconBtn} text-xl`}>
            ⋯
          </button>
          <button
            type="button"
            onClick={openFinish}
            disabled={!decided}
            className="min-h-11 px-4 rounded-lg bg-primary-dark text-white text-sm font-semibold disabled:opacity-50"
          >
            Finish
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-xl mx-auto px-4 pt-4 pb-[calc(9.5rem+env(safe-area-inset-bottom))] space-y-4">
        {guardError && (
          <p role="alert" className="rounded-xl bg-accent-light text-accent-text text-sm px-3 py-2">
            {guardError}
          </p>
        )}

        {s.pendingDraft !== null ? (
          <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
            <p className="text-base font-medium">You have an unsaved Strength draft.</p>
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
        ) : !decided || s.isLoadingTemplate ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : (
          <>
            {allDone && (
              <div className="rounded-2xl bg-primary-tint p-4 space-y-3">
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
                    onClick={() => setSheet('add-exercise')}
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
                onClick={() => setSheet('add-exercise')}
                className="w-full min-h-12 rounded-xl border border-border bg-surface font-medium text-primary-dark"
              >
                + Add exercise
              </button>
            )}

            {entry && (
              <WorkoutSetList
                key={exIndex}
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

      {deleted && (
        <div className="fixed inset-x-0 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
          <div role="status" className="flex items-center gap-3 rounded-xl bg-text text-surface pl-4 pr-1 shadow-lg">
            <span className="text-sm">Set {deleted.setIndex + 1} deleted</span>
            <button type="button" onClick={undoDelete} className="min-h-11 px-3 text-sm font-semibold text-primary-light">
              Undo
            </button>
          </div>
        </div>
      )}

      {decided && (
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
              {nextIndex !== -1 ? (
                <button
                  type="button"
                  onClick={() => selectExercise(nextIndex)}
                  className={`${barBtn} flex-1 min-w-0 bg-primary-dark text-white flex items-center justify-between gap-2`}
                >
                  <span className="truncate">Next: {nameOf(exercises[nextIndex].exercise_id)}</span>
                  <span aria-hidden="true">›</span>
                </button>
              ) : (
                <button type="button" onClick={openFinish} className={`${barBtn} flex-1 bg-primary-dark text-white`}>
                  Finish ›
                </button>
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
          onSelect={selectExercise}
          onAdd={(id) => void addExercise(id)}
          onClose={() => setSheet(null)}
        />
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
                        : 'border-border bg-surface text-text'
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
          isSaving={s.saveMutation.isPending || s.templateMutation.isPending}
          saveFailed={s.saveMutation.isError}
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
