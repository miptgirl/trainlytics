import { describe, it, expect } from 'vitest'
import {
  addExercise,
  addSet,
  buildStrengthPayload,
  deleteSet,
  insertSet,
  parseStrengthDraft,
  parseStrengthFormParams,
  removeExercise,
  replaceExercise,
  serializeStrengthDraft,
  setSetDone,
  updateSet,
  STRENGTH_DRAFT_VERSION,
  type StrengthDraft,
  type StrengthFormValues,
} from '../lib/strengthSession'
import type { ExerciseEntryFormValues } from '../components/ExerciseEntryBlock'

const set = (reps: string, weight: string, notes = '', done = false) => ({ reps, weight, notes, done })

const values: StrengthFormValues = {
  title: 'Leg day',
  duration_seconds: 2700,
  calories: '320',
  date: '2026-09-01T10:00',
  notes: 'Solid',
  wellbeing: 4,
  rpe: 3,
  exercises: [
    { exercise_id: '1', sets: [set('6', '100', 'felt ok', true), set('5', '102.5', 'tough')] },
  ],
}

describe('buildStrengthPayload', () => {
  it('builds the exact POST body the log form sends', () => {
    // Same state and body as the "No, keep template" case in LogWorkoutStrength.test.tsx
    expect(buildStrengthPayload(values)).toEqual({
      title: 'Leg day',
      duration_seconds: 2700,
      calories: 320,
      date: new Date('2026-09-01T10:00').toISOString(),
      notes: 'Solid',
      wellbeing: 4,
      rpe: 3,
      exercises: [
        {
          exercise_id: 1,
          order: 1,
          sets: [
            { set_number: 1, reps: 6, weight: 100, notes: 'felt ok' },
            { set_number: 2, reps: 5, weight: 102.5, notes: 'tough' },
          ],
        },
      ],
    })
  })

  it('maps empty strings to null, ignores `done`, and orders exercises by list position', () => {
    const body = buildStrengthPayload({
      ...values,
      title: '',
      calories: '',
      notes: '',
      duration_seconds: null,
      wellbeing: null,
      rpe: null,
      exercises: [
        { exercise_id: '9', sets: [set('', '', '', true)] },
        { exercise_id: '2', sets: [set('8', '0', '')] },
      ],
    })
    expect(body).toMatchObject({ title: null, calories: null, notes: null, duration_seconds: null })
    expect(body.exercises).toEqual([
      { exercise_id: 9, order: 1, sets: [{ set_number: 1, reps: null, weight: null, notes: null }] },
      // '0' is a non-empty string, so weight 0 is kept
      { exercise_id: 2, order: 2, sets: [{ set_number: 1, reps: 8, weight: 0, notes: null }] },
    ])
  })
})

describe('set and exercise transforms', () => {
  const base: ExerciseEntryFormValues[] = [
    { exercise_id: '1', sets: [set('5', '100'), set('5', '105', 'grind'), set('3', '110')] },
    { exercise_id: '2', sets: [set('10', '40')] },
  ]

  it('deleteSet removes the set at the index without mutating the input', () => {
    const next = deleteSet(base, 0, 1)
    expect(next[0].sets).toEqual([set('5', '100'), set('3', '110')])
    expect(base[0].sets).toHaveLength(3)
    expect(next[1]).toBe(base[1])
  })

  it('deleteSet never removes the last remaining set', () => {
    expect(deleteSet(base, 1, 0)).toBe(base)
    expect(deleteSet(base, 0, 7)).toBe(base)
  })

  it('insertSet puts a set back at its index (undo of delete)', () => {
    const removed = base[0].sets[1]
    const undone = insertSet(deleteSet(base, 0, 1), 0, 1, removed)
    expect(undone).toEqual(base)
  })

  it('insertSet clamps the index and defaults to an empty set', () => {
    expect(insertSet(base, 1, 99)[1].sets).toEqual([set('10', '40'), set('', '')])
    expect(insertSet(base, 1, -3)[1].sets[0]).toEqual(set('', ''))
  })

  it('addSet copies the last set reps and weight, not its note or done flag', () => {
    const done = setSetDone(updateSet(base, 0, 2, { notes: 'last one' }), 0, 2, true)
    const next = addSet(done, 0)
    expect(next[0].sets).toHaveLength(4)
    expect(next[0].sets[3]).toEqual(set('3', '110'))
  })

  it('addSet on an exercise with no sets adds an empty one', () => {
    expect(addSet([{ exercise_id: '1', sets: [] }], 0)[0].sets).toEqual([set('', '')])
  })

  it('setSetDone marks only the target set', () => {
    const next = setSetDone(base, 0, 0, true)
    expect(next[0].sets.map((s) => s.done)).toEqual([true, false, false])
    expect(setSetDone(next, 0, 0, false)[0].sets[0].done).toBe(false)
  })

  it('updateSet patches one field', () => {
    expect(updateSet(base, 1, 0, { reps: '12' })[1].sets[0]).toEqual(set('12', '40'))
  })

  it('addExercise appends; removeExercise keeps at least one', () => {
    const added = addExercise(base, { exercise_id: '3', sets: [set('', ''), set('', ''), set('', '')] })
    expect(added.map((e) => e.exercise_id)).toEqual(['1', '2', '3'])
    expect(removeExercise(added, 0).map((e) => e.exercise_id)).toEqual(['2', '3'])
    const single = [base[0]]
    expect(removeExercise(single, 0)).toBe(single)
  })

  it('replaceExercise keeps sets unless new ones are given', () => {
    expect(replaceExercise(base, 1, '5')[1]).toEqual({ exercise_id: '5', sets: base[1].sets })
    expect(replaceExercise(base, 1, '5', [set('1', '1')])[1].sets).toEqual([set('1', '1')])
  })
})

describe('strength draft schema', () => {
  const draft: StrengthDraft = {
    values,
    templateId: 3,
    workout: { currentExerciseIndex: 1, restEndsAt: 1_790_000_000_000, startedAt: 1_789_999_000_000 },
  }

  it('round-trips through JSON', () => {
    const stored = JSON.parse(JSON.stringify(serializeStrengthDraft(draft)))
    expect(stored.version).toBe(STRENGTH_DRAFT_VERSION)
    expect(parseStrengthDraft(stored)).toEqual(draft)
  })

  it('stays flat so a v1 reader still finds the form values at the top level', () => {
    const stored = serializeStrengthDraft(draft)
    expect(stored).toMatchObject({ title: 'Leg day', exercises: values.exercises, templateId: 3 })
  })

  it('loads a v1 draft written by the pre-hook form', () => {
    const v1 = {
      title: 'Old draft',
      duration_seconds: 1800,
      calories: '',
      date: '2026-08-30T18:00',
      notes: 'from yesterday',
      wellbeing: 2,
      rpe: null,
      exercises: [{ exercise_id: '2', sets: [{ reps: '10', weight: '50', notes: '', done: true }] }],
      templateId: null,
    }
    const parsed = parseStrengthDraft(v1)!
    expect(parsed.values).toStrictEqual({
      title: 'Old draft',
      duration_seconds: 1800,
      calories: '',
      date: '2026-08-30T18:00',
      notes: 'from yesterday',
      wellbeing: 2,
      rpe: null,
      exercises: [{ exercise_id: '2', sets: [{ reps: '10', weight: '50', notes: '', done: true }] }],
    })
    expect(parsed.templateId).toBeNull()
    expect(parsed.workout).toEqual({ currentExerciseIndex: 0, restEndsAt: null, startedAt: null })
  })

  it('fills fields missing from partial or older drafts', () => {
    const parsed = parseStrengthDraft({
      title: 'Partial',
      exercises: [{ exercise_id: 4, sets: [{ reps: 8 }] }, { exercise_id: '5' }],
      workout: { currentExerciseIndex: -2, restEndsAt: 'soon' },
    })!
    expect(parsed.values.exercises).toEqual([
      { exercise_id: '4', sets: [set('8', '')] },
      { exercise_id: '5', sets: [set('', '')] },
    ])
    expect(parsed.values).toMatchObject({ calories: '', notes: '', wellbeing: null, rpe: null, duration_seconds: null })
    expect(typeof parsed.values.date).toBe('string')
    expect(parsed.templateId).toBeNull()
    expect(parsed.workout).toEqual({ currentExerciseIndex: 0, restEndsAt: null, startedAt: null })
    // Builds the same body the pre-hook form would have sent for these values
    expect(buildStrengthPayload({ ...parsed.values, date: '2026-01-01T00:00' })).toMatchObject({
      title: 'Partial',
      calories: null,
      notes: null,
    })
  })

  it('keeps an empty exercise list as-is', () => {
    expect(parseStrengthDraft({ title: 'Stale', exercises: [] })!.values.exercises).toEqual([])
  })

  it('rejects non-object values', () => {
    expect(parseStrengthDraft(null)).toBeNull()
    expect(parseStrengthDraft('draft')).toBeNull()
    expect(parseStrengthDraft([1, 2])).toBeNull()
  })
})

describe('parseStrengthFormParams', () => {
  it('reads the strength form query params', () => {
    expect(
      parseStrengthFormParams(
        new URLSearchParams('type=strength&templateId=3&date=2026-09-01T10:00&plannedSessionId=12&weekStart=2026-08-31'),
      ),
    ).toEqual({ templateId: 3, date: '2026-09-01T10:00', plannedSessionId: 12, weekStart: '2026-08-31' })
    expect(parseStrengthFormParams(new URLSearchParams(''))).toEqual({
      templateId: undefined,
      date: undefined,
      plannedSessionId: undefined,
      weekStart: undefined,
    })
  })
})
