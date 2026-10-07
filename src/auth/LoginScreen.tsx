import { useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export function LoginScreen({ client, sessionError }: { client: SupabaseClient; sessionError: string }) {
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setError('')
    setMessage('')
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    try {
      const credentials = { email: email.trim(), password }
      const { data, error: authError } = creatingAccount
        ? await client.auth.signUp({
          ...credentials,
          options: { emailRedirectTo: window.location.origin + window.location.pathname },
        })
        : await client.auth.signInWithPassword(credentials)
      if (authError) {
        setError(authError.message)
      } else if (creatingAccount && !data.session) {
        setPassword('')
        setMessage('Check your email for a confirmation link, then come back to log in.')
      }
    } catch {
      setError('Unable to connect. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-screen">
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-mark" aria-hidden="true">♫</div>
      <h1 id="auth-title">Music Tree</h1>
      <p>{creatingAccount ? 'Create your account' : 'Welcome back. Let your music grow.'}</p>
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="auth-email">Email</label>
        <input id="auth-email" name="email" type="email" autoComplete="email" required
          value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
        <div className="auth-password-label">
          <label htmlFor="auth-password">Password</label>
          <button className="auth-password-toggle" type="button" aria-controls="auth-password"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((visible) => !visible)}>
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        <input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} required
          autoComplete={creatingAccount ? 'new-password' : 'current-password'}
          minLength={creatingAccount ? 6 : undefined}
          aria-describedby={creatingAccount ? 'auth-password-help' : undefined}
          value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
        {creatingAccount && <p id="auth-password-help" className="auth-help">Use at least 6 characters.</p>}
        {(error || sessionError) && <p className="auth-error" role="alert">{error || sessionError}</p>}
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : creatingAccount ? 'Create account' : 'Log in'}
        </button>
        <button className="auth-switch" type="button" disabled={busy} onClick={() => {
          setCreatingAccount(!creatingAccount)
          setShowPassword(false)
          setError('')
          setMessage('')
        }}>{creatingAccount ? 'Back to log in' : 'Create account'}</button>
      </form>
    </section>
  </main>
}
