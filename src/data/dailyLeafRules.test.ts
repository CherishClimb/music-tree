import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFreshState, createLocalRepository, STORAGE_KEY, type PersistedState } from './localRepository'
import { validateCloudState } from './cloudState'
import { createCloudSync } from './cloudSync'
import type { CloudMusicTreeRepository, CloudState } from './cloudMusicTreeRepository'
import type { PracticeRecord } from '../domain/types'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}
const stamp = '2026-10-07T12:00:00.000Z'
const input = (overrides: Partial<PracticeRecord> = {}) => ({
  date: '2026-10-05', minutes: 15, quality: 'normal' as const, improvement: 'none' as const,
  achievements: [], customAchievement: '', parentNote: '', ...overrides,
})
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(stamp)) })
afterEach(() => vi.useRealTimers())

describe('final Water and permanent leaf rules', () => {
  it.each([
    [4, 'normal', 'none', 0, 0],
    [7, 'normal', 'none', 1, 0],
    [12, 'normal', 'none', 2, 0],
    [15, 'normal', 'none', 2, 0],
    [19, 'normal', 'none', 2, 0],
    [15, 'focused', 'none', 3, 1],
    [19, 'focused', 'none', 3, 1],
    [15, 'normal', 'clear', 3, 0],
    [19, 'difficult', 'clear', 3, 0],
    [20, 'normal', 'none', 3, 1],
    [15, 'difficult', 'none', 2, 0],
    [20, 'difficult', 'none', 3, 1],
    [3, 'normal', 'breakthrough', 0, 1],
    [4, 'normal', 'breakthrough', 0, 1],
    [8, 'normal', 'breakthrough', 1, 1],
    [12, 'normal', 'breakthrough', 2, 1],
    [15, 'focused', 'breakthrough', 3, 1],
    [20, 'focused', 'breakthrough', 3, 1],
  ] as const)('%s minutes / %s / %s -> Water %s, leaves %s', (minutes, quality, improvement, water, leaves) => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC')
    const result = repository.savePracticeRecord(input({ minutes, quality, improvement }))
    expect(result.dailyWater).toBe(water)
    expect(repository.getDailyWater('2026-10-05')).toBe(water)
    expect(repository.getLeafGrowthEvents()).toHaveLength(leaves)
    expect(repository.getLeafState().earnedLeafCount).toBe(16 + leaves)
    if (leaves) expect(repository.getLeafGrowthEvents()[0]).toMatchObject({ date: '2026-10-05', sourceWater: water })
    if (water === 0) expect(result.message).not.toMatch(/water|glow|sparkle/i)
  })

  it('ordinary split records remain at 2/3, and minutes can later bring the day to 3/3', () => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC')
    const first = repository.savePracticeRecord(input({ minutes: 5, parentNote: 'one' })).record
    repository.savePracticeRecord(input({ minutes: 5, parentNote: 'two' }))
    const third = repository.savePracticeRecord(input({ minutes: 5, parentNote: 'three' }))
    expect(third.dailyWater).toBe(2)
    expect(third.message).not.toMatch(/water|glow|sparkle|leaf/i)
    expect(repository.getLeafGrowthEvents()).toHaveLength(0)
    repository.updatePracticeRecord(first.id, input({ minutes: 10, parentNote: 'one' }))
    expect(repository.getDailyWater('2026-10-05')).toBe(3)
    expect(repository.getLeafGrowthEvents()).toHaveLength(1)
  })

  it('a token Focused record cannot qualify a normal day, but a majority can', () => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC')
    const first = repository.savePracticeRecord(input({ minutes: 14 })).record
    repository.savePracticeRecord(input({ minutes: 1, quality: 'focused' }))
    expect(repository.getDailyWater('2026-10-05')).toBe(2)
    expect(repository.getLeafGrowthEvents()).toHaveLength(0)
    repository.updatePracticeRecord(first.id, input({ minutes: 14, quality: 'focused' }))
    expect(repository.getDailyWater('2026-10-05')).toBe(3)
    expect(repository.getLeafGrowthEvents()).toHaveLength(1)
  })

  it('starts each new date at zero and earns immediately after a missed day', () => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC')
    repository.savePracticeRecord(input())
    expect(repository.getDailyWater('2026-10-05')).toBe(2)
    expect(repository.getDailyWater('2026-10-06')).toBe(0)
    expect(repository.getDailyWater('2026-10-07')).toBe(0)
    repository.savePracticeRecord(input({ date: '2026-10-07', quality: 'focused' }))
    expect(repository.getDailyWater('2026-10-07')).toBe(3)
    expect(repository.getLeafGrowthEvents()).toEqual([expect.objectContaining({ date: '2026-10-07' })])
    expect(repository.getDailyWater('2026-10-08')).toBe(0)
    expect(repository.getDailyWater('2026-10-05')).toBe(2)
  })

  it('a late breakthrough edit awards the original activity date exactly once', () => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC')
    const values = input({ minutes: 3 })
    const record = repository.savePracticeRecord(values).record
    expect(repository.getLeafGrowthEvents()).toHaveLength(0)
    repository.updatePracticeRecord(record.id, { ...values, improvement: 'breakthrough' })
    const events = repository.getLeafGrowthEvents()
    expect(events).toEqual([expect.objectContaining({ date: values.date, createdAt: stamp, sourceWater: 0 })])
    repository.updatePracticeRecord(record.id, { ...values, improvement: 'breakthrough' })
    expect(repository.getLeafGrowthEvents()).toEqual(events)
    expect(repository.getDailyWater('2026-10-07')).toBe(0)
  })

  it('a late clear-improvement edit can reach Water 3 without earning a leaf', () => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC')
    const values = input({ minutes: 15 })
    const record = repository.savePracticeRecord(values).record
    repository.updatePracticeRecord(record.id, { ...values, improvement: 'clear' })
    expect(repository.getDailyWater(values.date)).toBe(3)
    expect(repository.getLeafGrowthEvents()).toHaveLength(0)
  })

  it('never deletes an earned leaf after reducing minutes, quality or improvement', () => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC')
    const record = repository.savePracticeRecord(input({ quality: 'focused' })).record
    const events = repository.getLeafGrowthEvents()
    repository.updatePracticeRecord(record.id, input({ minutes: 1, quality: 'difficult' }))
    expect(repository.getDailyWater('2026-10-05')).toBe(0)
    expect(repository.getLeafGrowthEvents()).toEqual(events)
    expect(repository.getLeafState().earnedLeafCount).toBe(17)
    expect(() => repository.updatePracticeRecord(record.id, input({ date: '2026-10-06', minutes: 20 }))).toThrow(/cannot move its date/)
  })

  it('protects an earned activity date from repeated moves, including after reload and import', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage, 'UTC')
    const record = repository.savePracticeRecord(input({ minutes: 3, improvement: 'breakthrough' })).record
    const backup = repository.exportBackupJson()
    const imported = createLocalRepository(new MemoryStorage(), 'UTC')
    imported.restoreBackupJson(backup)
    for (const saved of [repository, createLocalRepository(storage, 'UTC'), imported]) {
      const before = saved.exportBackupJson()
      for (const date of ['2026-10-06', '2026-10-07']) {
        expect(() => saved.updatePracticeRecord(record.id, input({ date, minutes: 20 }))).toThrow(/cannot move its date/)
        expect(saved.exportBackupJson()).toBe(before)
      }
    }
  })

  it('locks all records on an awarded date, covering aggregate contributions and old events', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage, 'UTC')
    const first = repository.savePracticeRecord(input({ minutes: 10, parentNote: 'one' })).record
    const second = repository.savePracticeRecord(input({ minutes: 10, parentNote: 'two' })).record
    for (const record of [first, second]) {
      expect(() => repository.updatePracticeRecord(record.id, input({ date: '2026-10-06', minutes: 20 }))).toThrow(/cannot move its date/)
    }
    // Existing events have no record provenance; protection uses their child/date.
    const old = JSON.parse(repository.exportBackupJson()) as PersistedState
    old.leafGrowthEvents = [{ id: 'legacy-leaf', childId: first.childId, date: first.date, sourceWater: 3, sourceHealth: 100, createdAt: stamp }]
    const restored = createLocalRepository(new MemoryStorage(), 'UTC')
    restored.loadSnapshot(JSON.stringify(old))
    expect(() => restored.updatePracticeRecord(first.id, input({ date: '2026-10-06' }))).toThrow(/cannot move its date/)
  })

  it('allows date corrections before earning, recalculating both dates and preserving identity', () => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC')
    const record = repository.savePracticeRecord(input({ minutes: 10 })).record
    repository.savePracticeRecord(input({ date: '2026-10-06', minutes: 10 }))
    const edited = repository.updatePracticeRecord(record.id, input({ date: '2026-10-06', minutes: 10 }))
    expect(edited).toMatchObject({ id: record.id, createdAt: record.createdAt, date: '2026-10-06' })
    expect(repository.getDailyWater('2026-10-05')).toBe(0)
    expect(repository.getDailyWater('2026-10-06')).toBe(3)
    expect(repository.getLeafGrowthEvents()).toEqual([expect.objectContaining({ date: '2026-10-06' })])
    expect(() => repository.updatePracticeRecord(record.id, input({ date: '2026-10-05', minutes: 20 }))).toThrow(/cannot move its date/)
  })

  it('repeated saves and simultaneous reasons cannot duplicate the daily leaf', () => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC')
    const values = input({ minutes: 20, quality: 'focused', improvement: 'clear' })
    const record = repository.savePracticeRecord(values).record
    expect(() => repository.savePracticeRecord(values)).toThrow(/already been saved/)
    expect(() => repository.addPracticeRecord(record)).toThrow(/already been saved/)
    repository.savePracticeRecord({ ...values, improvement: 'breakthrough' })
    repository.updatePracticeRecord(record.id, { ...values, improvement: 'breakthrough' })
    expect(repository.getLeafGrowthEvents()).toHaveLength(1)
    expect(repository.getDailyWater(values.date)).toBe(3)
  })

  it('persists historical leaf IDs and actual source Water through reload, backup, cloud hydration and Health recovery', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage, 'UTC')
    repository.savePracticeRecord(input({ minutes: 3, improvement: 'breakthrough' }))
    const events = repository.getLeafGrowthEvents()
    const backup = repository.exportBackupJson()
    const imported = createLocalRepository(new MemoryStorage(), 'UTC')
    imported.restoreBackupJson(backup)
    const cloud = createLocalRepository(new MemoryStorage(), 'UTC')
    cloud.loadSnapshot(JSON.stringify(validateCloudState(JSON.parse(backup))))
    vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'))
    for (const saved of [repository, imported, cloud]) {
      saved.reload()
      expect(saved.getLeafGrowthEvents()).toEqual(events)
      expect(saved.getLeafState()).toMatchObject({ earnedLeafCount: 17, visibleLeafCount: 17 })
      saved.savePracticeRecord(input({ date: '2026-10-20', minutes: 5, quality: 'focused', improvement: 'clear', achievements: ['assigned_section'] }))
      saved.savePracticeRecord(input({ date: '2026-10-20', minutes: 5, quality: 'focused', improvement: 'clear', achievements: ['assigned_section'], parentNote: 'second' }))
      expect(saved.getCurrentHealth()).toBeGreaterThanOrEqual(60)
      expect(saved.getLeafState()).toMatchObject({ earnedLeafCount: 17, visibleLeafCount: 17 })
      expect(saved.getLeafGrowthEvents()).toEqual(events)
    }
  })

  it('keeps legacy waterBalance unchanged during save and history recalculation', () => {
    const storage = new MemoryStorage()
    const old = createFreshState()
    old.treeState.waterBalance = 2
    storage.setItem(STORAGE_KEY, JSON.stringify(old))
    const repository = createLocalRepository(storage, 'UTC')
    repository.savePracticeRecord(input({ minutes: 20 }))
    repository.recalculateTreeStateFromHistory()
    expect(repository.getTreeState().waterBalance).toBe(2)
    expect(repository.getDailyWater('2026-10-05')).toBe(3)
    expect(repository.getDailyWater('2026-10-06')).toBe(0)
  })

  it('the existing cloud save includes a Breakthrough leaf with real 0/3 Water', async () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage, 'UTC')
    let remote: CloudState = { music_tree_id: 'tree-a', schema_version: 1, state: createFreshState(), updated_at: stamp }
    const cloud = {
      findMusicTreeForUser: vi.fn(async () => ({ id: 'tree-a', owner_user_id: 'owner-a', name: 'Music Tree' })),
      createMusicTreeForUser: vi.fn(),
      loadCloudState: vi.fn(async () => remote),
      createCloudState: vi.fn(),
      updateCloudState: vi.fn(async (_id: string, state: PersistedState) => {
        remote = { ...remote, state: validateCloudState(state), updated_at: '2026-10-07T12:00:01.000Z' }
        return remote
      }),
    } satisfies CloudMusicTreeRepository
    const sync = createCloudSync({ cloud, repository, storage, userId: 'owner-a', onChange: vi.fn() })
    await sync.start()
    repository.savePracticeRecord(input({ minutes: 3, improvement: 'breakthrough' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(sync.getView().saveStatus).toBe('saved')
    expect(remote.state.practiceRecords).toEqual(repository.getPracticeRecords())
    expect(remote.state.leafGrowthEvents).toEqual(repository.getLeafGrowthEvents())
    expect(remote.state.leafGrowthEvents[0]).toMatchObject({ date: '2026-10-05', sourceWater: 0 })
    sync.stop()
  })
})
