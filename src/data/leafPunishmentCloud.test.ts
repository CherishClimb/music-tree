import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFreshState, createLocalRepository, STORAGE_KEY, type PersistedState } from './localRepository'
import { createCloudSync } from './cloudSync'
import { latestSafetyCopy } from './cloudLocalCache'
import { CloudConflictError, type CloudMusicTreeRepository, type CloudState } from './cloudMusicTreeRepository'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}
const clock = (date: string) => vi.setSystemTime(new Date(`${date}T12:00:00Z`))
beforeEach(() => { vi.useFakeTimers(); clock('2026-10-01') })
afterEach(() => vi.useRealTimers())
const settle = () => vi.advanceTimersByTimeAsync(0)
async function harness() {
  const storage = new MemoryStorage()
  const repository = createLocalRepository(storage, 'UTC')
  let remote: CloudState = { music_tree_id: 'tree', state: createFreshState(), schema_version: 1, updated_at: '2026-10-01T12:00:00.000Z' }
  const cloud = {
    findMusicTreeForUser: vi.fn(async () => ({ id: 'tree', owner_user_id: 'owner', name: 'Music Tree' })),
    createMusicTreeForUser: vi.fn(),
    loadCloudState: vi.fn(async () => remote),
    createCloudState: vi.fn(),
    updateCloudState: vi.fn(async (_id: string, state: PersistedState, expected: string) => {
      if (expected !== remote.updated_at) throw new CloudConflictError()
      remote = { ...remote, state: JSON.parse(JSON.stringify(state)), updated_at: new Date(Date.parse(expected) + 1).toISOString() }
      return remote
    }),
  } satisfies CloudMusicTreeRepository
  const sync = createCloudSync({ cloud, repository, storage, userId: 'owner', onChange: vi.fn() })
  await sync.start()
  repository.activateLeafPunishment()
  await settle()
  return { repository, storage, cloud, sync, remote: () => remote, changeRemote: (state: PersistedState) => { remote = { ...remote, state, updated_at: new Date(Date.parse(remote.updated_at) + 1).toISOString() } } }
}

describe('leaf punishment over existing whole-snapshot cloud sync', () => {
  it('uploads a full ledger once and retries a failed save without another deduction', async () => {
    const h = await harness()
    clock('2026-10-11')
    h.cloud.updateCloudState.mockRejectedValueOnce(new Error('offline'))
    const expectedRevision = h.remote().updated_at
    const ledger = h.repository.reconcileLeafPunishment()
    await settle()
    expect(h.sync.getView().saveStatus).toBe('offline')
    const json = h.storage.getItem(STORAGE_KEY)
    expect(h.repository.reconcileLeafPunishment()).toEqual(ledger)
    await h.sync.retry()
    expect(h.remote().state.leafPunishment).toEqual(ledger)
    expect(h.cloud.updateCloudState).toHaveBeenLastCalledWith('tree', JSON.parse(h.repository.exportBackupJson()), expectedRevision)
    expect(h.storage.getItem(STORAGE_KEY)).toBe(json)
    expect(h.sync.getView().saveStatus).toBe('saved')
    h.sync.stop()
  })

  it('keeps a committed-but-unacknowledged save, surfaces conflict, and hydrates without duplication', async () => {
    const h = await harness()
    clock('2026-10-05')
    h.cloud.updateCloudState.mockImplementationOnce(async (_id, state) => {
      h.changeRemote(state)
      throw new Error('response lost after commit')
    })
    const ledger = h.repository.reconcileLeafPunishment()
    await settle()
    expect(h.remote().state.leafPunishment).toEqual(ledger)
    await h.sync.retry()
    expect(h.sync.getView().phase).toBe('conflict')
    await h.sync.reloadLatest()
    expect(h.sync.getView().phase).toBe('ready')
    h.cloud.updateCloudState.mockClear()
    expect(h.repository.reconcileLeafPunishment()).toEqual(ledger)
    expect(h.cloud.updateCloudState).not.toHaveBeenCalled()
    expect(h.repository.getLeafPunishmentBalance().appliedLoss).toBe(5)
    h.sync.stop()
  })

  it('preserves conflicting local history and takes the selected cloud snapshot without merging ledgers', async () => {
    const h = await harness()
    clock('2026-10-05')
    const other = createLocalRepository(new MemoryStorage(), 'UTC')
    other.loadSnapshot(JSON.stringify(h.remote().state))
    other.addVacationPeriod({ startDate: '2026-10-02', endDate: '2026-10-04' })
    other.reconcileLeafPunishment()
    h.changeRemote(JSON.parse(other.exportBackupJson()))
    h.repository.reconcileLeafPunishment()
    await settle()
    expect(h.sync.getView().phase).toBe('conflict')
    const unsynced = JSON.parse(h.repository.exportBackupJson())
    expect(unsynced.leafPunishment.events).toHaveLength(1)
    await h.sync.reloadLatest()
    expect(h.sync.getView().phase).toBe('ready')
    expect(JSON.parse(h.sync.getView().safetyCopy!)).toEqual(unsynced)
    expect(h.repository.getLeafPunishmentLedger()).toEqual(other.getLeafPunishmentLedger())
    expect(h.repository.getLeafPunishmentBalance().appliedLoss).toBe(0)
    expect(h.repository.reconcileLeafPunishment()).toEqual(other.getLeafPunishmentLedger())
    h.sync.stop()
  })

  it('does not erase activation when a legacy cloud snapshot replaces a newer remote revision', async () => {
    const h = await harness()
    const local = h.repository.exportBackupJson()
    h.changeRemote(createFreshState())
    await h.sync.reloadLatest()
    expect(h.sync.getView()).toMatchObject({ phase: 'error', message: expect.stringContaining('activation') })
    expect(h.repository.exportBackupJson()).toBe(local)
    expect(JSON.parse(latestSafetyCopy(h.storage)!)).toEqual(JSON.parse(local))
    h.sync.stop()
  })
})
