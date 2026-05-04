import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import '@testing-library/jest-dom'

const mockLogin = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    token: null,
    isLoading: false,
    username: null,
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Import after mocking
import LoginPage from '../pages/LoginPage'

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockLogin.mockReset()
  })

  it('renders the sign-in form', () => {
    renderLogin()
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows required-field errors on empty submit', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText(/username is required/i)).toBeInTheDocument()
    expect(screen.getByText(/password is required/i)).toBeInTheDocument()
  })

  it('calls login with the typed credentials', async () => {
    mockLogin.mockResolvedValue(undefined)
    renderLogin()
    await userEvent.type(screen.getByLabelText(/username/i), 'alice')
    await userEvent.type(screen.getByLabelText(/password/i), 'secret')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('alice', 'secret'))
  })

  it('displays an API error when login fails', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'))
    renderLogin()
    await userEvent.type(screen.getByLabelText(/username/i), 'alice')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid credentials/i)
  })
})
