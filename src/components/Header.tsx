// src/components/Header.tsx
import { supabase } from '../lib/supabaseClient'

export default function Header() {
  const logout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <header style={{ padding: 12, borderBottom: '1px solid #eee' }}>
      <strong>Modelos</strong>
      <button onClick={logout} style={{ float: 'right' }}>Salir</button>
    </header>
  )
}