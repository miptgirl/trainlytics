import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock the api so all background queries (cardio types, exercises, templates)
// resolve to empty arrays without hitting the network.
vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}))

const mockUpsertMutateAsync = vi.fn()

// Mock useSteps hooks — useUpsertStep is used by StepsForm inside the page.
vi.mock('../lib/hooks/useSteps', () => ({
  useSteps: () => ({ data: [], isLoading: false }),
  useUpsertStep: () => ({ mutateAsync: mockUpsertMutateAsync, isPending: false, isError: false }),
  useDeleteStep: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

// Import after mocks
import LogWorkoutPage from '../pages/LogWorkoutPage'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LogWorkoutPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LogWorkoutPage — Steps integration (plan 6.6)', () => {
  beforeEach(() => {
    mockUpsertMutateAsync.mockReset()
    mockUpsertMutateAsync.mockResolvedValue({
      id: 1,
      date: '2026-05-10',
      steps: 5000,
      user_id: 'user1',
      created_at: '',
      updated_at: '',
    })
  })

  it('shows all three workout-type buttons in the picker', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /cardio/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /steps/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /strength/i })).toBeInTheDocument()
  })

  it('clicking Steps reveals the step-entry form', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /steps/i }))
    // The StepsForm renders a number input (steps) and a date input
    expect(screen.getByRole('spinbutton')).toBeInTheDocument() // steps number input
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('submitting the Steps form calls useUpsertStep with the entered values', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /steps/i }))

    const stepsInput = screen.getByRole('spinbutton') // number input
    await userEvent.clear(stepsInput)
    await userEvent.type(stepsInput, '7500')

    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(mockUpsertMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ steps: 7500 }),
      ),
    )
  })

  it('shows a success confirmation after a successful Steps submission', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /steps/i }))

    const stepsInput = screen.getByRole('spinbutton') // number input
    await userEvent.clear(stepsInput)
    await userEvent.type(stepsInput, '7500')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(screen.getByText(/steps saved/i)).toBeInTheDocument())
  })
})
