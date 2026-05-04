import { useCallback } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'

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
              <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <p className="text-gray-500 text-sm">Dashboard — coming soon</p>
              </div>
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
