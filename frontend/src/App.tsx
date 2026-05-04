import { useCallback } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import LoginPage from './pages/LoginPage'
import ExercisesPage from './pages/ExercisesPage'
import CardioTypesPage from './pages/CardioTypesPage'
import LogCardioPage from './pages/LogCardioPage'
import LogStrengthPage from './pages/LogStrengthPage'
import CardioSessionDetailPage from './pages/CardioSessionDetailPage'
import StrengthSessionDetailPage from './pages/StrengthSessionDetailPage'
import HistoryPage from './pages/HistoryPage'
import TemplatesPage from './pages/TemplatesPage'
import { api } from './lib/api'

function SessionDetailRouter() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = useQuery({
    queryKey: ['sessions', id, 'type'],
    queryFn: () => api.get<{ type: string }>(`/sessions/${id}`),
  })
  if (isLoading) return <Layout><p className="text-gray-500 text-sm">Loading…</p></Layout>
  if (data?.type === 'strength') return <StrengthSessionDetailPage />
  return <CardioSessionDetailPage />
}

function Dashboard() {
  return <Navigate to="/history" replace />
}

function AppRoutes() {
  const navigate = useNavigate()
  const handleAuthRequired = useCallback(() => navigate('/login', { replace: true }), [navigate])

  return (
    <AuthProvider onAuthRequired={handleAuthRequired}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/exercises"
          element={
            <ProtectedRoute>
              <ExercisesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cardio-types"
          element={
            <ProtectedRoute>
              <CardioTypesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/log/cardio"
          element={
            <ProtectedRoute>
              <LogCardioPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/log/strength"
          element={
            <ProtectedRoute>
              <LogStrengthPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sessions/:id"
          element={
            <ProtectedRoute>
              <SessionDetailRouter />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/templates"
          element={
            <ProtectedRoute>
              <TemplatesPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
