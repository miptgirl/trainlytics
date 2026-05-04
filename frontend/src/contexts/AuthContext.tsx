import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setToken, setUnauthorizedHandler } from '../lib/api'

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

  // Register 401 handler so the api module can trigger logout+redirect
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null)
      setState({ token: null, username: null, isLoading: false })
      onAuthRequired()
    })
  }, [onAuthRequired])

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
    setState({ token: null, username: null, isLoading: false })
    onAuthRequired()
  }, [onAuthRequired])

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
