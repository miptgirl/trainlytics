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
  insertSet as insertSetInto,
  parseStrengthDraft,
  parseStrengthFormParams,
  removeExercise as removeExerciseFrom,
  replaceExercise as replaceExerciseIn,
  serializeStrengthDraft,
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
  /** Prefill from a template, or clear back to defaults with `null`. Keeps date and a touched title. */
  selectTemplate: (id: number | null) => Promise<void>
  titleTouched: boolean
  setTitleTouched: (touched: boolean) => void

  // Draft
  /** Draft found at mount and not yet restored or discarded (drives the banner). */
  pendingDraft: StrengthDraft | null
  restoreDraft: () => Promise<void>
  discardDraft: () => void
  /** Write any pending draft change now. */
  flushDraft: () => void

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
  /** No-op on the last remaining exercise. */
  removeExercise: (exIndex: number) => void
  /** Keeps the current sets unless `sets` is given. */
  replaceExercise: (exIndex: number, exerciseId: string, sets?: SetFormValues[]) => void
  /** Replaces an exercise's sets with its last-session defaults (one empty set if none). */
  prefillFromLastSession: (exIndex: number) => Promise<void>

  // Save
  buildPayload: () => StrengthSessionPayload
  /** Validates via RHF, then runs `requestSave`. Usable as a form `onSubmit`. */
  submit: (e?: BaseSyntheticEvent) => Promise<void>
  /** Posts `data`, or opens the template-diff prompt when it differs from the template. */
  requestSave: (data: StrengthFormValues) => void
  saveMutation: UseMutationResult<{ id: number }, Error, StrengthFormValues>
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

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [templateSnapshot, setTemplateSnapshot] = useState<TemplateSnapshot | null>(null)
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false)
  const [diffState, setDiffState] = useState<DiffState | null>(null)
  const [titleTouched, setTitleTouched] = useState(false)
  const [pendingDraft, setPendingDraft] = useState<StrengthDraft | null>(() =>
    parseStrengthDraft(loadDraft('strength')),
  )
  const [workout, setWorkout] = useState<WorkoutModeState>(initialWorkoutModeState)
  const hasMounted = useRef(false)
  // True once this session owns the stored draft: every later change is written,
  // even one that makes the form equal to its defaults again.
  const draftActive = useRef(false)
  const { schedule: scheduleDraft, flush: flushDraft, cancel: cancelDraft } = useDraftWriter(autosaveMs)

  const { data: exerciseLibrary = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: () => api.get<ExerciseOption[]>('/exercises'),
  })

  const form = useForm<StrengthFormValues>({
    defaultValues: { ...emptyStrengthDefaults(), date: params.date ?? localDateTimeNow() },
  })
  const { control, reset, getValues, setValue } = form
  const { isDirty } = form.formState
  const values = useWatch({ control }) as StrengthFormValues

  useEffect(() => {
    if (params.templateId) applyTemplate(params.templateId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.templateId])

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }
    if (!isDirty && !draftActive.current) return
    draftActive.current = true
    scheduleDraft(serializeStrengthDraft({ values, templateId: selectedTemplateId, workout }))
  }, [values, selectedTemplateId, workout, isDirty, scheduleDraft])

  // ── Template ──────────────────────────────────────────────────────────────

  async function applyTemplate(id: number) {
    setIsLoadingTemplate(true)
    try {
      const detail = await api.get<TemplateSnapshot>(`/templates/strength/${id}`)
      setSelectedTemplateId(id)
      setTemplateSnapshot(detail)
      const currentDate = getValues('date')
      const newValues = templateToFormValues(detail)
      newValues.date = currentDate
      if (titleTouched) {
        newValues.title = getValues('title')
      }
      reset(newValues)
    } finally {
      setIsLoadingTemplate(false)
    }
  }

  async function selectTemplate(id: number | null) {
    if (id === null) {
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
    cancelDraft()
    clearDraft('strength')
    draftActive.current = false
    setPendingDraft(null)
  }

  async function restoreDraft() {
    if (!pendingDraft) return
    const { values: draftValues, templateId: draftTemplateId, workout: draftWorkout } = pendingDraft
    if (draftTemplateId) {
      setIsLoadingTemplate(true)
      try {
        const snapshot = await api.get<TemplateSnapshot>(`/templates/strength/${draftTemplateId}`)
        setSelectedTemplateId(draftTemplateId)
        setTemplateSnapshot(snapshot)
      } catch {
        // Template may have been deleted; restore form values without template link
      } finally {
        setIsLoadingTemplate(false)
      }
    }
    setTitleTouched(true)
    draftActive.current = true
    reset(draftValues)
    setWorkout(draftWorkout)
    setPendingDraft(null)
  }

  function updateWorkout(patch: Partial<WorkoutModeState>) {
    draftActive.current = true
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

  function removeExercise(exIndex: number) {
    const exercises = getValues('exercises')
    const next = removeExerciseFrom(exercises, exIndex)
    if (next !== exercises) setValue('exercises', next, dirty)
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
    onSuccess: (session) => {
      cancelDraft()
      clearDraft('strength')
      draftActive.current = false
      qc.invalidateQueries({ queryKey: ['sessions'] })
      if (onSaved) onSaved(session.id)
      else navigate(`/sessions/${session.id}`)
    },
  })

  const templateMutation = useMutation({
    mutationFn: (data: StrengthFormValues) =>
      api.patch(`/templates/strength/${templateSnapshot!.id}`, toTemplatePayload(data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates', 'strength'] })
    },
  })

  function requestSave(data: StrengthFormValues) {
    // Persist what is about to be sent, so a failed save or closed tab keeps it
    flushDraft()
    if (!templateSnapshot) {
      saveMutation.mutate(data)
      return
    }
    const exerciseMap = new Map(exerciseLibrary.map((e) => [e.id, e.name]))
    const changes = computeDiff(templateSnapshot, data, exerciseMap)
    if (changes.length === 0) {
      saveMutation.mutate(data)
      return
    }
    setDiffState({ formData: data, changes })
  }

  async function confirmTemplateUpdate() {
    if (!diffState) return
    try {
      await templateMutation.mutateAsync(diffState.formData)
      setDiffState(null)
      saveMutation.mutate(diffState.formData)
    } catch {
      // templateMutation.isError shows the error in the modal
    }
  }

  function keepTemplate() {
    if (!diffState) return
    const data = diffState.formData
    setDiffState(null)
    saveMutation.mutate(data)
  }

  return {
    form,
    values,
    params,
    exerciseLibrary,
    selectedTemplateId,
    templateSnapshot,
    isLoadingTemplate,
    selectTemplate,
    titleTouched,
    setTitleTouched,
    pendingDraft,
    restoreDraft,
    discardDraft,
    flushDraft,
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
    replaceExercise,
    prefillFromLastSession,
    buildPayload: () => buildStrengthPayload(getValues()),
    submit: form.handleSubmit(requestSave),
    requestSave,
    saveMutation,
    templateMutation,
    diffState,
    confirmTemplateUpdate,
    keepTemplate,
    cancelDiff: () => setDiffState(null),
    adaptSnapshot: () => buildAdaptSnapshot(values, exerciseLibrary, templateSnapshot?.name),
  }
}
