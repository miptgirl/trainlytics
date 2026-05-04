/**
 * unitUtils.ts
 * Cardio unit conversion helpers.
 * The backend stores durations in seconds, distances in metres, and pace in
 * seconds-per-km.  The UI presents minutes, kilometres, and min/km.
 */

/** Convert seconds → decimal minutes. */
export function secondsToMins(seconds: number): number {
  return seconds / 60
}

/** Convert metres → kilometres. */
export function metresToKm(metres: number): number {
  return metres / 1000
}

/**
 * Format seconds-per-km as a "M:SS /km" display string.
 * e.g. 360 → "6:00 /km"
 */
export function secPerKmToMinPerKm(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')} /km`
}

/** Convert decimal minutes → seconds (rounded). */
export function minsToSeconds(mins: number): number {
  return Math.round(mins * 60)
}

/** Convert kilometres → metres. */
export function kmToMetres(km: number): number {
  return km * 1000
}

/**
 * Convert decimal min/km → seconds/km (rounded).
 * e.g. 6.5 → 390
 */
export function minPerKmToSecPerKm(minPerKm: number): number {
  return Math.round(minPerKm * 60)
}
