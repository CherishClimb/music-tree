// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { AuthGate } from '../auth/AuthGate'
import { createDemoState, createFreshState, createLocalRepository, STORAGE_KEY } from '../data/localRepository'
import { CloudConflictError, type CloudMusicTreeRepository } from '../data/cloudMusicTreeRepository'
import { CloudGate } from './CloudGate'

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { auth } }))
const session: Session = {
  access_token: 'test', refresh_token: 'test', token_type: 'bearer', expires_in: 3600,
  user: { id: 'owner-a', email: 'a@example.com', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-07' },
}
let notify: (event: AuthChangeEvent, session: Session | null) => void

function setup(meaningful = false) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(meaningful ? createDemoState() : createFreshState())]])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: vi.fn((key: string) => { values.delete(key) }),
  }
  const repository = createLocalRepository(storage)
  const tree = { id: 'tree-a', owner_user_id: 'owner-a', name: 'Music Tree' }
  const remote = { music_tree_id: tree.id, schema_version: 1 as const, state: createFreshState(), updated_at: '2026-10-07T10:00:00Z' }
  const cloud = {
    findMusicTreeForUser: vi.fn().mockResolvedValue(null),
    createMusicTreeForUser: vi.fn().mockResolvedValue(tree),
    loadCloudState: vi.fn().mockResolvedValue(remote),
    createCloudState: vi.fn().mockResolvedValue(remote),
    updateCloudState: vi.fn().mockResolvedValue({ ...remote, updated_at: '2026-10-07T10:00:01Z' }),
  } satisfies CloudMusicTreeRepository
  const view = render(<AuthGate>{(user) =>
    <CloudGate key={user.id} userId={user.id} repository={repository} storage={storage} cloud={cloud}>
      <button type="button" onClick={() => repository.updateChildProfile({ displayName: 'Edited', avatarId: 'ice_princess' })}>Edit Music Tree</button>
    </CloudGate>
  }</AuthGate>)
  return { cloud, storage, repository, tree, remote, view }
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.getSession.mockResolvedValue({ data: { session }, error: null })
  auth.onAuthStateChange.mockImplementation((callback) => {
    notify = callback
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  auth.signOut.mockImplementation(async () => {
    notify('SIGNED_OUT', null)
    return { error: null }
  })
})
afterEach(cleanup)

describe('cloud setup UI after authentication', () => {
  it('holds the editable UI behind loading until cloud resolution completes', async () => {
    const h = setup()
    h.cloud.findMusicTreeForUser.mockReturnValue(new Promise(() => {}))
    expect((await screen.findByRole('status')).textContent).toContain('Loading')
    expect(screen.queryByRole('button', { name: 'Edit Music Tree' })).toBeNull()
    await screen.findByRole('button', { name: 'Log out' })
    expect(screen.queryByRole('button', { name: 'Create a new Music Tree' })).toBeNull()
  })
  it('shows the other-device instructions and creates a fresh tree only after a click', async () => {
    const h = setup()
    const create = await screen.findByRole('button', { name: 'Create a new Music Tree' })
    expect(screen.getByText(/open that device first/)).toBeTruthy()
    expect(h.cloud.createCloudState).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Edit Music Tree' })).toBeNull()
    await userEvent.click(create)
    expect(await screen.findByRole('button', { name: 'Edit Music Tree' })).toBeTruthy()
    expect(h.cloud.createCloudState).toHaveBeenCalledTimes(1)
  })
  it('requires explicit confirmation to upload existing phone data and keeps logout available', async () => {
    const h = setup(true)
    const before = h.storage.getItem(STORAGE_KEY)
    const migrate = await screen.findByRole('button', { name: "Use this device's existing Music Tree" })
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy()
    expect(h.cloud.createCloudState).not.toHaveBeenCalled()
    await userEvent.click(migrate)
    expect(await screen.findByRole('button', { name: 'Edit Music Tree' })).toBeTruthy()
    expect(h.storage.getItem(STORAGE_KEY)).toBe(before)
  })
  it('blocks editing after a cloud conflict and exposes backup and reload actions', async () => {
    const h = setup()
    h.cloud.findMusicTreeForUser.mockResolvedValue(h.tree)
    h.cloud.updateCloudState.mockRejectedValue(new CloudConflictError())
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Music Tree' }))
    expect((await screen.findByRole('alert')).textContent).toContain('another device')
    expect(screen.queryByRole('button', { name: 'Edit Music Tree' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Export local backup' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Reload latest version' }))
    expect(await screen.findByRole('button', { name: 'Edit Music Tree' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Export previous local copy' })).toBeTruthy()
  })
  it('keeps valid local data and offers retry when the cloud load fails', async () => {
    const h = setup(true)
    const before = h.storage.getItem(STORAGE_KEY)
    h.cloud.findMusicTreeForUser.mockRejectedValue(new Error('Network unavailable'))
    expect((await screen.findByRole('alert')).textContent).toContain('Network unavailable')
    expect(screen.getByRole('button', { name: 'Retry cloud load' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit Music Tree' })).toBeNull()
    expect(h.storage.getItem(STORAGE_KEY)).toBe(before)
  })
  it('logout preserves the cache and a different authenticated account is gated again', async () => {
    const h = setup(true)
    h.cloud.findMusicTreeForUser.mockResolvedValue(h.tree)
    await screen.findByRole('button', { name: 'Edit Music Tree' })
    const before = h.storage.getItem(STORAGE_KEY)
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('button', { name: 'Log in' })).toBeTruthy()
    expect(h.storage.getItem(STORAGE_KEY)).toBe(before)
    expect(h.storage.removeItem).not.toHaveBeenCalled()
    // The new user has no cloud data and must not receive automatic uploads.
    h.repository.updateChildProfile({ displayName: 'Previous user data', avatarId: 'ice_princess' })
    h.cloud.findMusicTreeForUser.mockResolvedValue(null)
    await act(async () => { notify('SIGNED_IN', { ...session, user: { ...session.user, id: 'owner-b', email: 'b@example.com' } }) })
    await screen.findByRole('button', { name: "Use this device's existing Music Tree" })
    expect(screen.getByRole('alert').textContent).toContain('different account')
    expect(h.cloud.createCloudState).not.toHaveBeenCalled()
    expect(h.cloud.updateCloudState).not.toHaveBeenCalled()
    await waitFor(() => expect(h.cloud.findMusicTreeForUser).toHaveBeenLastCalledWith('owner-b'))
  })
})