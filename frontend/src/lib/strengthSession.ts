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
  notes: string | null
}

export interface TemplateExercise {
  exercise_id: number
  exercise_name: string
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
    }[]
  }[]
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
      sets: entry.sets.map((s) => ({
        reps: s.reps != null ? String(s.reps) : '',
        weight: s.weight_kg != null ? String(s.weight_kg) : '',
        notes: s.notes ?? '',
        rpe: '',
        done: false,
      })),
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Last-session defaults
// ─────────────────────────────────────────────────────────────────────────────

export interface LastSessionDefaults {
  sets: Array<{ set_number: number; reps: number | null; weight: number | null }>
}

/** Reps and weight only: a set's RPE describes how that set felt, so it is never carried over. */
export function lastSessionToFormSets(data: LastSessionDefaults): SetFormValues[] {
  return data.sets.map((s) => ({
    ...emptySet(),
    reps: s.reps !== null ? String(s.reps) : '',
    weight: s.weight !== null ? String(s.weight) : '',
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
// Set RPE
// ─────────────────────────────────────────────────────────────────────────────

/** A set's RPE field as a number; null when empty or not a number. */
export function parseSetRpe(value: string): number | null {
  if (!value.trim()) return null
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** True for '' or 1–10 in half steps (what the API accepts). */
export function isValidSetRpe(value: string): boolean {
  if (!value.trim()) return true
  const n = parseSetRpe(value)
  return n !== null && n >= 1 && n <= 10 && Number.isInteger(n * 2)
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
      const fReps = fs.reps ? parseInt(fs.reps, 10) : null
      const fWeight = fs.weight ? parseFloat(fs.weight) : null
      const fNotes = fs.notes || null
      if (fReps !== ts.reps) changes.push(`Changed reps on ${name} set ${j + 1}`)
      if (fWeight !== ts.weight_kg) changes.push(`Changed weight on ${name} set ${j + 1}`)
      if (fNotes !== ts.notes) changes.push(`Changed notes on ${name} set ${j + 1}`)
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
        reps: s.reps ? parseInt(s.reps, 10) : null,
        weight_kg: s.weight ? parseFloat(s.weight) : null,
        notes: s.notes || null,
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
        reps: s.reps ? parseInt(s.reps, 10) : null,
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
          reps: s.reps ? parseInt(s.reps, 10) : null,
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

/** Appends a set with the last set's reps and weight (empty note, not done). */
export function addSet(exercises: Exercises, exIndex: number): Exercises {
  return mapSets(exercises, exIndex, (sets) => {
    const last = sets[sets.length - 1]
    const next = last ? { ...emptySet(), reps: last.reps, weight: last.weight } : emptySet()
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

/** Points an entry at another exercise; keeps its sets unless `sets` is given. */
export function replaceExercise(
  exercises: Exercises,
  exIndex: number,
  exerciseId: string,
  sets?: SetFormValues[],
): Exercises {
  return exercises.map((entry, i) =>
    i === exIndex ? { exercise_id: exerciseId, sets: sets ?? entry.sets } : entry,
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
  return { reps: str(s.reps), weight: str(s.weight), notes: str(s.notes), rpe: str(s.rpe), done: s.done === true }
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
      rpe: version >= 3 ? num(raw.rpe) : null,
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
