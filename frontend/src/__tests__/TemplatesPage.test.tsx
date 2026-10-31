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

const core = {
  id: 4,
  name: 'Core',
  exercises: [
    {
      id: 40,
      exercise_id: 7,
      exercise_name: 'Plank',
      order: 1,
      sets: [
        { id: 400, set_number: 1, reps: null, weight_kg: null, duration_seconds: 45 },
        { id: 401, set_number: 2, reps: null, weight_kg: 10, duration_seconds: 60 },
      ],
    },
  ],
}

let templates: { id: number; name: string; exercise_count: number }[] = []

beforeEach(() => {
  templates = [{ id: 3, name: 'Leg day', exercise_count: 1 }]
  mockGet.mockReset()
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/templates/strength') return templates as never
    if (path === '/templates/strength/3') return legDay as never
    if (path === '/templates/strength/4') return core as never
    if (path === '/exercises') return [{ id: 1, name: 'Squat' }, { id: 7, name: 'Plank', measure: 'time' }] as never
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

describe('TemplatesPage: timed sets', () => {
  beforeEach(() => {
    templates = [{ id: 4, name: 'Core', exercise_count: 1 }]
  })

  it('a timed template set round-trips through the editor: Time inputs in, duration_seconds out', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const first = await screen.findByLabelText('Time in seconds for set 1')
    expect(first).toHaveValue('45')
    expect(screen.getByText('Time (s)')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('reps')).not.toBeInTheDocument()
    const second = screen.getByLabelText('Time in seconds for set 2')
    await user.clear(second)
    await user.type(second, '1:15')

    await user.click(screen.getByRole('button', { name: 'Save Template' }))
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1))
    expect(mockPatch).toHaveBeenCalledWith('/templates/strength/4', {
      name: 'Core',
      exercises: [
        {
          exercise_id: 7,
          order: 1,
          sets: [
            { set_number: 1, reps: null, duration_seconds: 45, weight_kg: null },
            { set_number: 2, reps: null, duration_seconds: 75, weight_kg: 10 },
          ],
        },
      ],
    })
  })

  it('refuses a time that would be saved empty', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const first = await screen.findByLabelText('Time in seconds for set 1')
    await user.clear(first)
    await user.type(first, '1:3')
    await user.click(screen.getByRole('button', { name: 'Save Template' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Plank, set 1: time "1:3" must be 1–86400 seconds (or m:ss).')
    expect(mockPatch).not.toHaveBeenCalled()
  })
})
