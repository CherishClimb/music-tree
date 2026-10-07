// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import App from '../App'
import { STORAGE_KEY } from '../data/localRepository'
import { AuthGate } from './AuthGate'

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('../lib/supabase', () => ({ supabase: { auth } }))

const session = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  user: {
    id: 'test-user', email: 'musician@example.com', aud: 'authenticated',
    app_metadata: {}, user_metadata: {}, created_at: '2026-10-07T00:00:00Z',
  },
} satisfies Session
let notify: (event: AuthChangeEvent, session: Session | null) => void
const unsubscribe = vi.fn()
const mount = () => render(<AuthGate><App /></AuthGate>)
const emit = async (event: AuthChangeEvent, value: Session | null) => {
  await act(async () => { notify(event, value) })
}
const fillCredentials = async () => {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Email'), 'musician@example.com')
  await user.type(screen.getByLabelText('Password'), 'test-password')
  return user
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  auth.onAuthStateChange.mockImplementation((callback) => {
    notify = callback
    return { data: { subscription: { unsubscribe } } }
  })
  auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: null })
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null })
  auth.signOut.mockResolvedValue({ error: null })
})
afterEach(cleanup)

describe('Music Tree authentication boundary', () => {
  it('shows loading until authentication is known, then shows login instead of Music Tree', async () => {
    let resolveSession!: (value: unknown) => void
    auth.getSession.mockReturnValue(new Promise((resolve) => { resolveSession = resolve }))
    mount()
    expect(screen.getByRole('status').textContent).toContain('Loading Music Tree')
    expect(screen.queryByLabelText('Email')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Magical winter practice' })).toBeNull()
    await act(async () => { resolveSession({ data: { session: null }, error: null }) })
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Log in' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Magical winter practice' })).toBeNull()
  })

  it('restores the persisted session on mount and again after a page remount', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    const first = mount()
    expect(await screen.findByRole('heading', { name: 'Magical winter practice' })).toBeTruthy()
    expect(screen.queryByLabelText('Email')).toBeNull()
    first.unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    mount()
    expect(await screen.findByRole('heading', { name: 'Magical winter practice' })).toBeTruthy()
    expect(auth.getSession).toHaveBeenCalledTimes(2)
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('shows the existing application after a successful email/password login', async () => {
    auth.signInWithPassword.mockImplementation(async () => {
      notify('SIGNED_IN', session)
      return { data: { session }, error: null }
    })
    mount()
    const user = await fillCredentials()
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'musician@example.com', password: 'test-password' })
    expect(await screen.findByRole('heading', { name: 'Magical winter practice' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy()
  })

  it('displays Supabase login errors and allows a retry', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid login credentials' } })
    mount()
    const user = await fillCredentials()
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Invalid login credentials')
    expect((screen.getByRole('button', { name: 'Log in' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByRole('heading', { name: 'Magical winter practice' })).toBeNull()
  })

  it('reports network failures without leaving the form disabled', async () => {
    auth.signInWithPassword.mockRejectedValue(new Error('offline'))
    mount()
    const user = await fillCredentials()
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to connect')
    expect((screen.getByLabelText('Password') as HTMLInputElement).disabled).toBe(false)
  })

  it('rejects empty credentials without contacting Supabase', async () => {
    mount()
    const email = await screen.findByLabelText('Email')
    fireEvent.submit(email.closest('form')!)
    expect(screen.getByRole('alert').textContent).toContain('email and password')
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('supports account creation requiring email confirmation', async () => {
    mount()
    const user = await fillCredentials()
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'musician@example.com', password: 'test-password',
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    expect((await screen.findByRole('status')).textContent).toContain('Check your email')
    expect(screen.queryByRole('heading', { name: 'Magical winter practice' })).toBeNull()
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('')
  })

  it('opens Music Tree when signup immediately returns an authenticated session', async () => {
    auth.signUp.mockImplementation(async () => {
      notify('SIGNED_IN', session)
      return { data: { session }, error: null }
    })
    mount()
    const user = await fillCredentials()
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'Magical winter practice' })).toBeTruthy()
  })

  it('logs out and returns to login while preserving Music Tree storage', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    const storedTree = localStorage.getItem(STORAGE_KEY)
    expect(storedTree).not.toBeNull()
    mount()
    const button = await screen.findByRole('button', { name: 'Log out' })
    await userEvent.click(button)
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(await screen.findByLabelText('Email')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Magical winter practice' })).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(storedTree)
  })

  it('keeps the application open and reports a failed logout', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null })
    auth.signOut.mockResolvedValue({ error: { message: 'network error' } })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Could not log out')
    expect(screen.getByRole('heading', { name: 'Magical winter practice' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Log out' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('responds to session refresh and sign-out events from another tab', async () => {
    mount()
    await screen.findByLabelText('Email')
    await emit('SIGNED_IN', session)
    expect(screen.getByRole('heading', { name: 'Magical winter practice' })).toBeTruthy()
    await emit('TOKEN_REFRESHED', { ...session, access_token: 'refreshed-token' })
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy()
    await emit('SIGNED_OUT', null)
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })

  it('does not overwrite a newer sign-out event with a stale restoration result', async () => {
    let resolveSession!: (value: unknown) => void
    auth.getSession.mockReturnValue(new Promise((resolve) => { resolveSession = resolve }))
    mount()
    await emit('SIGNED_OUT', null)
    await act(async () => { resolveSession({ data: { session }, error: null }) })
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Magical winter practice' })).toBeNull()
  })

  it.each(['returned', 'thrown'])('recovers from a %s session restoration error', async (kind) => {
    if (kind === 'returned') auth.getSession.mockResolvedValue({ data: { session: null }, error: { message: 'expired' } })
    else auth.getSession.mockRejectedValue(new Error('offline'))
    mount()
    expect(await screen.findByLabelText('Email')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('session could not be restored')
  })

  it('cleans up subscriptions during StrictMode setup and unmount', async () => {
    const view = render(<StrictMode><AuthGate><App /></AuthGate></StrictMode>)
    await waitFor(() => expect(auth.onAuthStateChange).toHaveBeenCalledTimes(2))
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })
})
