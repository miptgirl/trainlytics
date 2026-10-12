import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, it, expect } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  setToken: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}))

import { api, setUnauthorizedHandler } from '../lib/api'
import { AuthProvider, useAuth } from '../contexts/AuthContext'

function LogoutButton() {
  const { logout } = useAuth()
  return (
    <button type="button" onClick={() => void logout()}>
      Log out
    </button>
  )
}

function setup() {
  // No session to restore on mount; logout itself succeeds
  vi.mocked(api.post).mockImplementation(async (path: string) => {
    if (path === '/auth/refresh') throw new Error('Unauthorized')
    return undefined as never
  })
  localStorage.setItem('trainlytics_rest_seconds', '180')
  localStorage.setItem('trainlytics_rest_seconds_unsynced', '1')
  const qc = new QueryClient()
  qc.setQueryData(['profile'], { rest_seconds: 180 })
  const onAuthRequired = vi.fn()
  render(
    <QueryClientProvider client={qc}>
      <AuthProvider onAuthRequired={onAuthRequired}>
        <LogoutButton />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { qc, onAuthRequired }
}

it('an expired session (401) forgets the rest length and the cached profile too', async () => {
  const { qc, onAuthRequired } = setup()
  await waitFor(() => expect(setUnauthorizedHandler).toHaveBeenCalled())
  const onUnauthorized = vi.mocked(setUnauthorizedHandler).mock.lastCall![0]
  act(() => onUnauthorized())

  expect(onAuthRequired).toHaveBeenCalled()
  expect(localStorage.getItem('trainlytics_rest_seconds')).toBeNull()
  expect(localStorage.getItem('trainlytics_rest_seconds_unsynced')).toBeNull()
  expect(qc.getQueryData(['profile'])).toBeUndefined()
})

it('logout forgets this device\'s rest length and the cached profile', async () => {
  const { qc, onAuthRequired } = setup()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }))

  await waitFor(() => expect(onAuthRequired).toHaveBeenCalled())
  expect(localStorage.getItem('trainlytics_rest_seconds')).toBeNull()
  expect(localStorage.getItem('trainlytics_rest_seconds_unsynced')).toBeNull()
  expect(qc.getQueryData(['profile'])).toBeUndefined()
})
