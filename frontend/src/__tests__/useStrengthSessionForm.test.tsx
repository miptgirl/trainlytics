import { act, renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { api } from '../lib/api'
import {
  STRENGTH_AUTOSAVE_MS,
  useStrengthSessionForm,
  type UseStrengthSessionFormOptions,
} from '../lib/hooks/useStrengthSessionForm'
import { STRENGTH_DRAFT_VERSION } from '../lib/strengthSession'

const mockGet = vi.mocked(api.get)
const mockPost = vi.mocked(api.post)
const mockPatch = vi.mocked(api.patch)

const DRAFT_KEY = 'trainlytics_draft_strength'
const storedDraft = () => {
  const raw = localStorage.getItem(DRAFT_KEY)
  return raw === null ? null : JSON.parse(raw)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const set = (reps: string, weight: string, notes = '', done = false) => ({ reps, weight, notes, done })

const legDay = {
  id: 3,
  name: 'Leg day',
  exercises: [
    {
      exercise_id: 1,
      exercise_name: 'Squat',
      order: 1,
      sets: [
        { set_number: 1, reps: 5, weight_kg: 100, notes: null },
        { set_number: 2, reps: 5, weight_kg: 102.5, notes: 'tough' },
      ],
    },
  ],
}

function setup(url: string, options: UseStrengthSessionFormOptions = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    </QueryClientProvider>
  )
  const hook = renderHook(() => useStrengthSessionForm({ autosaveMs: 20, ...options }), { wrapper })
  return Object.assign(hook, { qc })
}

async function setupWithTemplate(options: UseStrengthSessionFormOptions = {}) {
  const hook = setup('/workout?templateId=3&date=2026-09-01T10:00', options)
  await waitFor(() => expect(hook.result.current.templateSnapshot).not.toBeNull())
  await waitFor(() => expect(hook.result.current.values.exercises[0].exercise_id).toBe('1'))
  return hook
}

beforeEach(() => {
  localStorage.clear()
  mockGet.mockReset()
  mockPost.mockReset()
  mockPatch.mockReset()
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/exercises') return [{ id: 1, name: 'Squat' }, { id: 2, name: 'Bench' }] as never
    if (path === '/templates/strength/3') return legDay as never
    if (path === '/exercises/2/last-session-defaults') {
      return { sets: [{ set_number: 1, reps: 8, weight: 60 }, { set_number: 2, reps: 6, weight: 65 }] } as never
    }
    if (path.endsWith('/last-session-defaults')) return { sets: [] } as never
    return [] as never
  })
  mockPost.mockResolvedValue({ id: 42 } as never)
})

describe('useStrengthSessionForm: payload parity', () => {
  it('actions build the same POST body as the full form for the same input', async () => {
    const onSaved = vi.fn()
    const { result } = await setupWithTemplate({ onSaved })

    act(() => {
      result.current.updateSet(0, 0, { reps: '6', notes: 'felt ok' })
      result.current.setSetDone(0, 0)
      result.current.setField('wellbeing', 4)
      result.current.setField('rpe', 3)
      result.current.setField('calories', '320')
      result.current.setField('notes', 'Solid')
      result.current.setField('duration_seconds', 2700)
    })

    // Same state and body as the "No, keep template" case in LogWorkoutStrength.test.tsx
    const expected = {
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
    }
    expect(result.current.buildPayload()).toEqual(expected)

    await act(() => result.current.submit())
    expect(result.current.diffState?.changes).toEqual([
      'Changed reps on Squat set 1',
      'Changed notes on Squat set 1',
    ])
    expect(mockPost).not.toHaveBeenCalled()

    act(() => result.current.keepTemplate())
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(42))
    expect(mockPost).toHaveBeenCalledWith('/sessions/strength', expected)
    expect(mockPatch).not.toHaveBeenCalled()
  })

  it('posts without a diff prompt when the session matches the template', async () => {
    const onSaved = vi.fn()
    const { result } = await setupWithTemplate({ onSaved })
    act(() => result.current.setSetDone(0, 1))
    await act(() => result.current.submit())
    expect(result.current.diffState).toBeNull()
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(42))
  })
})

describe('useStrengthSessionForm: actions', () => {
  it('deleteSet returns the removed set and insertSet restores it at its index', async () => {
    const { result } = await setupWithTemplate()
    let removed: ReturnType<typeof result.current.deleteSet> = null
    act(() => {
      removed = result.current.deleteSet(0, 0)
    })
    expect(removed).toEqual(set('5', '100'))
    expect(result.current.values.exercises[0].sets).toEqual([set('5', '102.5', 'tough')])

    act(() => result.current.insertSet(0, 0, removed!))
    expect(result.current.values.exercises[0].sets).toEqual([set('5', '100'), set('5', '102.5', 'tough')])
  })

  it('deleteSet refuses to remove the last remaining set', async () => {
    const { result } = await setupWithTemplate()
    act(() => {
      result.current.deleteSet(0, 1)
    })
    let removed: ReturnType<typeof result.current.deleteSet> = set('x', 'x')
    act(() => {
      removed = result.current.deleteSet(0, 0)
    })
    expect(removed).toBeNull()
    expect(result.current.values.exercises[0].sets).toEqual([set('5', '100')])
  })

  it('addSet copies the last set; setSetDone toggles done', async () => {
    const { result } = await setupWithTemplate()
    act(() => result.current.setSetDone(0, 1))
    act(() => result.current.addSet(0))
    expect(result.current.values.exercises[0].sets).toEqual([
      set('5', '100'),
      set('5', '102.5', 'tough', true),
      set('5', '102.5'),
    ])
    act(() => result.current.setSetDone(0, 1, false))
    expect(result.current.values.exercises[0].sets[1].done).toBe(false)
  })

  it('adds, replaces, prefills and removes exercises', async () => {
    const { result } = await setupWithTemplate()
    act(() => result.current.addExercise({ exercise_id: '2', sets: [set('', ''), set('', ''), set('', '')] }))
    expect(result.current.values.exercises.map((e) => e.exercise_id)).toEqual(['1', '2'])
    expect(result.current.values.exercises[1].sets).toHaveLength(3)

    await act(() => result.current.prefillFromLastSession(1))
    expect(result.current.values.exercises[1].sets).toEqual([set('8', '60'), set('6', '65')])

    act(() => result.current.replaceExercise(1, '1'))
    expect(result.current.values.exercises[1]).toEqual({ exercise_id: '1', sets: [set('8', '60'), set('6', '65')] })
    await act(() => result.current.prefillFromLastSession(1))
    expect(result.current.values.exercises[1].sets).toEqual([set('', '')])

    act(() => result.current.removeExercise(0))
    act(() => result.current.removeExercise(0))
    expect(result.current.values.exercises).toHaveLength(1)
  })
})

describe('useStrengthSessionForm: draft', () => {
  it('uses an autosave delay of at most 500ms', () => {
    expect(STRENGTH_AUTOSAVE_MS).toBeLessThanOrEqual(500)
  })

  it('does not create a draft from the template prefill alone', async () => {
    await setupWithTemplate()
    await act(() => sleep(60))
    expect(storedDraft()).toBeNull()
  })

  it('autosaves every change, including workout-mode position, in the v2 format', async () => {
    const { result } = await setupWithTemplate()
    act(() => result.current.updateSet(0, 0, { reps: '7' }))
    await waitFor(() => expect(storedDraft()?.exercises?.[0]?.sets?.[0]?.reps).toBe('7'))
    expect(storedDraft()).toMatchObject({ version: STRENGTH_DRAFT_VERSION, templateId: 3, title: 'Leg day' })

    // Reverting to the template values is still a change worth saving
    act(() => result.current.updateSet(0, 0, { reps: '5' }))
    await waitFor(() => expect(storedDraft().exercises[0].sets[0].reps).toBe('5'))

    act(() => result.current.updateWorkout({ currentExerciseIndex: 0, restEndsAt: 1_790_000_090_000 }))
    await waitFor(() => expect(storedDraft().workout).toEqual({
      currentExerciseIndex: 0,
      restEndsAt: 1_790_000_090_000,
      startedAt: null,
      autoDurationSeconds: null,
    }))
  })

  it('writes with the default delay within 500ms', async () => {
    const { result } = setup('/workout', { autosaveMs: undefined })
    act(() => result.current.setField('notes', 'quick'))
    await waitFor(() => expect(storedDraft()?.notes).toBe('quick'), { timeout: 500 })
  })

  it('restores a v1 draft written by the pre-hook form', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        title: 'Old draft',
        duration_seconds: null,
        calories: '250',
        date: '2026-08-30T18:00',
        notes: '',
        wellbeing: null,
        rpe: 5,
        exercises: [{ exercise_id: '2', sets: [{ reps: '10', weight: '50', notes: '', done: true }] }],
        templateId: 3,
      }),
    )
    const { result } = setup('/log?type=strength')
    expect(result.current.pendingDraft).not.toBeNull()

    await act(() => result.current.restoreDraft())
    expect(result.current.pendingDraft).toBeNull()
    expect(result.current.selectedTemplateId).toBe(3)
    expect(result.current.templateSnapshot?.name).toBe('Leg day')
    expect(result.current.titleTouched).toBe(true)
    expect(result.current.workout).toEqual({ currentExerciseIndex: 0, restEndsAt: null, startedAt: null, autoDurationSeconds: null })
    expect(result.current.buildPayload()).toEqual({
      title: 'Old draft',
      duration_seconds: null,
      calories: 250,
      date: new Date('2026-08-30T18:00').toISOString(),
      notes: null,
      wellbeing: null,
      rpe: 5,
      exercises: [
        { exercise_id: 2, order: 1, sets: [{ set_number: 1, reps: 10, weight: 50, notes: null }] },
      ],
    })
  })

  it('restores workout-mode position from a v2 draft', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 2,
        title: 'Mid-workout',
        duration_seconds: null,
        calories: '',
        date: '2026-09-01T10:00',
        notes: '',
        wellbeing: null,
        rpe: null,
        exercises: [
          { exercise_id: '1', sets: [set('5', '100', '', true)] },
          { exercise_id: '2', sets: [set('8', '60')] },
        ],
        templateId: null,
        workout: { currentExerciseIndex: 1, restEndsAt: 1_790_000_090_000, startedAt: 1_790_000_000_000 },
      }),
    )
    const { result } = setup('/workout')
    await act(() => result.current.restoreDraft())
    expect(result.current.workout).toEqual({
      currentExerciseIndex: 1,
      restEndsAt: 1_790_000_090_000,
      startedAt: 1_790_000_000_000,
      autoDurationSeconds: null,
    })
    expect(result.current.values.exercises[0].sets[0].done).toBe(true)
  })

  it('resume=1 restores the stored draft without asking and skips the URL template', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 2,
        title: 'Resumed',
        duration_seconds: null,
        calories: '',
        date: '2026-09-01T10:00',
        notes: '',
        wellbeing: null,
        rpe: null,
        exercises: [{ exercise_id: '2', sets: [set('8', '60', 'easy', true), set('8', '60')] }],
        templateId: null,
        workout: { currentExerciseIndex: 0, restEndsAt: 1_790_000_090_000, startedAt: null },
      }),
    )
    const { result } = setup('/workout?templateId=3&resume=1')
    expect(result.current.pendingDraft).toBeNull()
    await waitFor(() => expect(result.current.isRestoring).toBe(false))
    await act(() => sleep(30))
    expect(result.current.values.title).toBe('Resumed')
    expect(result.current.values.exercises[0].sets[0]).toEqual(set('8', '60', 'easy', true))
    expect(result.current.workout.restEndsAt).toBe(1_790_000_090_000)
    expect(mockGet).not.toHaveBeenCalledWith('/templates/strength/3')
  })

  it('resume=1 without a stored draft falls back to the URL template', async () => {
    const { result } = setup('/workout?templateId=3&resume=1')
    expect(result.current.isRestoring).toBe(false)
    await waitFor(() => expect(result.current.templateSnapshot?.name).toBe('Leg day'))
  })

  it('persistDraft writes the current state even when nothing changed', async () => {
    const { result } = await setupWithTemplate()
    expect(storedDraft()).toBeNull()
    act(() => result.current.persistDraft())
    expect(storedDraft()).toMatchObject({ version: STRENGTH_DRAFT_VERSION, title: 'Leg day', templateId: 3 })
  })

  it('never autosaves or saves over a draft that is waiting for Restore/Discard (B1)', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: 'Stale', exercises: [] }))
    const { result } = setup('/log?type=strength', { autosaveMs: 20 })
    act(() => result.current.setField('notes', 'typed while the banner shows'))
    await act(() => sleep(60))
    expect(storedDraft()).toEqual({ title: 'Stale', exercises: [] })

    await act(() => result.current.requestSave(result.current.form.getValues()))
    act(() => result.current.persistDraft())
    expect(mockPost).not.toHaveBeenCalled()
    expect(storedDraft()).toEqual({ title: 'Stale', exercises: [] })
  })

  it('discardDraft removes the stored draft; later edits start a new one', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: 'Stale', exercises: [] }))
    const { result } = setup('/log?type=strength', { autosaveMs: 20 })
    act(() => result.current.discardDraft())
    expect(result.current.pendingDraft).toBeNull()
    expect(storedDraft()).toBeNull()
    act(() => result.current.setField('notes', 'fresh'))
    await waitFor(() => expect(storedDraft()).toMatchObject({ notes: 'fresh', title: 'Strength session' }))
  })

  it('keeps the draft on a failed save and clears it only after a 2xx', async () => {
    const onSaved = vi.fn()
    mockPost.mockRejectedValueOnce(new Error('Request failed'))
    const { result } = await setupWithTemplate({ onSaved })
    act(() => result.current.setSetDone(0, 0))
    await waitFor(() => expect(storedDraft()).not.toBeNull())

    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.saveMutation.isError).toBe(true))
    expect(result.current.saveMutation.error?.message).toBe('Request failed')
    expect(storedDraft()?.exercises[0].sets[0].done).toBe(true)
    expect(onSaved).not.toHaveBeenCalled()

    // A change made between the failed and the successful save must not
    // resurrect the draft once the save succeeds
    act(() => result.current.setField('notes', 'retrying'))
    await act(() => result.current.submit())
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(42))
    expect(storedDraft()).toBeNull()
    await act(() => sleep(60))
    expect(storedDraft()).toBeNull()
  })

  it('does not rewrite the draft on unmount after a successful save', async () => {
    const onSaved = vi.fn()
    const { result, unmount } = await setupWithTemplate({ onSaved, autosaveMs: 1000 })
    act(() => result.current.setSetDone(0, 0))
    await act(() => result.current.submit())
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    unmount()
    expect(storedDraft()).toBeNull()
  })

  it('flushes a pending write on unmount', async () => {
    const { result, unmount } = await setupWithTemplate({ autosaveMs: 10_000 })
    act(() => result.current.setSetDone(0, 0))
    expect(storedDraft()).toBeNull()
    unmount()
    expect(storedDraft()?.exercises[0].sets[0].done).toBe(true)
  })
})

describe('useStrengthSessionForm: review fixes', () => {
  const draftWithTemplate = {
    version: 2,
    title: 'Linked',
    duration_seconds: null,
    calories: '',
    date: '2026-09-01T10:00',
    notes: '',
    wellbeing: null,
    rpe: null,
    exercises: [{ exercise_id: '1', sets: [set('6', '100', '', true), set('5', '102.5', 'tough')] }],
    templateId: 3,
    workout: { currentExerciseIndex: 0, restEndsAt: null, startedAt: null, autoDurationSeconds: null },
  }

  it('B2: a stale template response is dropped when another template was chosen meanwhile', async () => {
    let releaseLegDay: () => void = () => {}
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/templates/strength/3') {
        return new Promise((r) => {
          releaseLegDay = () => r(legDay)
        }) as never
      }
      if (path === '/templates/strength/9') return { id: 9, name: 'Other', exercises: [] } as never
      if (path === '/exercises') return [] as never
      return { sets: [] } as never
    })
    const { result } = setup('/log?type=strength')
    act(() => {
      void result.current.selectTemplate(3)
    })
    await act(() => result.current.selectTemplate(9))
    expect(result.current.templateSnapshot?.name).toBe('Other')
    await act(async () => releaseLegDay())
    expect(result.current.templateSnapshot?.name).toBe('Other')
    expect(result.current.selectedTemplateId).toBe(9)
  })

  it('3: restore applies the draft at once, even while the template request hangs', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draftWithTemplate))
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/templates/strength/3') return new Promise(() => {}) as never
      return [] as never
    })
    const { result } = setup('/log?type=strength')
    act(() => {
      void result.current.restoreDraft()
    })
    expect(result.current.values.title).toBe('Linked')
    expect(result.current.pendingDraft).toBeNull()
    expect(result.current.selectedTemplateId).toBe(3)
    expect(result.current.isRestoring).toBe(true)
  })

  it('3: a failed template request keeps the link, and the save fetches it again for the diff', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draftWithTemplate))
    let templateCalls = 0
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/templates/strength/3') {
        templateCalls++
        if (templateCalls === 1) throw new Error('offline')
        return legDay as never
      }
      if (path === '/exercises') return [{ id: 1, name: 'Squat' }] as never
      return [] as never
    })
    const { result } = setup('/log?type=strength')
    await act(() => result.current.restoreDraft())
    expect(result.current.templateSnapshot).toBeNull()
    expect(result.current.selectedTemplateId).toBe(3)
    act(() => result.current.setField('notes', 'x'))
    await waitFor(() => expect(storedDraft()?.templateId).toBe(3))

    await act(() => result.current.requestSave(result.current.form.getValues()))
    expect(templateCalls).toBe(2)
    expect(result.current.diffState?.changes).toEqual(['Changed reps on Squat set 1'])
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('5: a second save while the first is in flight is ignored', async () => {
    let resolvePost: (v: unknown) => void = () => {}
    mockPost.mockImplementation(() => new Promise((r) => (resolvePost = r)) as never)
    const onSaved = vi.fn()
    const { result } = setup('/log?type=strength', { onSaved })
    act(() => result.current.addExercise({ exercise_id: '1', sets: [set('5', '100')] }))
    await act(async () => {
      void result.current.requestSave(result.current.form.getValues())
      void result.current.requestSave(result.current.form.getValues())
    })
    await act(() => result.current.submit())
    expect(mockPost).toHaveBeenCalledTimes(1)
    await act(async () => resolvePost({ id: 7 }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(7))
  })

  it('8: a successful save refreshes last-session defaults', async () => {
    const onSaved = vi.fn()
    const { result, qc } = setup('/log?type=strength', { onSaved })
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await act(() => result.current.requestSave(result.current.form.getValues()))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(spy).toHaveBeenCalledWith({ queryKey: ['last-session-defaults'] })
  })

  it('4: workout position alone does not create a draft', async () => {
    const { result } = await setupWithTemplate()
    act(() => result.current.updateWorkout({ startedAt: 123, currentExerciseIndex: 0 }))
    await act(() => sleep(60))
    expect(storedDraft()).toBeNull()
    act(() => result.current.setSetDone(0, 0))
    await waitFor(() => expect(storedDraft()?.workout?.startedAt).toBe(123))
  })
})
