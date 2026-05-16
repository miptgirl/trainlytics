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
import { WeeklyInsightsCard } from '../components/WeeklyInsightsCard'

const mockPost = vi.mocked(api.post)

function renderCard(hasApiKey: boolean) {
  return render(
    <MemoryRouter>
      <WeeklyInsightsCard hasApiKey={hasApiKey} />
    </MemoryRouter>,
  )
}

describe('WeeklyInsightsCard', () => {
  beforeEach(() => {
    mockPost.mockReset()
  })

  it('shows configure-key prompt when no API key is set', () => {
    renderCard(false)
    expect(screen.getByText(/add an api key in profile/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /analyse/i })).not.toBeInTheDocument()
  })

  it('shows the Analyse button when API key is configured', () => {
    renderCard(true)
    expect(screen.getByRole('button', { name: /analyse this week/i })).toBeInTheDocument()
    expect(screen.queryByText(/add an api key/i)).not.toBeInTheDocument()
  })

  it('shows spinner while request is in flight', async () => {
    // Never resolves during the test
    mockPost.mockReturnValue(new Promise(() => {}))
    renderCard(true)
    await userEvent.click(screen.getByRole('button', { name: /analyse this week/i }))
    expect(screen.getByText(/analysing your training/i)).toBeInTheDocument()
  })

  it('renders analysis text on success', async () => {
    mockPost.mockResolvedValue({ analysis: 'Great training week! Volume is up 10%.' })
    renderCard(true)
    await userEvent.click(screen.getByRole('button', { name: /analyse this week/i }))
    expect(await screen.findByText(/great training week/i)).toBeInTheDocument()
  })

  it('shows error message and retry button on failure', async () => {
    mockPost.mockRejectedValue(new Error('AI service unavailable'))
    renderCard(true)
    await userEvent.click(screen.getByRole('button', { name: /analyse this week/i }))
    expect(await screen.findByText(/ai service unavailable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('retries successfully after an error', async () => {
    mockPost
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ analysis: 'Recovered!' })

    renderCard(true)
    await userEvent.click(screen.getByRole('button', { name: /analyse this week/i }))
    await screen.findByText(/timeout/i)

    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByText(/recovered/i)).toBeInTheDocument()
  })
})
