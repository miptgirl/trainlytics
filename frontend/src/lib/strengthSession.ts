/**
 * Pure strength-session logic shared by the full log form and workout mode:
 * form value types, template prefill/diff, POST payload, set/exercise list
 * transforms and the localStorage draft schema. No React, no I/O except
 * `fetchLastSessionSets`.
 */
import type { ExerciseEntryFormValues, ExerciseOption, SetFormValues } from '../components/ExerciseEntryBlock'
import { emptyEntry, emptySet } from '../components/exerciseEntryDefaults'
import { api } from './api'
import { datetimeLocalToUTC, localDateTimeNow } from './dateUtils'
import { draftSessionRpe } from './draftUtils'
import {
  MAX_SET_DURATION_SECONDS,
  inputKind,
  parseDuration,
  setKind,
  setRepsOrDuration,
  type Measure,
  type SetKind,
} from './workoutMode'

// The pure reps-or-time helpers live in workoutMode (SetTabs needs them, and must not import this module:
// it imports ./api, and the test setup loads SetTabs before tests mock ../lib/api)
export { inputKind, parseDuration, setKind, setRepsOrDuration, type SetKind }

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateSummary {
  id: number
  name: string
}

export interface TemplateSet {
  set_number: number
  reps: number | null
  weight_kg: number | null
  /** A timed set's planned hold; absent in responses cached before timed sets. */
  duration_seconds?: number | null
}

export interface TemplateExercise {
  exercise_id: number
  exercise_name: string
  /**
   * How the exercise is measured now (the sets are stored as entered); absent in
   * snapshots built locally or cached before timed sets.
   */
  measure?: Measure
  order: number
  sets: TemplateSet[]
}

export interface TemplateSnapshot {
  id: number
  name: string
  exercises: TemplateExercise[]
}

export interface StrengthFormValues {
  title: string
  duration_seconds: number | null
  calories: string
  /** datetime-local string, e.g. "2026-09-01T10:00" */
  date: string
  notes: string
  wellbeing: number | null
  rpe: number | null
  exercises: ExerciseEntryFormValues[]
}

/** Every top-level field except the exercise list. */
export type StrengthScalarField = Exclude<keyof StrengthFormValues, 'exercises'>

/** Body of `POST /sessions/strength`. */
export interface StrengthSessionPayload {
  title: string | null
  duration_seconds: number | null
  calories: number | null
  date: string
  notes: string | null
  wellbeing: number | null
  rpe: number | null
  exercises: {
    exercise_id: number
    order: number
    sets: {
      set_number: number
      reps: number | null
      weight: number | null
      notes: string | null
      rpe: number | null
      duration_seconds: number | null
    }[]
  }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-set RPE
// ─────────────────────────────────────────────────────────────────────────────

/** Per-set RPE as sent to the API: an integer 1–10, or null when blank or out of range. */
export function parseSetRpe(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null
  const n = parseInt(value, 10)
  return n >= 1 && n <= 10 ? n : null
}

/** True for a blank per-set RPE or one the API accepts (an integer 1–10). */
export function isValidSetRpe(value: string | null | undefined): boolean {
  return !value?.trim() || parseSetRpe(value) !== null
}

export interface InvalidSetRpe {
  exerciseIndex: number
  setIndex: number
  /** "Bench, set 2: RPE "7.5" must be a whole number from 1 to 10." */
  message: string
}

/**
 * The first set whose RPE would not be saved, or null when all are valid.
 * `parseSetRpe` turns an invalid value into null, so without this check it
 * would be dropped silently. Checks values, not inputs: collapsed blocks and
 * workout mode have no mounted RPE input.
 */
export function findInvalidSetRpe(
  exercises: ExerciseEntryFormValues[] | undefined,
  nameOf: (exerciseId: string) => string | undefined,
): InvalidSetRpe | null {
  const list = exercises ?? []
  for (let i = 0; i < list.length; i++) {
    const sets = list[i].sets ?? []
    const j = sets.findIndex((s) => !isValidSetRpe(s.rpe))
    if (j === -1) continue
    const name = nameOf(list[i].exercise_id) ?? `Exercise ${i + 1}`
    return {
      exerciseIndex: i,
      setIndex: j,
      message: `${name}, set ${j + 1}: RPE "${sets[j].rpe.trim()}" must be a whole number from 1 to 10.`,
    }
  }
  return null
}

/** Keeps a typed per-set RPE to digits forming 1–10 ("11" → "1", "0" → ""). */
export function sanitizeRpeInput(value: string): string {
  const digits = value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 2)
  return parseInt(digits, 10) > 10 ? digits.slice(0, 1) : digits
}

// ─────────────────────────────────────────────────────────────────────────────
// Timed sets: reps or a duration
// ─────────────────────────────────────────────────────────────────────────────

/** A set's reps and duration as sent to the API: only the kind it holds, the other null. */
export function setAmounts(s: Partial<Pick<SetFormValues, 'reps' | 'duration'>>): {
  reps: number | null
  duration_seconds: number | null
} {
  const kind = setKind(s)
  return {
    reps: kind === 'reps' && s.reps ? parseInt(s.reps, 10) : null,
    duration_seconds: kind === 'time' ? parseDuration(s.duration) : null,
  }
}

/** True for a blank hold or one the API accepts (1–86400 s, typed as seconds or m:ss). */
export function isValidSetDuration(value: string | null | undefined): boolean {
  return !value?.trim() || parseDuration(value) !== null
}

export interface InvalidSetDuration {
  exerciseIndex: number
  setIndex: number
  /** 'Plank, set 2: time "0" must be 1–86400 seconds (or m:ss).' */
  message: string
}

/**
 * The first set whose time would not be saved, or null when all are valid.
 * `parseDuration` turns an invalid value ("0", "1:3") into null, so without
 * this check the set would be saved empty. Checks values, like findInvalidSetRpe.
 */
export function findInvalidSetDuration(
  exercises: ExerciseEntryFormValues[] | undefined,
  nameOf: (exerciseId: string) => string | undefined,
): InvalidSetDuration | null {
  const list = exercises ?? []
  for (let i = 0; i < list.length; i++) {
    const sets = list[i].sets ?? []
    const j = sets.findIndex((s) => !isValidSetDuration(s.duration))
    if (j === -1) continue
    const name = nameOf(list[i].exercise_id) ?? `Exercise ${i + 1}`
    return {
      exerciseIndex: i,
      setIndex: j,
      message: `${name}, set ${j + 1}: time "${sets[j].duration.trim()}" must be 1–${MAX_SET_DURATION_SECONDS} seconds (or m:ss).`,
    }
  }
  return null
}

/** The first invalid set RPE or time, RPE first: what a save refuses before sending. */
export function findInvalidSet(
  exercises: ExerciseEntryFormValues[] | undefined,
  nameOf: (exerciseId: string) => string | undefined,
): InvalidSetRpe | InvalidSetDuration | null {
  return findInvalidSetRpe(exercises, nameOf) ?? findInvalidSetDuration(exercises, nameOf)
}

/**
 * Sets kept by an entry that now points at an exercise measured in `measure`:
 * the mismatched value is cleared on every set (reps for a timed exercise, a
 * duration for a reps one); weight, notes, RPE and done stay. Returns `sets`
 * itself when nothing changes (unknown measure, or nothing to clear).
 */
export function setsForMeasure(sets: SetFormValues[], measure?: Measure | null): SetFormValues[] {
  if (!measure) return sets
  const field = measure === 'time' ? 'reps' : 'duration'
  return sets.some((s) => s[field]) ? sets.map((s) => (s[field] ? { ...s, [field]: '' } : s)) : sets
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults and template prefill
// ─────────────────────────────────────────────────────────────────────────────

export const emptyStrengthDefaults = (): StrengthFormValues => ({
  title: 'Strength session',
  duration_seconds: null,
  calories: '',
  date: localDateTimeNow(),
  notes: '',
  wellbeing: null,
  rpe: null,
  exercises: [emptyEntry()],
})

/** The form a template prefills; each exercise's sets follow its current measure (see setsForMeasure). */
export function templateToFormValues(t: TemplateSnapshot): StrengthFormValues {
  return {
    title: t.name,
    duration_seconds: null,
    calories: '',
    date: localDateTimeNow(),
    wellbeing: null,
    rpe: null,
    notes: '',
    exercises: t.exercises.map((entry) => ({
      exercise_id: String(entry.exercise_id),
      sets: setsForMeasure(
        entry.sets.map((s) => ({
          reps: s.reps != null ? String(s.reps) : '',
          duration: s.duration_seconds != null ? String(s.duration_seconds) : '',
          weight: s.weight_kg != null ? String(s.weight_kg) : '',
          notes: '',
          rpe: '',
          done: false,
        })),
        entry.measure,
      ),
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Last-session defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `GET /exercises/:id/last-session-defaults`. The server matches the sets to the
 * exercise's current measure (no reps for a timed exercise, no duration for a
 * reps one), so the mappers below copy them as they come.
 */
export interface LastSessionDefaults {
  sets: Array<{
    set_number: number
    reps: number | null
    weight: number | null
    /** Absent in responses cached before timed sets. */
    duration_seconds?: number | null
  }>
}

export function lastSessionToFormSets(data: LastSessionDefaults): SetFormValues[] {
  return data.sets.map((s) => ({
    reps: s.reps !== null ? String(s.reps) : '',
    duration: s.duration_seconds != null ? String(s.duration_seconds) : '',
    weight: s.weight !== null ? String(s.weight) : '',
    notes: '',
    rpe: '',
    done: false,
  }))
}

/**
 * Sets to prefill for an exercise: last session's sets, or one empty set when
 * there is no history or the request fails (same rule as ExerciseEntryBlock).
 */
export async function fetchLastSessionSets(exerciseId: string | number): Promise<SetFormValues[]> {
  try {
    const data = await api.get<LastSessionDefaults>(`/exercises/${exerciseId}/last-session-defaults`)
    return data.sets.length > 0 ? lastSessionToFormSets(data) : [emptySet()]
  } catch {
    return [emptySet()]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Template diff and payloads
// ─────────────────────────────────────────────────────────────────────────────

export function computeDiff(
  snapshot: TemplateSnapshot,
  formData: StrengthFormValues,
  exerciseMap: Map<number, string>,
): string[] {
  const changes: string[] = []
  const tmpl = snapshot.exercises
  const form = formData.exercises
  const len = Math.max(tmpl.length, form.length)

  for (let i = 0; i < len; i++) {
    const te = tmpl[i]
    const fe = form[i]

    if (!te && fe) {
      const name = exerciseMap.get(parseInt(fe.exercise_id, 10)) ?? 'Unknown exercise'
      changes.push(`Added ${name}`)
      continue
    }
    if (te && !fe) {
      changes.push(`Removed ${te.exercise_name}`)
      continue
    }

    const feId = parseInt(fe!.exercise_id, 10)
    if (feId !== te!.exercise_id) {
      const newName = exerciseMap.get(feId) ?? 'Unknown exercise'
      changes.push(`Replaced ${te!.exercise_name} with ${newName}`)
      continue
    }

    const name = te!.exercise_name
    const tSets = te!.sets
    const fSets = fe!.sets

    if (fSets.length !== tSets.length) {
      const diff = fSets.length - tSets.length
      if (diff > 0) {
        changes.push(`Added ${diff} set${diff > 1 ? 's' : ''} to ${name}`)
      } else {
        changes.push(`Removed ${-diff} set${-diff > 1 ? 's' : ''} from ${name}`)
      }
    }

    const minSets = Math.min(tSets.length, fSets.length)
    for (let j = 0; j < minSets; j++) {
      const ts = tSets[j]
      const fs = fSets[j]
      const { reps: fReps, duration_seconds: fDuration } = setAmounts(fs)
      const fWeight = fs.weight ? parseFloat(fs.weight) : null
      if (fReps !== ts.reps) changes.push(`Changed reps on ${name} set ${j + 1}`)
      if (fDuration !== (ts.duration_seconds ?? null)) changes.push(`Changed time on ${name} set ${j + 1}`)
      if (fWeight !== ts.weight_kg) changes.push(`Changed weight on ${name} set ${j + 1}`)
    }
  }

  return changes
}

/** Body of `PATCH /templates/strength/:id` when saving changes back to the template. */
export function toTemplatePayload(data: StrengthFormValues) {
  return {
    exercises: data.exercises.map((entry, i) => ({
      exercise_id: parseInt(entry.exercise_id, 10),
      order: i + 1,
      sets: entry.sets.map((s, si) => ({
        set_number: si + 1,
        ...setAmounts(s),
        weight_kg: s.weight ? parseFloat(s.weight) : null,
      })),
    })),
  }
}

/** The template as it will be after `PATCH`ing it with `data` (keeps id and name). */
export function templateSnapshotFromValues(
  base: TemplateSnapshot,
  data: StrengthFormValues,
  exerciseMap: Map<number, string>,
): TemplateSnapshot {
  return {
    id: base.id,
    name: base.name,
    exercises: toTemplatePayload(data).exercises.map((e) => ({
      ...e,
      exercise_name: exerciseMap.get(e.exercise_id) ?? 'Unknown exercise',
    })),
  }
}

/** Body of `POST /sessions/strength`. Exercises are saved in list order. */
export function buildStrengthPayload(data: StrengthFormValues): StrengthSessionPayload {
  return {
    title: data.title || null,
    duration_seconds: data.duration_seconds ?? null,
    calories: data.calories ? parseInt(data.calories, 10) : null,
    date: datetimeLocalToUTC(data.date),
    notes: data.notes || null,
    wellbeing: data.wellbeing ?? null,
    rpe: data.rpe ?? null,
    exercises: data.exercises.map((entry, i) => ({
      exercise_id: parseInt(entry.exercise_id, 10),
      order: i + 1,
      sets: entry.sets.map((s, si) => ({
        set_number: si + 1,
        ...setAmounts(s),
        weight: s.weight ? parseFloat(s.weight) : null,
        notes: s.notes || null,
        rpe: parseSetRpe(s.rpe),
      })),
    })),
  }
}

/** Input for AdaptSessionModal: chosen exercises with numeric sets. */
export function buildAdaptSnapshot(
  values: Partial<StrengthFormValues>,
  exercises: ExerciseOption[],
  templateName: string | undefined,
) {
  const exerciseMap = new Map(exercises.map((e) => [e.id, e.name]))
  return {
    template_name: templateName,
    exercises: (values.exercises ?? [])
      .filter((e) => e.exercise_id)
      .map((e) => ({
        exercise_id: parseInt(e.exercise_id, 10),
        exercise_name: exerciseMap.get(parseInt(e.exercise_id, 10)) ?? 'Unknown',
        sets: (e.sets ?? []).map((s) => ({
          ...setAmounts(s),
          weight_kg: s.weight ? parseFloat(s.weight) : null,
        })),
      })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Set and exercise list transforms (immutable)
// ─────────────────────────────────────────────────────────────────────────────

type Exercises = ExerciseEntryFormValues[]

function mapSets(exercises: Exercises, exIndex: number, fn: (sets: SetFormValues[]) => SetFormValues[]): Exercises {
  return exercises.map((entry, i) => (i === exIndex ? { ...entry, sets: fn(entry.sets) } : entry))
}

export function updateSet(
  exercises: Exercises,
  exIndex: number,
  setIndex: number,
  patch: Partial<SetFormValues>,
): Exercises {
  return mapSets(exercises, exIndex, (sets) => sets.map((s, i) => (i === setIndex ? { ...s, ...patch } : s)))
}

/** Appends a set with the last set's reps or time, and weight (empty note, not done). */
export function addSet(exercises: Exercises, exIndex: number): Exercises {
  return mapSets(exercises, exIndex, (sets) => {
    const last = sets[sets.length - 1]
    const next = last
      ? { ...emptySet(), reps: last.reps, duration: last.duration ?? '', weight: last.weight }
      : emptySet()
    return [...sets, next]
  })
}

/** Inserts `set` at `setIndex` (clamped to the list), e.g. to undo a delete. */
export function insertSet(
  exercises: Exercises,
  exIndex: number,
  setIndex: number,
  set: SetFormValues = emptySet(),
): Exercises {
  return mapSets(exercises, exIndex, (sets) => {
    const at = Math.max(0, Math.min(setIndex, sets.length))
    return [...sets.slice(0, at), { ...set }, ...sets.slice(at)]
  })
}

/** Removes a set. The last remaining set of an exercise is never removed. */
export function deleteSet(exercises: Exercises, exIndex: number, setIndex: number): Exercises {
  const sets = exercises[exIndex]?.sets
  if (!sets || sets.length <= 1 || setIndex < 0 || setIndex >= sets.length) return exercises
  return mapSets(exercises, exIndex, (s) => s.filter((_, i) => i !== setIndex))
}

export function setSetDone(exercises: Exercises, exIndex: number, setIndex: number, done: boolean): Exercises {
  return updateSet(exercises, exIndex, setIndex, { done })
}

export function addExercise(exercises: Exercises, entry: ExerciseEntryFormValues = emptyEntry()): Exercises {
  return [...exercises, entry]
}

/** Inserts an exercise at `exIndex` (clamped), e.g. to undo a removal. */
export function insertExercise(exercises: Exercises, exIndex: number, entry: ExerciseEntryFormValues): Exercises {
  const at = Math.max(0, Math.min(exIndex, exercises.length))
  return [...exercises.slice(0, at), entry, ...exercises.slice(at)]
}

/** Removes an exercise. The last remaining exercise is never removed. */
export function removeExercise(exercises: Exercises, exIndex: number): Exercises {
  if (exercises.length <= 1 || exIndex < 0 || exIndex >= exercises.length) return exercises
  return exercises.filter((_, i) => i !== exIndex)
}

/**
 * Points an entry at another exercise; keeps its sets unless `sets` is given.
 * Kept sets follow the new exercise's `measure` (see setsForMeasure); given
 * sets are already the new exercise's and stay as they are.
 */
export function replaceExercise(
  exercises: Exercises,
  exIndex: number,
  exerciseId: string,
  sets?: SetFormValues[],
  measure?: Measure | null,
): Exercises {
  return exercises.map((entry, i) =>
    i === exIndex ? { exercise_id: exerciseId, sets: sets ?? setsForMeasure(entry.sets, measure) } : entry,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Draft schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Version 2 adds `version` and `workout`. Version 1 (production before the
 * hook) was `{ ...form values, templateId }` with no version field. Version 3
 * stores session `rpe` on the 1–10 scale; older drafts load with `rpe: null`
 * because their 1–5 values meant the opposite (1 = all-out). All versions load.
 */
export const STRENGTH_DRAFT_VERSION = 3

/** Workout-mode position, persisted with the draft so views can be switched. */
export interface WorkoutModeState {
  currentExerciseIndex: number
  /** Epoch ms when the running rest timer reaches zero; null when no timer runs. */
  restEndsAt: number | null
  /** Epoch ms when workout mode was first opened for this draft. */
  startedAt: number | null
  /** Duration last filled in automatically from `startedAt`; a different value means the user edited it. */
  autoDurationSeconds: number | null
}

export const initialWorkoutModeState = (): WorkoutModeState => ({
  currentExerciseIndex: 0,
  restEndsAt: null,
  startedAt: null,
  autoDurationSeconds: null,
})

export interface StrengthDraft {
  values: StrengthFormValues
  templateId: number | null
  workout: WorkoutModeState
  /** Absent in drafts written before it was stored; readers then infer it from the title. */
  titleTouched?: boolean
}

/** Flat on-disk shape: form values at the top level, so v1 readers still work. */
export function serializeStrengthDraft(draft: StrengthDraft): Record<string, unknown> {
  return {
    version: STRENGTH_DRAFT_VERSION,
    ...draft.values,
    templateId: draft.templateId,
    workout: draft.workout,
    ...(draft.titleTouched === undefined ? {} : { titleTouched: draft.titleTouched }),
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : fallback
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function parseSet(raw: unknown): SetFormValues {
  const s = isRecord(raw) ? raw : {}
  return {
    reps: str(s.reps),
    // Drafts written before timed sets have none: '' (no version bump needed)
    duration: str(s.duration),
    weight: str(s.weight),
    notes: str(s.notes),
    rpe: str(s.rpe),
    done: s.done === true,
  }
}

function parseEntry(raw: unknown): ExerciseEntryFormValues {
  const e = isRecord(raw) ? raw : {}
  return {
    exercise_id: str(e.exercise_id),
    sets: Array.isArray(e.sets) ? e.sets.map(parseSet) : [emptySet()],
  }
}

/**
 * Reads a stored draft (v1–v3). Missing or malformed fields fall back to
 * values that build the same payload the form would have sent; returns null
 * only when the stored value is not an object.
 */
export function parseStrengthDraft(raw: unknown): StrengthDraft | null {
  if (!isRecord(raw)) return null
  const w = isRecord(raw.workout) ? raw.workout : {}
  const index = num(w.currentExerciseIndex)
  const version = num(raw.version) ?? 1
  return {
    values: {
      title: str(raw.title),
      duration_seconds: num(raw.duration_seconds),
      calories: str(raw.calories),
      date: typeof raw.date === 'string' ? raw.date : localDateTimeNow(),
      notes: str(raw.notes),
      wellbeing: num(raw.wellbeing),
      rpe: version >= 3 ? draftSessionRpe(raw.rpe) : null,
      exercises: Array.isArray(raw.exercises) ? raw.exercises.map(parseEntry) : [emptyEntry()],
    },
    templateId: num(raw.templateId),
    ...(typeof raw.titleTouched === 'boolean' ? { titleTouched: raw.titleTouched } : {}),
    workout: {
      currentExerciseIndex: index !== null && index >= 0 ? Math.floor(index) : 0,
      restEndsAt: num(w.restEndsAt),
      startedAt: num(w.startedAt),
      autoDurationSeconds: num(w.autoDurationSeconds),
    },
  }
}

/** "Leg day · 1 Sep, 10:00 · 3 of 4 sets done" — tells the user which draft is waiting. */
export function describeDraft(draft: StrengthDraft): string {
  const { values } = draft
  const parts: string[] = [values.title || 'Untitled session']
  const d = new Date(values.date)
  if (!Number.isNaN(d.getTime())) {
    const month = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[d.getMonth()]
    const pad = (n: number) => String(n).padStart(2, '0')
    parts.push(`${d.getDate()} ${month}, ${pad(d.getHours())}:${pad(d.getMinutes())}`)
  }
  const sets = values.exercises.flatMap((e) => e.sets)
  parts.push(`${sets.filter((s) => s.done).length} of ${sets.length} sets done`)
  return parts.join(' · ')
}

// ─────────────────────────────────────────────────────────────────────────────
// URL parameters
// ─────────────────────────────────────────────────────────────────────────────

/** Query parameters shared by `/log` (strength) and `/workout`. */
export interface StrengthFormParams {
  templateId?: number
  /** datetime-local value used as the initial session date */
  date?: string
  plannedSessionId?: number
  weekStart?: string
  /** `resume=1`: restore the stored draft without asking (view switch, reload). */
  resume?: boolean
}

export function parseStrengthFormParams(params: URLSearchParams): StrengthFormParams {
  const int = (key: string) => {
    const v = params.get(key)
    return v ? parseInt(v, 10) : undefined
  }
  return {
    templateId: int('templateId'),
    date: params.get('date') ?? undefined,
    plannedSessionId: int('plannedSessionId'),
    weekStart: params.get('weekStart') ?? undefined,
    resume: params.get('resume') === '1',
  }
}

/**
 * URL of the strength form (`/log`) or workout mode (`/workout`) for the same
 * session. `resume` makes the target restore the stored draft without asking.
 */
export function strengthViewUrl(
  view: 'log' | 'workout',
  params: StrengthFormParams,
  { resume = false }: { resume?: boolean } = {},
): string {
  const q = new URLSearchParams()
  q.set('type', 'strength')
  if (params.templateId) q.set('templateId', String(params.templateId))
  if (params.date) q.set('date', params.date)
  if (params.plannedSessionId) q.set('plannedSessionId', String(params.plannedSessionId))
  if (params.weekStart) q.set('weekStart', params.weekStart)
  if (resume) q.set('resume', '1')
  return `/${view}?${q.toString()}`
}
