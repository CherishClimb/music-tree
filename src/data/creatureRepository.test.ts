import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CREATURE_POSITIONS_STORAGE_KEY, createFreshState, createLocalRepository, parseBackup, STORAGE_KEY, type PersistedState } from './localRepository'
import { isMeaningfulLocalState, validateCloudState } from './cloudState'
import { createCloudSync } from './cloudSync'
import type { CloudMusicTreeRepository, CloudState } from './cloudMusicTreeRepository'
import { CREATURE_CATALOG } from '../domain/creatures/creatureCatalog'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z')) })
afterEach(() => vi.useRealTimers())

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}
const practice = (day: number) => ({
  date: '2026-10-' + String(day).padStart(2, '0'),
  minutes: 20, quality: 'focused' as const, achievements: ['assigned_section'],
  customAchievement: '', improvement: 'none' as const, parentNote: '',
})
const earnLeaves = (repository: ReturnType<typeof createLocalRepository>, from: number, to: number) => {
  for (let day = from; day <= to; day += 1) repository.savePracticeRecord(practice(day))
}
function oldState(permanentCount = 27) {
  const state: Partial<PersistedState> = createFreshState()
  delete state.creatureCollection
  state.leafGrowthEvents = Array.from({ length: permanentCount - 16 }, (_, index) => ({
    id: 'old-leaf-' + index, childId: 'child_001', date: '2026-09-' + String(index + 1).padStart(2, '0'),
    sourceWater: 3, sourceHealth: 59, createdAt: '2026-09-20T12:00:00.000Z',
  }))
  // A stale/visible count must never replace the permanent baseline.
  state.treeState!.leafCount = 22
  return { ...state, futureField: { preserve: true } }
}

describe('persisted creature rewards', () => {
  it('starts fresh on the fixed schedule: none through 29, first at 30, second at 35', () => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC', () => 0)
    expect(repository.getCreatureCollection()).toEqual({ baselinePermanentLeafCount: 0, ownedCreatures: [] })
    expect(repository.getCreatureProgress().newLeaves).toBe(16)
    for (let day = 1; day <= 13; day += 1) {
      repository.savePracticeRecord(practice(day))
      expect(repository.getCreatureCollection().ownedCreatures).toHaveLength(0)
      expect(repository.getCreatureProgress().progressLeaves).toBe(16 + day)
    }
    repository.savePracticeRecord(practice(14))
    expect(repository.getCreatureCollection().ownedCreatures).toHaveLength(1)
    earnLeaves(repository, 15, 19)
    expect(repository.getCreatureCollection().ownedCreatures).toHaveLength(2)
    expect(repository.getLeafGrowthEvents()).toHaveLength(19)
  })

  it('migrates 42 permanent leaves with zero rewards, preserving the old data', () => {
    const old = oldState(42)
    const parsed = parseBackup(JSON.stringify(old))
    expect(parsed.creatureCollection).toEqual({ baselinePermanentLeafCount: 42, ownedCreatures: [] })
    const { creatureCollection, ...unchanged } = parsed
    expect(creatureCollection.ownedCreatures).toHaveLength(0)
    expect(unchanged).toEqual(old)
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(old))
    const random = vi.fn(() => 0)
    const repository = createLocalRepository(storage, 'UTC', random)
    expect(repository.getCreatureProgress().newLeaves).toBe(0)
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).creatureCollection.baselinePermanentLeafCount).toBe(42)
    expect(random).not.toHaveBeenCalled()
    earnLeaves(repository, 1, 4)
    expect(repository.getCreatureCollection().ownedCreatures).toHaveLength(0)
    repository.savePracticeRecord(practice(5))
    expect(repository.getLeafState().earnedLeafCount).toBe(47)
    expect(repository.getCreatureCollection().ownedCreatures).toHaveLength(1)
    expect(random).toHaveBeenCalledTimes(1)
  })

  it.each([16, 20, 25, 27, 29])('migrates an existing %s-leaf tree onto the fixed threshold 30', (count) => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(oldState(count)))
    const repository = createLocalRepository(storage, 'UTC', () => 0)
    expect(repository.getCreatureCollection()).toEqual({ baselinePermanentLeafCount: 0, ownedCreatures: [] })
    earnLeaves(repository, 1, 29 - count)
    expect(repository.getLeafState().earnedLeafCount).toBe(29)
    expect(repository.getCreatureCollection().ownedCreatures).toHaveLength(0)
    repository.savePracticeRecord(practice(30 - count))
    expect(repository.getLeafState().earnedLeafCount).toBe(30)
    expect(repository.getCreatureCollection().ownedCreatures).toHaveLength(1)
    earnLeaves(repository, 31 - count, 35 - count)
    expect(repository.getCreatureCollection().ownedCreatures).toHaveLength(2)
  })

  it('retains progress through missed days and earns rewards while Health is below 60', () => {
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'))
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(oldState(42)))
    const repository = createLocalRepository(storage, 'UTC', () => 0)
    repository.savePracticeRecord({ ...practice(1), quality: 'difficult', achievements: [] })
    expect(repository.getCreatureProgress().progressLeaves).toBe(1)
    vi.setSystemTime(new Date('2026-10-05T12:00:00.000Z'))
    expect(repository.getCreatureProgress().progressLeaves).toBe(1)
    repository.savePracticeRecord({ ...practice(5), improvement: 'small' })
    expect(repository.getCurrentHealth()).toBe(59)
    expect(repository.getCreatureProgress().progressLeaves).toBe(2)
    expect(repository.getLeafState()).toMatchObject({ earnedLeafCount: 44, visibleLeafCount: 44 })
    vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'))
    for (const day of [10, 15, 20]) repository.savePracticeRecord(practice(day))
    expect(repository.getCurrentHealth()).toBeLessThan(60)
    expect(repository.getCreatureCollection().ownedCreatures).toHaveLength(1)
    expect(repository.getCreatureProgress()).toMatchObject({ newLeaves: 5, progressLeaves: 0 })
    const collection = repository.getCreatureCollection()
    repository.savePracticeRecord({ ...practice(20), parentNote: 'extra practice', improvement: 'clear' })
    expect(repository.getCreatureCollection()).toEqual(collection)
    expect(repository.getCreatureProgress().newLeaves).toBe(5)
  })

  it('keeps exact IDs and timestamps after reload, recalculation and backup round trips', () => {
    const storage = new MemoryStorage()
    const random = vi.fn(() => 0.999)
    const repository = createLocalRepository(storage, 'UTC', random)
    earnLeaves(repository, 1, 14)
    const collection = repository.getCreatureCollection()
    expect(collection.ownedCreatures[0]).toEqual({
      creatureId: CREATURE_CATALOG[5].id, unlockedAt: '2026-10-20T12:00:00.000Z', newlyUnlocked: true, atHome: false, visibleSlotId: 'left',
    })
    repository.reload()
    repository.recalculateTreeStateFromHistory()
    const restored = createLocalRepository(storage, 'UTC', random)
    restored.restoreBackupJson(repository.exportBackupJson())
    restored.restoreBackupJson(repository.exportBackupJson())
    expect(restored.getCreatureCollection()).toEqual(collection)
    expect(random).toHaveBeenCalledTimes(1)
    const backup = JSON.parse(restored.exportBackupJson()) as PersistedState
    backup.creatureCollection.ownedCreatures[0] = { ...backup.creatureCollection.ownedCreatures[0], newlyUnlocked: false, atHome: true, visibleSlotId: null }
    restored.restoreBackupJson(JSON.stringify(backup))
    expect(restored.getCreatureCollection().ownedCreatures[0].atHome).toBe(true)
    expect(random).toHaveBeenCalledTimes(1)
  })

  it('upgrades old backups and cloud snapshots without retrospective rewards', () => {
    const old = oldState(42)
    expect(validateCloudState(old)).toEqual(old)
    const random = vi.fn(() => 0)
    const imported = createLocalRepository(new MemoryStorage(), 'UTC', random)
    imported.restoreBackupJson(JSON.stringify(old))
    const cloud = createLocalRepository(new MemoryStorage(), 'UTC', random)
    cloud.loadSnapshot(JSON.stringify(validateCloudState(old)))
    for (const repository of [imported, cloud]) {
      expect(repository.getCreatureCollection()).toEqual({ baselinePermanentLeafCount: 42, ownedCreatures: [] })
      expect(JSON.parse(repository.exportBackupJson()).futureField).toEqual({ preserve: true })
    }
    expect(random).not.toHaveBeenCalled()
  })

  it('treats empty collection migration as metadata and rejects malformed collections safely', () => {
    const fresh = createFreshState()
    expect(isMeaningfulLocalState(fresh)).toBe(false)
    const legacy: Partial<PersistedState> = fresh
    delete legacy.creatureCollection
    const parsed = parseBackup(JSON.stringify(legacy))
    expect(isMeaningfulLocalState(parsed)).toBe(false)
    const repository = createLocalRepository(new MemoryStorage(), 'UTC', () => 0)
    earnLeaves(repository, 1, 14)
    const before = repository.exportBackupJson()
    const invalid = JSON.parse(before) as PersistedState
    invalid.creatureCollection.ownedCreatures.push(invalid.creatureCollection.ownedCreatures[0])
    expect(() => repository.restoreBackupJson(JSON.stringify(invalid))).toThrow()
    expect(() => validateCloudState(invalid)).toThrow()
    expect(repository.exportBackupJson()).toBe(before)
    const collectionOnly = { ...createFreshState(), creatureCollection: repository.getCreatureCollection() }
    expect(isMeaningfulLocalState(collectionOnly)).toBe(true)
  })

  it('carries exact rewards through the unchanged whole-state cloud save and hydration', async () => {
    const storage = new MemoryStorage()
    const random = vi.fn(() => 0)
    const repository = createLocalRepository(storage, 'UTC', random)
    let remote: CloudState = {
      music_tree_id: 'tree-a', schema_version: 1, state: createFreshState(), updated_at: '2026-10-20T10:00:00.000Z',
    }
    const cloud = {
      findMusicTreeForUser: vi.fn(async () => ({ id: 'tree-a', owner_user_id: 'owner-a', name: 'Music Tree' })),
      createMusicTreeForUser: vi.fn(),
      loadCloudState: vi.fn(async () => remote),
      createCloudState: vi.fn(),
      updateCloudState: vi.fn(async (_id: string, state: PersistedState) => {
        remote = { ...remote, state: validateCloudState(state), updated_at: new Date(Date.parse(remote.updated_at) + 1).toISOString() }
        return remote
      }),
    } satisfies CloudMusicTreeRepository
    const sync = createCloudSync({ cloud, repository, storage, userId: 'owner-a', onChange: vi.fn() })
    await sync.start()
    for (let day = 1; day <= 14; day += 1) {
      repository.savePracticeRecord(practice(day))
      await vi.advanceTimersByTimeAsync(0)
    }
    expect(sync.getView().saveStatus).toBe('saved')
    expect(remote.state.creatureCollection.ownedCreatures).toHaveLength(1)
    expect(remote.state.creatureCollection).toEqual(repository.getCreatureCollection())
    const restored = createLocalRepository(new MemoryStorage(), 'UTC', random)
    restored.loadSnapshot(JSON.stringify(validateCloudState(remote.state)))
    restored.reload()
    expect(restored.getCreatureCollection()).toEqual(repository.getCreatureCollection())
    expect(random).toHaveBeenCalledTimes(1)
    sync.stop()
  })

  it('keeps placements local and separate from backup and cloud snapshots', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    repository.saveCreaturePosition('bellwing-bird', { x: 0.25, y: 0.75 })
    expect(JSON.parse(storage.getItem(CREATURE_POSITIONS_STORAGE_KEY)!)).toEqual({ 'bellwing-bird': { x: 0.25, y: 0.75 } })
    expect(repository.exportBackupJson()).not.toContain('creature-positions')

    repository.loadSnapshot(JSON.stringify(createFreshState()))
    expect(repository.getCreaturePositions()['bellwing-bird']).toEqual({ x: 0.25, y: 0.75 })
    const otherDevice = createLocalRepository(new MemoryStorage())
    otherDevice.restoreBackupJson(repository.exportBackupJson())
    expect(otherDevice.getCreaturePositions()).toEqual({})
  })
})
