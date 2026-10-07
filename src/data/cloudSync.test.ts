import { describe, expect, it, vi } from 'vitest'
import { createDemoState, createFreshState, createLocalRepository, STORAGE_KEY, type PersistedState } from './localRepository'
import { CloudConflictError, type CloudMusicTree, type CloudMusicTreeRepository, type CloudState } from './cloudMusicTreeRepository'
import { CLOUD_CACHE_OWNER_KEY, LAST_SAFETY_COPY_KEY } from './cloudLocalCache'
import { createCloudSync } from './cloudSync'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem = vi.fn((key: string) => { this.values.delete(key) })
}
const userId = 'owner-a'
const initialRevision = '2026-10-07T10:00:00.000Z'
const tree: CloudMusicTree = { id: 'tree-a', owner_user_id: userId, name: 'Music Tree' }
const snapshot = (state = createFreshState(), updatedAt = initialRevision): CloudState => ({
  music_tree_id: tree.id, schema_version: 1, state, updated_at: updatedAt,
})
function harness(local = createFreshState(), remote: CloudState | null = null, hasTree = remote !== null, storage = new MemoryStorage(), owner = userId) {
  if (!storage.getItem(STORAGE_KEY)) storage.setItem(STORAGE_KEY, JSON.stringify(local))
  const repository = createLocalRepository(storage)
  let cloudTree = hasTree ? { ...tree, owner_user_id: owner } : null
  let cloudState = remote
  const cloud = {
    findMusicTreeForUser: vi.fn(async () => cloudTree),
    createMusicTreeForUser: vi.fn(async () => (cloudTree = { ...tree, owner_user_id: owner })),
    loadCloudState: vi.fn(async () => cloudState),
    createCloudState: vi.fn(async (_id: string, state: PersistedState) => {
      if (cloudState) throw new CloudConflictError()
      cloudState = snapshot(state)
      return cloudState
    }),
    updateCloudState: vi.fn(async (_id: string, state: PersistedState, expected: string) => {
      if (!cloudState || cloudState.updated_at !== expected) throw new CloudConflictError()
      cloudState = snapshot(state, new Date(Date.parse(expected) + 1).toISOString())
      return cloudState
    }),
  } satisfies CloudMusicTreeRepository
  const onChange = vi.fn()
  const sync = createCloudSync({ cloud, repository, storage, userId: owner, onChange })
  return { cloud, repository, storage, sync, onChange, changeRemote: (value: CloudState) => { cloudState = value } }
}
const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 0)) }

describe('safe cloud bootstrap and local-first synchronization', () => {
  it('cloud wins over local, preserving a safety copy and unknown fields without echo-saving', async () => {
    const remote = { ...createFreshState(), futureField: { keep: true } }
    remote.childProfile.displayName = 'Cloud child'
    const h = harness(createDemoState(), snapshot(remote))
    const before = h.storage.getItem(STORAGE_KEY)
    await h.sync.start()
    expect(h.sync.getView().phase).toBe('ready')
    expect(JSON.parse(h.storage.getItem(STORAGE_KEY)!)).toEqual(remote)
    expect(JSON.parse(h.repository.exportBackupJson())).toEqual(remote)
    expect(h.storage.getItem(h.storage.getItem(LAST_SAFETY_COPY_KEY)!)).toBe(before)
    expect(h.cloud.updateCloudState).not.toHaveBeenCalled()
    expect(h.cloud.createCloudState).not.toHaveBeenCalled()
  })
  it.each([false, true])('requires confirmation for meaningful local data, including incomplete tree=%s', async (hasTree) => {
    const h = harness(createDemoState(), null, hasTree)
    const before = h.storage.getItem(STORAGE_KEY)
    await h.sync.start()
    expect(h.sync.getView().phase).toBe('migration')
    expect(h.storage.getItem(STORAGE_KEY)).toBe(before)
    expect(h.cloud.createMusicTreeForUser).not.toHaveBeenCalled()
    expect(h.cloud.createCloudState).not.toHaveBeenCalled()
  })
  it.each([false, true])('never uploads untouched fresh local data automatically, including incomplete tree=%s', async (hasTree) => {
    const h = harness(createFreshState(), null, hasTree)
    await h.sync.start()
    expect(h.sync.getView().phase).toBe('empty')
    expect(h.cloud.createMusicTreeForUser).not.toHaveBeenCalled()
    expect(h.cloud.createCloudState).not.toHaveBeenCalled()
  })
  it('creates Fresh State only after explicit Create new', async () => {
    const h = harness()
    await h.sync.start()
    await h.sync.createNew()
    expect(h.cloud.createMusicTreeForUser).toHaveBeenCalledWith(userId)
    expect(h.cloud.createCloudState).toHaveBeenCalledWith(tree.id, createFreshState())
    expect(h.sync.getView().phase).toBe('ready')
  })
  it.each([false, true])('migrates a phone-style state without deleting or replacing localStorage; existing tree=%s', async (hasTree) => {
    const h = harness(createDemoState(), null, hasTree)
    const before = h.storage.getItem(STORAGE_KEY)
    const expected = JSON.parse(h.repository.exportBackupJson())
    await h.sync.start()
    await h.sync.useLocal()
    expect(h.cloud.createCloudState).toHaveBeenCalledWith(tree.id, expected)
    expect(h.cloud.createMusicTreeForUser).toHaveBeenCalledTimes(hasTree ? 0 : 1)
    expect(h.storage.getItem(STORAGE_KEY)).toBe(before)
    expect(h.storage.removeItem).not.toHaveBeenCalled()
    expect(h.sync.getView()).toMatchObject({ phase: 'ready', message: expect.stringContaining('now saved') })
  })
  it('rechecks cloud at confirmation time instead of overwriting a newly uploaded phone tree', async () => {
    const h = harness(createFreshState(), null, true)
    await h.sync.start()
    const phone = createDemoState()
    h.changeRemote(snapshot(phone))
    await h.sync.createNew()
    expect(h.cloud.createCloudState).not.toHaveBeenCalled()
    expect(h.cloud.updateCloudState).not.toHaveBeenCalled()
    expect(JSON.parse(h.storage.getItem(STORAGE_KEY)!)).toEqual(phone)
  })
  it('keeps local data after an initial upload fails and safely retries an incomplete bootstrap', async () => {
    const h = harness(createDemoState())
    const before = h.storage.getItem(STORAGE_KEY)
    h.cloud.createCloudState.mockRejectedValueOnce(new Error('initial upload failed'))
    await h.sync.start()
    await h.sync.useLocal()
    expect(h.sync.getView().phase).toBe('error')
    expect(h.storage.getItem(STORAGE_KEY)).toBe(before)
    await h.sync.retry()
    expect(h.sync.getView().phase).toBe('migration')
    expect(h.cloud.createCloudState).toHaveBeenCalledTimes(1)
    await h.sync.useLocal()
    expect(h.sync.getView().phase).toBe('ready')
    expect(h.cloud.createMusicTreeForUser).toHaveBeenCalledTimes(1)
  })
  it('syncs full snapshots only after successful local mutations, advancing the expected timestamp', async () => {
    const h = harness(createFreshState(), snapshot())
    await h.sync.start()
    h.repository.addHomeworkItem({ title: 'Practice scales', type: 'scale' })
    expect(JSON.parse(h.storage.getItem(STORAGE_KEY)!).homeworkItems).toHaveLength(1)
    await settle()
    expect(h.cloud.updateCloudState).toHaveBeenLastCalledWith(tree.id, JSON.parse(h.repository.exportBackupJson()), initialRevision)
    const nextRevision = (await h.cloud.updateCloudState.mock.results[0].value).updated_at
    h.repository.updateChildProfile({ displayName: 'New name', avatarId: 'ice_princess' })
    await settle()
    expect(h.cloud.updateCloudState).toHaveBeenLastCalledWith(tree.id, JSON.parse(h.repository.exportBackupJson()), nextRevision)
    expect(h.sync.getView().saveStatus).toBe('saved')
  })
  it('keeps existing backup import/export working and syncs an explicit import', async () => {
    const h = harness(createFreshState(), snapshot())
    await h.sync.start()
    const backup = JSON.stringify(createDemoState())
    expect(h.repository.validateBackupJson(backup)).toBe(true)
    h.repository.restoreBackupJson(backup)
    await settle()
    expect(h.cloud.updateCloudState).toHaveBeenCalledWith(tree.id, JSON.parse(h.repository.exportBackupJson()), initialRevision)
    expect(JSON.parse(h.repository.exportBackupJson()).practiceRecords).toHaveLength(6)
  })
  it('does not notify cloud when the local write failed', async () => {
    const h = harness(createFreshState(), snapshot())
    await h.sync.start()
    vi.spyOn(h.storage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => h.repository.updateChildProfile({ displayName: 'Not saved', avatarId: 'ice_princess' })).toThrow('storage')
    expect(h.cloud.updateCloudState).not.toHaveBeenCalled()
    warning.mockRestore()
  })
  it('detects stale timestamps without overwriting the newer cloud; reload keeps the unsynced local copy', async () => {
    const h = harness(createFreshState(), snapshot())
    await h.sync.start()
    const newer = snapshot(createDemoState(), '2026-10-07T11:00:00.000Z')
    h.changeRemote(newer)
    h.repository.updateChildProfile({ displayName: 'Unsynced local name', avatarId: 'ice_princess' })
    await settle()
    const unsynced = h.storage.getItem(STORAGE_KEY)
    expect(h.sync.getView()).toMatchObject({ phase: 'conflict', message: expect.stringContaining('another device') })
    expect(h.cloud.updateCloudState).toHaveBeenCalledTimes(1)
    await h.sync.reloadLatest()
    expect(JSON.parse(h.storage.getItem(STORAGE_KEY)!)).toEqual(newer.state)
    expect(h.storage.getItem(h.storage.getItem(LAST_SAFETY_COPY_KEY)!)).toBe(unsynced)
    expect(h.cloud.updateCloudState).toHaveBeenCalledTimes(1)
  })
  it('preserves offline changes and retries with the original expected version', async () => {
    const h = harness(createFreshState(), snapshot())
    await h.sync.start()
    h.cloud.updateCloudState.mockRejectedValueOnce(new Error('network unavailable'))
    h.repository.updateChildProfile({ displayName: 'Offline edit', avatarId: 'ice_princess' })
    await settle()
    const offlineCopy = h.storage.getItem(STORAGE_KEY)
    expect(h.sync.getView()).toMatchObject({ phase: 'ready', saveStatus: 'offline' })
    await h.sync.retry()
    expect(h.cloud.updateCloudState).toHaveBeenLastCalledWith(tree.id, JSON.parse(h.repository.exportBackupJson()), initialRevision)
    expect(h.storage.getItem(STORAGE_KEY)).toBe(offlineCopy)
    expect(h.sync.getView().saveStatus).toBe('saved')
  })
  it('serializes overlapping mutations and saves the newest complete snapshot after the first request', async () => {
    const h = harness(createFreshState(), snapshot())
    await h.sync.start()
    let finish!: (row: CloudState) => void
    h.cloud.updateCloudState.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    h.repository.updateChildProfile({ displayName: 'First edit', avatarId: 'ice_princess' })
    h.repository.updateChildProfile({ displayName: 'Newest edit', avatarId: 'ice_princess' })
    expect(h.cloud.updateCloudState).toHaveBeenCalledTimes(1)
    const saved = snapshot(createFreshState(), '2026-10-07T10:00:00.001Z')
    h.changeRemote(saved)
    finish(saved)
    await settle()
    expect(h.cloud.updateCloudState).toHaveBeenCalledTimes(2)
    expect(h.cloud.updateCloudState).toHaveBeenLastCalledWith(tree.id, JSON.parse(h.repository.exportBackupJson()), saved.updated_at)
  })
  it('logout disposes the queue and ignores a late cloud load without deleting local data', async () => {
    const h = harness(createDemoState(), snapshot())
    let finish!: (row: CloudState) => void
    h.cloud.loadCloudState.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const before = h.storage.getItem(STORAGE_KEY)
    const loading = h.sync.start()
    await settle()
    h.sync.stop()
    const callbacks = h.onChange.mock.calls.length
    finish(snapshot())
    await loading
    expect(h.onChange).toHaveBeenCalledTimes(callbacks)
    expect(h.storage.getItem(STORAGE_KEY)).toBe(before)
    expect(h.storage.removeItem).not.toHaveBeenCalled()
  })
  it('logout stops further queued cloud saves even when a save completes late', async () => {
    const h = harness(createFreshState(), snapshot())
    await h.sync.start()
    let finish!: (row: CloudState) => void
    h.cloud.updateCloudState.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    h.repository.updateChildProfile({ displayName: 'First', avatarId: 'ice_princess' })
    h.repository.updateChildProfile({ displayName: 'Second', avatarId: 'ice_princess' })
    h.sync.stop()
    finish(snapshot())
    await settle()
    expect(h.cloud.updateCloudState).toHaveBeenCalledTimes(1)
    expect(JSON.parse(h.storage.getItem(STORAGE_KEY)!).childProfile.displayName).toBe('Second')
    expect(h.storage.removeItem).not.toHaveBeenCalled()
  })
  it('a different account cannot silently inherit the previous account\'s local data', async () => {
    const storage = new MemoryStorage()
    storage.setItem(CLOUD_CACHE_OWNER_KEY, 'previous-owner')
    const h = harness(createDemoState(), null, false, storage, 'new-owner')
    await h.sync.start()
    expect(h.sync.getView()).toMatchObject({ phase: 'migration', localOwner: 'previous-owner' })
    expect(h.cloud.createMusicTreeForUser).not.toHaveBeenCalled()
    expect(h.cloud.createCloudState).not.toHaveBeenCalled()
    expect(h.cloud.updateCloudState).not.toHaveBeenCalled()
  })
  it.each(['network', 'invalid', 'unsupported'])('does not reset valid local data on %s cloud load failure', async (failure) => {
    const h = harness(createDemoState(), snapshot())
    if (failure === 'network') h.cloud.loadCloudState.mockRejectedValue(new Error('network unavailable'))
    if (failure === 'invalid') h.cloud.loadCloudState.mockResolvedValue({ ...snapshot(), state: {} as PersistedState })
    if (failure === 'unsupported') h.cloud.loadCloudState.mockResolvedValue({ ...snapshot(), schema_version: 2 } as unknown as CloudState)
    const before = h.storage.getItem(STORAGE_KEY)
    await h.sync.start()
    expect(h.sync.getView().phase).toBe('error')
    expect(h.storage.getItem(STORAGE_KEY)).toBe(before)
    expect(h.storage.removeItem).not.toHaveBeenCalled()
    expect(h.cloud.createCloudState).not.toHaveBeenCalled()
    expect(h.cloud.updateCloudState).not.toHaveBeenCalled()
  })
  it('pauses when another browser tab changes the shared cache and exports this tab\'s copy', async () => {
    const h = harness(createDemoState(), snapshot(createDemoState()))
    await h.sync.start()
    const current = h.repository.exportBackupJson()
    h.storage.setItem(STORAGE_KEY, JSON.stringify(createFreshState()))
    h.sync.pauseForExternalChange()
    expect(h.sync.getView().phase).toBe('conflict')
    expect(h.sync.getView().safetyCopy).toBe(current)
    expect(h.sync.exportLocal()).toBe(current)
    expect(h.cloud.updateCloudState).not.toHaveBeenCalled()
  })

  it('an initial-state race becomes a conflict and preserves the phone copy', async () => {
    const h = harness(createDemoState())
    const before = h.storage.getItem(STORAGE_KEY)
    await h.sync.start()
    h.cloud.createCloudState.mockRejectedValueOnce(new CloudConflictError())
    await h.sync.useLocal()
    expect(h.sync.getView().phase).toBe('conflict')
    expect(h.storage.getItem(STORAGE_KEY)).toBe(before)
    expect(h.cloud.updateCloudState).not.toHaveBeenCalled()
  })
  it('does not replace the active local cache if archiving it fails', async () => {
    const h = harness(createDemoState(), snapshot())
    const before = h.storage.getItem(STORAGE_KEY)
    vi.spyOn(h.storage, 'setItem').mockImplementation(() => { throw new Error('Storage quota exhausted') })
    await h.sync.start()
    expect(h.sync.getView().phase).toBe('error')
    expect(h.storage.getItem(STORAGE_KEY)).toBe(before)
    expect(h.cloud.updateCloudState).not.toHaveBeenCalled()
  })
  it('does not begin the initial snapshot upload after logout during tree creation', async () => {
    const h = harness(createDemoState())
    await h.sync.start()
    let finish!: (value: CloudMusicTree) => void
    h.cloud.createMusicTreeForUser.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const migrating = h.sync.useLocal()
    await settle()
    const before = h.storage.getItem(STORAGE_KEY)
    h.sync.stop()
    finish(tree)
    await migrating
    expect(h.cloud.createCloudState).not.toHaveBeenCalled()
    expect(h.storage.getItem(STORAGE_KEY)).toBe(before)
  })
  it('invalid nested cloud records cannot replace a valid local history', async () => {
    const invalid = { ...createFreshState(), homeworkItems: [null] } as unknown as PersistedState
    const h = harness(createDemoState(), snapshot(invalid))
    const before = h.storage.getItem(STORAGE_KEY)
    await h.sync.start()
    expect(h.sync.getView().phase).toBe('error')
    expect(h.storage.getItem(STORAGE_KEY)).toBe(before)
  })})