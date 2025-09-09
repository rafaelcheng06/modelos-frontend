// src/lib/adminModels.ts
import { supabase } from './supabaseClient'

export type ModelRow = {
  id: string
  display_name: string
  user_id: string | null
  percent_default: number | null
  active: boolean
  created_at: string
}

export async function listModels(opts?: {
  search?: string
  page?: number
  pageSize?: number
}) {
  const page = opts?.page ?? 1
  const pageSize = opts?.pageSize ?? 10
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let q = supabase
    .from('models')
    .select('id, display_name, user_id, percent_default, active, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (opts?.search && opts.search.trim()) {
    q = q.ilike('display_name', `%${opts.search.trim()}%`)
  }

  const { data, error, count } = await q
  return { data: (data ?? []) as ModelRow[], error, count: count ?? 0 }
}

export async function setModelActive(id: string, active: boolean) {
  const { data, error } = await supabase
    .from('models')
    .update({ active })
    .eq('id', id)
    .select()
    .single()
  return { data: data as ModelRow | null, error }
}

export async function updateModelPercent(id: string, percent: number) {
  const { data, error } = await supabase
    .from('models')
    .update({ percent_default: percent })
    .eq('id', id)
    .select()
    .single()
  return { data: data as ModelRow | null, error }
}

export async function createModel(name: string) {
  const { data, error } = await supabase
    .from('models')
    .insert({ display_name: name, active: true })
    .select()
  return { data: (data ?? []) as ModelRow[], error }
}

export async function deleteModel(id: string) {
  const { error } = await supabase.from('models').delete().eq('id', id)
  return { ok: !error, error }
}