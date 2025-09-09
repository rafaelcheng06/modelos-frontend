// src/auth/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import type { ReactNode } from 'react'

type Props = { children: ReactNode }

export default function ProtectedRoute({ children }: Props) {
  const { loading, user } = useAuth()

  if (loading) {
    return <div style={{ padding: 24 }}>Cargando...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}