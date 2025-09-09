// src/lib/models.ts
import { supabase } from './supabaseClient'

export type ModelRow = {
  id: string
  display_name: string
  percent_default: number
  active: boolean
  user_id: string | null
  created_at: string
}

// Listar modelos (ordenados por fecha desc)
export async function listModels() {
  const { data, error } = await supabase
    .from('models')
    .select('id, display_name, percent_default, active, user_id, created_at')
    .order('created_at', { ascending: false })
  return { data: (data ?? []) as ModelRow[], error }
}

// Crear modelo (nombre + defaults)
export async function createModel(displayName: string) {
  const { data, error } = await supabase
    .from('models')
    .insert({
      display_name: displayName.trim(),
      percent_default: 60,
      active: true,
    })
    .select()
    .single()
  return { data: data as ModelRow | null, error }
}