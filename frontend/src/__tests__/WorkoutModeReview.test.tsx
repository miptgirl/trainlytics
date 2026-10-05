/**
 * Regression tests for the workout-mode review (blockers B1–B3 and should-fixes).
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const set = (reps: string, weight: string, done = false, notes = '') => ({ reps, weight, notes, done })
const tSet = (n: number, reps: number, weight_kg: number, notes: string | null = null) => ({
  set_number: n,
  reps,
  weight_kg,
  notes,
})

const exerciseList = [
  { id: 1, name: 'Squat', types: [{ id: 7, name: 'Legs' }] },
  { id: 2, name: 'Bench', types: [{ id: 8, name: 'Chest' }] },
  { id: 5, name: 'Pull-up', types: [{ id: 9, name: 'Back' }] },
]
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
const threeSets = {
  id: 6,
  name: 'Three sets',
  exercises: [
    { exercise_id: 1, exercise_name: 'Squat', order: 1, sets: [tSet(1, 5, 100), tSet(2, 6, 100), tSet(3, 7, 100)] },
  ],
}

const templates: Record<string, unknown> = {
  '/templates/strength/3': legDay,
  '/templates/strength/4': fullBody,
  '/templates/strength/6': threeSets,
}
// Per-test overrides: path → promise factory
let slow: Record<string, () => Promise<unknown>> = {}

function Probe() {
  const loc = useLocation()
  const navigate = useNavigate()
  return (
    <div>
      <p data-testid="location">{loc.pathname + loc.search}</p>
      <button type="button" onClick={() => navigate(-1)}>
        history back
      </button>
    </div>
  )
}

function renderAt(entries: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Probe />
        <Routes>
          <Route path="/workout" element={<WorkoutModePage />} />
          <Route path="/log" element={<LogWorkoutPage />} />
          <Route path="/plan" element={<p>Plan page</p>} />
          <Route path="/sessions/:id" element={<p>Session detail page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const location = () => screen.getByTestId('location').textContent
const exerciseHeading = () => screen.getByRole('heading', { level: 2 })

const fullBodyDraft = {
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
  workout: { currentExerciseIndex: 1, restEndsAt: null, startedAt: 1_790_000_000_000, autoDurationSeconds: null },
}

beforeEach(() => {
  localStorage.clear()
  slow = {}
  mockGet.mockReset()
  mockPost.mockReset()
  mockPatch.mockReset()
  mockGet.mockImplementation(async (path: string) => {
    if (slow[path]) return (await slow[path]()) as never
    if (path === '/profile') return { ai_key_configured: false } as never
    if (path === '/exercises') return exerciseList as never
    if (path === '/templates/strength') return [] as never
    if (templates[path]) return templates[path] as never
    if (path === '/exercises/1/last-session-defaults') {
      return { sets: [1, 2, 3, 4].map((n) => ({ set_number: n, reps: 8, weight: 57.5 })) } as never
    }
    if (path.endsWith('/last-session-defaults')) return { sets: [] } as never
    return [] as never
  })
  mockPost.mockResolvedValue({ id: 42 } as never)
  mockPatch.mockResolvedValue({} as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('B1: a pending draft is never overwritten and Back never lands on a stale form', () => {
  it('full form with a pending draft: no autosave, Save disabled', async () => {
    const user = userEvent.setup()
    localStorage.setItem(DRAFT_KEY, JSON.stringify(fullBodyDraft))
    renderAt(['/log?type=strength&templateId=3'])

    expect(await screen.findByText('You have an unsaved Strength draft.')).toBeInTheDocument()
    expect(screen.getByText(/Full body · 1 Sep, 10:00 · 3 of 4 sets done/)).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('Optional notes…'), 'oops')
    await act(() => sleep(400))
    expect(storedDraft()).toEqual(fullBodyDraft)
    expect(screen.getByRole('button', { name: 'Save Session' })).toBeDisabled()
    // S2: the form is inert until Restore/Discard, so nothing typed can be lost
    expect(screen.getByRole('button', { name: 'Save Session' }).closest('form')).toHaveAttribute('inert')
  })

  it('Full form → Workout mode → ✕ returns to the page before the form, with the draft intact', async () => {
    const user = userEvent.setup()
    renderAt(['/plan', '/log?type=strength&templateId=3'])
    await screen.findByText(/Pre-filled from/)
    await user.type(screen.getAllByPlaceholderText('note')[0], 'warm-up')
    await user.click(screen.getByRole('button', { name: 'Workout mode' }))
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))

    // Back from workout mode: the replaced /log entry is gone
    await user.click(screen.getByRole('button', { name: 'history back' }))
    expect(location()).toBe('/plan')
    expect(screen.getByText('Plan page')).toBeInTheDocument()
    await waitFor(() => expect(storedDraft()?.exercises[0].sets[0]).toEqual(set('5', '100', true, 'warm-up')))
  })

  it('Workout mode → Full form also replaces the entry', async () => {
    const user = userEvent.setup()
    renderAt(['/plan', '/workout?type=strength&templateId=3'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(screen.getByRole('button', { name: 'Workout options' }))
    await user.click(screen.getByRole('button', { name: 'Full form' }))
    await screen.findByText(/Pre-filled from/)
    expect(location()).toMatch(/^\/log\?type=strength&templateId=3.*resume=1/)
    await user.click(screen.getByRole('button', { name: 'history back' }))
    expect(location()).toBe('/plan')
  })

  it('after a save, Back does not reopen workout mode', async () => {
    const user = userEvent.setup()
    renderAt(['/plan', '/workout?type=strength&templateId=3'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await user.click(screen.getByRole('button', { name: 'Save workout' }))
    await screen.findByText('Session detail page')
    await user.click(screen.getByRole('button', { name: 'history back' }))
    expect(location()).toBe('/plan')
    expect(storedDraft()).toBeNull()
  })
})

describe('B2: a late template response never overwrites a restored draft', () => {
  it('does not fetch the URL template while the prompt shows; Restore keeps the draft', async () => {
    const user = userEvent.setup()
    localStorage.setItem(DRAFT_KEY, JSON.stringify(fullBodyDraft))
    renderAt(['/workout?type=strength&templateId=3'])
    await screen.findByText('You have an unsaved Strength draft.')
    expect(mockGet).not.toHaveBeenCalledWith('/templates/strength/3')

    await user.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Bench'))
    await act(() => sleep(400))
    expect(exerciseHeading()).toHaveTextContent('Bench')
    expect(mockGet).not.toHaveBeenCalledWith('/templates/strength/3')
    expect(storedDraft()?.templateId).toBe(4)
  })

  it('Discard loads the URL template', async () => {
    const user = userEvent.setup()
    localStorage.setItem(DRAFT_KEY, JSON.stringify(fullBodyDraft))
    renderAt(['/workout?type=strength&templateId=3'])
    await user.click(await screen.findByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.getByText('0 of 2 sets · 0 of 1 exercises')).toBeInTheDocument()
  })
})

describe('B3: undo while editing a done set cannot corrupt another set', () => {
  it('delete set 1, edit (old) set 3, Undo → editor closes and every set keeps its values', async () => {
    const user = userEvent.setup()
    renderAt(['/workout?type=strength&templateId=6'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Complete set' }))

    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))
    await user.click(screen.getByRole('button', { name: 'Edit set 2, 7 × 100 kg, done' }))
    expect(screen.getByText('Edit set 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(screen.queryByText(/^Edit set \d$/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(storedDraft()?.exercises[0].sets).toEqual([
        set('5', '100', true),
        set('6', '100', true),
        set('7', '100', true),
      ]),
    )
  })

  it('a note field opened on one set does not carry over to the next after a delete', async () => {
    const user = userEvent.setup()
    renderAt(['/workout?type=strength&templateId=6'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: '+ Add note' }))
    expect(screen.getByLabelText('Note')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete set 1' }))
    expect(screen.queryByLabelText('Note')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Reps for set 1')).toHaveValue('6')
  })
})

describe('Set editor layout and input (1, nit)', () => {
  it('reps and weight are separate stepper rows with wide inputs; weight is sanitised', async () => {
    const user = userEvent.setup()
    renderAt(['/workout?type=strength&templateId=3'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    const weight = screen.getByLabelText('Weight for set 2')
    expect(weight).toHaveValue('102.5')
    expect(weight.className).toMatch(/\bw-28\b/)
    expect(weight.className).toMatch(/text-\[2rem\]/)
    const reps = screen.getByLabelText('Reps for set 2')
    expect(reps.parentElement).not.toBe(weight.parentElement)

    await user.clear(weight)
    await user.type(weight, '2.5.5')
    expect(weight).toHaveValue('2.55')
    await user.clear(weight)
    await user.type(weight, '.5')
    expect(weight).toHaveValue('0.5')
  })
})

describe('Exercise placeholder and removal (2)', () => {
  it('"Choose an exercise" fills a placeholder that already has values, keeping its sets', async () => {
    const user = userEvent.setup()
    renderAt(['/workout?type=strength'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('No exercise chosen'))
    await user.type(screen.getByLabelText('Reps for set 1'), '5')
    await user.click(screen.getByRole('button', { name: 'Choose an exercise' }))
    const add = screen.getByRole('dialog', { name: 'Add exercise' })
    await user.click(within(add).getByRole('button', { name: 'Pull-up' }))

    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Pull-up'))
    expect(screen.getByText('Exercise 1 of 1')).toBeInTheDocument()
    await waitFor(() => expect(storedDraft()?.exercises).toEqual([{ exercise_id: '5', sets: [set('5', '')] }]))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(screen.getByRole('dialog', { name: 'Finish workout' })).toBeInTheDocument()
  })

  it('removes the current exercise from the options sheet, with Undo', async () => {
    const user = userEvent.setup()
    renderAt(['/workout?type=strength&templateId=4'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Workout options' }))
    await user.click(screen.getByRole('button', { name: 'Remove Squat' }))
    expect(exerciseHeading()).toHaveTextContent('Bench')
    expect(screen.getByText('Exercise 1 of 1')).toBeInTheDocument()
    expect(screen.getByText('Squat removed')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(exerciseHeading()).toHaveTextContent('Squat')
    expect(screen.getByText('Exercise 1 of 2')).toBeInTheDocument()
  })

  it('the last remaining exercise cannot be removed', async () => {
    const user = userEvent.setup()
    renderAt(['/workout?type=strength&templateId=3'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Workout options' }))
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument()
  })
})

describe('Draft creation and prompt (4)', () => {
  it('opening workout mode does not create a draft; the first change does, with the start time', async () => {
    const user = userEvent.setup()
    const before = Date.now()
    renderAt(['/workout?type=strength&templateId=3'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await act(() => sleep(400))
    expect(storedDraft()).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await waitFor(() => expect(storedDraft()?.workout?.startedAt).toBeGreaterThanOrEqual(before))
  })

  it('the workout-mode prompt names the waiting draft', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(fullBodyDraft))
    renderAt(['/workout?type=strength&templateId=3'])
    expect(await screen.findByText('Full body · 1 Sep, 10:00 · 3 of 4 sets done')).toBeInTheDocument()
  })
})

describe('Finish and save (6, 7, 10, 11, nit)', () => {
  it('recomputes the duration on every Finish unless the user typed one', async () => {
    const user = userEvent.setup()
    const t0 = Date.now()
    let now = t0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    renderAt(['/workout?type=strength&templateId=3'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))

    now = t0 + 20 * 60_000
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(screen.getByLabelText('Duration')).toHaveValue('20:00')
    await user.click(screen.getByRole('button', { name: 'Close' }))

    now = t0 + 31 * 60_000
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    const duration = screen.getByLabelText('Duration')
    expect(duration).toHaveValue('31:00')
    await user.clear(duration)
    await user.type(duration, '45:00')
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Close' }))

    now = t0 + 50 * 60_000
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(screen.getByLabelText('Duration')).toHaveValue('45:00')
  })

  it('retry after a failed POST does not ask about the template again or PATCH twice', async () => {
    const user = userEvent.setup()
    mockPost.mockRejectedValueOnce(Object.assign(new Error('Server exploded'), { status: 500 }))
    renderAt(['/workout?type=strength&templateId=3'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Increase reps by 1' }))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await user.click(screen.getByRole('button', { name: 'Save workout' }))
    await user.click(await screen.findByRole('button', { name: 'Yes, update template' }))

    expect(await screen.findByText(/The server couldn't save the workout \(error 500\)/)).toBeInTheDocument()
    expect(mockPatch).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Retry save' }))
    await screen.findByText('Session detail page')
    expect(screen.queryByText(/Update template/)).not.toBeInTheDocument()
    expect(mockPatch).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledTimes(2)
  })

  it('shows the server message for a 4xx', async () => {
    const user = userEvent.setup()
    mockPost.mockRejectedValueOnce(Object.assign(new Error('Invalid set'), { status: 422 }))
    renderAt(['/workout?type=strength&templateId=3'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await user.click(screen.getByRole('button', { name: 'Save workout' }))
    const alert = await screen.findByText(/Couldn't save the workout: Invalid set/)
    expect(alert).not.toHaveTextContent(/connection/)
  })

  it('the template prompt is a modal dialog: focus inside, Escape cancels', async () => {
    const user = userEvent.setup()
    renderAt(['/workout?type=strength&templateId=3'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Increase reps by 1' }))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await user.click(screen.getByRole('button', { name: 'Save workout' }))
    const dialog = await screen.findByRole('dialog', { name: 'Update template "Leg day"?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /Update template/ })).not.toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('no rest timer after the very last set; "Last exercise" while sets are left', async () => {
    const user = userEvent.setup()
    renderAt(['/workout?type=strength&templateId=3'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.getByText('Last exercise')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Finish ›' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    expect(screen.getByRole('button', { name: 'Skip rest' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    expect(screen.getByRole('button', { name: 'Skip rest' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Finish ›' })).toBeInTheDocument()
  })

  it('"Next" is a secondary button; Complete set is the primary action', async () => {
    renderAt(['/workout?type=strength&templateId=4'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    expect(screen.getByRole('button', { name: /Next: Bench/ }).className).not.toMatch(/bg-primary-dark/)
    expect(screen.getByRole('button', { name: 'Complete set' }).className).toMatch(/bg-primary-dark/)
  })
})

describe('Sheets (browser re-check)', () => {
  it('switching Choose → Add exercise focuses the search, and Escape still closes it', async () => {
    const user = userEvent.setup()
    renderAt(['/workout?type=strength&templateId=4'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    const opener = screen.getByRole('button', { name: 'Choose exercise' })
    await user.click(opener)
    await user.click(screen.getByRole('button', { name: '+ Add exercise' }))
    expect(screen.getByLabelText('Search exercises')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('Escape in the template prompt does not also close the Finish sheet', async () => {
    const user = userEvent.setup()
    renderAt(['/workout?type=strength&templateId=3'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Increase reps by 1' }))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await user.click(screen.getByRole('button', { name: 'Save workout' }))
    await screen.findByRole('dialog', { name: /Update template/ })
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /Update template/ })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Finish workout' })).toBeInTheDocument()
  })
})

describe('Add exercise (9)', () => {
  it('a double tap adds once; reps and weight come from last session', async () => {
    const user = userEvent.setup()
    let release: () => void = () => {}
    slow['/exercises/1/last-session-defaults'] = () =>
      new Promise((r) => {
        release = () => r({ sets: [{ set_number: 1, reps: 8, weight: 57.5 }] })
      })
    renderAt(['/workout?type=strength&templateId=4'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Choose exercise' }))
    await user.click(screen.getByRole('button', { name: '+ Add exercise' }))
    const add = screen.getByRole('dialog', { name: 'Add exercise' })
    const squat = within(add).getByRole('button', { name: 'Squat' })
    await user.click(squat)
    expect(squat).toBeDisabled()
    await user.click(squat)
    await act(async () => release())

    await waitFor(() => expect(screen.getByText('Exercise 3 of 3')).toBeInTheDocument())
    await waitFor(() =>
      expect(storedDraft()?.exercises[2]).toEqual({
        exercise_id: '1',
        sets: [set('8', '57.5'), set('8', '57.5'), set('8', '57.5')],
      }),
    )
  })
})

describe('Second review', () => {
  it('S1: resuming keeps the start time; Finish fills the real elapsed time', async () => {
    const user = userEvent.setup()
    const startedAt = Date.now() - 37 * 60_000
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...fullBodyDraft, workout: { ...fullBodyDraft.workout, startedAt } }),
    )
    renderAt(['/workout?type=strength&templateId=4&resume=1'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Bench'))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await waitFor(() => expect(storedDraft()?.workout?.startedAt).toBe(startedAt))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    expect(screen.getByLabelText('Duration')).toHaveValue('37:00')
  })

  it('S1: a draft handed over by the full form opens on the first unfinished exercise', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...fullBodyDraft, workout: { ...fullBodyDraft.workout, currentExerciseIndex: 0, startedAt: null } }),
    )
    renderAt(['/workout?type=strength&templateId=4&resume=1'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Bench'))
    expect(screen.getByText('Exercise 2 of 2')).toBeInTheDocument()
  })

  it('S2: the full form becomes editable again after Restore', async () => {
    const user = userEvent.setup()
    localStorage.setItem(DRAFT_KEY, JSON.stringify(fullBodyDraft))
    renderAt(['/log?type=strength&templateId=3'])
    await user.click(await screen.findByRole('button', { name: 'Restore' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save Session' }).closest('form')).not.toHaveAttribute('inert'),
    )
    expect(screen.getByRole('button', { name: 'Save Session' })).toBeEnabled()
  })

  it('nit: Escape while the template PATCH is running closes neither the prompt nor the Finish sheet', async () => {
    const user = userEvent.setup()
    let releasePatch: () => void = () => {}
    mockPatch.mockImplementation(() => new Promise((r) => (releasePatch = () => r({}))) as never)
    renderAt(['/workout?type=strength&templateId=3'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Increase reps by 1' }))
    await user.click(screen.getByRole('button', { name: 'Finish' }))
    await user.click(screen.getByRole('button', { name: 'Save workout' }))
    await user.click(await screen.findByRole('button', { name: 'Yes, update template' }))
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: /Update template/ })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Finish workout' })).toBeInTheDocument()
    await act(async () => releasePatch())
    await screen.findByText('Session detail page')
  })

  it('nit: removing an exercise with completed sets asks first', async () => {
    const user = userEvent.setup()
    renderAt(['/workout?type=strength&templateId=4'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(screen.getByRole('button', { name: 'Workout options' }))
    await user.click(screen.getByRole('button', { name: 'Remove Squat' }))
    expect(screen.getByText('Remove Squat and its 1 completed set?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep' }))
    expect(screen.getByText('Exercise 1 of 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove Squat' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(exerciseHeading()).toHaveTextContent('Bench')
    expect(screen.getByText('Squat removed')).toBeInTheDocument()
  })

  it('nit: a failed template load shows Retry instead of an endless Loading…', async () => {
    const user = userEvent.setup()
    let fail = true
    slow['/templates/strength/3'] = async () => {
      if (fail) throw new Error('offline')
      return legDay
    }
    renderAt(['/workout?type=strength&templateId=3'])
    expect(await screen.findByText(/Couldn't load the template/)).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
  })

  it('header Finish is outlined while sets remain and filled when everything is done', async () => {
    const user = userEvent.setup()
    renderAt(['/workout?type=strength&templateId=3'])
    await waitFor(() => expect(exerciseHeading()).toHaveTextContent('Squat'))
    const finish = () => screen.getByRole('button', { name: 'Finish' })
    expect(finish().className).not.toMatch(/bg-primary-dark/)
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    await user.click(screen.getByRole('button', { name: 'Complete set' }))
    expect(finish().className).toMatch(/bg-primary-dark/)
  })
})
