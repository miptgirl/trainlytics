import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

/**
 * StepsForm mock: renders a minimal form that exposes defaultValues via a
 * data-testid and lets tests trigger onSuccess by clicking a "Saved" button.
 */
vi.mock('../components/StepsForm', () => ({
  default: ({
    defaultValues,
    onSuccess,
  }: {
    defaultValues?: { date: string; steps: number }
    onSuccess?: () => void
  }) => (
    <div data-testid="steps-form">
      {defaultValues && (
        <span data-testid="form-date">{defaultValues.date}</span>
      )}
      <button type="button" onClick={() => onSuccess?.()}>
        Saved
      </button>
    </div>
  ),
}))

const mockDeleteMutateAsync = vi.fn()

const FIXTURE_ENTRIES = [
  { id: 1, user_id: 'user1', date: '2026-05-10', steps: 9500, created_at: '', updated_at: '' },
  { id: 2, user_id: 'user1', date: '2026-05-09', steps: 8000, created_at: '', updated_at: '' },
]

vi.mock('../lib/hooks/useSteps', () => ({
  useSteps: () => ({ data: FIXTURE_ENTRIES, isLoading: false }),
  useDeleteStep: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
  useUpsertStep: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
}))

// Import after mocks
import StepsPage from '../pages/StepsPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <StepsPage />
    </MemoryRouter>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StepsPage', () => {
  beforeEach(() => {
    mockDeleteMutateAsync.mockReset()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('renders the list of step entries with date and formatted step count', () => {
    renderPage()
    expect(screen.getByText('2026-05-10')).toBeInTheDocument()
    expect(screen.getByText('9,500 steps')).toBeInTheDocument()
    expect(screen.getByText('2026-05-09')).toBeInTheDocument()
    expect(screen.getByText('8,000 steps')).toBeInTheDocument()
  })

  it('starts in "Add entry" mode with no pre-filled date', () => {
    renderPage()
    expect(screen.getByText(/add entry/i)).toBeInTheDocument()
    expect(screen.queryByTestId('form-date')).not.toBeInTheDocument()
  })

  it("clicking Edit pre-fills the form with that entry's date and shows the editing heading", async () => {
    renderPage()
    const editButtons = screen.getAllByRole('button', { name: /edit/i })
    await userEvent.click(editButtons[0]) // first row: 2026-05-10
    expect(screen.getByTestId('form-date')).toHaveTextContent('2026-05-10')
    expect(screen.getByText(/editing 2026-05-10/i)).toBeInTheDocument()
  })

  it('clicking Cancel clears the selection and returns to "Add entry" mode', async () => {
    renderPage()
    const editButtons = screen.getAllByRole('button', { name: /edit/i })
    await userEvent.click(editButtons[0])
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByText(/add entry/i)).toBeInTheDocument()
    expect(screen.queryByTestId('form-date')).not.toBeInTheDocument()
  })

  it('form onSuccess resets the form to "Add entry" mode after editing', async () => {
    renderPage()
    const editButtons = screen.getAllByRole('button', { name: /edit/i })
    await userEvent.click(editButtons[0])
    // Simulate the form calling onSuccess (e.g. after a successful save)
    await userEvent.click(screen.getByRole('button', { name: /saved/i }))
    expect(screen.getByText(/add entry/i)).toBeInTheDocument()
    expect(screen.queryByTestId('form-date')).not.toBeInTheDocument()
  })

  it('clicking Delete calls useDeleteStep.mutateAsync with the entry id', async () => {
    renderPage()
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    await userEvent.click(deleteButtons[0]) // id = 1
    await waitFor(() => expect(mockDeleteMutateAsync).toHaveBeenCalledWith(1))
  })

  it('does not call Delete when the user cancels the confirmation dialog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
    await userEvent.click(deleteButtons[0])
    expect(mockDeleteMutateAsync).not.toHaveBeenCalled()
  })
})
