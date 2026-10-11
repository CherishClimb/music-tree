import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoState, createFreshState, createLocalRepository, STORAGE_KEY, type PersistedState } from './localRepository'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem = vi.fn((key: string, value: string) => { this.values.set(key, value) })
  removeItem(key: string) { this.values.delete(key) }
}

const clock = (instant: string) => vi.setSystemTime(new Date(instant))
const practice = (date: string, minutes = 20) => ({ date, minutes, quality: 'normal' as const, achievements: [], customAchievement: '', improvement: 'none' as const, parentNote: '' })
beforeEach(() => { vi.useFakeTimers(); clock('2026-10-01T12:00:00Z') })
afterEach(() => vi.useRealTimers())

describe('Phase 2B.1 local persistence boundary', () => {
  it('accepts an optional legacy field without starting the clock on load or reads', () => {
    const legacy: PersistedState = createFreshState()
    delete legacy.leafPunishment
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(legacy))
    const repository = createLocalRepository(storage, 'Europe/Berlin')
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual({ ...legacy, leafPunishment: null })
    clock('2027-01-01T12:00:00Z')
    const reloaded = createLocalRepository(storage, 'Europe/Berlin')
    storage.setItem.mockClear()
    for (const current of [repository, reloaded]) {
      expect(current.getLeafPunishmentLedger()).toBeNull()
      expect(current.getLeafPunishmentBalance()).toEqual({ earnedLeafCount: 16, appliedLoss: 0, availableLeafCount: 16 })
      current.getLeafState()
    }
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(reloaded.activateLeafPunishment().startDate).toBe('2027-01-02')
    expect(reloaded.reconcileLeafPunishment().events).toEqual([])
  })

  it('preserves populated growth history, health, stages and reminders exactly', () => {
    const saved = createDemoState()
    saved.leafGrowthEvents = Array.from({ length: 20 }, (_, index) => ({
      id: `leaf_${index}`, childId: saved.childProfile.id, date: `2026-09-${String(index + 1).padStart(2, '0')}`,
      sourceWater: 3, sourceHealth: 59, createdAt: '2026-09-30T12:00:00Z',
    }))
    saved.treeState = { ...saved.treeState, stage: 3, rootStrength: 9, treeHealth: 57, leafCount: 36 }
    saved.rootAwards = [{ lessonEvaluationId: 'lesson', completedCycle: true, completedPieceCategory: true, bigImprovement: true, points: 3, createdAt: '2026-09-30' }]
    saved.stageEntrySnapshots = [{ id: 'stage', previousStage: 2, newStage: 3, stageEntryDate: '2026-09-30', qualifyingEventIds: ['lesson'], cumulativeTotals: { practiceDays: 40, learningCycles: 9, completedPieces: 18 }, stageCounters: { practiceDays: 0 }, permanentStage: 3 }]
    saved.rewardReminders = [{ id: 'reminder', childId: saved.childProfile.id, leafMilestone: 35, status: 'pending', createdAt: '2026-09-30T12:00:00Z' }]
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(saved))
    const repository = createLocalRepository(storage, 'UTC')
    const before = JSON.parse(repository.exportBackupJson())
    repository.activateLeafPunishment()
    clock('2026-10-11T12:00:00Z')
    const health = repository.getHealthReplay()
    const leaves = repository.getLeafState()
    const progression = repository.getCurrentStageProgression()
    const ledger = repository.reconcileLeafPunishment()
    expect(repository.getLeafPunishmentBalance()).toEqual({ earnedLeafCount: 36, appliedLoss: 15, availableLeafCount: 21 })
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!)).toEqual({ ...before, leafPunishment: ledger })
    expect(repository.getHealthReplay()).toEqual(health)
    expect(repository.getLeafState()).toEqual({ ...leaves, visibleLeafCount: 21 })
    expect(repository.getCurrentStageProgression()).toEqual(progression)
    const reloaded = createLocalRepository(storage, 'UTC')
    expect(reloaded.reconcileLeafPunishment()).toEqual(ledger)
    expect(reloaded.getLeafGrowthEvents()).toEqual(saved.leafGrowthEvents)
  })

  it('reconciles at the practice write while selectors stay read-only and defensive', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage, 'UTC')
    repository.activateLeafPunishment()
    clock('2026-10-05T12:00:00Z')
    const initial = repository.reconcileLeafPunishment()
    repository.savePracticeRecord(practice('2026-10-03', 5))
    const corrected = repository.getLeafPunishmentLedger()!
    expect(corrected.events[0].revisions[0]).toEqual(initial.events[0].revisions[0])
    expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(0)
    storage.setItem.mockClear()
    const copy = repository.getLeafPunishmentLedger()!
    copy.startDate = '2000-01-01'
    copy.events[0].revisions[0].appliedLoss = 99
    repository.getLeafPunishmentBalance()
    repository.getLeafState()
    expect(repository.getLeafPunishmentLedger()).toEqual(corrected)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(corrected.events[0].revisions.at(-1)).toMatchObject({ active: false, appliedLoss: 0 })
    expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(0)
    expect(repository.reconcileLeafPunishment()).toEqual(corrected)
  })

  it.each([
    ['Europe/Berlin', '2026-10-01T22:30:00Z', '2026-10-03', '2026-10-05T21:59:59Z', '2026-10-05T22:00:00Z'],
    ['America/Los_Angeles', '2026-10-02T00:30:00Z', '2026-10-02', '2026-10-05T06:59:59Z', '2026-10-05T07:00:00Z'],
  ])('retains activation in %s when UTC and local dates differ', (zone, activatedAt, startDate, beforeMidnight, afterMidnight) => {
    clock(activatedAt)
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage, zone)
    const activated = repository.activateLeafPunishment()
    expect(activated).toMatchObject({ activatedAt: new Date(activatedAt).toISOString(), startDate, timeZone: zone })
    clock(beforeMidnight)
    const reloaded = createLocalRepository(storage, 'UTC')
    expect(reloaded.activateLeafPunishment()).toEqual(activated)
    expect(reloaded.reconcileLeafPunishment().events).toEqual([])
    clock(afterMidnight)
    expect(reloaded.reconcileLeafPunishment().events).toHaveLength(1)
    expect(reloaded.getLeafPunishmentBalance().appliedLoss).toBe(5)
  })
})
