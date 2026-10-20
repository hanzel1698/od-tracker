import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { Button, Field } from '@/components/ui'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'At least 6 characters'),
})
type Form = z.infer<typeof schema>

export function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async (f: Form) => {
    setMsg(null)
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword(f)
      if (error) setMsg({ kind: 'error', text: error.message })
    } else {
      const { data, error } = await supabase.auth.signUp({
        ...f,
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      })
      if (error) setMsg({ kind: 'error', text: error.message })
      else if (!data.session) setMsg({ kind: 'info', text: 'Check your inbox to confirm the email, then sign in.' })
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-700 text-2xl font-bold text-white">₹</div>
          <h1 className="text-xl font-bold">OD Tracker</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Overdrafts against fixed deposits</p>
        </div>
        {!supabaseConfigured && (
          <p className="mb-4 rounded-lg bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time.
          </p>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Email" error={formState.errors.email?.message}>
            <input className="input" type="email" autoComplete="email" {...register('email')} />
          </Field>
          <Field label="Password" error={formState.errors.password?.message}>
            <input
              className="input"
              type="password"
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              {...register('password')}
            />
          </Field>
          {msg && (
            <p className={msg.kind === 'error' ? 'text-sm text-red-600' : 'text-sm text-emerald-700 dark:text-emerald-400'}>{msg.text}</p>
          )}
          <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">
          {mode === 'in' ? (
            <>
              First time?{' '}
              <button className="text-blue-600 underline" onClick={() => setMode('up')}>
                Create the account
              </button>{' '}
              (sign-ups should be disabled afterwards).
            </>
          ) : (
            <button className="text-blue-600 underline" onClick={() => setMode('in')}>
              Back to sign in
            </button>
          )}
        </p>
      </div>
    </div>
  )
}
