/**
 * Pure helpers for workout mode: progress, which set/exercise is current,
 * "Last time" summaries, rest timer arithmetic and settings, and the entry
 * point choice between `/workout` and `/log`.
 */
import type { ExerciseEntryFormValues, SetFormValues } from '../components/ExerciseEntryBlock'
import { emptySet } from '../components/exerciseEntryDefaults'
import type { LastSessionDefaults } from './strengthSession'

type Exercises = ExerciseEntryFormValues[]

// ─────────────────────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────────────────────

export function exerciseProgress(entry: ExerciseEntryFormValues): { done: number; total: number } {
  return { done: entry.sets.filter((s) => s.done).length, total: entry.sets.length }
}

export function isExerciseDone(entry: ExerciseEntryFormValues): boolean {
  return entry.sets.length > 0 && entry.sets.every((s) => s.done)
}

export function sessionProgress(exercises: Exercises) {
  let doneSets = 0
  let totalSets = 0
  for (const e of exercises) {
    const p = exerciseProgress(e)
    doneSets += p.done
    totalSets += p.total
  }
  return {
    doneSets,
    totalSets,
    doneExercises: exercises.filter(isExerciseDone).length,
    totalExercises: exercises.length,
  }
}

/** Index of the first set not yet done, or -1 when all are done. */
export function currentSetIndex(entry: ExerciseEntryFormValues): number {
  return entry.sets.findIndex((s) => !s.done)
}

/**
 * Next unfinished exercise after `from`, wrapping around to earlier ones;
 * -1 when every other exercise is done.
 */
export function nextUnfinishedIndex(exercises: Exercises, from: number): number {
  const n = exercises.length
  for (let step = 1; step < n; step++) {
    const i = (from + step) % n
    if (!isExerciseDone(exercises[i])) return i
  }
  return -1
}

export const allExercisesDone = (exercises: Exercises): boolean =>
  exercises.length > 0 && exercises.every(isExerciseDone)

/** Keeps a stored index inside the list. */
export const clampIndex = (index: number, length: number): number =>
  Math.max(0, Math.min(index, Math.max(0, length - 1)))

/**
 * Exercise to show after a set of `exIndex` was completed (`exercises`
 * already has it marked done): the same one while it has sets left,
 * otherwise the next unfinished one, or the same one when nothing is left.
 */
export function exerciseAfterCompletion(exercises: Exercises, exIndex: number): number {
  if (!isExerciseDone(exercises[exIndex])) return exIndex
  const next = nextUnfinishedIndex(exercises, exIndex)
  return next === -1 ? exIndex : next
}

/** True for an untouched placeholder entry (no exercise, no values). */
export function isBlankEntry(entry: ExerciseEntryFormValues): boolean {
  return (
    !entry.exercise_id &&
    entry.sets.every((s) => !s.reps && !s.weight && !s.notes && !s.rpe && !s.done)
  )
}

/** Three sets for a newly added exercise, reps and weight from last session when known. */
export function newExerciseSets(defaults: LastSessionDefaults | null | undefined): SetFormValues[] {
  const sets = defaults?.sets ?? []
  return [0, 1, 2].map((i) => {
    const src = sets[i] ?? sets[sets.length - 1]
    return {
      ...emptySet(),
      reps: src?.reps != null ? String(src.reps) : '',
      weight: src?.weight != null ? formatNumber(src.weight) : '',
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Number formatting and steppers
// ─────────────────────────────────────────────────────────────────────────────

/** Drops float noise: 57.49999 → "57.5", 60 → "60". */
export const formatNumber = (n: number): string => String(Math.round(n * 100) / 100)

/** Keeps a typed weight a valid decimal: comma → dot, one dot, digits only ("2.5.5" → "2.55", "." → "0."). */
export function sanitizeDecimal(raw: string): string {
  const cleaned = raw.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const [head, ...rest] = cleaned.split('.')
  const out = rest.length > 0 ? `${head}.${rest.join('')}` : head
  return out.startsWith('.') ? `0${out}` : out
}

/** Adds `delta` to a numeric string field; empty counts as 0; never below 0. */
export function stepValue(value: string, delta: number): string {
  const n = parseFloat(value)
  return formatNumber(Math.max(0, (Number.isFinite(n) ? n : 0) + delta))
}

/** One 10 lb stack plate in kg. */
const STACK_PLATE_KG = 4.5359237

/** Kg printed on the n-th plate of a 10 lb weight stack: 4.5, 9, 14, 18, 23, 27, 32… (0 for n = 0). */
export function stackWeight(n: number): number {
  const kg = n * STACK_PLATE_KG
  return kg < 10 ? Math.round(kg * 2) / 2 : Math.round(kg)
}

/**
 * Moves a weight to the next (+1) or previous (−1) stack value; a weight between
 * plates goes to the nearest one that way (30 → 32 / 27). Empty counts as 0; never below 0.
 */
export function stepWeight(value: string, direction: 1 | -1): string {
  const w = parseFloat(value)
  const current = Number.isFinite(w) ? w : 0
  // Printed values sit within 0.5 kg of n × plate, so these starts bracket the answer
  let n = Math.floor(current / STACK_PLATE_KG)
  if (direction > 0) {
    n = Math.max(1, n - 1)
    while (stackWeight(n) <= current) n++
  } else {
    n += 2
    while (n > 0 && stackWeight(n) >= current) n--
  }
  return formatNumber(stackWeight(n))
}

/** "6 × 100 kg", "8 reps", "– × 60 kg", "8 × 100 kg @8" — one set as a compact label. */
export function formatSet(set: Pick<SetFormValues, 'reps' | 'weight'> & { rpe?: string }): string {
  const reps = set.reps || '–'
  const label = set.weight ? `${reps} × ${set.weight} kg` : `${reps} reps`
  return set.rpe ? `${label} @${set.rpe}` : label
}

/**
 * Last session's sets: "4 × 8 @ 57.5 kg" when every set is the same,
 * otherwise "8×60, 6×65 kg". Null when there is no history.
 */
export function formatLastTime(defaults: LastSessionDefaults | null | undefined): string | null {
  const sets = defaults?.sets ?? []
  if (sets.length === 0) return null
  const uniform = sets.every((s) => s.reps === sets[0].reps && s.weight === sets[0].weight)
  const hasWeight = sets.some((s) => s.weight != null)
  if (uniform) {
    const { reps, weight } = sets[0]
    const base = `${sets.length} × ${reps ?? '–'}`
    return weight != null ? `${base} @ ${formatNumber(weight)} kg` : base
  }
  const parts = sets.map((s) =>
    s.weight != null ? `${s.reps ?? '–'}×${formatNumber(s.weight)}` : `${s.reps ?? '–'}`,
  )
  return hasWeight ? `${parts.join(', ')} kg` : `${parts.join(', ')} reps`
}

// ─────────────────────────────────────────────────────────────────────────────
// Rest timer
// ─────────────────────────────────────────────────────────────────────────────

/** Preset chips; any valid length (see isValidRestLength) can be set from Settings. */
export const REST_LENGTHS = [60, 90, 120, 180] as const
export const DEFAULT_REST_SECONDS = 90
// Same bounds as the API (UserSettingsPatch.rest_seconds)
export const MIN_REST_SECONDS = 15
export const MAX_REST_SECONDS = 600
export const REST_STEP_SECONDS = 5
// This device's rest length (the profile's rest_seconds, or a pick not saved
// there yet), so workout mode has a value at once and offline
const REST_KEY = 'trainlytics_rest_seconds'
// Set while the stored length is a pick the profile doesn't have yet
const REST_UNSYNCED_KEY = 'trainlytics_rest_seconds_unsynced'

/** Whole seconds, 15–600, a multiple of 5. */
export function isValidRestLength(seconds: unknown): seconds is number {
  return (
    typeof seconds === 'number' &&
    Number.isInteger(seconds) &&
    seconds >= MIN_REST_SECONDS &&
    seconds <= MAX_REST_SECONDS &&
    seconds % REST_STEP_SECONDS === 0
  )
}

export const isPresetRestLength = (seconds: number): boolean =>
  (REST_LENGTHS as readonly number[]).includes(seconds)

/** Typed rest length → seconds: "135" or "2:15" → 135; null when it isn't a whole-second time. */
export function parseRestInput(raw: string): number | null {
  const t = raw.trim()
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(t)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  return /^\d{1,4}$/.test(t) ? Number(t) : null
}

/** True for the keys this device's rest length lives under (null: storage was cleared). */
export const isRestStorageKey = (key: string | null): boolean =>
  key === null || key === REST_KEY || key === REST_UNSYNCED_KEY

// Keys whose last write failed (full or blocked storage): from then on memory
// holds their value, since storage may still return an older one
const memoryStore = new Map<string, string | null>()

function readKey(key: string): string | null {
  if (memoryStore.has(key)) return memoryStore.get(key) ?? null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeKey(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
    memoryStore.delete(key)
  } catch {
    memoryStore.set(key, value)
  }
}

/** The stored length when valid, else null (nothing stored on this device). */
export function storedRestLength(): number | null {
  const raw = readKey(REST_KEY)
  const v = raw === null ? NaN : Number(raw)
  return isValidRestLength(v) ? v : null
}

export const loadRestLength = (): number => storedRestLength() ?? DEFAULT_REST_SECONDS

export function saveRestLength(seconds: number): void {
  writeKey(REST_KEY, String(seconds))
}

export const isRestLengthUnsynced = (): boolean => readKey(REST_UNSYNCED_KEY) === '1'

export function setRestLengthUnsynced(unsynced: boolean): void {
  writeKey(REST_UNSYNCED_KEY, unsynced ? '1' : null)
}

/** Forgets this device's rest length (on logout, so the next account starts clean). */
export function clearStoredRestLength(): void {
  writeKey(REST_KEY, null)
  writeKey(REST_UNSYNCED_KEY, null)
}

/** Whole seconds left until `endsAt` (epoch ms), never negative. */
export function restRemaining(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000))
}

/** 90 → "1:30", 5 → "0:05". */
export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Save errors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What to tell the user after a failed save. ApiError carries an HTTP status;
 * anything without one (fetch TypeError) is a network problem.
 */
export function saveErrorMessage(err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status
  const message = err instanceof Error ? err.message : ''
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return `Couldn't save the workout: ${message || `error ${status}`}. It's still kept on this device.`
  }
  if (typeof status === 'number') {
    return `The server couldn't save the workout (error ${status}). It's still kept on this device — try again.`
  }
  return "Couldn't reach the server. Your workout is still kept on this device — check your connection and retry."
}

/** Why saving the rest length to the profile failed. ApiError's message is the API `detail` as text. */
export function restSaveErrorMessage(err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status
  const message = err instanceof Error ? err.message : ''
  if (typeof status === 'number') return `Couldn't save the rest timer: ${message || `error ${status}`}.`
  return "Couldn't reach the server to save the rest timer. Check your connection and try again."
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

/** Workout mode is the default below 768px; checked when the user taps Start. */
export function prefersWorkoutMode(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches
}
