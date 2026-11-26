// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// Real installed SDK, with synthetic credentials and fake fetch/storage only.
// Import the actual client module so this tests registration at client creation.
let client: Pick<SupabaseClient, 'auth'> | undefined
let stopObserver = () => {}
afterEach(() => {
  cleanup()
  stopObserver()
  client?.auth.stopAutoRefresh()
  vi.unstubAllEnvs()
  vi.doUnmock('@supabase/supabase-js')
  window.history.replaceState(null, '', '/')
})
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://offline.example.test')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'offline-public-key')
})

async function setup(mode: 'recovery' | 'restored' | 'invalid') {
  const actual = await vi.importActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js')
  const now = Math.floor(Date.now() / 1000)
  const enc = (v: unknown) => btoa(JSON.stringify(v)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const token = enc({ alg: 'HS256', typ: 'JWT' }) + '.' +
    enc({ sub: 'offline-owner', aud: 'authenticated', exp: now + 3600, iat: now }) + '.c2ln'
  const user = { id: 'offline-owner', email: 'offline@example.test', aud: 'authenticated',
    app_metadata: {}, user_metadata: {}, created_at: '2026-10-07T00:00:00Z' }
  const session = { access_token: token, refresh_token: 'offline-refresh', expires_at: now + 3600,
    expires_in: 3600, token_type: 'bearer', user }
  window.history.replaceState(null, '', mode === 'recovery'
    ? '/?auth=recovery#access_token=' + token +
      '&refresh_token=offline-refresh&expires_in=3600&token_type=bearer&type=recovery'
    : mode === 'invalid' ? '/?auth=recovery#error=access_denied&error_code=otp_expired' : '/?auth=recovery')
  const storage = new Map<string, string>()
  if (mode !== 'recovery') storage.set('offline-recovery-ordering', JSON.stringify(session))
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(user), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }))
  const seen: string[] = []
  vi.doMock('@supabase/supabase-js', () => ({
    ...actual,
    createClient: (url: string, key: string, options: Parameters<typeof actual.createClient>[2]) => {
      const created = actual.createClient(url, key, {
        ...options, global: { fetch: fetchMock },
        auth: { ...options?.auth, autoRefreshToken: false, storageKey: 'offline-recovery-ordering',
          storage: {
            getItem: (name) => storage.get(name) ?? null,
            setItem: (name, value) => { storage.set(name, value) },
            removeItem: (name) => { storage.delete(name) },
          },
        },
      })
      client = created
      const { data: { subscription } } = created.auth.onAuthStateChange((event) => { seen.push(event) })
      stopObserver = () => subscription.unsubscribe()
      return created
    },
  }))
  const { AuthGate } = await import('./AuthGate')
  await client!.auth.initialize()
  await new Promise((resolve) => window.setTimeout(resolve, 30))
  const proof = await import('./recoverySession')
  const app = vi.fn(() => <p>Editable app must not mount</p>)
  return { AuthGate, app, seen, fetchMock, proof }
}

it('retains a validated SDK recovery event emitted before React mounts', async () => {
  const { AuthGate, app, seen, fetchMock, proof } = await setup('recovery')
  expect(seen).toContain('PASSWORD_RECOVERY')
  expect(proof.getObservedRecoveryUserId()).toBe('offline-owner')
  render(<AuthGate>{app}</AuthGate>)
  expect(await screen.findByLabelText('New password')).toBeTruthy()
  expect(app).not.toHaveBeenCalled()
  expect(fetchMock).toHaveBeenCalled()
  await act(async () => { await client!.auth.signOut({ scope: 'local' }) })
  expect(proof.getObservedRecoveryUserId()).toBeNull()
  expect(screen.getByRole('alert').textContent).toContain('invalid, expired or already used')
  expect(app).not.toHaveBeenCalled()
})

it.each(['restored', 'invalid'] as const)('does not authorize a %s callback with an ordinary stored session', async (mode) => {
  const { AuthGate, app, seen, proof } = await setup(mode)
  expect(seen).not.toContain('PASSWORD_RECOVERY')
  expect(proof.getObservedRecoveryUserId()).toBeNull()
  render(<AuthGate>{app}</AuthGate>)
  expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toBeTruthy()
  expect(screen.queryByLabelText('New password')).toBeNull()
  expect(app).not.toHaveBeenCalled()
})
