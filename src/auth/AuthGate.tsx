import { clearObservedRecovery, getObservedRecoveryUserId, hasObservedRecovery } from './recoverySession'
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { LoginScreen } from './LoginScreen'
import { PasswordRecoveryScreen, type RecoveryState } from './PasswordRecoveryScreen'
import { clearRecoveryLocation, markRecoveryView, readRecoveryCallback, RECOVERY_EVENT_WAIT_MS } from './passwordRecovery'
import './auth.css'

export function AuthGate({ children }: { children: ReactNode | ((user: User) => ReactNode) }) {
  const [initialCallback] = useState(() => readRecoveryCallback())
  const [recovery, setRecovery] = useState<RecoveryState>(() => ({
    kind: initialCallback.invalid ? 'invalid' : (initialCallback.requested || getObservedRecoveryUserId() !== null) ? 'waiting' : 'none',
  }))
  const recoveryRef = useRef(recovery)
  const changeRecovery = useCallback((next: RecoveryState) => {
    recoveryRef.current = next
    setRecovery(next)
  }, [])
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [requestNew, setRequestNew] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let active = true
    let receivedAuthEvent = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      receivedAuthEvent = true
      const current = recoveryRef.current
      if (event === 'PASSWORD_RECOVERY') {
        // Only the SDK's validated recovery event authorizes this view.
        // A URL marker or an ordinary existing session is not enough.
        if (current.kind !== 'invalid' && current.kind !== 'complete') {
          markRecoveryView()
          changeRecovery(nextSession?.user
            ? { kind: 'active', userId: nextSession.user.id }
            : { kind: 'invalid' })
        }
      } else if (current.kind !== 'invalid' && current.kind !== 'complete'
        && hasObservedRecovery(nextSession?.user.id)) {
        markRecoveryView()
        changeRecovery({ kind: 'active', userId: nextSession!.user.id })
      } else if (current.kind !== 'none' && current.kind !== 'complete') {
        if (!nextSession?.user || (current.kind === 'active' && current.userId !== nextSession.user.id)) {
          changeRecovery({ kind: 'invalid' })
        }
      }
      setSession(nextSession)
      setError('')
      setLoading(false)
      setInitialized(true)
    })

    // Subscribe first: late restoration must not replace a newer auth event.
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || receivedAuthEvent) return
      setSession(sessionError ? null : data.session)
      if (!sessionError && recoveryRef.current.kind !== 'invalid'
        && recoveryRef.current.kind !== 'complete' && hasObservedRecovery(data.session?.user.id)) {
        markRecoveryView()
        changeRecovery({ kind: 'active', userId: data.session!.user.id })
      } else if (recoveryRef.current.kind !== 'none') {
        if (sessionError || !data.session?.user) changeRecovery({ kind: 'invalid' })
        // No witnessed recovery event: restoration alone grants nothing.
      } else if (sessionError) {
        setError('Your session could not be restored. Please log in again.')
      }
      setLoading(false)
      setInitialized(true)
    }).catch(() => {
      if (!active || receivedAuthEvent) return
      if (recoveryRef.current.kind !== 'none') changeRecovery({ kind: 'invalid' })
      else setError('Your session could not be restored. Please log in again.')
      setLoading(false)
      setInitialized(true)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [changeRecovery])

  useEffect(() => {
    if (recovery.kind !== 'waiting' || !initialized) return
    // SDK initialization has finished. A marker without a recovery event (for
    // example refreshing an already-consumed callback) fails closed.
    const timer = window.setTimeout(() => {
      if (recoveryRef.current.kind === 'waiting') changeRecovery({ kind: 'invalid' })
    }, RECOVERY_EVENT_WAIT_MS)
    return () => window.clearTimeout(timer)
  }, [recovery.kind, initialized, changeRecovery])

  const logout = async () => {
    if (!supabase) return
    setLoggingOut(true)
    setError('')
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) throw signOutError
      setSession(null)
    } catch {
      setError('Could not log out. Please check your connection and try again.')
    } finally {
      setLoggingOut(false)
    }
  }

  const finishRecovery = async () => {
    if (!supabase) return
    // Lock recovery before sign-out events; never briefly mount the cloud app.
    changeRecovery({ kind: 'complete' })
    clearObservedRecovery()
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
    if (signOutError) throw signOutError
    setSession(null)
    clearRecoveryLocation()
  }

  const exitRecovery = async (request: boolean) => {
    if (!supabase) return
    setError('')
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) throw signOutError
      setSession(null)
      clearObservedRecovery()
      clearRecoveryLocation()
      setRequestNew(request)
      changeRecovery({ kind: 'none' })
    } catch {
      setError('Could not sign out of this session. Please check your connection and try again.')
    }
  }

  if (!supabase) {
    return <main className="auth-screen"><section className="auth-card">
      <h1>Music Tree</h1>
      <p role="alert">Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then rebuild the app.</p>
    </section></main>
  }
  if (recovery.kind !== 'none') return <PasswordRecoveryScreen client={supabase}
    recovery={recovery} exitError={error}
    onInvalid={() => changeRecovery({ kind: 'invalid' })}
    onPasswordUpdated={finishRecovery} onExit={exitRecovery} />
  if (loading) return <main className="auth-screen"><p role="status">Loading Music Tree...</p></main>
  if (!session?.user) return <LoginScreen client={supabase} sessionError={error} initialRecoveryRequest={requestNew} />

  return <>
    <div className="auth-account-bar" aria-label="Account">
      <span className="auth-account-email">{session.user.email}</span>
      <button className="auth-logout" type="button" disabled={loggingOut} onClick={() => void logout()}>
        {loggingOut ? 'Logging out...' : 'Log out'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
    <Fragment key={session.user.id}>{typeof children === 'function' ? children(session.user) : children}</Fragment>
  </>
}
