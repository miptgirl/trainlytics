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
  return !entry.exercise_id && entry.sets.every((s) => !s.reps && !s.weight && !s.notes && !s.done)
}

/** Three sets for a newly added exercise, reps taken from last session when known. */
export function newExerciseSets(defaults: LastSessionDefaults | null | undefined): SetFormValues[] {
  return [0, 1, 2].map((i) => {
    const reps = defaults?.sets[i]?.reps ?? defaults?.sets[defaults.sets.length - 1]?.reps ?? null
    return { ...emptySet(), reps: reps != null ? String(reps) : '' }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Number formatting and steppers
// ─────────────────────────────────────────────────────────────────────────────

/** Drops float noise: 57.49999 → "57.5", 60 → "60". */
export const formatNumber = (n: number): string => String(Math.round(n * 100) / 100)

/** Adds `delta` to a numeric string field; empty counts as 0; never below 0. */
export function stepValue(value: string, delta: number): string {
  const n = parseFloat(value)
  return formatNumber(Math.max(0, (Number.isFinite(n) ? n : 0) + delta))
}

/** "6 × 100 kg", "8 reps", "– × 60 kg" — one set as a compact label. */
export function formatSet(set: Pick<SetFormValues, 'reps' | 'weight'>): string {
  const reps = set.reps || '–'
  return set.weight ? `${reps} × ${set.weight} kg` : `${reps} reps`
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

export const REST_LENGTHS = [60, 90, 120, 180] as const
export const DEFAULT_REST_SECONDS = 90
const REST_KEY = 'trainlytics_rest_seconds'

export function loadRestLength(): number {
  try {
    const v = Number(localStorage.getItem(REST_KEY))
    return (REST_LENGTHS as readonly number[]).includes(v) ? v : DEFAULT_REST_SECONDS
  } catch {
    return DEFAULT_REST_SECONDS
  }
}

export function saveRestLength(seconds: number): void {
  try {
    localStorage.setItem(REST_KEY, String(seconds))
  } catch {
    // ignore
  }
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
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

/** Workout mode is the default below 768px; checked when the user taps Start. */
export function prefersWorkoutMode(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches
}
