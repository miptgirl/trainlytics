/**
 * useStrengthSessionForm — the strength logging flow, shared by the full form
 * (`/log?type=strength`) and workout mode.
 *
 * State lives in a react-hook-form instance owned by this hook. The full form
 * binds its existing RHF components (`StrengthExerciseList`,
 * `ExerciseEntryBlock`) to `form`; other UIs read `values` and change state
 * only through the actions below. Both write the same store, so the same input
 * builds the same `POST /sessions/strength` body from either view.
 *
 * Draft rules: once the form is dirty (or a draft was restored), every change
 * is written to localStorage within `autosaveMs`, flushed when the page is
 * hidden or the hook unmounts. The draft is removed only after a 2xx save or
 * an explicit discard; a failed save keeps it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type BaseSyntheticEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { useForm, useWatch, type Path, type PathValue, type UseFormReturn } from 'react-hook-form'
import type { ExerciseEntryFormValues, ExerciseOption, SetFormValues } from '../../components/ExerciseEntryBlock'
import { api } from '../api'
import { localDateTimeNow } from '../dateUtils'
import { clearDraft, loadDraft, saveDraft } from '../draftUtils'
import {
  addExercise as addExerciseTo,
  addSet as addSetTo,
  buildAdaptSnapshot,
  buildStrengthPayload,
  computeDiff,
  deleteSet as deleteSetFrom,
  emptyStrengthDefaults,
  fetchLastSessionSets,
  initialWorkoutModeState,
  insertExercise as insertExerciseInto,
  insertSet as insertSetInto,
  parseStrengthDraft,
  parseStrengthFormParams,
  removeExercise as removeExerciseFrom,
  replaceExercise as replaceExerciseIn,
  serializeStrengthDraft,
  templateSnapshotFromValues,
  templateToFormValues,
  toTemplatePayload,
  type StrengthDraft,
  type StrengthFormParams,
  type StrengthFormValues,
  type StrengthScalarField,
  type StrengthSessionPayload,
  type TemplateSnapshot,
  type WorkoutModeState,
} from '../strengthSession'

/** Upper bound between a change and its draft write. */
export const STRENGTH_AUTOSAVE_MS = 300
/** Give up on a template snapshot request after this long (api.ts has no timeout). */
const TEMPLATE_FETCH_TIMEOUT_MS = 10_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Request timed out')), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

export interface DiffState {
  formData: StrengthFormValues
  changes: string[]
}

export interface UseStrengthSessionFormOptions {
  /** Runs after a 2xx save, once the draft is cleared. Default: go to `/sessions/:id`. */
  onSaved?: (sessionId: number) => void
  /** Draft write delay in ms (default `STRENGTH_AUTOSAVE_MS`). */
  autosaveMs?: number
}

export interface StrengthSessionForm {
  /** RHF instance. Only for UIs built from RHF components; others use the actions. */
  form: UseFormReturn<StrengthFormValues>
  /** Live form values. */
  values: StrengthFormValues
  /** Parsed `templateId`, `date`, `plannedSessionId`, `weekStart` query params. */
  params: StrengthFormParams
  /** Exercise library (`GET /exercises`). */
  exerciseLibrary: ExerciseOption[]

  // Template
  selectedTemplateId: number | null
  templateSnapshot: TemplateSnapshot | null
  isLoadingTemplate: boolean
  /** Set when loading a template failed or timed out; `retryTemplate` tries again. */
  templateError: string | null
  retryTemplate: () => void
  /** Prefill from a template, or clear back to defaults with `null`. Keeps date and a touched title. */
  selectTemplate: (id: number | null) => Promise<void>
  titleTouched: boolean
  setTitleTouched: (touched: boolean) => void

  // Draft
  /**
   * Draft found at mount and not yet restored or discarded (drives the banner).
   * With `resume=1` in the URL the draft is restored automatically instead.
   * While it is set nothing is autosaved and saving is refused, so the stored
   * draft can't be overwritten before the user decides.
   */
  pendingDraft: StrengthDraft | null
  /** True while a draft restore (including its template fetch) is in progress. */
  isRestoring: boolean
  restoreDraft: () => Promise<void>
  discardDraft: () => void
  /** Write any pending draft change now. */
  flushDraft: () => void
  /** Write the current state as the draft now, even if nothing changed (view switch). */
  persistDraft: () => void

  // Workout-mode position (persisted in the draft, ignored by the payload)
  workout: WorkoutModeState
  updateWorkout: (patch: Partial<WorkoutModeState>) => void

  // Field actions
  setField: <K extends StrengthScalarField>(name: K, value: StrengthFormValues[K]) => void
  updateSet: (exIndex: number, setIndex: number, patch: Partial<SetFormValues>) => void
  /** Appends a copy of the last set's reps and weight. */
  addSet: (exIndex: number) => void
  insertSet: (exIndex: number, setIndex: number, set?: SetFormValues) => void
  /** Returns the removed set (for undo), or null when it was the last one. */
  deleteSet: (exIndex: number, setIndex: number) => SetFormValues | null
  setSetDone: (exIndex: number, setIndex: number, done?: boolean) => void
  addExercise: (entry?: ExerciseEntryFormValues) => void
  /** Returns the removed entry (for undo), or null on the last remaining exercise. */
  removeExercise: (exIndex: number) => ExerciseEntryFormValues | null
  insertExercise: (exIndex: number, entry: ExerciseEntryFormValues) => void
  /** Keeps the current sets unless `sets` is given. */
  replaceExercise: (exIndex: number, exerciseId: string, sets?: SetFormValues[]) => void
  /** Replaces an exercise's sets with its last-session defaults (one empty set if none). */
  prefillFromLastSession: (exIndex: number) => Promise<void>

  // Save
  buildPayload: () => StrengthSessionPayload
  /** Validates via RHF, then runs `requestSave`. Usable as a form `onSubmit`. */
  submit: (e?: BaseSyntheticEvent) => Promise<void>
  /**
   * Posts `data`, or opens the template-diff prompt when it differs from the
   * template. Ignored while a draft decision is pending, a save is in flight or
   * the prompt is open; once the prompt was answered it isn't asked again.
   */
  requestSave: (data: StrengthFormValues) => Promise<void>
  saveMutation: UseMutationResult<{ id: number }, Error, StrengthFormValues>
  /** Waiting for the template snapshot before the diff prompt (part of `isSaving`). */
  preparingSave: boolean
  /** Any save step in progress: preparing, PATCHing the template or POSTing. */
  isSaving: boolean
  templateMutation: UseMutationResult<unknown, Error, StrengthFormValues>
  /** Pending template-diff prompt, or null. */
  diffState: DiffState | null
  confirmTemplateUpdate: () => Promise<void>
  keepTemplate: () => void
  cancelDiff: () => void

  /** Input for AdaptSessionModal. */
  adaptSnapshot: () => ReturnType<typeof buildAdaptSnapshot>
}

function useDraftWriter(delayMs: number) {
  const pending = useRef<Record<string, unknown> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    pending.current = null
  }, [])

  const flush = useCallback(() => {
    const data = pending.current
    cancel()
    if (data) saveDraft('strength', data)
  }, [cancel])

  // The first unsaved change starts the timer; later changes only replace the
  // data, so a write never lags a change by more than `delayMs`.
  const schedule = useCallback(
    (data: Record<string, unknown>) => {
      pending.current = data
      if (timer.current === null) timer.current = setTimeout(flush, delayMs)
    },
    [flush, delayMs],
  )

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  return { schedule, flush, cancel }
}

export function useStrengthSessionForm(options: UseStrengthSessionFormOptions = {}): StrengthSessionForm {
  const { onSaved, autosaveMs = STRENGTH_AUTOSAVE_MS } = options
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const paramsKey = searchParams.toString()
  const params = useMemo(() => parseStrengthFormParams(new URLSearchParams(paramsKey)), [paramsKey])

  const [initialDraft] = useState<StrengthDraft | null>(() => parseStrengthDraft(loadDraft('strength')))
  // `resume=1` (view switch, reload of workout mode) restores without asking.
  // State starts from the draft itself, so the first render (and any effect
  // reading it, e.g. workout mode's start time) already sees the draft.
  const [resumeDraft] = useState(() => params.resume === true && initialDraft !== null)
  const resumed = resumeDraft ? initialDraft : null
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(resumed?.templateId ?? null)
  const [templateSnapshot, setTemplateSnapshot] = useState<TemplateSnapshot | null>(null)
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [diffState, setDiffState] = useState<DiffState | null>(null)
  const [titleTouched, setTitleTouched] = useState(resumeDraft)
  const [pendingDraft, setPendingDraft] = useState<StrengthDraft | null>(resumeDraft ? null : initialDraft)
  const [isRestoring, setIsRestoring] = useState(false)
  const [workout, setWorkout] = useState<WorkoutModeState>(() => resumed?.workout ?? initialWorkoutModeState())
  const [preparingSave, setPreparingSave] = useState(false)
  const hasMounted = useRef(false)
  // True once this session owns the stored draft: every later change is written,
  // even one that makes the form equal to its defaults again.
  const draftActive = useRef(false)
  // Bumped by every template load, restore and clear; a template response for
  // an older generation is dropped so it can't overwrite newer state.
  const templateGeneration = useRef(0)
  const saving = useRef(false)
  // Changes the user chose to keep out of the template ("No"): the prompt is
  // asked again only when the diff is different from that answer
  const keptChanges = useRef<string | null>(null)
  const lastTemplateRequest = useRef<number | null>(null)
  const snapshotRequests = useRef(new Map<number, Promise<TemplateSnapshot | null>>())
  const { schedule: scheduleDraft, flush: flushDraft, cancel: cancelDraft } = useDraftWriter(autosaveMs)

  const { data: exerciseLibrary = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => api.get<ExerciseOption[]>('/exercises'),
  })

  const form = useForm<StrengthFormValues>({
    defaultValues: resumed?.values ?? { ...emptyStrengthDefaults(), date: params.date ?? localDateTimeNow() },
  })
  const { control, reset, getValues, setValue } = form
  const { isDirty } = form.formState
  const values = useWatch({ control }) as StrengthFormValues

  useEffect(() => {
    // A resumed draft already carries its template and values; a pending one
    // waits for Restore/Discard (Discard loads the URL template then)
    if (resumeDraft || pendingDraft) return
    if (params.templateId) void applyTemplate(params.templateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.templateId])

  useEffect(() => {
    if (resumeDraft) applyDraft(initialDraft!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }
    // Never write over a stored draft the user hasn't restored or discarded
    if (pendingDraft) return
    // Workout position alone (e.g. the start time) doesn't create a draft;
    // it is saved along with the first real change
    if (!isDirty && !draftActive.current) return
    draftActive.current = true
    scheduleDraft(serializeStrengthDraft({ values, templateId: selectedTemplateId, workout }))
  }, [values, selectedTemplateId, workout, isDirty, pendingDraft, scheduleDraft])

  // ── Template ──────────────────────────────────────────────────────────────

  async function applyTemplate(id: number) {
    const generation = ++templateGeneration.current
    lastTemplateRequest.current = id
    setIsLoadingTemplate(true)
    setTemplateError(null)
    try {
      const detail = await withTimeout(api.get<TemplateSnapshot>(`/templates/strength/${id}`), TEMPLATE_FETCH_TIMEOUT_MS)
      if (generation !== templateGeneration.current) return
      keptChanges.current = null
      setSelectedTemplateId(id)
      setTemplateSnapshot(detail)
      const currentDate = getValues('date')
      const newValues = templateToFormValues(detail)
      newValues.date = currentDate
      if (titleTouched) {
        newValues.title = getValues('title')
      }
      reset(newValues)
    } catch (err) {
      if (generation === templateGeneration.current) {
        const status = (err as { status?: unknown } | null)?.status
        setTemplateError(
          status === 404
            ? 'This template no longer exists.'
            : "Couldn't load the template. Check your connection and try again.",
        )
      }
    } finally {
      if (generation === templateGeneration.current) setIsLoadingTemplate(false)
    }
  }

  function retryTemplate() {
    if (lastTemplateRequest.current !== null) void applyTemplate(lastTemplateRequest.current)
  }

  async function selectTemplate(id: number | null) {
    if (id === null) {
      templateGeneration.current++
      setIsLoadingTemplate(false)
      setTemplateError(null)
      keptChanges.current = null
      setSelectedTemplateId(null)
      setTemplateSnapshot(null)
      const currentDate = getValues('date')
      const defaults = emptyStrengthDefaults()
      defaults.date = currentDate
      if (titleTouched) {
        defaults.title = getValues('title')
      }
      reset(defaults)
    } else {
      await applyTemplate(id)
    }
  }

  // ── Draft ─────────────────────────────────────────────────────────────────

  function discardDraft() {
    if (!pendingDraft) return
    cancelDraft()
    clearDraft('strength')
    draftActive.current = false
    setPendingDraft(null)
    if (params.templateId) void applyTemplate(params.templateId)
  }

  async function restoreDraft() {
    if (!pendingDraft) return
    await applyDraft(pendingDraft)
  }

  /**
   * Puts the draft into the form at once; the template snapshot (needed only
   * for the diff prompt) loads in the background. The template link is kept
   * even when that request fails, and the save retries it.
   */
  function applyDraft(draft: StrengthDraft): Promise<void> {
    const { values: draftValues, templateId: draftTemplateId, workout: draftWorkout } = draft
    const generation = ++templateGeneration.current
    setIsLoadingTemplate(false)
    setTemplateError(null)
    keptChanges.current = null
    setTitleTouched(true)
    draftActive.current = true
    reset(draftValues)
    setWorkout(draftWorkout)
    setSelectedTemplateId(draftTemplateId)
    setTemplateSnapshot(null)
    setPendingDraft(null)
    if (!draftTemplateId) return Promise.resolve()
    setIsRestoring(true)
    return loadSnapshot(draftTemplateId)
      .then((snapshot) => {
        if (generation === templateGeneration.current && snapshot) setTemplateSnapshot(snapshot)
      })
      .finally(() => {
        if (generation === templateGeneration.current) setIsRestoring(false)
      })
  }

  /** Template snapshot or null on failure/timeout; concurrent calls share one request. */
  function loadSnapshot(id: number): Promise<TemplateSnapshot | null> {
    const inFlight = snapshotRequests.current.get(id)
    if (inFlight) return inFlight
    const request = withTimeout(api.get<TemplateSnapshot>(`/templates/strength/${id}`), TEMPLATE_FETCH_TIMEOUT_MS)
      .catch(() => null)
      .finally(() => snapshotRequests.current.delete(id))
    snapshotRequests.current.set(id, request)
    return request
  }

  function persistDraft() {
    if (pendingDraft) return
    cancelDraft()
    draftActive.current = true
    saveDraft('strength', serializeStrengthDraft({ values: getValues(), templateId: selectedTemplateId, workout }))
  }

  function updateWorkout(patch: Partial<WorkoutModeState>) {
    setWorkout((w) => ({ ...w, ...patch }))
  }

  // ── Field actions ─────────────────────────────────────────────────────────

  const dirty = { shouldDirty: true } as const

  function setField<K extends StrengthScalarField>(name: K, value: StrengthFormValues[K]) {
    setValue(name as Path<StrengthFormValues>, value as PathValue<StrengthFormValues, K>, dirty)
  }

  function commitSets(exIndex: number, next: ExerciseEntryFormValues[]) {
    setValue(`exercises.${exIndex}.sets` as const, next[exIndex].sets, dirty)
  }

  function updateSet(exIndex: number, setIndex: number, patch: Partial<SetFormValues>) {
    const current = getValues(`exercises.${exIndex}.sets.${setIndex}` as const)
    if (!current) return
    setValue(`exercises.${exIndex}.sets.${setIndex}` as const, { ...current, ...patch }, dirty)
  }

  function addSet(exIndex: number) {
    if (!getValues(`exercises.${exIndex}` as const)) return
    commitSets(exIndex, addSetTo(getValues('exercises'), exIndex))
  }

  function insertSet(exIndex: number, setIndex: number, set?: SetFormValues) {
    if (!getValues(`exercises.${exIndex}` as const)) return
    commitSets(exIndex, insertSetInto(getValues('exercises'), exIndex, setIndex, set))
  }

  function deleteSet(exIndex: number, setIndex: number): SetFormValues | null {
    const exercises = getValues('exercises')
    const next = deleteSetFrom(exercises, exIndex, setIndex)
    if (next === exercises) return null
    const removed = exercises[exIndex].sets[setIndex]
    commitSets(exIndex, next)
    return removed
  }

  function setSetDone(exIndex: number, setIndex: number, done = true) {
    updateSet(exIndex, setIndex, { done })
  }

  function addExercise(entry?: ExerciseEntryFormValues) {
    setValue('exercises', addExerciseTo(getValues('exercises'), entry), dirty)
  }

  function removeExercise(exIndex: number): ExerciseEntryFormValues | null {
    const exercises = getValues('exercises')
    const next = removeExerciseFrom(exercises, exIndex)
    if (next === exercises) return null
    setValue('exercises', next, dirty)
    return exercises[exIndex]
  }

  function insertExercise(exIndex: number, entry: ExerciseEntryFormValues) {
    setValue('exercises', insertExerciseInto(getValues('exercises'), exIndex, entry), dirty)
  }

  function replaceExercise(exIndex: number, exerciseId: string, sets?: SetFormValues[]) {
    if (!getValues(`exercises.${exIndex}` as const)) return
    setValue('exercises', replaceExerciseIn(getValues('exercises'), exIndex, exerciseId, sets), dirty)
  }

  async function prefillFromLastSession(exIndex: number) {
    const exerciseId = getValues(`exercises.${exIndex}.exercise_id` as const)
    if (!exerciseId) return
    const sets = await fetchLastSessionSets(exerciseId)
    // Skip if the exercise changed while the request was in flight
    if (getValues(`exercises.${exIndex}.exercise_id` as const) !== exerciseId) return
    setValue(`exercises.${exIndex}.sets` as const, sets, dirty)
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (data: StrengthFormValues) =>
      api.post<{ id: number }>('/sessions/strength', buildStrengthPayload(data)),
    onMutate: () => {
      saving.current = true
    },
    onSettled: () => {
      saving.current = false
    },
    onSuccess: (session) => {
      cancelDraft()
      clearDraft('strength')
      draftActive.current = false
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['last-session-defaults'] })
      if (onSaved) onSaved(session.id)
      // replace: Back must not reopen the form (or workout mode) and start a new draft
      else navigate(`/sessions/${session.id}`, { replace: true })
    },
  })

  function post(data: StrengthFormValues) {
    if (saving.current) return
    saving.current = true
    saveMutation.mutate(data)
  }

  const templateMutation = useMutation({
    mutationFn: (data: StrengthFormValues) =>
      api.patch(`/templates/strength/${templateSnapshot!.id}`, toTemplatePayload(data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', 'strength'] })
    },
  })

  async function requestSave(data: StrengthFormValues) {
    if (pendingDraft || saving.current || diffState) return
    // Persist what is about to be sent, so a failed save or closed tab keeps it
    flushDraft()
    let snapshot = templateSnapshot
    if (!snapshot && selectedTemplateId) {
      // Restored draft whose template didn't load yet: one more try for the diff
      const generation = templateGeneration.current
      saving.current = true
      setPreparingSave(true)
      try {
        snapshot = await loadSnapshot(selectedTemplateId)
      } finally {
        saving.current = false
        setPreparingSave(false)
      }
      // The template changed meanwhile: let the user save again against it
      if (generation !== templateGeneration.current) return
      if (snapshot) setTemplateSnapshot(snapshot)
      // Include anything typed while waiting
      data = getValues()
    }
    if (!snapshot) {
      post(data)
      return
    }
    const exerciseMap = new Map(exerciseLibrary.map((e) => [e.id, e.name]))
    const changes = computeDiff(snapshot, data, exerciseMap)
    if (changes.length === 0 || JSON.stringify(changes) === keptChanges.current) {
      post(data)
      return
    }
    setDiffState({ formData: data, changes })
  }

  async function confirmTemplateUpdate() {
    if (!diffState || templateMutation.isPending || !templateSnapshot) return
    try {
      await templateMutation.mutateAsync(diffState.formData)
      // The template now matches this session: a retry finds no diff and
      // won't PATCH again; a later edit shows a new diff and asks again
      const exerciseMap = new Map(exerciseLibrary.map((e) => [e.id, e.name]))
      setTemplateSnapshot(templateSnapshotFromValues(templateSnapshot, diffState.formData, exerciseMap))
      keptChanges.current = null
      setDiffState(null)
      post(diffState.formData)
    } catch {
      // templateMutation.isError shows the error in the modal
    }
  }

  function keepTemplate() {
    if (!diffState) return
    const data = diffState.formData
    keptChanges.current = JSON.stringify(diffState.changes)
    setDiffState(null)
    post(data)
  }

  return {
    form,
    values,
    params,
    exerciseLibrary,
    selectedTemplateId,
    templateSnapshot,
    isLoadingTemplate,
    templateError,
    retryTemplate,
    selectTemplate,
    titleTouched,
    setTitleTouched,
    pendingDraft,
    isRestoring,
    restoreDraft,
    discardDraft,
    flushDraft,
    persistDraft,
    workout,
    updateWorkout,
    setField,
    updateSet,
    addSet,
    insertSet,
    deleteSet,
    setSetDone,
    addExercise,
    removeExercise,
    insertExercise,
    replaceExercise,
    prefillFromLastSession,
    buildPayload: () => buildStrengthPayload(getValues()),
    submit: form.handleSubmit(requestSave),
    requestSave,
    saveMutation,
    preparingSave,
    isSaving: preparingSave || saveMutation.isPending || templateMutation.isPending,
    templateMutation,
    diffState,
    confirmTemplateUpdate,
    keepTemplate,
    cancelDiff: () => setDiffState(null),
    adaptSnapshot: () => buildAdaptSnapshot(values, exerciseLibrary, templateSnapshot?.name),
  }
}
