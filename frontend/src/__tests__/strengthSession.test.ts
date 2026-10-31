import { describe, it, expect } from 'vitest'
import {
  addExercise,
  addSet,
  buildAdaptSnapshot,
  buildStrengthPayload,
  deleteSet,
  insertSet,
  insertExercise,
  describeDraft,
  computeDiff,
  findInvalidSet,
  findInvalidSetDuration,
  findInvalidSetRpe,
  inputKind,
  isValidSetDuration,
  isValidSetRpe,
  parseDuration,
  setKind,
  setRepsOrDuration,
  templateToFormValues,
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

const set = (reps: string, weight: string, notes = '', done = false, rpe = '', duration = '') => ({
  reps,
  duration,
  weight,
  notes,
  rpe,
  done,
})

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
            { set_number: 1, reps: 6, weight: 100, notes: 'felt ok', rpe: null, duration_seconds: null },
            { set_number: 2, reps: 5, weight: 102.5, notes: 'tough', rpe: null, duration_seconds: null },
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
      { exercise_id: 9, order: 1, sets: [{ set_number: 1, reps: null, weight: null, notes: null, rpe: null, duration_seconds: null }] },
      // '0' is a non-empty string, so weight 0 is kept
      { exercise_id: 2, order: 2, sets: [{ set_number: 1, reps: 8, weight: 0, notes: null, rpe: null, duration_seconds: null }] },
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
    expect(findInvalidSetRpe(exercises, (id) => names.get(id))).toEqual({
      exerciseIndex: 1,
      setIndex: 1,
      message: 'Bench, set 2: RPE "7.5" must be a whole number from 1 to 10.',
    })
    expect(findInvalidSetRpe(exercises.slice(0, 1), () => undefined)).toBeNull()
    expect(findInvalidSetRpe(undefined, () => undefined)).toBeNull()
  })

  it('stays out of templates: not saved to them and not a template change', () => {
    const snapshot = {
      id: 3,
      name: 'Leg day',
      exercises: [
        { exercise_id: 1, exercise_name: 'Squat', order: 1, sets: [{ set_number: 1, reps: 5, weight_kg: 100, duration_seconds: null }] },
      ],
    }
    const form = { ...values, exercises: [{ exercise_id: '1', sets: [set('5', '100', '', true, '9')] }] }
    expect(toTemplatePayload(form).exercises[0].sets[0]).not.toHaveProperty('rpe')
    expect(computeDiff(snapshot, form, new Map([[1, 'Squat']]))).toEqual([])
  })

  it('keeps set notes out of templates: not prefilled, not saved, not a template change', () => {
    // A response from before notes were dropped still carries them; they are ignored
    const legacySet = { set_number: 1, reps: 5, weight_kg: 100, notes: 'go slow' }
    const snapshot = {
      id: 3,
      name: 'Leg day',
      exercises: [{ exercise_id: 1, exercise_name: 'Squat', order: 1, sets: [legacySet] }],
    }
    expect(templateToFormValues(snapshot).exercises[0].sets[0].notes).toBe('')
    const form = { ...values, exercises: [{ exercise_id: '1', sets: [set('5', '100', 'felt heavy')] }] }
    expect(toTemplatePayload(form).exercises[0].sets[0]).not.toHaveProperty('notes')
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

describe('timed sets', () => {
  const hold = (duration: string, weight = '', notes = '', done = false, rpe = '') =>
    set('', weight, notes, done, rpe, duration)
  const plankSnapshot = {
    id: 3,
    name: 'Core',
    exercises: [
      {
        exercise_id: 7,
        exercise_name: 'Plank',
        order: 1,
        sets: [
          { set_number: 1, reps: null, weight_kg: null, duration_seconds: 45 },
          { set_number: 2, reps: null, weight_kg: null, duration_seconds: 45 },
        ],
      },
    ],
  }

  it('parseDuration reads whole seconds or m:ss, 1 s to a day', () => {
    expect(parseDuration('90')).toBe(90)
    expect(parseDuration(' 1:30 ')).toBe(90)
    expect(parseDuration('45')).toBe(45)
    expect(parseDuration('86400')).toBe(86400)
    expect(parseDuration('1440:00')).toBe(86400)
    for (const bad of ['', '  ', '0', '0:00', '1:3', '1:60', '90000', '86401', '45s', '1.5', '-5', ':30', undefined, null]) {
      expect(parseDuration(bad)).toBeNull()
    }
    expect(isValidSetDuration('')).toBe(true)
    expect(isValidSetDuration('1:30')).toBe(true)
    expect(isValidSetDuration('0')).toBe(false)
  })

  it('a draft written before timed sets loads with the time empty, no version bump', () => {
    const parsed = parseStrengthDraft({
      version: STRENGTH_DRAFT_VERSION,
      title: 'Old',
      exercises: [{ exercise_id: '1', sets: [{ reps: '5', weight: '100', notes: '', rpe: '', done: false }] }],
    })!
    expect(parsed.values.exercises[0].sets[0]).toEqual(set('5', '100'))
    const timed = parseStrengthDraft({ title: 'New', exercises: [{ exercise_id: '7', sets: [{ duration: '1:30' }] }] })!
    expect(timed.values.exercises[0].sets[0].duration).toBe('1:30')
  })

  it('payloads send whole seconds or null, and never reps and a time together', () => {
    const form: StrengthFormValues = {
      ...values,
      exercises: [{ exercise_id: '7', sets: [hold('45'), hold('1:30', '10', '', true, '8'), set('', '')] }],
    }
    expect(buildStrengthPayload(form).exercises[0].sets).toEqual([
      { set_number: 1, reps: null, duration_seconds: 45, weight: null, notes: null, rpe: null },
      { set_number: 2, reps: null, duration_seconds: 90, weight: 10, notes: null, rpe: 8 },
      { set_number: 3, reps: null, duration_seconds: null, weight: null, notes: null, rpe: null },
    ])
    expect(toTemplatePayload(form).exercises[0].sets).toEqual([
      { set_number: 1, reps: null, duration_seconds: 45, weight_kg: null },
      { set_number: 2, reps: null, duration_seconds: 90, weight_kg: 10 },
      { set_number: 3, reps: null, duration_seconds: null, weight_kg: null },
    ])
    expect(buildAdaptSnapshot(form, [{ id: 7, name: 'Plank' }], 'Core').exercises[0].sets[0]).toEqual({
      reps: null,
      duration_seconds: 45,
      weight_kg: null,
    })
    // A hand-edited draft holding both reads as timed; only the time is sent
    const both = { ...values, exercises: [{ exercise_id: '7', sets: [set('10', '', '', false, '', '45')] }] }
    expect(buildStrengthPayload(both).exercises[0].sets[0]).toMatchObject({ reps: null, duration_seconds: 45 })
  })

  it('template prefill carries the planned time', () => {
    expect(templateToFormValues(plankSnapshot).exercises[0].sets).toEqual([hold('45'), hold('45')])
  })

  it('addSet copies the last set\'s time, not its note, RPE or done flag', () => {
    const list: ExerciseEntryFormValues[] = [{ exercise_id: '7', sets: [hold('60', '20', 'shaky', true, '9')] }]
    expect(addSet(list, 0)[0].sets[1]).toEqual(hold('60', '20'))
  })

  it('reports a changed time against the template, and none for the same time typed as m:ss', () => {
    const form = { ...values, exercises: [{ exercise_id: '7', sets: [hold('0:45'), hold('60')] }] }
    expect(computeDiff(plankSnapshot, form, new Map([[7, 'Plank']]))).toEqual(['Changed time on Plank set 2'])
  })

  it('flags a time that would not be saved, naming exercise and set', () => {
    const exercises: ExerciseEntryFormValues[] = [
      { exercise_id: '1', sets: [set('5', '100')] },
      { exercise_id: '7', sets: [hold('45'), hold('0')] },
    ]
    const names = new Map([['7', 'Plank']])
    expect(findInvalidSetDuration(exercises, (id) => names.get(id))).toEqual({
      exerciseIndex: 1,
      setIndex: 1,
      message: 'Plank, set 2: time "0" must be 1–86400 seconds (or m:ss).',
    })
    expect(findInvalidSetDuration([{ exercise_id: '7', sets: [hold('1:3')] }], () => undefined)?.message).toBe(
      'Exercise 1, set 1: time "1:3" must be 1–86400 seconds (or m:ss).',
    )
    expect(findInvalidSetDuration(exercises.slice(0, 1), () => undefined)).toBeNull()
    // RPE is checked first, then time
    const both = [{ exercise_id: '7', sets: [hold('0', '', '', false, '11')] }]
    expect(findInvalidSet(both, () => 'Plank')?.message).toMatch(/RPE "11"/)
    expect(findInvalidSet([{ exercise_id: '7', sets: [hold('0')] }], () => 'Plank')?.message).toMatch(/time "0"/)
  })

  it('a set shows the input for the value it holds, else its exercise\'s measure', () => {
    expect(setKind(hold('45'))).toBe('time')
    expect(setKind(set('8', ''))).toBe('reps')
    expect(setKind(set('', '20'))).toBeNull()
    expect(inputKind(set('', ''), 'time')).toBe('time')
    expect(inputKind(set('', ''), undefined)).toBe('reps')
    // Logged while the exercise was timed, opened after it went back to reps
    expect(inputKind(hold('45'), 'reps')).toBe('time')
    expect(inputKind(set('8', ''), 'time')).toBe('reps')
  })

  it('editing reps clears the time and editing the time clears reps', () => {
    const list: ExerciseEntryFormValues[] = [{ exercise_id: '7', sets: [hold('45', '20')] }]
    const asReps = updateSet(list, 0, 0, setRepsOrDuration('reps', '8'))
    expect(asReps[0].sets[0]).toEqual(set('8', '20'))
    expect(updateSet(asReps, 0, 0, setRepsOrDuration('time', '30'))[0].sets[0]).toEqual(hold('30', '20'))
  })

  it('replaceExercise with the other measure clears the mismatched value and keeps weight, notes, RPE and done', () => {
    const list: ExerciseEntryFormValues[] = [
      { exercise_id: '2', sets: [set('8', '60', 'easy', true, '7'), set('8', '60')] },
    ]
    const plank = replaceExercise(list, 0, '7', undefined, 'time')
    expect(plank[0]).toEqual({ exercise_id: '7', sets: [set('', '60', 'easy', true, '7'), set('', '60')] })
    const back = replaceExercise([{ exercise_id: '7', sets: [hold('45', '', 'n', true, '8')] }], 0, '2', undefined, 'reps')
    expect(back[0].sets).toEqual([set('', '', 'n', true, '8')])
    // Same measure, unknown measure, or sets given for the new exercise: untouched
    expect(replaceExercise(list, 0, '1', undefined, 'reps')[0].sets).toBe(list[0].sets)
    expect(replaceExercise(list, 0, '1')[0].sets).toBe(list[0].sets)
    expect(replaceExercise(list, 0, '7', [hold('45')], 'time')[0].sets).toEqual([hold('45')])
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

  it.each([7.5, 0, 11, '8', null])('loads a v3 session rpe of %s as null (not an integer 1–10)', (rpe) => {
    const v3: Record<string, unknown> = { ...serializeStrengthDraft(draft), rpe }
    expect(parseStrengthDraft(v3)!.values.rpe).toBeNull()
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
      // Drafts written before per-set RPE and timed sets load with those fields empty
      exercises: [{ exercise_id: '2', sets: [{ reps: '10', duration: '', weight: '50', notes: '', rpe: '', done: true }] }],
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
