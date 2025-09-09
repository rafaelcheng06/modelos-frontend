// src/pages/Home.tsx
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabaseClient'

export default function Home() {
  const { user } = useAuth()

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Panel</h1>
      <p>Sesión: <b>{user?.email}</b></p>
      <button onClick={handleLogout}>Cerrar sesión</button>
    </div>
  )
}