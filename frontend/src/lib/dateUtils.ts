/**
 * Formats a Date as "YYYY-MM-DD" in the user's local timezone.
 * Use this instead of toISOString().slice(0,10) which uses UTC and can
 * return the wrong date for users in UTC+ timezones.
 */
export function toLocalDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Formats a "YYYY-MM-DD" date string as "Sun, 4 Oct" (no timezone shift).
 */
export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  // Fixed names: en-GB renders September as "Sept"
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
  return `${weekday}, ${d.getDate()} ${month}`
}

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

/** Returns the Monday of the local week containing `d` as "YYYY-MM-DD". */
export function getMondayOf(d: Date): string {
  const day = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return toLocalDateStr(monday)
}

/** Returns the Monday of the current local week as "YYYY-MM-DD". */
export function getMondayOfCurrentWeek(): string {
  return getMondayOf(new Date())
}
