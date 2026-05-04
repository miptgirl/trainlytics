import { useCallback } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import LoginPage from './pages/LoginPage'
import ExercisesPage from './pages/ExercisesPage'

function Dashboard() {
  return (
    <Layout>
      <p className="text-gray-500 text-sm">Dashboard — coming soon</p>
    </Layout>
  )
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
