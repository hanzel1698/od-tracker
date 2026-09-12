import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useRealtimeSync } from './lib/queries'
import { isSupabaseConfigured } from './lib/supabase'
import { Dashboard } from './pages/Dashboard'
import { OdDetail } from './pages/OdDetail'
import { AddEditOd } from './pages/AddEditOd'
import { Login, SetupRequired } from './pages/Login'

/** Routes for a signed-in user, plus the realtime subscription they depend on. */
function SignedInRoutes() {
  useRealtimeSync()

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/od/new" element={<AddEditOd />} />
      <Route path="/od/:id" element={<OdDetail />} />
      <Route path="/od/:id/edit" element={<AddEditOd />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function Gate() {
  const { user, loading } = useAuth()

  // Holding here avoids a login-form flash for someone who is already signed in.
  if (loading) return <div className="spinner" role="status" aria-label="Loading" />
  if (!user) return <Login />
  return <SignedInRoutes />
}

export function App() {
  if (!isSupabaseConfigured) return <SetupRequired />

  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}
