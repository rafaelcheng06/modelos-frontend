// src/lib/profile.ts
import { supabase } from './supabaseClient'

export type Role = "admin" | "model";

export type ModelRow = {
  id: string;
  display_name: string;
};

export type AppUserRow = {
  role: Role;
  model_id: string;
};

export type ModelProfile = {
  model: ModelRow | null;
  appUser: AppUserRow | null;
  error: string | null;
};

export async function getModelProfile() {
  // 1. Obtener usuario actual
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) return { model: null, appUser: null, error: 'No user' }

  // 2. Nombre desde models
  const { data: model, error: mErr } = await supabase
    .from('models')
    .select('id, display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  // 3. Rol desde app_users
  const { data: appUser, error: aErr } = await supabase
    .from('app_users')
    .select('role, model_id')
    .eq('user_id', user.id)
    .maybeSingle()

  return { model, appUser, error: mErr ?? aErr ?? null }
}