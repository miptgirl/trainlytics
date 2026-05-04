/**
 * TimeInput.tsx
 *
 * A controlled text input that accepts and displays time values in human-readable
 * format:
 *   - format="duration"  →  h:mm:ss  or  m:ss   (e.g. "1:05:30", "45:00")
 *   - format="pace"      →  m:ss per km          (e.g. "5:30")
 *
 * The canonical value passed in and emitted is always **seconds** (integer).
 * A null value means "empty / not set".
 *
 * On blur the text is parsed; if invalid an inline error message is shown and
 * onChange(null) is called.  During editing the raw text is never touched.
 */

import { useEffect, useRef, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — exported so they can be unit-tested independently
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeInputProps {
  /** Canonical value in seconds; null means empty. */
  value: number | null
  onChange: (seconds: number | null) => void
  format: 'duration' | 'pace'
  placeholder?: string
  required?: boolean
  className?: string
  id?: string
}

export function TimeInput({
  value,
  onChange,
  format,
  placeholder,
  required,
  className,
  id,
}: TimeInputProps) {
  const [display, setDisplay] = useState<string>(
    value != null ? formatSeconds(value, format) : '',
  )
  const [error, setError] = useState<string>('')
  const focused = useRef(false)

  // Sync display when value changes externally (e.g. initial load of existing data).
  // We skip this while the user is focused so we don't clobber their in-progress edit.
  useEffect(() => {
    if (!focused.current) {
      setDisplay(value != null ? formatSeconds(value, format) : '')
      setError('')
    }
  }, [value, format])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDisplay(e.target.value)
    // Clear the error while the user is actively correcting the value
    setError('')
  }

  function handleFocus() {
    focused.current = true
  }

  function handleBlur() {
    focused.current = false

    const trimmed = display.trim()

    if (!trimmed) {
      // Empty field — valid (means "no value")
      onChange(null)
      setError('')
      return
    }

    const parsed = parseTimeString(trimmed)
    if (parsed === null) {
      setError('Enter a valid time — e.g. 1:30:00 or 5:30')
      onChange(null)
    } else {
      // Normalise the display to the canonical format
      setDisplay(formatSeconds(parsed, format))
      setError('')
      onChange(parsed)
    }
  }

  const baseClass =
    'w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const borderClass = error ? 'border-red-400' : 'border-gray-300'

  return (
    <div>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={display}
        placeholder={placeholder ?? (format === 'pace' ? 'm:ss' : 'h:mm:ss')}
        required={required}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={className ?? `${baseClass} ${borderClass}`}
      />
      {error && <p className="mt-0.5 text-xs text-red-600">{error}</p>}
    </div>
  )
}
