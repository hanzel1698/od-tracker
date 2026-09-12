import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { Field } from '../components/Field'

type Mode = 'signin' | 'signup'

export function Login() {
  const { signIn, signUp } = useAuth()

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password)
      } else {
        const { needsConfirmation } = await signUp(email.trim(), password)
        if (needsConfirmation) {
          setNotice('Check your inbox for the confirmation link, then sign in.')
          setMode('signin')
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>OD Tracker</h1>
        <p className="auth-tagline">Overdrafts against fixed deposits, in one place.</p>

        <form className="form" onSubmit={onSubmit}>
          <Field
            label="Email"
            type="email"
            value={email}
            autoComplete="email"
            required
            onChange={(event) => setEmail(event.target.value)}
          />
          <Field
            label="Password"
            type="password"
            value={password}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            hint={mode === 'signup' ? 'At least 6 characters.' : undefined}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error && <div className="banner banner-error">{error}</div>}
          {notice && <div className="banner banner-success">{notice}</div>}

          <button className="btn btn-block" type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            className="btn-text"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError(null)
              setNotice(null)
            }}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </main>
  )
}

/** Shown instead of the login form when the Supabase env vars are missing. */
export function SetupRequired() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Almost there</h1>
        <p className="auth-tagline">This build has no Supabase project attached yet.</p>
        <ol className="setup-list">
          <li>
            Create a project at <a href="https://supabase.com">supabase.com</a>.
          </li>
          <li>
            Run <code>web/supabase/schema.sql</code> in the SQL editor.
          </li>
          <li>
            Copy <code>web/.env.example</code> to <code>web/.env.local</code> and fill in{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
          </li>
          <li>Restart the dev server, or set the same two variables in Netlify and redeploy.</li>
        </ol>
      </div>
    </main>
  )
}
