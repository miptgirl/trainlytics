import { metresToKm } from './unitUtils'

export interface StrengthSet {
  set_number: number
  reps: number | null
  weight: number | null
}

export interface StrengthExerciseEntry {
  exercise_name: string
  sets: StrengthSet[]
}

export interface StrengthSession {
  type: string
  date: string
  title: string | null
  duration_seconds: number | null
  calories: number | null
  notes: string | null
  exercises: StrengthExerciseEntry[]
}

export interface CardioSegment {
  order: number
  title: string | null
  duration_seconds: number
  distance_meters: number | null
  pace_seconds_per_km: number | null
}

export interface CardioSession {
  title: string | null
  total_duration_seconds: number | null
  date: string
  notes: string | null
  calories: number | null
  segments: CardioSegment[]
}

function formatExportDate(isoString: string): string {
  const d = new Date(isoString)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    ` ${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

function formatSegmentDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatExportPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')} min/km`
}

export function formatStrengthSession(session: StrengthSession): string {
  const heading = session.title ?? (session.type.charAt(0).toUpperCase() + session.type.slice(1))

  const sections: string[] = []

  const summaryParts = ['Type: Strength']
  if (session.duration_seconds != null) {
    summaryParts.push(`Duration: ${Math.round(session.duration_seconds / 60)} min`)
  }
  if (session.calories != null) {
    summaryParts.push(`Calories: ${session.calories} kcal`)
  }
  sections.push(`## ${heading} – ${formatExportDate(session.date)}\n${summaryParts.join(' | ')}`)

  for (const entry of session.exercises) {
    const lines = [`### ${entry.exercise_name}`]
    for (const set of entry.sets) {
      const w = set.weight != null ? `${set.weight} kg` : '—'
      const r = set.reps != null ? String(set.reps) : '—'
      lines.push(`- Set ${set.set_number}: ${w} × ${r}`)
    }
    sections.push(lines.join('\n'))
  }

  if (session.notes) {
    sections.push(`Notes: ${session.notes}`)
  }

  return sections.join('\n\n')
}

export function formatCardioSession(session: CardioSession, typeName?: string): string {
  const type = typeName ?? 'Cardio'
  const heading = session.title ?? type

  const sections: string[] = []

  const totalDuration =
    session.total_duration_seconds ??
    session.segments.reduce((sum, s) => sum + s.duration_seconds, 0)
  const totalDistance = session.segments.reduce((sum, s) => sum + (s.distance_meters ?? 0), 0)

  const summaryParts = [`Type: ${type}`]
  summaryParts.push(`Duration: ${Math.round(totalDuration / 60)} min`)
  if (totalDistance > 0) {
    summaryParts.push(`Distance: ${metresToKm(totalDistance).toFixed(2)} km`)
  }
  if (session.calories != null) {
    summaryParts.push(`Calories: ${session.calories} kcal`)
  }
  sections.push(`## ${heading} – ${formatExportDate(session.date)}\n${summaryParts.join(' | ')}`)

  for (let i = 0; i < session.segments.length; i++) {
    const seg = session.segments[i]
    const label = seg.title ? `Segment ${i + 1}: ${seg.title}` : `Segment ${i + 1}`
    const segParts: string[] = []
    if (seg.distance_meters != null) {
      segParts.push(`Distance: ${metresToKm(seg.distance_meters).toFixed(2)} km`)
    }
    segParts.push(`Duration: ${formatSegmentDuration(seg.duration_seconds)}`)
    if (seg.pace_seconds_per_km != null) {
      segParts.push(`Pace: ${formatExportPace(seg.pace_seconds_per_km)}`)
    }
    sections.push(`### ${label}\n- ${segParts.join(' | ')}`)
  }

  if (session.notes) {
    sections.push(`Notes: ${session.notes}`)
  }

  return sections.join('\n\n')
}
