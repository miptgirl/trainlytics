import { describe, it, expect } from 'vitest'
import { formatStrengthSession, formatCardioSession } from '../lib/exportUtils'
import type { StrengthSession, CardioSession } from '../lib/exportUtils'

// ── Strength ─────────────────────────────────────────────────────────────────

const baseStrength: StrengthSession = {
  type: 'strength',
  date: '2026-05-10T00:00:00Z',
  title: 'Push Day',
  duration_seconds: 3600,
  calories: 450,
  notes: 'Felt strong today.',
  exercises: [
    {
      exercise_name: 'Bench Press',
      sets: [
        { set_number: 1, reps: 8, weight: 80 },
        { set_number: 2, reps: 6, weight: 82.5 },
      ],
    },
  ],
}

describe('formatStrengthSession', () => {
  it('includes title as H2 heading', () => {
    const result = formatStrengthSession(baseStrength)
    expect(result).toContain('## Push Day –')
  })

  it('falls back to capitalised type when no title', () => {
    const result = formatStrengthSession({ ...baseStrength, title: null })
    expect(result).toContain('## Strength –')
  })

  it('includes type, duration and calories in summary line', () => {
    const result = formatStrengthSession(baseStrength)
    expect(result).toContain('Type: Strength | Duration: 60 min | Calories: 450 kcal')
  })

  it('omits duration from summary when null', () => {
    const result = formatStrengthSession({ ...baseStrength, duration_seconds: null })
    expect(result).toContain('Type: Strength | Calories: 450 kcal')
    expect(result).not.toContain('Duration')
  })

  it('omits calories from summary when null', () => {
    const result = formatStrengthSession({ ...baseStrength, calories: null })
    expect(result).toContain('Type: Strength | Duration: 60 min')
    expect(result).not.toContain('Calories')
  })

  it('renders exercise as H3 with set bullet lines', () => {
    const result = formatStrengthSession(baseStrength)
    expect(result).toContain('### Bench Press')
    expect(result).toContain('- Set 1: 80 kg × 8')
    expect(result).toContain('- Set 2: 82.5 kg × 6')
  })

  it('formats multiple exercises separated by blank lines', () => {
    const session: StrengthSession = {
      ...baseStrength,
      exercises: [
        {
          exercise_name: 'Squat',
          sets: [
            { set_number: 1, reps: 5, weight: 100 },
            { set_number: 2, reps: 5, weight: 105 },
          ],
        },
        {
          exercise_name: 'Deadlift',
          sets: [{ set_number: 1, reps: 3, weight: 140 }],
        },
      ],
    }
    const result = formatStrengthSession(session)
    expect(result).toContain('### Squat')
    expect(result).toContain('### Deadlift')
    expect(result).toContain('- Set 1: 100 kg × 5')
    expect(result).toContain('- Set 2: 105 kg × 5')
    expect(result).toContain('- Set 1: 140 kg × 3')
    // blank line separates sections
    expect(result).toContain('\n\n### Deadlift')
  })

  it('renders — for null set weight', () => {
    const session: StrengthSession = {
      ...baseStrength,
      exercises: [{ exercise_name: 'Row', sets: [{ set_number: 1, reps: 10, weight: null }] }],
    }
    expect(formatStrengthSession(session)).toContain('- Set 1: — × 10')
  })

  it('renders — for null set reps', () => {
    const session: StrengthSession = {
      ...baseStrength,
      exercises: [{ exercise_name: 'Row', sets: [{ set_number: 1, reps: null, weight: 50 }] }],
    }
    expect(formatStrengthSession(session)).toContain('- Set 1: 50 kg × —')
  })

  it('renders — for both null reps and weight', () => {
    const session: StrengthSession = {
      ...baseStrength,
      exercises: [{ exercise_name: 'Row', sets: [{ set_number: 1, reps: null, weight: null }] }],
    }
    expect(formatStrengthSession(session)).toContain('- Set 1: — × —')
  })

  it('includes notes at the end', () => {
    const result = formatStrengthSession(baseStrength)
    expect(result).toContain('Notes: Felt strong today.')
    // notes must come after the exercises
    const notesIdx = result.indexOf('Notes:')
    const exerciseIdx = result.indexOf('### Bench Press')
    expect(notesIdx).toBeGreaterThan(exerciseIdx)
  })

  it('omits notes line when null', () => {
    const result = formatStrengthSession({ ...baseStrength, notes: null })
    expect(result).not.toContain('Notes:')
  })
})

// ── Cardio ────────────────────────────────────────────────────────────────────

const baseCardio: CardioSession = {
  title: 'Morning Run',
  total_duration_seconds: 2700,
  date: '2026-05-10T00:00:00Z',
  notes: 'Good conditions.',
  calories: 350,
  segments: [
    {
      order: 1,
      title: 'Warm-up walk',
      duration_seconds: 600,
      distance_meters: 1000,
      pace_seconds_per_km: 600,
    },
    {
      order: 2,
      title: 'Main run',
      duration_seconds: 2100,
      distance_meters: 7000,
      pace_seconds_per_km: 300,
    },
  ],
}

describe('formatCardioSession', () => {
  it('includes title as H2 heading', () => {
    const result = formatCardioSession(baseCardio, 'Run')
    expect(result).toContain('## Morning Run –')
  })

  it('falls back to typeName in heading when no title', () => {
    const result = formatCardioSession({ ...baseCardio, title: null }, 'Cycling')
    expect(result).toContain('## Cycling –')
  })

  it('falls back to "Cardio" when no title and no typeName', () => {
    const result = formatCardioSession({ ...baseCardio, title: null })
    expect(result).toContain('## Cardio –')
  })

  it('includes type, duration, total distance and calories in summary line', () => {
    const result = formatCardioSession(baseCardio, 'Run')
    expect(result).toContain('Type: Run | Duration: 45 min | Distance: 8.00 km | Calories: 350 kcal')
  })

  it('omits distance from summary when all segments have no distance', () => {
    const session: CardioSession = {
      ...baseCardio,
      segments: [{ order: 1, title: null, duration_seconds: 600, distance_meters: null, pace_seconds_per_km: null }],
    }
    const result = formatCardioSession(session, 'Run')
    expect(result).not.toContain('Distance:')
  })

  it('omits calories from summary when null', () => {
    const result = formatCardioSession({ ...baseCardio, calories: null }, 'Run')
    expect(result).not.toContain('Calories')
  })

  it('uses total_duration_seconds when set', () => {
    // total_duration_seconds = 2700 = 45 min, regardless of segment sum
    const result = formatCardioSession(baseCardio, 'Run')
    expect(result).toContain('Duration: 45 min')
  })

  it('sums segment durations when total_duration_seconds is null', () => {
    const session: CardioSession = {
      ...baseCardio,
      total_duration_seconds: null,
      segments: [
        { order: 1, title: null, duration_seconds: 600, distance_meters: null, pace_seconds_per_km: null },
        { order: 2, title: null, duration_seconds: 1200, distance_meters: null, pace_seconds_per_km: null },
      ],
    }
    const result = formatCardioSession(session, 'Run')
    expect(result).toContain('Duration: 30 min')
  })

  it('renders named segments as H3 with title', () => {
    const result = formatCardioSession(baseCardio, 'Run')
    expect(result).toContain('### Segment 1: Warm-up walk')
    expect(result).toContain('### Segment 2: Main run')
  })

  it('renders unnamed segments as "Segment N" without colon', () => {
    const session: CardioSession = {
      ...baseCardio,
      segments: [
        { order: 1, title: null, duration_seconds: 1800, distance_meters: 5000, pace_seconds_per_km: 360 },
      ],
    }
    const result = formatCardioSession(session, 'Run')
    expect(result).toContain('### Segment 1\n')
    expect(result).not.toContain('### Segment 1:')
  })

  it('formats segment distance, duration and pace', () => {
    const result = formatCardioSession(baseCardio, 'Run')
    expect(result).toContain('Distance: 1.00 km')
    expect(result).toContain('Duration: 10:00')
    expect(result).toContain('Pace: 10:00 min/km')
    expect(result).toContain('Distance: 7.00 km')
    expect(result).toContain('Duration: 35:00')
    expect(result).toContain('Pace: 5:00 min/km')
  })

  it('omits segment distance and pace when null', () => {
    const session: CardioSession = {
      ...baseCardio,
      segments: [
        { order: 1, title: 'Interval', duration_seconds: 600, distance_meters: null, pace_seconds_per_km: null },
      ],
    }
    const result = formatCardioSession(session, 'Run')
    expect(result).not.toContain('Distance:')
    expect(result).not.toContain('Pace:')
    expect(result).toContain('Duration: 10:00')
  })

  it('includes notes at the end', () => {
    const result = formatCardioSession(baseCardio, 'Run')
    expect(result).toContain('Notes: Good conditions.')
    const notesIdx = result.indexOf('Notes:')
    const segIdx = result.indexOf('### Segment')
    expect(notesIdx).toBeGreaterThan(segIdx)
  })

  it('omits notes line when null', () => {
    const result = formatCardioSession({ ...baseCardio, notes: null }, 'Run')
    expect(result).not.toContain('Notes:')
  })
})
