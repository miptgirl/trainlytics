import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../components/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { api } from '../lib/api'
import LogWorkoutPage from '../pages/LogWorkoutPage'

describe('Log form: failed save', () => {
  it('shows the error inside the pinned Save/Cancel bar', async () => {
    const user = userEvent.setup()
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/exercises') return [{ id: 1, name: 'Squat', types: [{ id: 7, name: 'Legs' }] }] as never
      if (path.endsWith('/last-session-defaults')) return { sets: [] } as never
      return [] as never
    })
    vi.mocked(api.post).mockRejectedValue(new Error('boom'))

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/log?type=strength']}>
          <LogWorkoutPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await user.click(await screen.findByText('— select exercise —'))
    await user.click(await screen.findByText('Legs'))
    await user.click(await screen.findByRole('button', { name: 'Squat' }))
    await user.click(screen.getByRole('button', { name: 'Save Session' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('boom')
    // same container as the Save button, so it travels with the pinned bar
    const bar = screen.getByRole('button', { name: 'Save Session' }).parentElement!.parentElement!
    await waitFor(() => expect(within(bar).getByRole('alert')).toBeInTheDocument())
  })
})
