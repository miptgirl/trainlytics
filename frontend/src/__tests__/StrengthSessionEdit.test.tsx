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
      sets: [{ id: 1, set_number: 1, reps: 5, weight: 100, notes: null, rpe: null }],
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

  it('shows per-set RPE in the table and edits it in the form', async () => {
    const rated = {
      ...session,
      exercises: [{ ...session.exercises[0], sets: [{ ...session.exercises[0].sets[0], rpe: 8 }] }],
    }
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/sessions/5') return rated as never
      if (path === '/exercises') return exerciseList as never
      if (path.endsWith('/replacements')) return [] as never
      return { sets: [] } as never
    })
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('RPE')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const rpe = await screen.findByLabelText('RPE for set 1')
    expect(rpe).toHaveValue('8')
    await user.clear(rpe)
    // Non-digits are dropped and values above 10 are cut back
    await user.type(rpe, 'x11')
    expect(rpe).toHaveValue('1')
    await user.clear(rpe)
    await user.type(rpe, '9')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(mockPatch).toHaveBeenCalled())
    const [, payload] = mockPatch.mock.calls[0] as [string, { exercises: { sets: { rpe: number | null }[] }[] }]
    expect(payload.exercises[0].sets[0].rpe).toBe(9)
  })

  it('refuses a set RPE that would not be saved, and the message clears once it is fixed', async () => {
    // Not reachable by typing (the field clamps to 1–10); a stored value can still be off
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/sessions/5') {
        return { ...session, exercises: [{ ...session.exercises[0], sets: [{ ...session.exercises[0].sets[0], rpe: 12 }] }] } as never
      }
      if (path === '/exercises') return exerciseList as never
      if (path.endsWith('/replacements')) return [] as never
      return { sets: [] } as never
    })
    const user = await openEdit()
    await screen.findByRole('button', { name: /Squat/ })
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Squat, set 1: RPE "12" must be a whole number from 1 to 10.')
    expect(mockPatch).not.toHaveBeenCalled()

    const rpe = screen.getByLabelText('RPE for set 1')
    await user.clear(rpe)
    await user.type(rpe, '9')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('shows the server error when saving fails', async () => {
    mockPatch.mockRejectedValue(new Error('Input should be less than or equal to 10'))
    const user = await openEdit()
    await screen.findByRole('button', { name: /Squat/ })
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save the changes: Input should be less than or equal to 10",
    )
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
      { exercise_id: 1, order: 1, sets: [{ set_number: 1, reps: 5, weight: 100, notes: null, rpe: null }] },
    ])
  })
})
