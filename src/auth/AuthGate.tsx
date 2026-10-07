import { Fragment, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { LoginScreen } from './LoginScreen'
import './auth.css'

export function AuthGate({ children }: { children: ReactNode | ((user: User) => ReactNode) }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let active = true
    let receivedAuthEvent = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      receivedAuthEvent = true
      setSession(nextSession)
      setError('')
      setLoading(false)
    })

    // Subscribe first so a late restoration result cannot overwrite a newer login/logout.
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || receivedAuthEvent) return
      setSession(sessionError ? null : data.session)
      if (sessionError) setError('Your session could not be restored. Please log in again.')
      setLoading(false)
    }).catch(() => {
      if (!active || receivedAuthEvent) return
      setError('Your session could not be restored. Please log in again.')
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

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

  if (!supabase) {
    return <main className="auth-screen"><section className="auth-card">
      <h1>Music Tree</h1>
      <p role="alert">Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then rebuild the app.</p>
    </section></main>
  }
  if (loading) return <main className="auth-screen"><p role="status">Loading Music Tree...</p></main>
  if (!session?.user) return <LoginScreen client={supabase} sessionError={error} />

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

