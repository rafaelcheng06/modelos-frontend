// src/pages/Login.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { ensureProfile } from '../lib/ensureProfile'
export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('') // << nuevo
  const [isRegister, setIsRegister] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

   async function handleEmailPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErr(null)
    setMsg(null)

    try {
      if (isRegister) {
        // 1) Registro con email+password y guardamos el display_name en user_metadata
        const { error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName }, // << guarda en metadata
          },
        })
        if (signUpErr) throw signUpErr

        // 2) Si el proyecto NO requiere confirmación de email, la sesión ya existe.
        //    Creamos/actualizamos la fila en public.models con el nombre.
        await ensureProfile(displayName)

        setMsg('Cuenta creada. Si tu proyecto requiere confirmación, revisa tu correo.')
        navigate('/dashboard', { replace: true })
      } else {
        // Login normal
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInErr) throw signInErr

        // Asegura que exista la fila en models (por si el usuario nunca la creó)
        await ensureProfile()

        setMsg('Sesión iniciada.')
        navigate('/dashboard', { replace: true })
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '40px auto' }}>
      <h1>{isRegister ? 'Crear cuenta' : 'Iniciar sesión'}</h1>

      <form onSubmit={handleEmailPassword} style={{ display: 'grid', gap: 12 }}>
        <label>
          Correo
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="tu@email.com"
            style={{ width: '100%' }}
          />
        </label>

        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            style={{ width: '100%' }}
          />
        </label>

        {isRegister && (
          <label>
            Nombre de modelo
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              placeholder="Ej: Ana Rivera"
              style={{ width: '100%' }}
            />
          </label>
        )}

        <button disabled={loading} type="submit">
          {loading
            ? 'Procesando...'
            : isRegister
            ? 'Crear cuenta'
            : 'Entrar'}
        </button>
      </form>

      <div style={{ marginTop: 12 }}>
        <button
          onClick={() => {
            setIsRegister((v) => !v)
            setErr(null)
            setMsg(null)
          }}
        >
          {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
        </button>
      </div>

      {msg && <p style={{ color: 'green' }}>{msg}</p>}
      {err && <p style={{ color: 'crimson' }}>{err}</p>}
    </div>
  )
}