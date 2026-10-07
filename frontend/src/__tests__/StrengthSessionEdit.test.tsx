import { render, screen, waitFor } from '@testing-library/react'
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
import StrengthSessionDetailPage from '../pages/StrengthSessionDetailPage'

const mockGet = vi.mocked(api.get)
const mockPatch = vi.mocked(api.patch)

const session = {
  id: 5,
  type: 'strength',
  date: '2026-09-01T10:00:00Z',
  title: 'Push day',
  duration_seconds: null,
  calories: null,
  notes: null,
  wellbeing: 4,
  rpe: 6,
  created_at: '2026-09-01T10:00:00Z',
  exercises: [
    {
      id: 1,
      exercise_id: 1,
      exercise_name: 'Squat',
      order: 1,
      sets: [
        { id: 1, set_number: 1, reps: 5, weight: 100, notes: null, rpe: 8.5 },
        { id: 2, set_number: 2, reps: 6, weight: 90, notes: null, rpe: null },
      ],
    },
  ],
}

const exerciseList = [
  { id: 1, name: 'Squat', types: [{ id: 7, name: 'Legs' }] },
  { id: 2, name: 'Bench', types: [{ id: 8, name: 'Chest' }] },
]

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/sessions/5']}>
        <Routes>
          <Route path="/sessions/:id" element={<StrengthSessionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Strength session edit form', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPatch.mockReset()
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/sessions/5') return session as never
      if (path === '/exercises') return exerciseList as never
      if (path.endsWith('/replacements')) return [] as never
      return { sets: [] } as never
    })
    mockPatch.mockResolvedValue(session as never)
  })

  async function openEdit() {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    return user
  }

  it('uses the grouped picker and shows Add Exercise after the last block', async () => {
    await openEdit()
    // grouped picker trigger shows the selected exercise, no native <select>
    expect(await screen.findByRole('button', { name: /Squat/ })).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    const addBtn = screen.getByRole('button', { name: '+ Add Exercise' })
    const block = screen.getByText(/Exercise 1/)
    expect(block.compareDocumentPosition(addBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByLabelText('Collapse exercise')).toBeInTheDocument()
  })

  it('does not call last-session-defaults when selecting an exercise, and keeps sets', async () => {
    const user = await openEdit()
    await user.click(await screen.findByRole('button', { name: /Squat/ }))
    // picker reopens inside the selected exercise's category; go back to categories
    await user.click(await screen.findByRole('button', { name: /all categories/i }))
    await user.click(await screen.findByText('Chest'))
    await user.click(screen.getByRole('button', { name: 'Bench' }))

    await waitFor(() => expect(screen.getByText(/Exercise 1 — Bench/)).toBeInTheDocument())
    expect(mockGet.mock.calls.some(([p]) => String(p).includes('last-session-defaults'))).toBe(false)
    expect(screen.getByDisplayValue('5')).toBeInTheDocument()
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
  })

  it('includes wellbeing and rpe in the PATCH payload', async () => {
    const user = await openEdit()
    await screen.findByRole('button', { name: /Squat/ })
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(mockPatch).toHaveBeenCalled())
    const [path, payload] = mockPatch.mock.calls[0] as [string, Record<string, unknown>]
    expect(path).toBe('/sessions/5')
    expect(payload).toMatchObject({ wellbeing: 4, rpe: 6 })
    expect(payload.exercises).toEqual([
      {
        exercise_id: 1,
        order: 1,
        sets: [
          { set_number: 1, reps: 5, weight: 100, notes: null, rpe: 8.5 },
          { set_number: 2, reps: 6, weight: 90, notes: null, rpe: null },
        ],
      },
    ])
  })

  it('blocks saving an invalid RPE in a collapsed exercise', async () => {
    const user = await openEdit()
    await screen.findByRole('button', { name: /Squat/ })
    await user.type(screen.getByLabelText('RPE for set 2'), '85')
    await user.click(screen.getByLabelText('Collapse exercise'))
    expect(screen.queryByLabelText('RPE for set 2')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Squat, set 2: RPE "85" must be 1–10 in steps of 0.5.')
    expect(mockPatch).not.toHaveBeenCalled()
  })

  it('shows the server error when saving fails', async () => {
    mockPatch.mockRejectedValue(new Error('Input should be a multiple of 0.5'))
    const user = await openEdit()
    await screen.findByRole('button', { name: /Squat/ })
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save the changes: Input should be a multiple of 0.5",
    )
  })

  it('hides the RPE column when no set has one', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/sessions/5') {
        return {
          ...session,
          exercises: [{ ...session.exercises[0], sets: session.exercises[0].sets.map((s) => ({ ...s, rpe: null })) }],
        } as never
      }
      return [] as never
    })
    renderPage()
    expect(await screen.findByText('Squat')).toBeInTheDocument()
    expect(screen.queryByText('RPE')).not.toBeInTheDocument()
  })

  it('shows set RPE in the set table', async () => {
    renderPage()
    expect(await screen.findByText('RPE')).toBeInTheDocument()
    expect(screen.getByText('8.5')).toBeInTheDocument()
  })

  it('edits set RPE with a typed value and sends it in the PATCH', async () => {
    const user = await openEdit()
    await screen.findByRole('button', { name: /Squat/ })
    const rpe2 = screen.getByLabelText('RPE for set 2')
    await user.type(rpe2, '7.5')
    await user.clear(screen.getByLabelText('RPE for set 1'))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(mockPatch).toHaveBeenCalled())
    const [, payload] = mockPatch.mock.calls[0] as [string, { exercises: { sets: { rpe: number | null }[] }[] }]
    expect(payload.exercises[0].sets.map((s) => s.rpe)).toEqual([null, 7.5])
  })

  it('blocks saving an RPE that is not a half step in 1–10', async () => {
    const user = await openEdit()
    await screen.findByRole('button', { name: /Squat/ })
    const input = screen.getByLabelText('RPE for set 2')
    await user.type(input, '8.3')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    // Native constraint validation (min/max/step) and the form rule both reject it
    await waitFor(() => expect(input).toBeInvalid())
    expect(mockPatch).not.toHaveBeenCalled()
  })
})
