import { act, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'

let unauthorizedHandler: (() => void) | null = null

vi.mock('../lib/api', () => ({
  api: {
    post: vi.fn((path: string) =>
      path === '/auth/refresh'
        ? Promise.resolve({ access_token: 'x.eyJzdWIiOiJhbGljZSJ9.y' })
        : Promise.resolve({}),
    ),
  },
  setToken: vi.fn(),
  setUnauthorizedHandler: (handler: () => void) => {
    unauthorizedHandler = handler
  },
}))

import { AuthProvider, useAuth } from '../contexts/AuthContext'

let auth: ReturnType<typeof useAuth> | null = null

function Probe() {
  auth = useAuth()
  return null
}

function renderWithCachedProfile() {
  const queryClient = new QueryClient()
  queryClient.setQueryData(['profile'], { display_name: 'Alice', rest_seconds: 90 })
  const onAuthRequired = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider onAuthRequired={onAuthRequired}>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { queryClient, onAuthRequired }
}

describe('AuthProvider logout', () => {
  beforeEach(() => {
    auth = null
    unauthorizedHandler = null
  })

  it('clears cached queries on logout', async () => {
    const { queryClient, onAuthRequired } = renderWithCachedProfile()
    await waitFor(() => expect(auth?.username).toBe('alice'))
    expect(queryClient.getQueryData(['profile'])).toBeDefined()

    await act(() => auth!.logout())

    expect(queryClient.getQueryData(['profile'])).toBeUndefined()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(onAuthRequired).toHaveBeenCalled()
  })

  it('clears cached queries when a 401 forces logout', async () => {
    const { queryClient, onAuthRequired } = renderWithCachedProfile()
    await waitFor(() => expect(unauthorizedHandler).not.toBeNull())
    expect(queryClient.getQueryData(['profile'])).toBeDefined()

    act(() => unauthorizedHandler!())

    expect(queryClient.getQueryData(['profile'])).toBeUndefined()
    expect(onAuthRequired).toHaveBeenCalled()
  })
})
