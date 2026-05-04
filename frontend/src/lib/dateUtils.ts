/**
 * Returns the current local date/time as a value suitable for
 * <input type="datetime-local"> (format: "YYYY-MM-DDTHH:MM").
 */
export function localDateTimeNow(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}`
  )
}

/**
 * Converts a UTC ISO 8601 datetime string (from the API) into a
 * datetime-local input value in the user's local timezone.
 */
export function toDatetimeLocal(isoString: string): string {
  const d = new Date(isoString)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

/**
 * Converts a datetime-local string (local time) to a UTC ISO 8601 string
 * for sending to the API.
 */
export function datetimeLocalToUTC(val: string): string {
  return new Date(val).toISOString()
}

/**
 * Formats a UTC ISO 8601 datetime string as "4 May 2026 · 07:30"
 * using the user's local timezone.
 */
export function formatSessionDateTime(isoString: string): string {
  const d = new Date(isoString)
  const date = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${date} · ${time}`
}
