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
      sets: [{ id: 1, set_number: 1, reps: 5, weight: 100, notes: null }],
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
      { exercise_id: 1, order: 1, sets: [{ set_number: 1, reps: 5, weight: 100, notes: null }] },
    ])
  })
})
