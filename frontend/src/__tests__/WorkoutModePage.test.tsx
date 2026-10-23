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
import { resetRestLength } from '../lib/restLengthSync'
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

const tSet = (n: number, reps: number, weight_kg: number) => ({
  set_number: n,
  reps,
  weight_kg,
})

const legDay = {
  id: 3,
  name: 'Leg day',
  exercises: [
    { exercise_id: 1, exercise_name: 'Squat', order: 1, sets: [tSet(1, 5, 100), tSet(2, 5, 102.5)] },
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

// The dock's exercise button names the current exercise ("Exercise 1 of 2, Squat, 0 of 2 sets done. Choose exercise";
// "… No exercise chosen, … Add exercise" for an entry without one, where a tap opens the exercise search)
const DOCK_NAME = /\. (Choose|Add) exercise$/
const exerciseHeading = () => screen.getByRole('button', { name: DOCK_NAME })
const expectPosition = (k: number, m: number) =>
  expect(exerciseHeading()).toHaveAccessibleName(new RegExp(`^Exercise ${k} of ${m}, `))
const set = (reps: string, weight: string, done = false, notes = '', rpe = '') => ({ reps, weight, notes, rpe, done })

// The real API always includes rest_seconds; null = never set
const PROFILE = { ai_key_configured: false, rest_seconds: null }
// Server-side profile: GET returns it, PATCH merges into it
let profile: Record<string, unknown> = { ...PROFILE }
// Weight steps of Squat (exercise 1), as GET /exercises returns them
let squatScale: unknown = null

beforeEach(() => {
  resetRestLength()
  localStorage.clear()
  profile = { ...PROFILE }
  squatScale = null
  mockGet.mockReset()
  mockPost.mockReset()
  mockPatch.mockReset()
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/profile') return { ...profile } as never
    if (path === '/exercises') return exerciseList.map((e) => (e.id === 1 ? { ...e, weight_scale: squatScale } : e)) as never
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
  // PATCH /profile answers with the whole profile, like the API
  mockPatch.mockImplementation(async (path: string, body: unknown) => {
    if (path !== '/profile') return {} as never
    profile = { ...profile, ...(body as object) }
    return { ...profile } as never
  })
})

describe('Workout mode: payload parity with the full form', () => {
  it('posts the same body as the full form for the same input', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3&date=2026-09-01T10:00')

    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(await screen.findByText('Last time: 8×57.5, 8×57.5, 8×57.5, 8×57.5 kg')).toBeInTheDocument()
    const reps = screen.getByLabelText('Reps for set 1')
    await user.clear(reps)
    await user.type(reps, '6')
    await user.click(screen.getByRole('button', { name: '+ Add note' }))
    await user.type(screen.getByLabelText('Note'), 'felt ok')
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(screen.getByRole('button', { name: '+ Add note' }))
    await user.type(screen.getByLabelText('Note'), 'tough')

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
    // Set notes are not part of a template, so they are not listed as template changes
    expect(screen.queryByText(/Changed notes/)).not.toBeInTheDocument()
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
    expect(await screen.findByText('Session detail page')).toBeInTheDocument()
    expect(storedDraft()).toBeNull()
  })
})

describe('Workout mode: weight steps', () => {
  // Squat's first set is 100 kg in the Leg day template
  it.each([
    ['the default 10 lb stack', null, '104'],
    ['a 2.5 kg increment', { kind: 'increment', step_kg: 2.5 }, '102.5'],
    ['a 15 lb plate stack', { kind: 'stack', top_lb: 10, plate_lb: 15, plates: null }, '107'],
  ])('the weight + button steps by %s', async (_, weightScale, next) => {
    squatScale = weightScale
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')

    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Increase weight' }))
    expect(screen.getByLabelText('Weight for set 1')).toHaveValue(next)
  })
})

describe('Workout mode: logging', () => {
  it('completing the last set of an exercise stays on it: done card, rest, then Next and Finish workout', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=4')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.getByText('0 of 4 sets · 0 of 2 exercises')).toBeInTheDocument()

    const before = Date.now()
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    expect(screen.getByTestId('rest-clock')).toHaveTextContent(/1:(30|29)/)
    await waitFor(() => expect(storedDraft()?.workout?.restEndsAt).toBeGreaterThanOrEqual(before + 90_000))
    expect(exerciseHeading()).toHaveTextContent('Squat')

    // The last set of Squat: no auto-advance, and rest still starts
    const beforeLast = Date.now()
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    expect(exerciseHeading()).toHaveTextContent('Squat')
    expectPosition(1, 2)
    expect(screen.getByRole('heading', { name: 'Squat done' })).toBeInTheDocument()
    expect(screen.getByText('Today: 5×100, 5×100 kg')).toBeInTheDocument()
    expect(screen.getByText('2 of 4 sets · 1 of 2 exercises')).toBeInTheDocument()
    await waitFor(() => expect(storedDraft()?.workout?.restEndsAt).toBeGreaterThanOrEqual(beforeLast + 90_000))
    expect(screen.getByRole('button', { name: 'Skip rest' })).toBeEnabled()
    // No tab is joined to an editor; focus moved to the likely next tap
    expect(screen.queryByRole('button', { name: 'Complete set' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { pressed: true, name: /^Set / })).not.toBeInTheDocument()
    const next = screen.getByRole('button', { name: 'Next: Bench, 2 of 2' })
    expect(next).toHaveTextContent('Next, 2 of 2')
    expect(next).toHaveFocus()

    await user.click(next)
    expect(exerciseHeading()).toHaveTextContent('Bench')
    expectPosition(2, 2)
    expect(screen.getByLabelText('Reps for set 1')).toHaveValue('8')

    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    // The last set of the workout: no rest, and the card finishes instead
    expect(screen.getByRole('heading', { name: 'Bench done' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip rest' })).toBeDisabled()
    expect(screen.getByText('Rest')).toBeInTheDocument()
    const finish = screen.getByRole('button', { name: 'Finish workout' })
    expect(finish).toHaveFocus()
    await user.click(finish)
    expect(screen.getByRole('dialog', { name: 'Finish workout' })).toBeInTheDocument()
  })

  it('One more set adds a set and opens the editor on it', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    expect(screen.getByRole('heading', { name: 'Squat done' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'One more set' }))
    expect(screen.queryByRole('heading', { name: 'Squat done' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set 3 of 3, 5 × 102.5 kg' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Reps for set 3')).toHaveValue('5')
    // The button that was tapped is gone; focus lands on what comes next, not on the page
    expect(screen.getByLabelText('Reps for set 3')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Complete set' })).toBeInTheDocument()
    expect(screen.getByText('2 of 3 sets · 0 of 1 exercises')).toBeInTheDocument()
  })

  it('Next skips exercises that are already done, wrapping to the next unfinished one', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 3, title: 'Mixed', duration_seconds: null, calories: '', date: '2026-09-01T10:00',
        notes: '', wellbeing: null, rpe: null, templateId: null,
        exercises: [
          { exercise_id: '5', sets: [set('6', '')] },
          { exercise_id: '1', sets: [set('5', '100', true), set('5', '100')] },
          { exercise_id: '2', sets: [set('8', '60', true)] },
        ],
        workout: { currentExerciseIndex: 1, restEndsAt: null, startedAt: Date.now() },
      }),
    )
    renderAt('/workout?resume=1')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    // Bench (3 of 3) is done already, so Next wraps to Pull-up
    await user.click(screen.getByRole('button', { name: 'Next: Pull-up, 1 of 3' }))
    expect(exerciseHeading()).toHaveTextContent('Pull-up')
    expectPosition(1, 3)
  })

  it('reopening on a finished exercise shows the done card without moving focus', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 3, title: 'Full body', duration_seconds: null, calories: '', date: '2026-09-01T10:00',
        notes: '', wellbeing: null, rpe: null, templateId: null,
        exercises: [
          { exercise_id: '1', sets: [set('5', '100', true)] },
          { exercise_id: '2', sets: [set('8', '60')] },
        ],
        workout: { currentExerciseIndex: 0, restEndsAt: null, startedAt: Date.now() },
      }),
    )
    renderAt('/workout?resume=1')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.getByRole('heading', { name: 'Squat done' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next: Bench, 2 of 2' })).not.toHaveFocus()
  })

  it('delete + undo puts the set back at the same position', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(screen.getByRole('button', { name: '+ Add note' }))
    await user.type(screen.getByLabelText('Note'), 'tough')
    await user.click(screen.getByRole('button', { name: 'Add set' }))
    // Sets: 1 done (5×100), 2 current (5×102.5 tough), 3 copy of set 2 (5×102.5)
    await user.click(screen.getByRole('button', { name: 'Delete set 2' }))

    expect(await screen.findByText('Set deleted')).toBeInTheDocument()
    expect(screen.queryByLabelText('Note')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(screen.queryByText('Set deleted')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Note')).toHaveValue('tough')
    await waitFor(() =>
      expect(storedDraft().exercises[0].sets).toEqual([
        set('5', '100', true),
        set('5', '102.5', false, 'tough'),
        set('5', '102.5'),
      ]),
    )
  })

  it('tapping a done tab opens it with Cancel / Save: Cancel restores its values, Save keeps it done', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))

    const doneTab = () => screen.getByRole('button', { name: /^Set 1 of 2, .*, done$/ })
    await user.click(doneTab())
    expect(doneTab()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Complete set' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Increase reps by 1' }))
    await user.click(screen.getByRole('button', { name: 'Increase weight' }))
    expect(screen.getByLabelText('Reps for set 1')).toHaveValue('6')
    expect(screen.getByLabelText('Weight for set 1')).toHaveValue('104')
    // The tab shows the values as they are typed
    expect(doneTab()).toHaveTextContent('6×104')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(doneTab()).toHaveAccessibleName('Set 1 of 2, 5 × 100 kg, done')
    expect(doneTab()).toHaveAttribute('aria-pressed', 'false')

    await user.click(doneTab())
    const weight = screen.getByLabelText('Weight for set 1')
    await user.clear(weight)
    await user.type(weight, '97,5')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(doneTab()).toHaveAccessibleName('Set 1 of 2, 5 × 97.5 kg, done')
    // The editor is back on the first set not done
    expect(screen.getByRole('button', { name: 'Set 2 of 2, 5 × 102.5 kg' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Reps for set 2')).toHaveValue('5')
  })

  it('tapping a later pending tab logs that set; no "Set N" label is shown anywhere', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.queryByText(/^Set \d/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set 1 of 2, 5 × 100 kg' })).toHaveAttribute('aria-pressed', 'true')
    // Opening the page moves no focus
    expect(screen.getByLabelText('Reps for set 1')).not.toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Set 2 of 2, 5 × 102.5 kg' }))
    expect(screen.getByLabelText('Reps for set 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await waitFor(() => expect(storedDraft()?.exercises[0].sets.map((x: { done: boolean }) => x.done)).toEqual([false, true]))
    // Back to the default: the first set not done
    expect(screen.getByRole('button', { name: 'Set 1 of 2, 5 × 100 kg' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Set 2 of 2, 5 × 102.5 kg, done' })).toHaveTextContent('5×102.5')
  })

  it('Add set copies the last set', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Add set' }))
    await waitFor(() => expect(storedDraft()?.exercises[0].sets[2]).toEqual(set('5', '102.5')))
    expect(screen.getByText('0 of 3 sets · 0 of 1 exercises')).toBeInTheDocument()
  })

  it('Add exercise appends it with 3 sets and selects it', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))

    await user.click(exerciseHeading())
    const sheet = screen.getByRole('dialog', { name: 'Choose exercise' })
    expect(within(sheet).getByText('Current')).toBeInTheDocument()
    expect(within(sheet).getByText('Last time: 8×57.5, 8×57.5, 8×57.5, 8×57.5 kg')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: '+ Add exercise' }))

    const add = screen.getByRole('dialog', { name: 'Add exercise' })
    await user.type(within(add).getByLabelText('Search exercises'), 'pull')
    await user.click(within(add).getByRole('button', { name: 'Pull-up' }))

    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Pull-up'))
    expectPosition(2, 2)
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
    const opener = exerciseHeading()
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

describe('Workout mode: empty exercises, removal and the dock', () => {
  const dock = () => exerciseHeading()
  const segments = () => Array.from(dock().querySelectorAll('[aria-hidden="true"] > span'))

  it('deleting the only set shows the empty state; Undo puts the set back', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=4')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))
    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))

    expect(screen.getByRole('heading', { name: 'No sets left' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a set' })).toHaveFocus()
    expect(screen.getByText('Add a set to keep Squat, or take it out of this workout.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Sets' })).not.toBeInTheDocument()
    expect(dock()).toHaveAccessibleName('Exercise 1 of 2, Squat, no sets. Choose exercise')
    expect(dock()).toHaveTextContent('No sets')
    await waitFor(() => expect(storedDraft()?.exercises[0].sets).toEqual([]))

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.queryByRole('heading', { name: 'No sets left' })).not.toBeInTheDocument()
    await waitFor(() => expect(storedDraft()?.exercises[0].sets).toEqual([set('5', '100')]))
    expect(screen.getByLabelText('Reps for set 1')).toHaveValue('5')
  })

  it('the empty state adds a set from last session, or removes the exercise with Undo', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=4')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))
    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))

    // Nothing left to copy, so last session's first set (8 × 57.5) fills it, not 0 / 0
    await user.click(screen.getByRole('button', { name: 'Add a set' }))
    expect(screen.getByRole('button', { name: 'Set 1 of 1, 8 × 57.5 kg' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Reps for set 1')).toHaveValue('8')
    expect(screen.getByLabelText('Weight for set 1')).toHaveValue('57.5')
    expect(screen.getByLabelText('Reps for set 1')).toHaveFocus()
    await waitFor(() => expect(storedDraft()?.exercises[0].sets).toEqual([set('8', '57.5')]))
    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))
    expect(screen.getByRole('button', { name: 'Add a set' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Remove Squat' }))
    expect(exerciseHeading()).toHaveTextContent('Bench')
    expectPosition(1, 1)
    // The Remove button is gone with the exercise; the dock's exercise button takes focus
    expect(exerciseHeading()).toHaveFocus()
    expect(screen.getByText('Squat removed')).toBeInTheDocument()
    await waitFor(() => expect(storedDraft()?.exercises.map((e: { exercise_id: string }) => e.exercise_id)).toEqual(['2']))

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(exerciseHeading()).toHaveTextContent('Squat')
    expectPosition(1, 2)
    expect(screen.getByRole('heading', { name: 'No sets left' })).toBeInTheDocument()
  })

  it('an entry without an exercise says "this exercise" when it is empty', async () => {
    const user = userEvent.setup()
    renderAt('/workout')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('No exercise chosen'))
    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))
    expect(screen.getByText('Add a set to keep this exercise.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose an exercise' })).toBeInTheDocument()
    // A tap on the dock opens the exercise search, so its name says Add exercise
    expect(exerciseHeading()).toHaveAccessibleName('Exercise 1 of 1, No exercise chosen, no sets. Add exercise')
    await user.click(exerciseHeading())
    expect(screen.getByRole('dialog', { name: 'Add exercise' })).toBeInTheDocument()
  })

  it('Add a set on an exercise without history starts blank', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=4')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Next exercise: Bench' }))
    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))
    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))
    await user.click(screen.getByRole('button', { name: 'Add a set' }))
    expect(screen.getByRole('button', { name: 'Set 1 of 1, – reps' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Reps for set 1')).toHaveValue('')
    expect(screen.getByLabelText('Weight for set 1')).toHaveValue('')
  })

  it('Finish refuses an exercise with no sets and goes to it', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=4')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))
    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))
    await user.click(screen.getByRole('button', { name: 'Next exercise: Bench' }))
    expect(exerciseHeading()).toHaveTextContent('Bench')

    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Squat has no sets. Add a set or remove it before finishing.')
    expect(screen.queryByRole('dialog', { name: 'Finish workout' })).not.toBeInTheDocument()
    expectPosition(1, 2)
    expect(screen.getByRole('heading', { name: 'No sets left' })).toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('a restored draft on an empty exercise moves no focus', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 3, title: 'Full body', duration_seconds: null, calories: '', date: '2026-09-01T10:00',
        notes: '', wellbeing: null, rpe: null, templateId: null,
        exercises: [
          { exercise_id: '1', sets: [] },
          { exercise_id: '2', sets: [set('8', '60')] },
        ],
        workout: { currentExerciseIndex: 0, restEndsAt: null, startedAt: Date.now() },
      }),
    )
    renderAt('/workout?resume=1')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.getByRole('heading', { name: 'No sets left' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a set' })).not.toHaveFocus()
    expect(document.body).toHaveFocus()
  })

  it('Undo after deleting a done set that was open for editing brings back its saved values', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(screen.getByRole('button', { name: 'Set 1 of 2, 5 × 100 kg, done' }))
    await user.click(screen.getByRole('button', { name: 'Increase reps by 1' }))
    expect(screen.getByLabelText('Reps for set 1')).toHaveValue('6')
    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(screen.getByRole('button', { name: 'Set 1 of 2, 5 × 100 kg, done' })).toBeInTheDocument()
    await waitFor(() =>
      expect(storedDraft()?.exercises[0].sets).toEqual([set('5', '100', true), set('5', '102.5')]),
    )
  })

  it('Undo after deleting the only set while editing it brings back its saved values', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 3, title: 'Full body', duration_seconds: null, calories: '', date: '2026-09-01T10:00',
        notes: '', wellbeing: null, rpe: null, templateId: null,
        exercises: [
          { exercise_id: '1', sets: [set('5', '100', true)] },
          { exercise_id: '2', sets: [set('8', '60')] },
        ],
        workout: { currentExerciseIndex: 0, restEndsAt: null, startedAt: Date.now() },
      }),
    )
    renderAt('/workout?resume=1')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Set 1 of 1, 5 × 100 kg, done' }))
    await user.click(screen.getByRole('button', { name: 'Increase weight' }))
    expect(screen.getByLabelText('Weight for set 1')).toHaveValue('104')
    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))
    expect(screen.getByRole('heading', { name: 'No sets left' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(screen.getByRole('heading', { name: 'Squat done' })).toBeInTheDocument()
    // The tab names the live values (the stored draft may not have caught up yet)
    expect(screen.getByRole('button', { name: 'Set 1 of 1, 5 × 100 kg, done' })).toBeInTheDocument()
    await waitFor(() => expect(storedDraft()?.exercises[0].sets).toEqual([set('5', '100', true)]))
  })

  it('removes an exercise from the chooser with Undo; no trash on rows with done sets or on the only exercise', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 3, title: 'Mixed', duration_seconds: null, calories: '', date: '2026-09-01T10:00',
        notes: '', wellbeing: null, rpe: null, templateId: null,
        exercises: [
          { exercise_id: '1', sets: [set('5', '100', true), set('5', '100')] },
          { exercise_id: '2', sets: [set('8', '60')] },
          { exercise_id: '5', sets: [set('6', '')] },
        ],
        workout: { currentExerciseIndex: 2, restEndsAt: null, startedAt: Date.now() },
      }),
    )
    renderAt('/workout?resume=1')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Pull-up'))
    await user.click(dock())
    let sheet = screen.getByRole('dialog', { name: 'Choose exercise' })
    expect(within(sheet).queryByRole('button', { name: 'Remove Squat from this workout' })).not.toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Remove Bench from this workout' }))

    // The sheet closes; Pull-up stays current (now 2 of 2)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(exerciseHeading()).toHaveTextContent('Pull-up')
    expectPosition(2, 2)
    expect(screen.getByRole('status')).toHaveTextContent('Bench removed')
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expectPosition(3, 3)
    await waitFor(() =>
      expect(storedDraft()?.exercises.map((e: { exercise_id: string }) => e.exercise_id)).toEqual(['1', '2', '5']),
    )

    // Removing the current exercise selects its neighbour
    await user.click(dock())
    sheet = screen.getByRole('dialog', { name: 'Choose exercise' })
    await user.click(within(sheet).getByRole('button', { name: 'Remove Pull-up from this workout' }))
    expect(exerciseHeading()).toHaveTextContent('Bench')
    expectPosition(2, 2)
  })

  it('the only exercise has no trash in the chooser', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(dock())
    const sheet = screen.getByRole('dialog', { name: 'Choose exercise' })
    expect(within(sheet).queryByRole('button', { name: /^Remove / })).not.toBeInTheDocument()
  })

  it('‹ and › step through the list in order and are disabled at the ends', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=4')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.getByRole('button', { name: 'Previous exercise' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next exercise: Bench' }))
    expect(exerciseHeading()).toHaveTextContent('Bench')
    expect(screen.getByRole('button', { name: 'Next exercise' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous exercise: Squat' }))
    expect(exerciseHeading()).toHaveTextContent('Squat')
  })

  it('the dock shows one bar segment per set, filled for done sets', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(dock()).toHaveAccessibleName('Exercise 1 of 1, Squat, 0 of 2 sets done. Choose exercise')
    expect(segments()).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(screen.getByRole('button', { name: 'Add set' }))
    expect(dock()).toHaveAccessibleName('Exercise 1 of 1, Squat, 1 of 3 sets done. Choose exercise')
    expect(segments().map((el) => el.classList.contains('bg-primary'))).toEqual([true, false, false])
  })

  it('chooser rows say what was done today, what is left, or last time; the header shows the running rest', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=4')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(dock())
    let sheet = screen.getByRole('dialog', { name: 'Choose exercise' })
    expect(within(sheet).getByText('Last time: 8×57.5, 8×57.5, 8×57.5, 8×57.5 kg')).toBeInTheDocument()
    // Bench has no history
    expect(within(sheet).getByText('2 sets')).toBeInTheDocument()
    expect(within(sheet).queryByText(/^Resting/)).not.toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Close' }))

    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(dock())
    sheet = screen.getByRole('dialog', { name: 'Choose exercise' })
    const squat = within(sheet).getByRole('button', { name: 'Squat, current, 1 of 2 sets done' })
    expect(squat).toHaveAccessibleDescription('Today: 5×100 kg · 1 set left')
    expect(within(sheet).getByText(/^Resting/)).toHaveTextContent(/Resting 1:(30|29)/)
    await user.click(within(sheet).getByRole('button', { name: 'Close' }))

    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(dock())
    sheet = screen.getByRole('dialog', { name: 'Choose exercise' })
    const done = within(sheet).getByRole('button', { name: 'Squat, current, all 2 sets done' })
    expect(done).toHaveAccessibleDescription('Today: 5×100, 5×100 kg')
    expect(done).toHaveClass('opacity-60')
    expect(within(sheet).getByRole('heading', { name: 'Done' })).toBeInTheDocument()
  })
})

describe('Workout mode: rest length from the profile', () => {
  /** The first GET /profile waits for `response`. */
  function serveProfileOnce(response: Promise<unknown>) {
    const base = mockGet.getMockImplementation()!
    let first = true
    mockGet.mockImplementation((path: string) => {
      if (path === '/profile' && first) {
        first = false
        return response as never
      }
      return base(path)
    })
  }

  it('the profile rest_seconds drives the timer and replaces the cached value', async () => {
    localStorage.setItem('trainlytics_rest_seconds', '60')
    profile.rest_seconds = 135
    const user = userEvent.setup()
    renderAt('/workout?templateId=4')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await waitFor(() => expect(screen.getByTestId('rest-clock')).toHaveTextContent('2:15'))
    expect(localStorage.getItem('trainlytics_rest_seconds')).toBe('135')

    const before = Date.now()
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await waitFor(() => expect(storedDraft()?.workout?.restEndsAt).toBeGreaterThanOrEqual(before + 135_000))
    expect(storedDraft().workout.restEndsAt).toBeLessThan(Date.now() + 136_000)

    // Not a preset: the options sheet names it, and no chip is pressed
    await user.click(screen.getByRole('button', { name: 'Workout options' }))
    const sheet = screen.getByRole('dialog', { name: 'Workout options' })
    expect(within(sheet).getByRole('group', { name: 'Rest timer · 2:15' })).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { pressed: true })).not.toBeInTheDocument()
  })

  it('choosing a chip saves it to the profile', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=4')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Workout options' }))
    const sheet = screen.getByRole('dialog', { name: 'Workout options' })
    expect(within(sheet).getByRole('button', { name: '90s' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(sheet).getByRole('button', { name: '120s' }))
    expect(mockPatch).toHaveBeenCalledWith('/profile', { rest_seconds: 120 })
    expect(within(sheet).getByRole('button', { name: '120s' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sheet).getByRole('group', { name: 'Rest timer' })).toBeInTheDocument()
    expect(localStorage.getItem('trainlytics_rest_seconds')).toBe('120')
  })

  it('a failed save keeps the chosen length for the workout', async () => {
    mockPatch.mockImplementation(async (path: string) => {
      if (path === '/profile') throw new TypeError('Failed to fetch')
      return {} as never
    })
    const user = userEvent.setup()
    renderAt('/workout?templateId=4')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Workout options' }))
    const sheet = screen.getByRole('dialog', { name: 'Workout options' })
    await user.click(within(sheet).getByRole('button', { name: '180s' }))
    expect(await within(sheet).findByRole('status')).toHaveTextContent(
      'Not saved to your profile yet; this device uses 3:00 and will retry.',
    )
    expect(within(sheet).getByRole('button', { name: '180s' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(sheet).getByRole('button', { name: 'Close' }))

    expect(screen.getByTestId('rest-clock')).toHaveTextContent('3:00')
    const before = Date.now()
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await waitFor(() => expect(storedDraft()?.workout?.restEndsAt).toBeGreaterThanOrEqual(before + 180_000))
    expect(exerciseHeading()).toHaveTextContent('Squat')
  })

  it('a length picked in another tab reaches the open workout', async () => {
    renderAt('/workout?templateId=4')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/profile'))
    expect(screen.getByTestId('rest-clock')).toHaveTextContent('1:30')

    // Settings in another tab stored 2:30; this tab only hears the storage event
    localStorage.setItem('trainlytics_rest_seconds', '150')
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'trainlytics_rest_seconds', newValue: '150' })))
    expect(screen.getByTestId('rest-clock')).toHaveTextContent('2:30')
  })

  it('a new length never moves a running rest; the next rest uses it', async () => {
    let releaseProfile!: (p: unknown) => void
    serveProfileOnce(new Promise((r) => (releaseProfile = r)))
    const user = userEvent.setup()
    renderAt('/workout?templateId=4')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))

    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await waitFor(() => expect(storedDraft()?.workout?.restEndsAt).toEqual(expect.any(Number)))
    const endsAt = storedDraft().workout.restEndsAt
    expect(screen.getByTestId('rest-clock')).toHaveTextContent(/1:(30|29)/)

    // The profile arrives mid-rest with another length
    profile.rest_seconds = 135
    await act(async () => releaseProfile({ ...profile }))
    await waitFor(() => expect(localStorage.getItem('trainlytics_rest_seconds')).toBe('135'))
    // A preset picked mid-rest
    await user.click(screen.getByRole('button', { name: 'Workout options' }))
    const sheet = screen.getByRole('dialog', { name: 'Workout options' })
    await user.click(within(sheet).getByRole('button', { name: '180s' }))
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('/profile', { rest_seconds: 180 }))
    await user.click(within(sheet).getByRole('button', { name: 'Close' }))

    await act(() => new Promise((r) => setTimeout(r, 400)))
    expect(storedDraft().workout.restEndsAt).toBe(endsAt)
    expect(screen.getByTestId('rest-clock')).toHaveTextContent(/1:(30|29|28|27)/)

    // Reset starts a rest of the new length
    const before = Date.now()
    await user.click(screen.getByRole('button', { name: 'Restart rest timer' }))
    await waitFor(() => expect(storedDraft().workout.restEndsAt).toBeGreaterThanOrEqual(before + 180_000))
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

    const doneTab = screen.getByRole('button', { name: 'Set 1 of 2, 5 × 100 kg, RPE 8, done' })
    expect(within(doneTab).getByText('5×100')).toBeInTheDocument()
    expect(within(doneTab).getByText('RPE 8')).toBeInTheDocument()
    // Never prefilled: the next set starts unrated
    for (const n of [5, 6, 7, 8, 9, 10]) {
      expect(screen.getByRole('button', { name: `RPE ${n} for set 2` })).toHaveAttribute('aria-pressed', 'false')
    }
    await waitFor(() => expect(storedDraft()?.exercises[0].sets[0].rpe).toBe('8'))

    await user.click(doneTab)
    const again = screen.getByRole('button', { name: 'RPE 8 for set 1' })
    expect(again).toHaveAttribute('aria-pressed', 'true')
    await user.click(again)
    expect(again).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Set 1 of 2, 5 × 100 kg, done' })).not.toHaveTextContent('RPE')
    await waitFor(() => expect(storedDraft()?.exercises[0].sets[0].rpe).toBe(''))
  })

  it('Finish is refused while a set has an RPE that would not be saved', async () => {
    const user = userEvent.setup()
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 3, title: 'Full body', duration_seconds: null, calories: '', date: '2026-09-01T10:00',
        notes: '', wellbeing: null, rpe: null, templateId: null,
        exercises: [
          { exercise_id: '1', sets: [set('5', '100', true)] },
          { exercise_id: '2', sets: [set('8', '60', true), set('8', '60', true, '', '85')] },
        ],
        workout: { currentExerciseIndex: 0, restEndsAt: null, startedAt: Date.now() },
      }),
    )
    renderAt('/workout?resume=1')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    // Every exercise is done, so the done card finishes the workout
    await user.click(screen.getByRole('button', { name: 'Finish workout' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Bench, set 2: RPE "85" must be a whole number from 1 to 10.')
    // Jumps to the exercise with the bad value; no finish sheet, nothing sent
    expect(exerciseHeading()).toHaveTextContent('Bench')
    expect(screen.queryByRole('dialog', { name: 'Finish workout' })).not.toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })
})

describe('Workout mode: RPE chips', () => {
  const draftWithRpe = (rpe: string) => ({
    version: 2,
    title: 'Leg day',
    duration_seconds: null,
    calories: '',
    date: '2026-09-01T10:00',
    notes: '',
    wellbeing: null,
    rpe: null,
    exercises: [{ exercise_id: '1', sets: [set('5', '100', false, '', rpe), set('5', '100')] }],
    templateId: 3,
    workout: { currentExerciseIndex: 0, restEndsAt: null, startedAt: Date.now() - 5 * 60_000 },
  })

  it('marks the selected chip pressed with the dark selected style', async () => {
    const user = userEvent.setup()
    renderAt('/workout?templateId=3')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    const chip7 = screen.getByRole('button', { name: 'RPE 7 for set 1' })
    expect(chip7).toHaveClass('border-border', 'bg-surface', 'text-text')
    await user.click(chip7)
    expect(chip7).toHaveAttribute('aria-pressed', 'true')
    expect(chip7).toHaveClass('border-primary-dark', 'bg-primary-dark', 'text-white', 'font-semibold')
    expect(screen.getByRole('button', { name: 'RPE 8 for set 1' })).toHaveClass('border-border', 'bg-surface', 'text-text')
  })

  it('shows an off-chip value (typed on the log page) in the label with a Clear button', async () => {
    const user = userEvent.setup()
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draftWithRpe('4')))
    renderAt('/workout?templateId=3&resume=1')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))

    expect(screen.getByText(/^RPE ·/)).toHaveTextContent('RPE · 4')
    for (const n of [5, 6, 7, 8, 9, 10]) {
      expect(screen.getByRole('button', { name: `RPE ${n} for set 1` })).toHaveAttribute('aria-pressed', 'false')
    }
    await user.click(screen.getByRole('button', { name: 'Clear RPE for set 1' }))
    expect(screen.queryByRole('button', { name: 'Clear RPE for set 1' })).not.toBeInTheDocument()
    expect(screen.queryByText(/^RPE ·/)).not.toBeInTheDocument()
    await waitFor(() => expect(storedDraft()?.exercises[0].sets[0].rpe).toBe(''))
  })

  it('a chip replaces an off-chip value', async () => {
    const user = userEvent.setup()
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draftWithRpe('4')))
    renderAt('/workout?templateId=3&resume=1')
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))

    await user.click(screen.getByRole('button', { name: 'RPE 9 for set 1' }))
    expect(screen.getByRole('button', { name: 'RPE 9 for set 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Clear RPE for set 1' })).not.toBeInTheDocument()
    await waitFor(() => expect(storedDraft()?.exercises[0].sets[0].rpe).toBe('9'))

    await user.click(screen.getByRole('button', { name: 'RPE 6 for set 1' }))
    expect(screen.getByRole('button', { name: 'RPE 6 for set 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'RPE 9 for set 1' })).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(storedDraft()?.exercises[0].sets[0].rpe).toBe('6'))
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
    expectPosition(2, 2)
    expect(screen.getByText('3 of 4 sets · 1 of 2 exercises')).toBeInTheDocument()
    expect(screen.getByLabelText('Reps for set 2')).toHaveValue('8')
    expect(screen.getByTestId('rest-clock')).toHaveTextContent(/0:4[45]/)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Set 1 of 2, 8 × 60 kg, done' }))
    expect(screen.getByLabelText('Note')).toHaveValue('easy')
  })

  it('opening fresh with a stored draft asks Restore or Discard', async () => {
    const user = userEvent.setup()
    localStorage.setItem(DRAFT_KEY, JSON.stringify(midWorkout(Date.now() + 45_000)))
    renderAt('/workout?templateId=3')

    expect(await screen.findByText('You have an unsaved Strength draft.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: DOCK_NAME })).not.toBeInTheDocument()
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
    await user.type(screen.getAllByPlaceholderText('note')[1], 'tough')
    await user.click(screen.getAllByRole('checkbox')[0])
    await user.click(screen.getByRole('button', { name: 'Workout mode' }))

    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.queryByText('You have an unsaved Strength draft.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set 1 of 2, 5 × 100 kg, done' })).toBeInTheDocument()
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
    expectPosition(1, 2)
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
    expectPosition(1, 2)
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
    await waitFor(() => expectPosition(2, 2))
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Full body' }))
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expectPosition(1, 2)
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
    expect(screen.queryByRole('button', { name: DOCK_NAME })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Workout options' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Finish' })).toBeDisabled()

    await act(async () => {
      release(legDay)
    })
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
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
    await user.click(screen.getByRole('button', { name: 'Add set' }))
    // Only the open set (the first not done) has a delete button
    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))
    expect(await screen.findByText('Set deleted')).toBeInTheDocument()

    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Full body' }))
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.queryByText('Set deleted')).not.toBeInTheDocument()
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
    await waitFor(() => expectPosition(2, 2))
    const dialog = await openSheet(user)
    await user.click(within(dialog).getByRole('button', { name: 'Full body' }))
    await screen.findByRole('alert')
    fail = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expectPosition(1, 2))
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

