/**
 * Format a seconds value as a display string.
 *
 * duration: ≥ 1 h → "h:mm:ss", otherwise "m:ss"
 * pace:     always "m:ss"
 */
export function formatSeconds(seconds: number, format: 'duration' | 'pace'): string {
  const s = Math.round(seconds)
  if (format === 'pace' || s < 3600) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}

/**
 * Parse a time string into seconds.
 *
 * Accepts:
 *   "m:ss"      e.g. "5:30"  → 330
 *   "h:mm:ss"   e.g. "1:05:30" → 3930
 *
 * Returns null if the string doesn't match a valid pattern.
 */
export function parseTimeString(s: string): number | null {
  const trimmed = s.trim()
  if (!trimmed) return null

  // h:mm:ss
  const hms = trimmed.match(/^(\d+):([0-5]\d):([0-5]\d)$/)
  if (hms) {
    return parseInt(hms[1], 10) * 3600 + parseInt(hms[2], 10) * 60 + parseInt(hms[3], 10)
  }

  // m:ss
  const ms = trimmed.match(/^(\d+):([0-5]\d)$/)
  if (ms) {
    return parseInt(ms[1], 10) * 60 + parseInt(ms[2], 10)
  }

  return null
}
