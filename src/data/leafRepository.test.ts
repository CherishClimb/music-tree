import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoState, createLocalRepository, STORAGE_KEY } from './localRepository'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T12:00:00.000Z')) })
afterEach(() => vi.useRealTimers())

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

const storageWithBase = (base = 4) => { const storage = new MemoryStorage(); const state = createDemoState(); state.practiceRecords = []; state.lessonEvaluations = []; state.vacationPeriods = []; state.leafGrowthEvents = []; state.migrationBaseEarnedLeafCount = base; state.rewardReminderBaselineLeafCount = base; state.rewardReminders = []; state.treeState.leafCount = base; storage.setItem(STORAGE_KEY, JSON.stringify(state)); return storage }
const qualifying = (date: string, note: string) => ({ date, minutes: 20, quality: 'focused' as const, achievements: ['assigned_section'], customAchievement: '', improvement: 'none' as const, parentNote: note })

describe('LeafGrowthEvent repository integration', () => {
  it('creates one event from Water 3 and Health 100 and one milestone reminder', () => {
    const repository = createLocalRepository(storageWithBase())
    repository.savePracticeRecord(qualifying('2026-10-04', 'qualifying'))
    expect(repository.getLeafGrowthEvents()).toEqual([expect.objectContaining({ id: 'leaf_growth_child_001_2026-10-04', date: '2026-10-04', sourceWater: 3, sourceHealth: 100 })])
    expect(repository.getLeafState('2026-10-04')).toMatchObject({ earnedLeafCount: 5, visibleLeafCount: 5 })
    expect(repository.getRewardReminders()).toEqual([expect.objectContaining({ leafMilestone: 5, status: 'pending' })])
  })

  it('does not create from Water below 3 or achievement alone', () => {
    const lowWater = createLocalRepository(storageWithBase())
    lowWater.savePracticeRecord({ ...qualifying('2026-10-04', 'low water'), minutes: 5 })
    expect(lowWater.getLeafGrowthEvents()).toHaveLength(0)
  })

  it('earns from qualifying practice even without full Health or an achievement', () => {
    const repository = createLocalRepository(storageWithBase())
    repository.savePracticeRecord({ ...qualifying('2026-10-04', 'normal practice'), quality: 'normal', achievements: [] })
    expect(repository.getCurrentHealth('2026-10-04')).toBe(90)
    expect(repository.getLeafGrowthEvents()).toEqual([expect.objectContaining({ date: '2026-10-04', sourceHealth: 90 })])
  })

  it.each([
    ['2026-10-03', 84],
    ['2026-10-02', 71],
  ] as const)('earns immediately after missed practice days following %s, without a recovery cooldown', (previousDate, expectedHealth) => {
    const repository = createLocalRepository(storageWithBase())
    repository.savePracticeRecord(qualifying(previousDate, 'before the break'))
    expect(repository.getCurrentHealth(previousDate)).toBe(100)
    expect(repository.getPracticeRecords().some((record) => record.date === '2026-10-04')).toBe(false)
    const before = repository.getLeafState('2026-10-05').earnedLeafCount

    repository.savePracticeRecord(qualifying('2026-10-05', 'back to practice'))

    expect(repository.getDailyWater('2026-10-05')).toBe(3)
    expect(repository.getCurrentHealth('2026-10-05')).toBe(expectedHealth)
    expect(repository.getLeafGrowthEvents()).toContainEqual(expect.objectContaining({ date: '2026-10-05', sourceHealth: expectedHealth }))
    expect(repository.getLeafState('2026-10-05').earnedLeafCount).toBe(before + 1)
  })

  it('earns at Health 59 and preserves all foliage through reload/import and health recovery', () => {
    const storage = storageWithBase(10)
    const repository = createLocalRepository(storage)
    repository.savePracticeRecord({ ...qualifying('2026-10-01', 'first practice'), quality: 'difficult', achievements: [] })
    // Existing Health replay: 85 -> 68 -> 54 -> 43, then 34 + 25 = 59.
    repository.savePracticeRecord({ ...qualifying('2026-10-05', 'returning practice'), improvement: 'small' })
    expect(repository.getCurrentHealth('2026-10-05')).toBe(59)
    const events = repository.getLeafGrowthEvents()
    expect(events).toHaveLength(2)
    expect(events[1]).toMatchObject({ date: '2026-10-05', sourceWater: 3, sourceHealth: 59 })
    expect(repository.getLeafState('2026-10-05')).toMatchObject({ earnedLeafCount: 12, visibleLeafCount: 12 })
    expect(repository.getTreeState().leafCount).toBe(12)

    const backup = repository.exportBackupJson()
    const reloaded = createLocalRepository(storage)
    const restored = createLocalRepository(storageWithBase())
    restored.restoreBackupJson(backup)
    for (const saved of [reloaded, restored]) {
      expect(saved.getLeafGrowthEvents()).toEqual(events)
      expect(saved.getLeafState('2026-10-05')).toMatchObject({ earnedLeafCount: 12, visibleLeafCount: 12 })
    }

    reloaded.savePracticeRecord({ ...qualifying('2026-10-05', 'more practice'), improvement: 'clear' })
    expect(reloaded.getCurrentHealth('2026-10-05')).toBe(89)
    expect(reloaded.getLeafState('2026-10-05')).toMatchObject({ earnedLeafCount: 12, visibleLeafCount: 12 })
    expect(reloaded.getLeafGrowthEvents()).toEqual(events)
    expect(createLocalRepository(storage).getLeafGrowthEvents()).toEqual(events)
  })

  it('is idempotent for repeated same-day saves, reload, and import', () => {
    const storage = storageWithBase()
    const repository = createLocalRepository(storage)
    repository.savePracticeRecord(qualifying('2026-10-04', 'one'))
    repository.savePracticeRecord(qualifying('2026-10-04', 'two'))
    expect(repository.getLeafGrowthEvents()).toHaveLength(1)
    expect(createLocalRepository(storage).getLeafGrowthEvents()).toEqual(repository.getLeafGrowthEvents())
    const restored = createLocalRepository(storageWithBase())
    restored.restoreBackupJson(repository.exportBackupJson())
    expect(restored.getLeafGrowthEvents()).toEqual(repository.getLeafGrowthEvents())
    expect(restored.getRewardReminders()).toEqual(repository.getRewardReminders())
  })

  it('may earn another stable event on the next date', () => {
    const repository = createLocalRepository(storageWithBase())
    repository.savePracticeRecord(qualifying('2026-10-04', 'day one'))
    repository.savePracticeRecord({ ...qualifying('2026-10-05', 'day two'), improvement: 'clear' })
    expect(repository.getLeafGrowthEvents().map((event) => event.id)).toEqual(['leaf_growth_child_001_2026-10-04', 'leaf_growth_child_001_2026-10-05'])
    expect(repository.getLeafState('2026-10-05').earnedLeafCount).toBe(6)
  })

  it('preserves a legacy count without fabricating events or old reminders', () => {
    const storage = new MemoryStorage()
    const legacy = createDemoState() as unknown as Record<string, unknown>
    delete legacy.leafGrowthEvents
    delete legacy.migrationBaseEarnedLeafCount
    delete legacy.rewardReminderBaselineLeafCount
    storage.setItem(STORAGE_KEY, JSON.stringify(legacy))
    const repository = createLocalRepository(storage)
    expect(repository.getLeafState('2026-08-04')).toMatchObject({ migrationBaseEarnedLeafCount: 16, earnedLeafCount: 16 })
    expect(repository.getLeafGrowthEvents()).toHaveLength(0)
    expect(repository.getRewardReminders()).toHaveLength(0)
  })
})
