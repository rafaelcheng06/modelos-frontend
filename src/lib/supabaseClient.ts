// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,          // guarda la sesión en localStorage
    storageKey: 'modelos-auth',    // clave de almacenamiento
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})