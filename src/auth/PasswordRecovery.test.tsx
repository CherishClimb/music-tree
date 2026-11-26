// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { AuthGate } from './AuthGate'
import { passwordRecoveryRedirect, readRecoveryCallback, RECOVERY_EVENT_WAIT_MS } from './passwordRecovery'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(), onAuthStateChange: vi.fn(), signInWithPassword: vi.fn(),
  signUp: vi.fn(), signOut: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ supabase: { auth } }))

const session: Session = {
  access_token: 'mock-access', refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 3600,
  user: { id: 'recovery-owner', email: 'test@example.com', aud: 'authenticated',
    app_metadata: {}, user_metadata: {}, created_at: '2026-10-07' },
}
const listeners = new Set<(event: AuthChangeEvent, value: Session | null) => void>()
const appMounted = vi.fn()
function EditableApp() { appMounted(); return <p>Editable application</p> }
const mount = () => render(<AuthGate><EditableApp /></AuthGate>)
const emit = async (event: AuthChangeEvent, value: Session | null) => {
  await act(async () => { for (const notify of listeners) notify(event, value) })
}
const activeRecovery = async () => {
  window.history.replaceState(null, '', '/?auth=recovery')
  auth.getSession.mockResolvedValue({ data: { session }, error: null })
  mount()
  await emit('PASSWORD_RECOVERY', session)
  await screen.findByLabelText('New password')
}
const fillPasswords = async (password = 'new-password-123', confirmation = password) => {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('New password'), password)
  await user.type(screen.getByLabelText('Confirm new password'), confirmation)
  return user
}

beforeEach(() => {
  vi.resetAllMocks()
  listeners.clear()
  window.history.replaceState(null, '', '/')
  localStorage.setItem('music-tree:mvp:v1', '{"existing":"practice-and-roles-fixture"}')
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  auth.onAuthStateChange.mockImplementation((notify) => {
    listeners.add(notify)
    return { data: { subscription: { unsubscribe: () => listeners.delete(notify) } } }
  })
  auth.signOut.mockImplementation(async () => {
    for (const notify of listeners) notify('SIGNED_OUT', null)
    return { error: null }
  })
  auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
  auth.updateUser.mockResolvedValue({ data: { user: session.user }, error: null })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

describe('password reset request', () => {
  it('opens from login without requiring a password and returns safely', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Forgot Password?' }))
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Back to log in' }))
    expect(screen.getByRole('button', { name: 'Log in' })).toBeTruthy()
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('requests the fixed callback and gives a non-enumerating confirmation', async () => {
    mount()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Forgot Password?' }))
    await user.type(screen.getByLabelText('Email'), 'test@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('test@example.com', {
      redirectTo: passwordRecoveryRedirect(),
    })
    expect(screen.getByRole('status').textContent).toContain('If an account exists')
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
    expect(appMounted).not.toHaveBeenCalled()
  })

  it('rejects empty/invalid email without contacting Supabase', async () => {
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Forgot Password?' }))
    const form = screen.getByLabelText('Email').closest('form')!
    fireEvent.submit(form)
    expect(screen.getByRole('alert').textContent).toContain('valid email')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } })
    fireEvent.submit(form)
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it.each(['api', 'rate', 'network'])('handles %s failure without echoing provider/account details', async (kind) => {
    if (kind === 'network') auth.resetPasswordForEmail.mockRejectedValue(new Error('private provider detail'))
    else auth.resetPasswordForEmail.mockResolvedValue({
      error: { status: kind === 'rate' ? 429 : 400, message: 'Account test@example.com does not exist' },
    })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Forgot Password?' }))
    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    const message = screen.getByRole('alert').textContent!
    expect(message).not.toContain('test@example.com')
    expect(message).not.toContain('private provider detail')
    expect((screen.getByRole('button', { name: 'Send reset link' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('coalesces repeated submissions while awaiting the email API', async () => {
    let resolve!: (value: unknown) => void
    auth.resetPasswordForEmail.mockReturnValue(new Promise((r) => { resolve = r }))
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Forgot Password?' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } })
    const form = screen.getByLabelText('Email').closest('form')!
    fireEvent.submit(form); fireEvent.submit(form)
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1)
    await act(async () => { resolve({ error: null }) })
  })
})

describe('recovery boundary and password update', () => {
  it('holds the editable application behind recovery even with an existing session', async () => {
    await activeRecovery()
    expect(appMounted).not.toHaveBeenCalled()
    await emit('TOKEN_REFRESHED', session)
    await emit('USER_UPDATED', session)
    expect(screen.getByLabelText('New password')).toBeTruthy()
    expect(appMounted).not.toHaveBeenCalled()
  })

  it('does not authorize a marker or a restored ordinary session, including callback refresh', async () => {
    vi.useFakeTimers()
    window.history.replaceState(null, '', '/?auth=recovery')
    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    mount()
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByLabelText('New password')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(RECOVERY_EVENT_WAIT_MS + 1) })
    expect(screen.getByRole('alert').textContent).toContain('invalid, expired or already used')
    expect(auth.updateUser).not.toHaveBeenCalled()
    expect(appMounted).not.toHaveBeenCalled()
  })

  it.each(['otp_expired', 'access_denied', 'already_used'])('rejects %s callbacks despite a normal existing session', async (code) => {
    window.history.replaceState(null, '', '/?auth=recovery#error=access_denied&error_code=' + code)
    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    mount()
    await emit('SIGNED_IN', session)
    await emit('PASSWORD_RECOVERY', session)
    expect(screen.getByRole('alert').textContent).toContain('invalid, expired or already used')
    expect(screen.queryByLabelText('New password')).toBeNull()
    expect(auth.updateUser).not.toHaveBeenCalled()
    expect(appMounted).not.toHaveBeenCalled()
  })

  it('rejects a marker with a missing session', async () => {
    window.history.replaceState(null, '', '/?auth=recovery')
    mount()
    expect((await screen.findByRole('alert')).textContent).toContain('invalid, expired or already used')
    expect(appMounted).not.toHaveBeenCalled()
  })

  it('does not let stale restoration overwrite a validated recovery event', async () => {
    let resolve!: (value: unknown) => void
    auth.getSession.mockReturnValue(new Promise((r) => { resolve = r }))
    window.history.replaceState(null, '', '/?auth=recovery')
    mount()
    await emit('PASSWORD_RECOVERY', session)
    await act(async () => { resolve({ data: { session: null }, error: null }) })
    expect(screen.getByLabelText('New password')).toBeTruthy()
    expect(appMounted).not.toHaveBeenCalled()
  })

  it('fails closed if the recovery account changes or signs out', async () => {
    await activeRecovery()
    await emit('SIGNED_IN', { ...session, user: { ...session.user, id: 'different-owner' } })
    expect(screen.queryByLabelText('New password')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('invalid, expired or already used')
    expect(appMounted).not.toHaveBeenCalled()
  })

  it('validates confirmation and minimum length before updateUser', async () => {
    await activeRecovery()
    const form = screen.getByLabelText('New password').closest('form')!
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } })
    fireEvent.submit(form)
    expect(screen.getByRole('alert').textContent).toContain('at least 6')
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'long-enough' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different' } })
    fireEvent.submit(form)
    expect(screen.getByRole('alert').textContent).toContain('do not match')
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('updates only the password, signs out locally and allows subsequent normal login without touching practice storage', async () => {
    const stored = localStorage.getItem('music-tree:mvp:v1')
    await activeRecovery()
    auth.updateUser.mockImplementation(async () => {
      for (const notify of listeners) notify('USER_UPDATED', session)
      return { data: { user: session.user }, error: null }
    })
    const user = await fillPasswords()
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'new-password-123' })
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(screen.getByRole('heading', { name: 'Password updated' })).toBeTruthy()
    expect(window.location.search).toBe('')
    expect(appMounted).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Back to log in' }))
    await user.type(screen.getByLabelText('Email'), 'test@example.com')
    await user.type(screen.getByLabelText('Password'), 'new-password-123')
    auth.signInWithPassword.mockImplementation(async () => {
      for (const notify of listeners) notify('SIGNED_IN', session)
      return { error: null }
    })
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'test@example.com', password: 'new-password-123' })
    expect(screen.getByText('Editable application')).toBeTruthy()
    expect(localStorage.getItem('music-tree:mvp:v1')).toBe(stored)
  })

  it.each(['weak', 'network', 'same'])('reports %s update failures without dropping recovery mode', async (kind) => {
    if (kind === 'network') auth.updateUser.mockRejectedValue(new Error('offline'))
    else auth.updateUser.mockResolvedValue({ error: { code: kind === 'same' ? 'same_password' : 'weak_password' } })
    await activeRecovery()
    const user = await fillPasswords()
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(screen.getByRole('alert')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Update password' }) as HTMLButtonElement).disabled).toBe(false)
    expect(appMounted).not.toHaveBeenCalled()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('handles session expiry while submitting and offers a new request', async () => {
    auth.updateUser.mockResolvedValue({ error: { status: 401, code: 'session_not_found' } })
    await activeRecovery()
    const user = await fillPasswords()
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Request a new link' }))
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeTruthy()
    expect(appMounted).not.toHaveBeenCalled()
  })

  it('does not falsely claim sign-out success or resubmit the password when finishing is retried', async () => {
    auth.signOut.mockResolvedValueOnce({ error: { message: 'offline' } })
    await activeRecovery()
    const user = await fillPasswords()
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(screen.getByRole('alert').textContent).toContain('sign-out failed')
    expect(screen.queryByRole('button', { name: 'Back to log in' })).toBeNull()
    expect(appMounted).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Retry finishing' }))
    expect(screen.getByRole('button', { name: 'Back to log in' })).toBeTruthy()
    expect(auth.updateUser).toHaveBeenCalledTimes(1)
  })

  it('preserves the invalid-link gate if exiting the existing session fails', async () => {
    window.history.replaceState(null, '', '/?auth=recovery#error=access_denied')
    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    auth.signOut.mockResolvedValue({ error: { message: 'offline' } })
    mount()
    await userEvent.click(screen.getByRole('button', { name: 'Request a new link' }))
    expect(screen.getAllByRole('alert').some((e) => e.textContent?.includes('Could not sign out'))).toBe(true)
    expect(appMounted).not.toHaveBeenCalled()
  })

  it('rejects duplicate password submissions while updateUser is pending', async () => {
    let resolve!: (value: unknown) => void
    auth.updateUser.mockReturnValue(new Promise((r) => { resolve = r }))
    await activeRecovery()
    await fillPasswords()
    const form = screen.getByLabelText('New password').closest('form')!
    fireEvent.submit(form); fireEvent.submit(form)
    expect(auth.updateUser).toHaveBeenCalledTimes(1)
    await act(async () => { resolve({ error: null, data: { user: session.user } }) })
  })

  it('keeps one active subscription through StrictMode and cleans up on unmount', async () => {
    window.history.replaceState(null, '', '/?auth=recovery')
    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    const view = render(<StrictMode><AuthGate><EditableApp /></AuthGate></StrictMode>)
    await emit('PASSWORD_RECOVERY', session)
    expect(listeners.size).toBe(1)
    expect(screen.getByLabelText('New password')).toBeTruthy()
    expect(appMounted).not.toHaveBeenCalled()
    view.unmount()
    expect(listeners.size).toBe(0)
  })
})

describe('fixed callback selection', () => {
  it('uses the production domain outside the exact supported local origins', () => {
    expect(passwordRecoveryRedirect('https://music.curigrove.com')).toBe('https://music.curigrove.com/?auth=recovery')
    expect(passwordRecoveryRedirect('https://untrusted.example')).toBe('https://music.curigrove.com/?auth=recovery')
    expect(passwordRecoveryRedirect('http://localhost:5173')).toBe('http://localhost:5173/?auth=recovery')
    expect(passwordRecoveryRedirect('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173/?auth=recovery')
  })

  it('treats recovery markers and callback errors as UI intent, not a session', () => {
    expect(readRecoveryCallback('?auth=recovery', '')).toEqual({ requested: true, invalid: false })
    expect(readRecoveryCallback('', '#type=recovery')).toEqual({ requested: true, invalid: false })
    expect(readRecoveryCallback('?auth=recovery', '#error_code=otp_expired')).toEqual({ requested: true, invalid: true })
    expect(readRecoveryCallback('', '')).toEqual({ requested: false, invalid: false })
  })
})
