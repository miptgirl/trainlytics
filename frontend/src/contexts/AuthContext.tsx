import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, setToken, setUnauthorizedHandler } from '../lib/api'
import { resetRestLength } from '../lib/restLengthSync'

interface AuthState {
  token: string | null
  username: string | null
  isLoading: boolean
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function parseJwt(t: string): { sub?: string } | null {
  try {
    return JSON.parse(atob(t.split('.')[1])) as { sub?: string }
  } catch {
    return null
  }
}

interface AuthProviderProps {
  children: ReactNode
  onAuthRequired: () => void
}

export function AuthProvider({ children, onAuthRequired }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({ token: null, username: null, isLoading: true })
  const queryClient = useQueryClient()

  // Cached queries and the stored rest length belong to the account leaving;
  // the next one on this browser must not see (or upload) them. An unsynced
  // rest pick is lost when the session expires.
  const forgetAccount = useCallback(() => {
    resetRestLength()
    queryClient.clear()
  }, [queryClient])

  // Register 401 handler so the api module can trigger logout+redirect
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null)
      forgetAccount()
      setState({ token: null, username: null, isLoading: false })
      onAuthRequired()
    })
  }, [onAuthRequired, forgetAccount])

  // Silent refresh on page load using the HttpOnly refresh cookie
  useEffect(() => {
    api
      .post<{ access_token: string }>('/auth/refresh')
      .then((data) => {
        const username = parseJwt(data.access_token)?.sub ?? null
        setToken(data.access_token)
        setState({ token: data.access_token, username, isLoading: false })
      })
      .catch(() => setState((s) => ({ ...s, isLoading: false })))
  }, [])

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await api.post<{ access_token: string }>('/auth/login', { username, password })
      setToken(data.access_token)
      setState({ token: data.access_token, username, isLoading: false })
    },
    [],
  )

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {})
    setToken(null)
    forgetAccount()
    setState({ token: null, username: null, isLoading: false })
    onAuthRequired()
  }, [onAuthRequired, forgetAccount])

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// Hook lives with its provider; splitting the file only to satisfy fast refresh isn't worth it.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
