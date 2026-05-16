import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '../lib/api'
import { AdaptSessionModal } from '../components/AdaptSessionModal'

const mockPost = vi.mocked(api.post)

const defaultSnapshot = {
  exercises: [
    {
      exercise_id: 1,
      exercise_name: 'Squat',
      sets: [{ reps: 5, weight_kg: 100 }],
    },
  ],
}

function renderModal(hasApiKey = true, onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <AdaptSessionModal
        hasApiKey={hasApiKey}
        sessionSnapshot={defaultSnapshot}
        onClose={onClose}
      />
    </MemoryRouter>,
  )
}

describe('AdaptSessionModal', () => {
  beforeEach(() => {
    mockPost.mockReset()
  })

  it('renders the modal header', () => {
    renderModal()
    expect(screen.getByText(/adapt this session/i)).toBeInTheDocument()
  })

  it('shows configure-key prompt when no API key is set', () => {
    renderModal(false)
    expect(screen.getByText(/add an api key in profile/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /get suggestions/i })).not.toBeInTheDocument()
  })

  it('"Get suggestions" is disabled while textarea is empty', () => {
    renderModal()
    const btn = screen.getByRole('button', { name: /get suggestions/i })
    expect(btn).toBeDisabled()
  })

  it('"Get suggestions" becomes enabled when text is typed', async () => {
    renderModal()
    await userEvent.type(screen.getByRole('textbox'), 'My knee hurts')
    expect(screen.getByRole('button', { name: /get suggestions/i })).not.toBeDisabled()
  })

  it('shows spinner while request is in flight', async () => {
    mockPost.mockReturnValue(new Promise(() => {}))
    renderModal()
    await userEvent.type(screen.getByRole('textbox'), 'Low energy today')
    await userEvent.click(screen.getByRole('button', { name: /get suggestions/i }))
    expect(screen.getByText(/getting suggestions/i)).toBeInTheDocument()
  })

  it('renders suggestions text on success', async () => {
    mockPost.mockResolvedValue({ suggestions: 'Replace squats with leg press.' })
    renderModal()
    await userEvent.type(screen.getByRole('textbox'), 'Bad knee today')
    await userEvent.click(screen.getByRole('button', { name: /get suggestions/i }))
    expect(await screen.findByText(/replace squats with leg press/i)).toBeInTheDocument()
  })

  it('submits session_snapshot and user_message in request body', async () => {
    mockPost.mockResolvedValue({ suggestions: 'OK' })
    renderModal()
    await userEvent.type(screen.getByRole('textbox'), 'Tired')
    await userEvent.click(screen.getByRole('button', { name: /get suggestions/i }))
    await screen.findByText(/ok/i)

    expect(mockPost).toHaveBeenCalledWith('/ai/adapt-session', {
      session_snapshot: defaultSnapshot,
      user_message: 'Tired',
    })
  })

  it('shows error message on failure', async () => {
    mockPost.mockRejectedValue(new Error('API error'))
    renderModal()
    await userEvent.type(screen.getByRole('textbox'), 'Not feeling great')
    await userEvent.click(screen.getByRole('button', { name: /get suggestions/i }))
    expect(await screen.findByText(/api error/i)).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    renderModal(true, onClose)
    // Click the footer "Close" button (there's also the ✕ header button)
    const closeButtons = screen.getAllByRole('button', { name: /close/i })
    await userEvent.click(closeButtons[closeButtons.length - 1])
    expect(onClose).toHaveBeenCalledOnce()
  })
})
