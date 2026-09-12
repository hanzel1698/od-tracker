import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Whether the app has been pointed at a Supabase project yet. The UI checks
 * this first and shows setup instructions instead of a login form that could
 * only ever fail, which is the difference between "I forgot to set the env
 * vars" and "the app is broken".
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  console.warn(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
      'Copy web/.env.example to web/.env.local and fill in your project details.',
  )
}

// The placeholder keeps createClient from throwing on a misconfigured build, so
// the app can render its own setup screen rather than a blank page.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'public-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
