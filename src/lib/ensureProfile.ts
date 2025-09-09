// src/lib/ensureProfile.ts
import { supabase } from './supabaseClient'

/**
 * Asegura el perfil del usuario firmado sin romper roles existentes.
 * - Si no existe fila en app_users, la crea con role='model'.
 *   (Si ya existe, NO toca el role.)
 * - Si hay display_name (del form o metadata), upsert en models por user_id.
 */
export async function ensureProfile(displayNameFromForm?: string): Promise<{ error: Error | null }> {
  const { data: authData, error: authErr } = await supabase.auth.getUser()
  if (authErr || !authData?.user) return { error: authErr ?? new Error('No user') }
  const user = authData.user

  // 1) app_users: crear si NO existe (no modificar si ya existe)
  const { data: existing, error: selErr } = await supabase
    .from('app_users')
    .select('user_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (selErr) return { error: selErr }

  if (!existing) {
    const { error: insErr } = await supabase
      .from('app_users')
      .insert({ user_id: user.id, role: 'model' })
    if (insErr) return { error: insErr }
  }

  // 2) models: upsert por user_id con display_name si lo tenemos
  const displayName = (displayNameFromForm ?? user.user_metadata?.display_name ?? '').trim()
  if (displayName) {
    const { error: upErr } = await supabase
      .from('models')
      .upsert(
        { user_id: user.id, display_name: displayName },
        { onConflict: 'user_id' }
      )
    if (upErr) return { error: upErr }
  }

  return { error: null }
}