import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key)

// The publishable/anon key is designed for browsers; RLS limits it to the
// signed-in user's own rows. Never put a service-role key here.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Turn a PostgREST/Postgres error into something worth showing in a toast. */
export function errorMessage(e: unknown): string {
  if (!e) return 'Unknown error'
  if (typeof e === 'string') return e
  const err = e as { message?: string; details?: string; hint?: string; code?: string }
  if (err.code === '23505') return 'That record already exists (duplicate account number?)'
  if (err.code === '23503') return 'This record is still referenced elsewhere'
  return [err.message, err.details].filter(Boolean).join(' — ') || 'Request failed'
}
