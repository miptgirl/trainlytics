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

/** A machine weight stack: a top plate, then equal plates. `plates` counts every position, top plate included. */
export type StackScale = { kind: 'stack'; top_lb: number; plate_lb: number; plates?: number | null }

/** Fixed kg steps for barbells and dumbbells. */
export type IncrementScale = { kind: 'increment'; step_kg: number }

/** An exercise's weight steps; null on the exercise means the default 10 lb stack. */
export type WeightScale = StackScale | IncrementScale

const LB_KG = 0.45359237
const DEFAULT_STACK: StackScale = { kind: 'stack', top_lb: 10, plate_lb: 10, plates: null }
// Far above any real load; keeps the stack's position search finite for absurd typed values
const MAX_STACK_KG = 1_000_000

/** Kg printed on the n-th position of a weight stack: 4.5, 9, 14, 18, 23, 27… for the default (0 for n = 0). */
export function stackWeight(n: number, scale: StackScale = DEFAULT_STACK): number {
  if (n <= 0) return 0
  const kg = (scale.top_lb + (n - 1) * scale.plate_lb) * LB_KG
  return kg < 10 ? Math.round(kg * 2) / 2 : Math.round(kg)
}

/**
 * Highest position (0 = no plate, at most `max`) whose printed weight is at most `kg`.
 * The estimate is the exact position; printed values sit within 0.5 kg of it, so with
 * plates of at least 1 lb (≥ 0.45 kg) each correction loop runs at most about 3 times.
 * `kg` is clamped to MAX_STACK_KG and `max` is `plates`, so the search is bounded either way.
 */
function stackIndexAtOrBelow(kg: number, scale: StackScale, max: number): number {
  const topKg = scale.top_lb * LB_KG
  const plateKg = scale.plate_lb * LB_KG
  let n = kg < topKg ? 0 : Math.min(Math.floor((kg - topKg) / plateKg) + 1, max)
  while (n > 0 && stackWeight(n, scale) > kg) n--
  while (n < max && stackWeight(n + 1, scale) <= kg) n++
  return n
}

/** Next (+1) or previous (−1) printed value of a stack; with `plates` set, never past the last position. */
function stepStack(current: number, direction: 1 | -1, scale: StackScale): number {
  const kg = Math.min(current, MAX_STACK_KG)
  const top = scale.plates ?? Infinity
  const at = stackIndexAtOrBelow(kg, scale, top)
  if (direction > 0) return stackWeight(Math.min(at + 1, top), scale)
  let n = Math.min(at, top)
  while (n > 0 && stackWeight(n, scale) >= kg) n--
  return stackWeight(n, scale)
}

/** Next (+1) or previous (−1) multiple of `step`; an off-grid value snaps to the nearest multiple that way. */
function stepIncrement(current: number, direction: 1 | -1, step: number): number {
  const q = current / step
  // Within float noise of a multiple, so 0.3 / 0.1 (2.9999999999999996) counts as on the grid
  const grid = Math.round(q)
  const exact = Math.abs(q - grid) < 1e-9 ? grid : q
  const k = direction > 0 ? Math.floor(exact) + 1 : Math.ceil(exact) - 1
  return Math.max(0, k * step)
}

/**
 * Moves a weight to the next (+1) or previous (−1) step of the exercise's weight
 * scale (default: the 10 lb stack). A weight between steps goes to the nearest one
 * in that direction (30 → 32 / 27 on the default stack). Empty counts as 0; never below 0.
 */
export function stepWeight(value: string, direction: 1 | -1, scale?: WeightScale | null): string {
  const w = parseFloat(value)
  const current = Number.isFinite(w) ? w : 0
  if (scale?.kind === 'increment') return formatNumber(stepIncrement(current, direction, scale.step_kg))
  return formatNumber(stepStack(current, direction, scale ?? DEFAULT_STACK))
}

/** "6 × 100 kg", "8 reps", "– × 60 kg" — one set as a compact label. */
export function formatSet(set: Pick<SetFormValues, 'reps' | 'weight'>): string {
  const reps = set.reps || '–'
  return set.weight ? `${reps} × ${set.weight} kg` : `${reps} reps`
}

// Advance widths (em) of Montserrat Bold, the widest weight the set values use,
// measured with canvas measureText in Chromium and rounded up. The dot also
// carries its worst kerning, 0.01em on each side ("8.8" is 0.02em wider than
// its glyphs). Anything else counts as the widest digit.
const BOLD_ADVANCE_EM: Record<string, number> = {
  '0': 0.68, '1': 0.4, '2': 0.59, '3': 0.6, '4': 0.69, '5': 0.6, '6': 0.64, '7': 0.62, '8': 0.66, '9': 0.64,
  '.': 0.29, '×': 0.6, '–': 0.5,
}
const WIDEST_EM = 0.69

/** Upper bound of the rendered width (px) of a set value ("102.5", "8×60") in Montserrat Bold at `px`. */
export function boldTextWidth(text: string, px: number): number {
  let em = 0
  for (const ch of text) em += BOLD_ADVANCE_EM[ch] ?? WIDEST_EM
  return em * px
}

/** One set's reps and weight, as typed in the form (strings) or as the API returns them (numbers). */
export interface SetValues {
  reps: number | string | null
  weight: number | string | null
}

/** A value as shown: numbers without float noise, typed text as typed, '' when missing. */
function shown(value: number | string | null): string {
  if (value === null) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? formatNumber(value) : ''
  return value.trim()
}

/** A set tab's value: "8×60", "12" without a weight, "–" for missing reps ("–×60"). */
export function formatSetShort(set: SetValues): string {
  const reps = shown(set.reps) || '–'
  const weight = shown(set.weight)
  return weight ? `${reps}×${weight}` : reps
}

/**
 * Sets in order, for "Last time" and "Today": "8×60, 8×60, 6×65 kg", or
 * "12, 10, 8 reps" when no set has a weight. In a weighted list a set without
 * one shows "10×–", so it never reads as 10 kg. Null for no sets.
 */
export function formatSetList(sets: readonly SetValues[]): string | null {
  if (sets.length === 0) return null
  const weighted = sets.some((s) => shown(s.weight) !== '')
  const parts = sets.map((s) => (weighted && !shown(s.weight) ? `${shown(s.reps) || '–'}×–` : formatSetShort(s)))
  return `${parts.join(', ')} ${weighted ? 'kg' : 'reps'}`
}

/** Last session's sets ("8×60, 8×60, 6×65 kg"); null when there is no history. */
export function formatLastTime(defaults: LastSessionDefaults | null | undefined): string | null {
  return formatSetList(defaults?.sets ?? [])
}

/** Screen-reader name of a set tab: "Set 2 of 4, 8 × 60 kg, RPE 7, done". */
export function setTabLabel(set: SetFormValues, setNumber: number, total: number): string {
  const parts = [`Set ${setNumber} of ${total}`, formatSet({ reps: set.reps, weight: set.weight })]
  if (set.rpe) parts.push(`RPE ${set.rpe}`)
  if (set.done) parts.push('done')
  return parts.join(', ')
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Second line of a "Choose exercise" row: today's sets and what is left once
 * a set is done ("Today: 8×60, 8×60 kg · 2 sets left"), otherwise last
 * session ("Last time: …"), otherwise the planned count ("3 sets"). An
 * exercise whose sets were all deleted says "No sets", as the dock does.
 */
export function exerciseSummary(
  entry: ExerciseEntryFormValues,
  last: LastSessionDefaults | null | undefined,
): string {
  if (entry.sets.length === 0) return 'No sets'
  const done = entry.sets.filter((s) => s.done)
  if (done.length > 0) {
    const left = entry.sets.length - done.length
    return `Today: ${formatSetList(done)}${left > 0 ? ` · ${plural(left, 'set left', 'sets left')}` : ''}`
  }
  const lastTime = formatLastTime(last)
  return lastTime ? `Last time: ${lastTime}` : plural(entry.sets.length, 'set', 'sets')
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
