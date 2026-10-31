import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}))

import { api } from '../lib/api'
import TemplatesPage from '../pages/TemplatesPage'

const mockGet = vi.mocked(api.get)
const mockPatch = vi.mocked(api.patch)

const legDay = {
  id: 3,
  name: 'Leg day',
  exercises: [
    {
      id: 30,
      exercise_id: 1,
      exercise_name: 'Squat',
      order: 1,
      sets: [
        { id: 300, set_number: 1, reps: 5, weight_kg: 100, duration_seconds: null },
        { id: 301, set_number: 2, reps: 5, weight_kg: 102.5, duration_seconds: null },
      ],
    },
  ],
}

beforeEach(() => {
  mockGet.mockReset()
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/templates/strength') return [{ id: 3, name: 'Leg day', exercise_count: 1 }] as never
    if (path === '/templates/strength/3') return legDay as never
    if (path === '/exercises') return [{ id: 1, name: 'Squat' }] as never
    return [] as never
  })
  mockPatch.mockClear()
})

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TemplatesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('TemplatesPage: templates are exercises and sets only', () => {
  it('the editor has no notes fields and saves no notes', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(await screen.findAllByPlaceholderText('reps')).toHaveLength(2)
    expect(screen.queryByText('Notes')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Optional notes…')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('note')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save Template' }))
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1))
    expect(mockPatch).toHaveBeenCalledWith('/templates/strength/3', {
      name: 'Leg day',
      exercises: [
        {
          exercise_id: 1,
          order: 1,
          sets: [
            { set_number: 1, reps: 5, weight_kg: 100, duration_seconds: null },
            { set_number: 2, reps: 5, weight_kg: 102.5, duration_seconds: null },
          ],
        },
      ],
    })
  })
})
