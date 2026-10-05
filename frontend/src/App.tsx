import { useCallback, useEffect, useRef } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  useParams,
} from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import LoginPage from './pages/LoginPage'
import SettingsPage from './pages/SettingsPage'
import LogWorkoutPage from './pages/LogWorkoutPage'
import WorkoutModePage from './pages/WorkoutModePage'
import CardioSessionDetailPage from './pages/CardioSessionDetailPage'
import StrengthSessionDetailPage from './pages/StrengthSessionDetailPage'
import TemplatesPage from './pages/TemplatesPage'
import StepsPage from './pages/StepsPage'
import ProfilePage from './pages/ProfilePage'
import StatsPage from './pages/StatsPage'
import PlanPage from './pages/PlanPage'
import TodayPage from './pages/TodayPage'
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

export function Dashboard() {
  return <Navigate to="/today" replace />
}

/** Scroll to the top on forward navigation; Back/Forward (POP) keep the browser's own restore. */
export function ScrollToTop() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()
  // Read through a ref so a same-path navigation-type change doesn't re-trigger the scroll
  const navigationTypeRef = useRef(navigationType)
  navigationTypeRef.current = navigationType
  useEffect(() => {
    if (navigationTypeRef.current !== 'POP') window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function AppRoutes() {
  const navigate = useNavigate()
  const handleAuthRequired = useCallback(() => navigate('/login', { replace: true }), [navigate])

  return (
    <AuthProvider onAuthRequired={handleAuthRequired}>
      <ScrollToTop />
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
          path="/today"
          element={
            <ProtectedRoute>
              <TodayPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/log"
          element={
            <ProtectedRoute>
              <LogWorkoutPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workout"
          element={
            <ProtectedRoute>
              <WorkoutModePage />
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
          element={<Navigate to="/stats?tab=history" replace />}
        />
        <Route
          path="/stats"
          element={
            <ProtectedRoute>
              <StatsPage />
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
        <Route
          path="/steps"
          element={
            <ProtectedRoute>
              <StepsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={<Navigate to="/stats" replace />}
        />
        <Route
          path="/plan"
          element={
            <ProtectedRoute>
              <PlanPage />
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
