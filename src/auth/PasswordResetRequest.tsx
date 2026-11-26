import { useRef, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { passwordRecoveryRedirect } from './passwordRecovery'

export function PasswordResetRequest({ client, initialEmail, onBack }: {
  client: SupabaseClient
  initialEmail: string
  onBack: () => void
}) {
  const [email, setEmail] = useState(initialEmail)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current) return
    setError('')
    setSent(false)
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }
    submitting.current = true
    setBusy(true)
    try {
      const { error: requestError } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: passwordRecoveryRedirect(),
      })
      if (requestError) {
        // Never echo provider messages that might disclose whether an account exists.
        setError(requestError.status === 429
          ? 'Too many requests. Please wait before trying again.'
          : 'Could not request a reset link. Please try again later.')
      } else {
        setSent(true)
      }
    } catch {
      setError('Unable to connect. Please check your connection and try again.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return <main className="auth-screen">
    <section className="auth-card" aria-labelledby="reset-request-title">
      <div className="auth-mark" aria-hidden="true">♫</div>
      <h1 id="reset-request-title">Reset your password</h1>
      <p>Enter your account email to request a recovery link.</p>
      <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
        <label htmlFor="reset-email">Email</label>
        <input id="reset-email" name="email" type="email" autoComplete="email" required
          value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} />
        {error && <p className="auth-error" role="alert">{error}</p>}
        {sent && <p className="auth-message" role="status">
          If an account exists for this email, you will receive a password reset link.
        </p>}
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? 'Sending request…' : 'Send reset link'}
        </button>
        <button className="auth-switch" type="button" disabled={busy} onClick={onBack}>Back to log in</button>
      </form>
    </section>
  </main>
}
