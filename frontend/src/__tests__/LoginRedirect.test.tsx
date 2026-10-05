import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), token: 't', isLoading: false, username: 'demo', logout: vi.fn() }),
}))

import LoginPage from '../pages/LoginPage'

describe('login redirect', () => {
  it('sends a signed-in user from /login to /today', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/today" element={<p>today route</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('today route')).toBeInTheDocument()
  })
})
