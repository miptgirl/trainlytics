import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { api } from '../lib/api'
import LogWorkoutPage from '../pages/LogWorkoutPage'
import WorkoutModePage from '../pages/WorkoutModePage'

const mockGet = vi.mocked(api.get)
const mockPost = vi.mocked(api.post)
const mockPatch = vi.mocked(api.patch)

const DRAFT_KEY = 'trainlytics_draft_strength'
const storedDraft = () => {
  const raw = localStorage.getItem(DRAFT_KEY)
  return raw === null ? null : JSON.parse(raw)
}

const exerciseList = [
  { id: 1, name: 'Squat', types: [{ id: 7, name: 'Legs' }] },
  { id: 2, name: 'Bench', types: [{ id: 8, name: 'Chest' }] },
  { id: 5, name: 'Pull-up', types: [{ id: 9, name: 'Back' }] },
]

const tSet = (n: number, reps: number, weight_kg: number, notes: string | null = null) => ({
  set_number: n,
  reps,
  weight_kg,
  notes,
})

const legDay = {
  id: 3,
  name: 'Leg day',
  exercises: [
    { exercise_id: 1, exercise_name: 'Squat', order: 1, sets: [tSet(1, 5, 100), tSet(2, 5, 102.5, 'tough')] },
  ],
}

const fullBody = {
  id: 4,
  name: 'Full body',
  exercises: [
    { exercise_id: 1, exercise_name: 'Squat', order: 1, sets: [tSet(1, 5, 100), tSet(2, 5, 100)] },
    { exercise_id: 2, exercise_name: 'Bench', order: 2, sets: [tSet(1, 8, 60), tSet(2, 8, 60)] },
  ],
}

function LocationProbe() {
  return <p data-testid="search">{useLocation().search}</p>
}

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <LocationProbe />
        <Routes>
          <Route path="/workout" element={<WorkoutModePage />} />
          <Route path="/log" element={<LogWorkoutPage />} />
          <Route path="/sessions/:id" element={<p>Session detail page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const exerciseHeading = () => screen.getByRole('heading', { level: 2 })
const set = (reps: string, weight: string, done = false, notes = '', rpe = '') => ({ reps, weight, notes, rpe, done })

beforeEach(() => {
  localStorage.clear()
  mockGet.mockReset()
  mockPost.mockReset()
  mockPatch.mockReset()
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/profile') return { ai_key_configured: false } as never
    if (path === '/exercises') return exerciseList as never
    if (path === '/templates/strength') return [{ id: 3, name: 'Leg day' }, { id: 4, name: 'Full body' }] as never
    if (path === '/templates/strength/3') return legDay as never
    if (path === '/templates/strength/4') return fullBody as never
    if (path === '/exercises/1/last-session-defaults') {
      return { sets: [1, 2, 3, 4].map((n) => ({ set_number: n, reps: 8, weight: 57.5 })) } as never
    }
    if (path === '/exercises/5/last-session-defaults') {
      return { sets: [{ set_number: 1, reps: 6, weight: null }] } as never
    }
    if (path.endsWith('/last-session-defaults')) return { sets: [] } as never
    return [] as never
  })
  mockPost.mockResolvedValue({ id: 42 } as never)
  mockPatch.mockResolvedValue({} as never)
})

describe('Workout mode: payload parity with the full form', () => {
  it('posts the same body as the full form for the same input', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3&date=2026-09-01T10:00')

    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(await screen.findByText('Last time: 4 × 8 @ 57.5 kg')).toBeInTheDocument()
    const reps = screen.getByLabelText('Reps for set 1')
    await user.clear(reps)
    await user.type(reps, '6')
    await user.click(screen.getByRole('button', { name: '+ Add note' }))
    await user.type(screen.getByLabelText('Note'), 'felt ok')
    await user.click(screen.getByRole('button', { name: 'Complete set' }))

    await user.click(screen.getByRole('button', { name: 'Finish' }))
    const sheet = screen.getByRole('dialog', { name: 'Finish workout' })
    // Prefilled from the elapsed time (at least 1:00); type over it
    const duration = within(sheet).getByLabelText('Duration')
    expect(duration).toHaveValue('1:00')
    await user.clear(duration)
    await user.type(duration, '45:00')
    await user.click(within(sheet).getByRole('button', { name: /Good/ }))
    await user.click(within(sheet).getByRole('button', { name: /Moderate/ }))
    await user.type(within(sheet).getByLabelText('Calories (kcal, optional)'), '320')
    await user.type(within(sheet).getByLabelText('Session note'), 'Solid')
    await user.click(within(sheet).getByRole('button', { name: 'Save workout' }))

    expect(await screen.findByText('Update template "Leg day"?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'No, keep template as-is' }))

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    // Identical to the body asserted for the full form in LogWorkoutStrength.test.tsx
    expect(mockPost).toHaveBeenCalledWith('/sessions/strength', {
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
            { set_number: 1, reps: 6, weight: 100, notes: 'felt ok', rpe: null },
            { set_number: 2, reps: 5, weight: 102.5, notes: 'tough', rpe: null },
          ],
        },
      ],
    })
    expect(await screen.findByText('Session detail page')).toBeInTheDocument()
    expect(storedDraft()).toBeNull()
  })
})

describe('Workout mode: logging', () => {
  it('completing a set starts the rest timer; finishing an exercise moves to the next one', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=4')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.getByText('0 of 4 sets · 0 of 2 exercises')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Next: Bench/ })).toBeInTheDocument()

    const before = Date.now()
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    expect(screen.getByTestId('rest-clock')).toHaveTextContent(/1:(30|29)/)
    await waitFor(() => expect(storedDraft()?.workout?.restEndsAt).toBeGreaterThanOrEqual(before + 90_000))
    expect(exerciseHeading()).toHaveTextContent('Squat')

    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    expect(exerciseHeading()).toHaveTextContent('Bench')
    expect(screen.getByText('Exercise 2 of 2')).toBeInTheDocument()
    expect(screen.getByText('2 of 4 sets · 1 of 2 exercises')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    expect(screen.getByText('All exercises done')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finish ›' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Skip rest' }))
    expect(screen.getByText('Rest')).toBeInTheDocument()
  })

  it('delete + undo puts the set back at the same position', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(screen.getByRole('button', { name: '+ Add set' }))
    // Sets: 1 done (5×100), 2 current (5×102.5 tough), 3 copy of set 2 (5×102.5)
    await user.click(screen.getByRole('button', { name: 'Delete set 2' }))

    expect(await screen.findByText('Set 2 deleted')).toBeInTheDocument()
    expect(screen.queryByLabelText('Note')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(screen.queryByText('Set 2 deleted')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Note')).toHaveValue('tough')
    await waitFor(() =>
      expect(storedDraft().exercises[0].sets).toEqual([
        set('5', '100', true),
        set('5', '102.5', false, 'tough'),
        set('5', '102.5'),
      ]),
    )
  })

  it('the last remaining set has no delete button', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Delete set 2' }))
    expect(screen.queryByRole('button', { name: /Delete set/ })).not.toBeInTheDocument()
  })

  it('editing a done set then Cancel restores its values; Save keeps it done', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))

    await user.click(screen.getByRole('button', { name: 'Edit set 1, 5 × 100 kg, done' }))
    expect(screen.getByText('Edit set 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Increase reps by 1' }))
    await user.click(screen.getByRole('button', { name: 'Increase weight by 2.5' }))
    expect(screen.getByLabelText('Reps for set 1')).toHaveValue('6')
    expect(screen.getByLabelText('Weight for set 1')).toHaveValue('102.5')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Edit set 1, 5 × 100 kg, done' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit set 1, 5 × 100 kg, done' }))
    const weight = screen.getByLabelText('Weight for set 1')
    await user.clear(weight)
    await user.type(weight, '97,5')
    await user.click(screen.getByRole('button', { name: 'Save set 1' }))
    expect(screen.getByRole('button', { name: 'Edit set 1, 5 × 97.5 kg, done' })).toBeInTheDocument()
    // The current set editor is back on set 2
    expect(screen.getByLabelText('Reps for set 2')).toHaveValue('5')
  })

  it('Add set copies the last set', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: '+ Add set' }))
    await waitFor(() => expect(storedDraft()?.exercises[0].sets[2]).toEqual(set('5', '102.5')))
    expect(screen.getByText('0 of 3 sets · 0 of 1 exercises')).toBeInTheDocument()
  })

  it('Add exercise appends it with 3 sets and selects it', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))

    await user.click(screen.getByRole('button', { name: 'Choose exercise' }))
    const sheet = screen.getByRole('dialog', { name: 'Choose exercise' })
    expect(within(sheet).getByText('Current')).toBeInTheDocument()
    expect(within(sheet).getByText('0 of 2 sets · last 4 × 8 @ 57.5 kg')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: '+ Add exercise' }))

    const add = screen.getByRole('dialog', { name: 'Add exercise' })
    await user.type(within(add).getByLabelText('Search exercises'), 'pull')
    await user.click(within(add).getByRole('button', { name: 'Pull-up' }))

    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Pull-up'))
    expect(screen.getByText('Exercise 2 of 2')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(storedDraft()?.exercises[1]).toEqual({
        exercise_id: '5',
        sets: [set('6', ''), set('6', ''), set('6', '')],
      }),
    )
  })

  it('Escape closes the exercise sheet and returns focus', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    const opener = screen.getByRole('button', { name: 'Choose exercise' })
    await user.click(opener)
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('blocks Finish while an entry has no exercise', async () => {
    const user = userEvent.setup()
    renderAt('/workout')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('No exercise chosen'))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Exercise 1 has no exercise chosen')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Workout mode: per-set RPE', () => {
  it('a tapped chip shows on the done row, is not copied to the next set, and tapping it again clears it', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))

    const chip8 = screen.getByRole('button', { name: 'RPE 8 for set 1' })
    expect(chip8).toHaveAttribute('aria-pressed', 'false')
    await user.click(chip8)
    expect(chip8).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Complete set' }))

    expect(screen.getByRole('button', { name: 'Edit set 1, 5 × 100 kg @8, done' })).toBeInTheDocument()
    expect(screen.getByText('5 × 100 kg @8')).toBeInTheDocument()
    // Never prefilled: the next set starts unrated
    for (const n of [5, 6, 7, 8, 9, 10]) {
      expect(screen.getByRole('button', { name: `RPE ${n} for set 2` })).toHaveAttribute('aria-pressed', 'false')
    }
    await waitFor(() => expect(storedDraft()?.exercises[0].sets[0].rpe).toBe('8'))

    await user.click(screen.getByRole('button', { name: 'Edit set 1, 5 × 100 kg @8, done' }))
    const again = screen.getByRole('button', { name: 'RPE 8 for set 1' })
    expect(again).toHaveAttribute('aria-pressed', 'true')
    await user.click(again)
    expect(again).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Save set 1' }))
    expect(screen.getByRole('button', { name: 'Edit set 1, 5 × 100 kg, done' })).toBeInTheDocument()
    await waitFor(() => expect(storedDraft()?.exercises[0].sets[0].rpe).toBe(''))
  })
})

describe('Workout mode: draft', () => {
  const midWorkout = (restEndsAt: number) => ({
    version: 2,
    title: 'Full body',
    duration_seconds: null,
    calories: '',
    date: '2026-09-01T10:00',
    notes: '',
    wellbeing: null,
    rpe: null,
    exercises: [
      { exercise_id: '1', sets: [set('5', '100', true), set('5', '100', true)] },
      { exercise_id: '2', sets: [set('8', '60', true, 'easy'), set('8', '60')] },
    ],
    templateId: 4,
    workout: { currentExerciseIndex: 1, restEndsAt, startedAt: Date.now() - 20 * 60_000 },
  })

  it('reload restores the exercise, sets and remaining rest', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(midWorkout(Date.now() + 45_000)))
    renderAt('/workout?templateId=4&resume=1')

    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Bench'))
    expect(screen.queryByText('You have an unsaved Strength draft.')).not.toBeInTheDocument()
    expect(screen.getByText('Exercise 2 of 2')).toBeInTheDocument()
    expect(screen.getByText('3 of 4 sets · 1 of 2 exercises')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit set 1, 8 × 60 kg, done' })).toHaveTextContent('easy')
    expect(screen.getByLabelText('Reps for set 2')).toHaveValue('8')
    expect(screen.getByTestId('rest-clock')).toHaveTextContent(/0:4[45]/)
  })

  it('opening fresh with a stored draft asks Restore or Discard', async () => {
    const user = userEvent.setup()
    localStorage.setItem(DRAFT_KEY, JSON.stringify(midWorkout(Date.now() + 45_000)))
    renderAt('/workout?templateId=3')

    expect(await screen.findByText('You have an unsaved Strength draft.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose exercise' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Bench'))
  })

  it('Discard starts fresh from the URL template', async () => {
    const user = userEvent.setup()
    localStorage.setItem(DRAFT_KEY, JSON.stringify(midWorkout(Date.now() + 45_000)))
    renderAt('/workout?templateId=3')
    await user.click(await screen.findByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.getByText('0 of 2 sets · 0 of 1 exercises')).toBeInTheDocument()
  })

  it('a failed save keeps the draft and offers retry', async () => {
    const user = userEvent.setup()
    mockPost.mockRejectedValueOnce(new Error('Request failed'))
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))

    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await user.click(screen.getByRole('button', { name: 'Save workout' }))
    expect(await screen.findByText(/Couldn't reach the server/)).toBeInTheDocument()
    expect(storedDraft()?.exercises[0].sets.map((s: { done: boolean }) => s.done)).toEqual([true, true])

    await user.click(screen.getByRole('button', { name: 'Retry save' }))
    expect(await screen.findByText('Session detail page')).toBeInTheDocument()
    expect(mockPost).toHaveBeenCalledTimes(2)
    expect(storedDraft()).toBeNull()
  })
})

describe('Switching between the full form and workout mode', () => {
  it('keeps every set, note and done flag both ways', async () => {
    const user = userEvent.setup()
    renderAt('/log?type=strength&templateId=3')
    await screen.findByText(/Pre-filled from/)

    await user.type(screen.getAllByPlaceholderText('note')[0], 'warm-up')
    await user.click(screen.getAllByRole('checkbox')[0])
    await user.click(screen.getByRole('button', { name: 'Workout mode' }))

    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.queryByText('You have an unsaved Strength draft.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit set 1, 5 × 100 kg, done' })).toHaveTextContent('warm-up')
    expect(screen.getByLabelText('Note')).toHaveValue('tough')

    const reps = screen.getByLabelText('Reps for set 2')
    await user.clear(reps)
    await user.type(reps, '7')
    await user.click(screen.getByRole('button', { name: 'Workout options' }))
    await user.click(screen.getByRole('button', { name: 'Full form' }))

    await screen.findByText(/Pre-filled from/)
    expect(screen.queryByText('You have an unsaved Strength draft.')).not.toBeInTheDocument()
    expect(screen.getAllByPlaceholderText('note')[0]).toHaveValue('warm-up')
    expect(screen.getAllByPlaceholderText('note')[1]).toHaveValue('tough')
    expect(screen.getAllByRole('checkbox')[0]).toBeChecked()
    expect(screen.getAllByRole('checkbox')[1]).not.toBeChecked()
    expect(screen.getAllByPlaceholderText('reps')[1]).toHaveValue(7)
  })
})

describe('Workout mode: starting from a template', () => {
  const entryButton = () => screen.queryByRole('button', { name: 'Start from template' })
  const openSheet = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: 'Start from template' }))
    return screen.getByRole('dialog', { name: 'Start from template' })
  }
  const blankDraft = (over: Record<string, unknown> = {}) => ({
    version: 2,
    title: 'Strength session',
    duration_seconds: null,
    calories: '',
    date: '2026-09-01T10:00',
    notes: '',
    wellbeing: null,
    rpe: null,
    exercises: [{ exercise_id: '', sets: [set('', '')] }],
    templateId: null,
    workout: { currentExerciseIndex: 0, restEndsAt: null, startedAt: Date.now() - 60_000 },
    ...over,
  })
  const templatesRequested = () => mockGet.mock.calls.some(([path]) => path === '/templates/strength')

  it('a blank session offers one entry button; the sheet lists templates; picking pre-fills it', async () => {
    const user = userEvent.setup()
    renderAt('/workout?type=strength')
    const dialog = await openSheet(user)
    expect(within(dialog).getByRole('button', { name: 'Leg day' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Full body' }))

    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.getByText('Exercise 1 of 2')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(entryButton()).not.toBeInTheDocument()
  })

  it('the pick is stored in the draft; Close and reopening with resume=1 shows the template, not the picker', async () => {
    const user = userEvent.setup()
    const view = renderAt('/workout?type=strength')
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Full body' }))
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await waitFor(() => expect(storedDraft()?.templateId).toBe(4))
    expect(storedDraft().exercises.map((e: { exercise_id: string }) => e.exercise_id)).toEqual(['1', '2'])

    await user.click(screen.getByRole('button', { name: /Close workout/ }))
    view.unmount()
    renderAt('/workout?type=strength&resume=1')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.getByText('Exercise 1 of 2')).toBeInTheDocument()
    expect(entryButton()).not.toBeInTheDocument()
  })

  it('after a resume, picking a template sets its name as the title', async () => {
    const user = userEvent.setup()
    localStorage.setItem(DRAFT_KEY, JSON.stringify(blankDraft()))
    renderAt('/workout?type=strength&resume=1')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Strength session')
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Leg day' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Leg day'))
  })

  it('resets the current exercise to the first one', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify(
        blankDraft({
          exercises: [
            { exercise_id: '', sets: [set('', '')] },
            { exercise_id: '', sets: [set('', '')] },
          ],
          workout: { currentExerciseIndex: 1, restEndsAt: null, startedAt: Date.now() - 60_000 },
        }),
      ),
    )
    renderAt('/workout?type=strength&resume=1')
    expect(await screen.findByText('Exercise 2 of 2')).toBeInTheDocument()
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Full body' }))
    expect(await screen.findByText('Exercise 1 of 2')).toBeInTheDocument()
    expect(exerciseHeading()).toHaveTextContent('Squat')
  })

  it('the chosen template carries to the full form and into the update-template prompt', async () => {
    const user = userEvent.setup()
    renderAt('/workout?type=strength')
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Leg day' }))
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))

    await user.click(screen.getByRole('button', { name: 'Workout options' }))
    await user.click(screen.getByRole('button', { name: 'Full form' }))
    await screen.findByText(/Pre-filled from/)
    expect((screen.getByRole('option', { name: 'Leg day' }) as HTMLOptionElement).selected).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Workout mode' }))
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))

    const reps = screen.getByLabelText('Reps for set 1')
    await user.clear(reps)
    await user.type(reps, '6')
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await user.click(screen.getByRole('button', { name: 'Save workout' }))
    expect(await screen.findByText('Update template "Leg day"?')).toBeInTheDocument()
  })

  it('is hidden when opened with a templateId', async () => {
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(entryButton()).not.toBeInTheDocument()
  })

  it('is hidden once an entry has been changed', async () => {
    const user = userEvent.setup()
    renderAt('/workout?type=strength')
    await screen.findByRole('button', { name: 'Start from template' })

    await user.click(screen.getByRole('button', { name: 'Choose an exercise' }))
    const add = screen.getByRole('dialog', { name: 'Add exercise' })
    await user.click(within(add).getByRole('button', { name: 'Pull-up' }))

    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Pull-up'))
    expect(entryButton()).not.toBeInTheDocument()
  })

  it('stays hidden after typing into a set and clearing it again', async () => {
    const user = userEvent.setup()
    renderAt('/workout?type=strength')
    await screen.findByRole('button', { name: 'Start from template' })

    const reps = screen.getByLabelText('Reps for set 1')
    await user.type(reps, '5')
    expect(entryButton()).not.toBeInTheDocument()
    await user.clear(reps)
    expect(reps).toHaveValue('')
    expect(entryButton()).not.toBeInTheDocument()
  })

  it('on a template error, "Continue without template" returns to an empty session', async () => {
    const user = userEvent.setup()
    const base = mockGet.getMockImplementation()!
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/templates/strength/3') throw new Error('offline')
      return base(path)
    })
    renderAt('/workout?type=strength')
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Leg day' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the template")
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continue without template' }))

    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('No exercise chosen'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a 404 on the URL template: Continue without template drops templateId from the URL', async () => {
    const user = userEvent.setup()
    const base = mockGet.getMockImplementation()!
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/templates/strength/9') throw Object.assign(new Error('Not found'), { status: 404 })
      return base(path)
    })
    renderAt('/workout?templateId=9')
    expect(await screen.findByRole('alert')).toHaveTextContent('This template no longer exists.')
    expect(screen.getByTestId('search')).toHaveTextContent('templateId=9')

    await user.click(screen.getByRole('button', { name: 'Continue without template' }))

    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('No exercise chosen'))
    await waitFor(() => expect(screen.getByTestId('search')).not.toHaveTextContent('templateId'))
    // The template list was refetched so a deleted template drops out
    await waitFor(() => expect(mockGet.mock.calls.filter(([p]) => p === '/templates/strength').length).toBeGreaterThan(1))
  })

  it('while a template loads, the bottom bar, options and Finish are not actionable', async () => {
    const user = userEvent.setup()
    let release: (v: unknown) => void = () => {}
    const base = mockGet.getMockImplementation()!
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/templates/strength/3') return new Promise((r) => (release = r)) as never
      return base(path)
    })
    renderAt('/workout?type=strength')
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Leg day' }))

    expect(await screen.findByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose exercise' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Workout options' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Finish' })).toBeDisabled()

    await act(async () => {
      release(legDay)
    })
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.getByRole('button', { name: 'Choose exercise' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Workout options' })).toBeEnabled()
  })

  it('is hidden when there are no templates', async () => {
    const base = mockGet.getMockImplementation()!
    mockGet.mockImplementation(async (path: string) => (path === '/templates/strength' ? ([] as never) : base(path)))
    renderAt('/workout?type=strength')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('No exercise chosen'))
    await waitFor(() => expect(templatesRequested()).toBe(true))
    // Let the (empty) response land before asserting absence
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(entryButton()).not.toBeInTheDocument()
  })

  it('picking a template clears a pending undo toast', async () => {
    const user = userEvent.setup()
    renderAt('/workout?type=strength')
    await screen.findByRole('button', { name: 'Start from template' })
    await user.click(screen.getByRole('button', { name: '+ Add set' }))
    await user.click(screen.getByRole('button', { name: 'Delete set 2' }))
    expect(await screen.findByText('Set 2 deleted')).toBeInTheDocument()

    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Full body' }))
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.queryByText('Set 2 deleted')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('Retry after a failed pick claims the draft and starts at the first exercise', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify(
        blankDraft({
          exercises: [
            { exercise_id: '', sets: [set('', '')] },
            { exercise_id: '', sets: [set('', '')] },
          ],
          workout: { currentExerciseIndex: 1, restEndsAt: null, startedAt: Date.now() - 60_000 },
        }),
      ),
    )
    let fail = true
    const base = mockGet.getMockImplementation()!
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/templates/strength/4' && fail) throw new Error('offline')
      return base(path)
    })
    renderAt('/workout?type=strength&resume=1')
    expect(await screen.findByText('Exercise 2 of 2')).toBeInTheDocument()
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Full body' }))
    await screen.findByRole('alert')
    fail = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Exercise 1 of 2')).toBeInTheDocument()
    await waitFor(() => expect(storedDraft()?.templateId).toBe(4))
  })

  it('notes typed in the full form keep the template entry hidden in workout mode, and are kept', async () => {
    const user = userEvent.setup()
    renderAt('/log?type=strength')
    await user.type(await screen.findByPlaceholderText('Optional notes…'), 'sore knee')
    await user.click(screen.getByRole('button', { name: 'Workout mode' }))

    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('No exercise chosen'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(entryButton()).not.toBeInTheDocument()
    expect(storedDraft().notes).toBe('sore knee')
  })

  it('Continue without template keeps entered fields and offers the entry again', async () => {
    const user = userEvent.setup()
    localStorage.setItem(DRAFT_KEY, JSON.stringify(blankDraft({ notes: '' })))
    const base = mockGet.getMockImplementation()!
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/templates/strength/3') throw new Error('offline')
      return base(path)
    })
    renderAt('/workout?type=strength&resume=1')
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Leg day' }))
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Continue without template' }))
    expect(await screen.findByRole('button', { name: 'Start from template' })).toBeInTheDocument()
  })

  it('Continue without template does not reset a form that already holds a custom title', async () => {
    const user = userEvent.setup()
    localStorage.setItem(DRAFT_KEY, JSON.stringify(blankDraft({ title: 'Mine', titleTouched: true })))
    const base = mockGet.getMockImplementation()!
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/templates/strength/3') throw new Error('offline')
      return base(path)
    })
    renderAt('/workout?type=strength&resume=1')
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Leg day' }))
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Continue without template' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mine'))
  })
})

