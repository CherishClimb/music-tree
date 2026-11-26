import { useRef, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export type RecoveryState =
  | { kind: 'none' | 'waiting' | 'invalid' | 'complete' }
  | { kind: 'active'; userId: string }

export function PasswordRecoveryScreen({ client, recovery, exitError, onInvalid, onPasswordUpdated, onExit }: {
  client: SupabaseClient
  recovery: RecoveryState
  exitError: string
  onInvalid: () => void
  onPasswordUpdated: () => Promise<void>
  onExit: (requestNew: boolean) => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [finished, setFinished] = useState(false)

  const finish = async () => {
    try {
      await onPasswordUpdated()
      setFinished(true)
    } catch {
      setError('Your password changed, but sign-out failed. Retry finishing before logging in.')
    }
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current || saved || recovery.kind !== 'active') return
    setError('')
    if (password.length < 6) {
      setError('Use at least 6 characters. Your account may require a stronger password.')
      return
    }
    if (password !== confirmation) {
      setError('The passwords do not match.')
      return
    }
    submitting.current = true
    setBusy(true)
    try {
      const { error: updateError } = await client.auth.updateUser({ password })
      if (updateError) {
        if (updateError.status === 401 || updateError.status === 403
          || ['session_not_found', 'refresh_token_not_found', 'otp_expired', 'bad_jwt'].includes(updateError.code ?? '')) {
          setPassword('')
          setConfirmation('')
          onInvalid()
        } else {
          setError(updateError.code === 'same_password'
            ? 'Choose a password different from your current password.'
            : 'Could not update your password. Check your account’s password requirements and try again.')
        }
        return
      }
      setPassword('')
      setConfirmation('')
      setSaved(true)
      await finish()
    } catch {
      setError('Unable to update your password. Please check your connection and try again.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const exit = async (requestNew: boolean) => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    try {
      await onExit(requestNew)
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return <main className="auth-screen">
    <section className="auth-card" aria-labelledby="recovery-title">
      <div className="auth-mark" aria-hidden="true">♫</div>
      <h1 id="recovery-title">{saved ? 'Password updated' : 'Set a new password'}</h1>
      {saved ? <>
        <p className="auth-message" role="status">Your password has been updated.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {!finished && <button className="auth-submit" type="button" disabled={busy} onClick={async () => {
          if (submitting.current) return
          submitting.current = true
          setBusy(true)
          setError('')
          try { await finish() } finally { submitting.current = false; setBusy(false) }
        }}>Retry finishing</button>}
        {finished && <button className="auth-submit" type="button" disabled={busy}
          onClick={() => void exit(false)}>Back to log in</button>}
      </> : recovery.kind === 'waiting' ? <p role="status">Checking your recovery link…</p>
        : recovery.kind !== 'active' ? <>
          <p className="auth-error" role="alert">
            This recovery link is invalid, expired or already used. Request a new link to continue.
          </p>
          <button className="auth-submit" type="button" disabled={busy}
            onClick={() => void exit(true)}>Request a new link</button>
          <button className="auth-switch" type="button" disabled={busy}
            onClick={() => void exit(false)}>Back to log in</button>
        </> : <>
          <p>Choose and confirm your new password.</p>
          <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
            <label htmlFor="recovery-password">New password</label>
            <input id="recovery-password" name="new-password" type="password" autoComplete="new-password"
              required minLength={6} value={password} disabled={busy}
              onChange={(event) => setPassword(event.target.value)} aria-describedby="recovery-password-help" />
            <label htmlFor="recovery-confirm">Confirm new password</label>
            <input id="recovery-confirm" name="confirm-password" type="password" autoComplete="new-password"
              required minLength={6} value={confirmation} disabled={busy}
              onChange={(event) => setConfirmation(event.target.value)} />
            <p id="recovery-password-help" className="auth-help">
              Use at least 6 characters. Your account may require a stronger password.
            </p>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={busy}>
              {busy ? 'Updating password…' : 'Update password'}
            </button>
            <button className="auth-switch" type="button" disabled={busy}
              onClick={() => void exit(false)}>Back to log in</button>
          </form>
        </>}
      {exitError && <p className="auth-error" role="alert">{exitError}</p>}
    </section>
  </main>
}
