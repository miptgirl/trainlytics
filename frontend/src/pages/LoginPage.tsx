import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import logo from '../assets/logo.svg'

interface FormValues {
  username: string
  password: string
}

export default function LoginPage() {
  const { token, isLoading, login } = useAuth()
  const navigate = useNavigate()
  const [apiError, setApiError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>()

  if (isLoading) return null

  if (token) return <Navigate to="/today" replace />

  async function onSubmit(values: FormValues) {
    setApiError(null)
    try {
      await login(values.username, values.password)
      navigate('/today', { replace: true })
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Login failed')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl shadow-md p-8">
        <div className="flex justify-center mb-6">
          <img src={logo} alt="Trainlytics" className="h-12 w-auto" />
        </div>
        <p className="text-sm text-text-muted-strong text-center mb-6">Sign in to continue</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-text mb-1">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              {...register('username', { required: 'Username is required' })}
            />
            {errors.username && (
              <p className="mt-1 text-xs text-error-text">{errors.username.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full border border-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              {...register('password', { required: 'Password is required' })}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-error-text">{errors.password.message}</p>
            )}
          </div>

          {apiError && (
            <p role="alert" className="text-xs text-error-text">
              {apiError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-primary-dark hover:brightness-95 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
