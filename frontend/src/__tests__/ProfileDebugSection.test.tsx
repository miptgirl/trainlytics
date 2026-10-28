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
    post: vi.fn(),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}))

import { api } from '../lib/api'
import ProfilePage from '../pages/ProfilePage'

const mockGet = vi.mocked(api.get)
const mockPost = vi.mocked(api.post)

let profile: Record<string, unknown> = {}

beforeEach(() => {
  localStorage.clear()
  profile = { ai_key_configured: false, goals: [] }
  mockGet.mockReset()
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/profile') return { ...profile } as never
    if (path === '/imports/pending') return { total_pending: 0 } as never
    return [] as never
  })
  mockPost.mockReset()
  mockPost.mockResolvedValue({ columns: ['n'], rows: [[1]], rowcount: 1 } as never)
})

async function openDebugPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await userEvent.click(await screen.findByRole('button', { name: /debug/i }))
  // The AI logs half of the panel is there either way
  expect(await screen.findByText(/ai request logs/i)).toBeInTheDocument()
}

describe('ProfilePage — Debug panel SQL executor', () => {
  it.each([
    ['false', false],
    ['missing (older backend or cached profile)', undefined],
  ])('is hidden when debug_sql_available is %s', async (_label, value) => {
    if (value !== undefined) profile.debug_sql_available = value
    await openDebugPanel()

    expect(screen.queryByPlaceholderText(/select \* from/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument()
    expect(screen.queryByText(/direct db access/i)).not.toBeInTheDocument()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('is shown and runs a query when debug_sql_available is true', async () => {
    profile.debug_sql_available = true
    await openDebugPanel()

    expect(screen.getByText(/direct db access/i)).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText(/select \* from/i), 'SELECT 1 AS n')
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/debug/sql', { sql: 'SELECT 1 AS n' }))
    expect(await screen.findByRole('columnheader', { name: 'n' })).toBeInTheDocument()
  })
})
