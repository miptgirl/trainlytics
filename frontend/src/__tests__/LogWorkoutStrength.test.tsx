import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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

const mockGet = vi.mocked(api.get)
const mockPost = vi.mocked(api.post)
const mockPatch = vi.mocked(api.patch)

const DRAFT_KEY = 'trainlytics_draft_strength'

const exerciseList = [
  { id: 1, name: 'Squat', types: [{ id: 7, name: 'Legs' }] },
  { id: 2, name: 'Bench', types: [{ id: 8, name: 'Chest' }] },
]

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

function renderPage(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/log" element={<LogWorkoutPage />} />
          <Route path="/sessions/:id" element={<p>Session detail page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const utc = (local: string) => new Date(local).toISOString()

describe('LogWorkoutPage strength path: POST body', () => {
  beforeEach(() => {
    localStorage.clear()
    mockGet.mockReset()
    mockPost.mockReset()
    mockPatch.mockReset()
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/profile') return { ai_key_configured: false } as never
      if (path === '/exercises') return exerciseList as never
      if (path === '/templates/strength') return [{ id: 3, name: 'Leg day' }] as never
      if (path === '/templates/strength/3') return legDay as never
      if (path === '/exercises/2/last-session-defaults') {
        return { sets: [{ set_number: 1, reps: 8, weight: 60 }] } as never
      }
      if (path.endsWith('/last-session-defaults')) return { sets: [] } as never
      return [] as never
    })
    mockPost.mockResolvedValue({ id: 42 } as never)
    mockPatch.mockResolvedValue({} as never)
  })

  it('template prefill + edits + "No, keep template" posts the exact body', async () => {
    const user = userEvent.setup()
    renderPage('/log?type=strength&templateId=3&date=2026-09-01T10:00')

    expect(await screen.findByText(/Pre-filled from/)).toBeInTheDocument()
    const reps = screen.getAllByPlaceholderText('reps')
    expect(reps).toHaveLength(2)
    expect(reps[0]).toHaveValue(5)

    await user.clear(reps[0])
    await user.type(reps[0], '6')
    await user.type(screen.getAllByPlaceholderText('note')[0], 'felt ok')
    await user.click(screen.getByRole('button', { name: /Good/ }))
    await user.click(screen.getByRole('button', { name: /Moderate/ }))
    await user.type(screen.getByPlaceholderText('e.g. 500'), '320')
    await user.type(screen.getByPlaceholderText('Optional notes…'), 'Solid')
    const duration = screen.getByPlaceholderText('h:mm:ss (optional)')
    await user.type(duration, '45:00')
    await user.tab()

    await user.click(screen.getByRole('button', { name: 'Save Session' }))
    expect(await screen.findByText('Update template "Leg day"?')).toBeInTheDocument()
    expect(screen.getByText('Changed reps on Squat set 1')).toBeInTheDocument()
    expect(screen.getByText('Changed notes on Squat set 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'No, keep template as-is' }))

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    expect(mockPatch).not.toHaveBeenCalled()
    expect(mockPost).toHaveBeenCalledWith('/sessions/strength', {
      title: 'Leg day',
      duration_seconds: 2700,
      calories: 320,
      date: utc('2026-09-01T10:00'),
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
  })

  it('"Yes, update template" patches the template then posts the session', async () => {
    const user = userEvent.setup()
    renderPage('/log?type=strength&templateId=3&date=2026-09-01T10:00')

    await screen.findByText(/Pre-filled from/)
    await user.click(screen.getAllByRole('button', { name: 'Remove set' })[1])
    await user.type(screen.getByLabelText('RPE for set 1'), '9')
    await user.click(screen.getByRole('button', { name: 'Save Session' }))
    // RPE is not part of the template, so it is not listed as a change
    expect(await screen.findByText('Removed 1 set from Squat')).toBeInTheDocument()
    expect(screen.queryByText(/RPE/i, { selector: 'li' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yes, update template' }))

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    expect(mockPatch).toHaveBeenCalledWith('/templates/strength/3', {
      exercises: [
        {
          exercise_id: 1,
          order: 1,
          sets: [{ set_number: 1, reps: 5, weight_kg: 100, notes: null }],
        },
      ],
    })
    expect(mockPost).toHaveBeenCalledWith('/sessions/strength', {
      title: 'Leg day',
      duration_seconds: null,
      calories: null,
      date: utc('2026-09-01T10:00'),
      notes: null,
      wellbeing: null,
      rpe: null,
      exercises: [
        {
          exercise_id: 1,
          order: 1,
          sets: [{ set_number: 1, reps: 5, weight: 100, notes: null, rpe: 9 }],
        },
      ],
    })
    // The template PATCH carries no RPE
    const templateBody = mockPatch.mock.calls[0][1] as { exercises: { sets: object[] }[] }
    expect(templateBody.exercises[0].sets[0]).not.toHaveProperty('rpe')
  })

  it('changing only set RPE on a template session asks nothing and posts it', async () => {
    const user = userEvent.setup()
    renderPage('/log?type=strength&templateId=3&date=2026-09-01T10:00')
    await screen.findByText(/Pre-filled from/)
    await user.type(screen.getByLabelText('RPE for set 2'), '8')
    await user.click(screen.getByRole('button', { name: 'Save Session' }))

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/Update template/)).not.toBeInTheDocument()
    expect(mockPatch).not.toHaveBeenCalled()
    const body = mockPost.mock.calls[0][1] as { exercises: { sets: { rpe: number | null }[] }[] }
    expect(body.exercises[0].sets.map((s) => s.rpe)).toEqual([null, 8])
  })

  it('a set RPE that would not be saved blocks the save, even in a collapsed exercise', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 3, title: 'Old draft', duration_seconds: null, calories: '', date: '2026-08-30T18:00',
        notes: '', wellbeing: null, rpe: null, templateId: null,
        exercises: [{ exercise_id: '2', sets: [{ reps: '10', weight: '50', notes: '', rpe: '7.5', done: false }] }],
      }),
    )
    const user = userEvent.setup()
    renderPage('/log?type=strength')
    await user.click(await screen.findByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(screen.getByDisplayValue('Old draft')).toBeInTheDocument())
    // Collapsing unmounts the set inputs, so only a check on the values can catch it
    await user.click(screen.getByLabelText('Collapse exercise'))
    expect(screen.queryByLabelText('RPE for set 1')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save Session' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bench, set 1: RPE "7.5" must be a whole number from 1 to 10.',
    )
    // Without the check, parseSetRpe would send rpe: null and drop the value silently
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('no template: picker + last-session defaults posts directly without a diff prompt', async () => {
    const user = userEvent.setup()
    renderPage('/log?type=strength&date=2026-09-02T07:30')

    await user.click(await screen.findByText('— select exercise —'))
    await user.click(await screen.findByText('Chest'))
    await user.click(screen.getByRole('button', { name: 'Bench' }))
    await waitFor(() => expect(screen.getAllByPlaceholderText('reps')[0]).toHaveValue(8))
    await user.click(screen.getByRole('button', { name: '+ Add Set' }))
    const reps = screen.getAllByPlaceholderText('reps')
    await user.type(reps[1], '7')
    await user.type(screen.getAllByPlaceholderText('kg')[1], '62.5')

    await user.click(screen.getByRole('button', { name: 'Save Session' }))

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/Update template/)).not.toBeInTheDocument()
    expect(mockPost).toHaveBeenCalledWith('/sessions/strength', {
      title: 'Strength session',
      duration_seconds: null,
      calories: null,
      date: utc('2026-09-02T07:30'),
      notes: null,
      wellbeing: null,
      rpe: null,
      exercises: [
        {
          exercise_id: 2,
          order: 1,
          sets: [
            { set_number: 1, reps: 8, weight: 60, notes: null, rpe: null },
            { set_number: 2, reps: 7, weight: 62.5, notes: null, rpe: null },
          ],
        },
      ],
    })
  })

  it('restores a draft saved by the pre-hook code and posts it', async () => {
    // Shape written by the production form before the hook existed:
    // `{ ...useWatch values, templateId }`, no version field.
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        title: 'Old draft',
        duration_seconds: 1800,
        calories: '',
        date: '2026-08-30T18:00',
        notes: 'from yesterday',
        wellbeing: 2,
        rpe: null,
        exercises: [
          {
            exercise_id: '2',
            sets: [
              { reps: '10', weight: '50', notes: '', done: true },
              { reps: '', weight: '55', notes: 'last', done: false },
            ],
          },
        ],
        templateId: null,
      }),
    )
    const user = userEvent.setup()
    renderPage('/log?type=strength')

    expect(await screen.findByText('You have an unsaved Strength draft.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(screen.getByDisplayValue('Old draft')).toBeInTheDocument())
    expect(screen.queryByText('You have an unsaved Strength draft.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save Session' }))
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    expect(mockPost).toHaveBeenCalledWith('/sessions/strength', {
      title: 'Old draft',
      duration_seconds: 1800,
      calories: null,
      date: utc('2026-08-30T18:00'),
      notes: 'from yesterday',
      wellbeing: 2,
      rpe: null,
      exercises: [
        {
          exercise_id: 2,
          order: 1,
          sets: [
            { set_number: 1, reps: 10, weight: 50, notes: null, rpe: null },
            { set_number: 2, reps: null, weight: 55, notes: 'last', rpe: null },
          ],
        },
      ],
    })
  })

  it('discarding the draft banner removes the stored draft', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: 'Stale', exercises: [] }))
    const user = userEvent.setup()
    renderPage('/log?type=strength')

    const banner = (await screen.findByText('You have an unsaved Strength draft.')).closest('.mb-4') as HTMLElement
    await user.click(within(banner).getByRole('button', { name: 'Discard' }))
    expect(screen.queryByText('You have an unsaved Strength draft.')).not.toBeInTheDocument()
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('keeps the draft and shows an error when the save fails; clears it on success', async () => {
    const user = userEvent.setup()
    mockPost.mockRejectedValueOnce(new Error('Request failed'))
    renderPage('/log?type=strength&date=2026-09-02T07:30')

    await user.click(await screen.findByText('— select exercise —'))
    await user.click(await screen.findByText('Legs'))
    await user.click(screen.getByRole('button', { name: 'Squat' }))
    await user.type(screen.getAllByPlaceholderText('reps')[0], '5')
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull())

    await user.click(screen.getByRole('button', { name: 'Save Session' }))
    expect(await screen.findByText('Failed to save session. Please try again.')).toBeInTheDocument()
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Save Session' }))
    expect(await screen.findByText('Session detail page')).toBeInTheDocument()
    expect(mockPost).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })
})
