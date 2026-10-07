import { describe, it, expect } from 'vitest'
import {
  addExercise,
  addSet,
  buildStrengthPayload,
  deleteSet,
  insertSet,
  insertExercise,
  describeDraft,
  computeDiff,
  invalidSetRpeMessage,
  isValidSetRpe,
  toTemplatePayload,
  parseSetRpe,
  parseStrengthDraft,
  parseStrengthFormParams,
  sanitizeRpeInput,
  strengthViewUrl,
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

const set = (reps: string, weight: string, notes = '', done = false, rpe = '') => ({ reps, weight, notes, rpe, done })

const values: StrengthFormValues = {
  title: 'Leg day',
  duration_seconds: 2700,
  calories: '320',
  date: '2026-09-01T10:00',
  notes: 'Solid',
  wellbeing: 4,
  rpe: 6,
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
      rpe: 6,
      exercises: [
        {
          exercise_id: 1,
          order: 1,
          sets: [
            { set_number: 1, reps: 6, weight: 100, notes: 'felt ok', rpe: null },
            { set_number: 2, reps: 5, weight: 102.5, notes: 'tough', rpe: null },
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
      { exercise_id: 9, order: 1, sets: [{ set_number: 1, reps: null, weight: null, notes: null, rpe: null }] },
      // '0' is a non-empty string, so weight 0 is kept
      { exercise_id: 2, order: 2, sets: [{ set_number: 1, reps: 8, weight: 0, notes: null, rpe: null }] },
    ])
  })
})

describe('per-set RPE', () => {
  it('sends an integer 1–10 or null in the POST body', () => {
    const body = buildStrengthPayload({
      ...values,
      exercises: [
        {
          exercise_id: '1',
          sets: [set('5', '100', '', true, '8'), set('5', '100', '', true, ''), set('5', '100', '', true, '10')],
        },
      ],
    })
    expect(body.exercises[0].sets.map((s) => s.rpe)).toEqual([8, null, 10])
  })

  it('parseSetRpe accepts only whole numbers in range', () => {
    expect(parseSetRpe('7')).toBe(7)
    expect(parseSetRpe(' 9 ')).toBe(9)
    expect(parseSetRpe('')).toBeNull()
    expect(parseSetRpe('0')).toBeNull()
    expect(parseSetRpe('11')).toBeNull()
    expect(parseSetRpe('7.5')).toBeNull()
    expect(parseSetRpe(undefined)).toBeNull()
  })

  it('sanitizeRpeInput keeps typed values to digits forming 1–10', () => {
    expect(sanitizeRpeInput('8')).toBe('8')
    expect(sanitizeRpeInput('10')).toBe('10')
    expect(sanitizeRpeInput('11')).toBe('1')
    expect(sanitizeRpeInput('0')).toBe('')
    expect(sanitizeRpeInput('7.5')).toBe('7')
    expect(sanitizeRpeInput('a9')).toBe('9')
  })

  it('flags a set RPE that would not be saved, naming exercise and set', () => {
    for (const ok of ['', ' ', '1', '8', '10']) expect(isValidSetRpe(ok)).toBe(true)
    for (const bad of ['0', '11', '7.5', 'x']) expect(isValidSetRpe(bad)).toBe(false)
    const exercises: ExerciseEntryFormValues[] = [
      { exercise_id: '1', sets: [set('5', '100', '', true, '8')] },
      { exercise_id: '2', sets: [set('8', '60'), set('8', '60', '', false, '7.5')] },
    ]
    const names = new Map([['2', 'Bench']])
    expect(invalidSetRpeMessage(exercises, (id) => names.get(id))).toBe(
      'Bench, set 2: RPE "7.5" must be a whole number from 1 to 10.',
    )
    expect(invalidSetRpeMessage(exercises.slice(0, 1), () => undefined)).toBeNull()
  })

  it('stays out of templates: not saved to them and not a template change', () => {
    const snapshot = {
      id: 3,
      name: 'Leg day',
      exercises: [
        { exercise_id: 1, exercise_name: 'Squat', order: 1, sets: [{ set_number: 1, reps: 5, weight_kg: 100, notes: null }] },
      ],
    }
    const form = { ...values, exercises: [{ exercise_id: '1', sets: [set('5', '100', '', true, '9')] }] }
    expect(toTemplatePayload(form).exercises[0].sets[0]).not.toHaveProperty('rpe')
    expect(computeDiff(snapshot, form, new Map([[1, 'Squat']]))).toEqual([])
  })

  it('addSet does not copy RPE from the previous set', () => {
    const list: ExerciseEntryFormValues[] = [{ exercise_id: '1', sets: [set('5', '100', '', true, '9')] }]
    expect(addSet(list, 0)[0].sets[1]).toEqual(set('5', '100'))
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
    workout: { currentExerciseIndex: 1, restEndsAt: 1_790_000_000_000, startedAt: 1_789_999_000_000, autoDurationSeconds: 1200 },
  }

  it('round-trips through JSON', () => {
    const stored = JSON.parse(JSON.stringify(serializeStrengthDraft(draft)))
    expect(stored.version).toBe(STRENGTH_DRAFT_VERSION)
    expect(parseStrengthDraft(stored)).toEqual(draft)
  })

  it('is version 3', () => {
    expect(STRENGTH_DRAFT_VERSION).toBe(3)
  })

  it('drops session rpe from a v2 draft (old inverted 1–5 scale)', () => {
    const v2 = { ...serializeStrengthDraft(draft), version: 2, rpe: 1 }
    const parsed = parseStrengthDraft(v2)!
    expect(parsed.values.rpe).toBeNull()
    // Everything else still loads
    expect(parsed.values.wellbeing).toBe(4)
    expect(parsed.templateId).toBe(3)
  })

  it('drops session rpe from a v1 draft with no version field', () => {
    const v1: Record<string, unknown> = { ...serializeStrengthDraft(draft), rpe: 5 }
    delete v1.version
    expect(parseStrengthDraft(v1)!.values.rpe).toBeNull()
  })

  it('keeps session rpe from a v3 draft', () => {
    const v3: Record<string, unknown> = { ...serializeStrengthDraft(draft), rpe: 8 }
    expect(v3.version).toBe(3)
    expect(parseStrengthDraft(v3)!.values.rpe).toBe(8)
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
      // Drafts written before per-set RPE load with the field empty
      exercises: [{ exercise_id: '2', sets: [{ reps: '10', weight: '50', notes: '', rpe: '', done: true }] }],
    })
    expect(parsed.templateId).toBeNull()
    expect(parsed.workout).toEqual({ currentExerciseIndex: 0, restEndsAt: null, startedAt: null, autoDurationSeconds: null })
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
    expect(parsed.workout).toEqual({ currentExerciseIndex: 0, restEndsAt: null, startedAt: null, autoDurationSeconds: null })
    // Builds the same body the pre-hook form would have sent for these values
    expect(buildStrengthPayload({ ...parsed.values, date: '2026-01-01T00:00' })).toMatchObject({
      title: 'Partial',
      calories: null,
      notes: null,
    })
  })

  it('reads per-set rpe from a draft and leaves it empty when the draft predates it', () => {
    const parsed = parseStrengthDraft({
      title: 'Mixed',
      exercises: [
        { exercise_id: '1', sets: [{ reps: '5', weight: '100', rpe: '8', done: true }, { reps: '5', weight: '100' }] },
      ],
    })!
    expect(parsed.values.exercises[0].sets.map((s) => s.rpe)).toEqual(['8', ''])
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

describe('parseStrengthFormParams / strengthViewUrl', () => {
  it('reads the strength form query params', () => {
    expect(
      parseStrengthFormParams(
        new URLSearchParams('type=strength&templateId=3&date=2026-09-01T10:00&plannedSessionId=12&weekStart=2026-08-31&resume=1'),
      ),
    ).toEqual({ templateId: 3, date: '2026-09-01T10:00', plannedSessionId: 12, weekStart: '2026-08-31', resume: true })
    expect(parseStrengthFormParams(new URLSearchParams(''))).toEqual({
      templateId: undefined,
      date: undefined,
      plannedSessionId: undefined,
      weekStart: undefined,
      resume: false,
    })
  })

  it('builds the URL of the other view with the same params', () => {
    const params = parseStrengthFormParams(new URLSearchParams('type=strength&templateId=3&date=2026-09-01T10:00'))
    expect(strengthViewUrl('workout', params, { resume: true })).toBe(
      '/workout?type=strength&templateId=3&date=2026-09-01T10%3A00&resume=1',
    )
    expect(strengthViewUrl('log', { ...params, resume: true })).toBe(
      '/log?type=strength&templateId=3&date=2026-09-01T10%3A00',
    )
  })
})

describe('insertExercise / describeDraft', () => {
  it('puts a removed exercise back at its index', () => {
    const list = [{ exercise_id: '1', sets: [] }, { exercise_id: '3', sets: [] }]
    expect(insertExercise(list, 1, { exercise_id: '2', sets: [] }).map((e) => e.exercise_id)).toEqual(['1', '2', '3'])
    expect(insertExercise(list, 9, { exercise_id: '4', sets: [] }).map((e) => e.exercise_id)).toEqual(['1', '3', '4'])
  })

  it('describes which draft is waiting', () => {
    const draft = parseStrengthDraft({
      title: '',
      date: '2026-09-01T07:05',
      exercises: [{ exercise_id: '1', sets: [set('5', '1', '', true), set('5', '1')] }],
    })!
    expect(describeDraft(draft)).toBe('Untitled session · 1 Sep, 07:05 · 1 of 2 sets done')
  })
})
