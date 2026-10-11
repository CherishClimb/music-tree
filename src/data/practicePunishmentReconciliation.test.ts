import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFreshState, createLocalRepository, STORAGE_KEY } from './localRepository'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem = vi.fn((key: string, value: string) => { this.values.set(key, value) })
  removeItem(key: string) { this.values.delete(key) }
}

const clock = (day: string) => vi.setSystemTime(new Date(`${day}T12:00:00Z`))
const practice = (date: string, minutes = 5) => ({ date, minutes, quality: 'normal' as const, achievements: [], customAchievement: '', improvement: 'none' as const, parentNote: '' })
const record = (date: string, minutes = 5) => ({ ...practice(date, minutes), id: 'correction', childId: 'child_001', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
const setup = (leaves = 16) => {
  const storage = new MemoryStorage()
  const initial = createFreshState()
  initial.migrationBaseEarnedLeafCount = leaves
  initial.treeState.leafCount = leaves
  storage.setItem(STORAGE_KEY, JSON.stringify(initial))
  const repository = createLocalRepository(storage, 'UTC')
  repository.activateLeafPunishment()
  return { repository, storage }
}
beforeEach(() => { vi.useFakeTimers(); clock('2026-10-01') })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('practice mutation punishment reconciliation', () => {
  it.each(['save', 'add', 'update'] as const)('%s saves practice and its correction in one snapshot', (method) => {
    const { repository, storage } = setup()
    clock('2026-10-05')
    const original = repository.reconcileLeafPunishment().events[0]
    if (method === 'update') repository.addPracticeRecord(record('2026-10-03', 4))
    storage.setItem.mockClear()
    const listener = vi.fn()
    repository.subscribeToPersistence(listener)
    if (method === 'save') repository.savePracticeRecord(practice('2026-10-03'))
    if (method === 'add') repository.addPracticeRecord(record('2026-10-03'))
    if (method === 'update') repository.updatePracticeRecord('correction', practice('2026-10-03'))
    const ledger = repository.getLeafPunishmentLedger()!
    expect(ledger.events[0].revisions).toEqual([...original.revisions, expect.objectContaining({ active: false, appliedLoss: 0 })])
    expect(repository.getLeafPunishmentBalance().availableLeafCount).toBe(16)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledTimes(1)
    const persisted = JSON.parse(listener.mock.calls[0][0])
    expect(persisted.practiceRecords).toEqual(repository.getPracticeRecords())
    expect(persisted.leafPunishment).toEqual(ledger)
    expect(createLocalRepository(storage, 'UTC').reconcileLeafPunishment()).toEqual(ledger)
  })

  it.each([0, 1, 3, 5])('restores only the actual %i-leaf loss, retaining history after reload', (leaves) => {
    const { repository, storage } = setup(leaves)
    clock('2026-10-05')
    const original = repository.reconcileLeafPunishment().events[0]
    repository.savePracticeRecord(practice('2026-10-03'))
    expect(repository.getLeafPunishmentBalance()).toEqual({ earnedLeafCount: leaves, appliedLoss: 0, availableLeafCount: leaves })
    const reloaded = createLocalRepository(storage, 'UTC')
    const corrected = reloaded.getLeafPunishmentLedger()!
    expect(corrected.events[0].assessedLoss).toBe(leaves)
    expect(corrected.events[0].revisions[0]).toEqual(original.revisions[0])
    storage.setItem.mockClear()
    expect(reloaded.reconcileLeafPunishment()).toEqual(corrected)
    expect(reloaded.reconcileLeafPunishment()).toEqual(corrected)
    reloaded.getLeafPunishmentBalance()
    reloaded.getLeafState()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('preserves still-valid partial and zero losses when an earlier penalty is removed', () => {
    const { repository } = setup(7)
    clock('2026-10-11')
    const original = repository.reconcileLeafPunishment()
    expect(original.events.map((event) => event.assessedLoss)).toEqual([5, 2, 0])
    repository.savePracticeRecord(practice('2026-10-04'))
    const corrected = repository.getLeafPunishmentLedger()!
    expect(corrected.events.slice(1)).toEqual(original.events.slice(1))
    expect(repository.getLeafPunishmentBalance()).toEqual({ earnedLeafCount: 7, appliedLoss: 2, availableLeafCount: 5 })
    expect(repository.reconcileLeafPunishment()).toEqual(corrected)
  })

  it('replaces several shifted blocks consistently and reuses their caps when a correction moves again', () => {
    const { repository, storage } = setup(7)
    clock('2026-10-11')
    const original = repository.reconcileLeafPunishment()
    const saved = repository.savePracticeRecord(practice('2026-10-03')).record
    const shifted = repository.getLeafPunishmentLedger()!
    expect(shifted.events.slice(0, 3).map((event) => event.revisions.at(-1)?.appliedLoss)).toEqual([0, 0, 0])
    expect(shifted.events.slice(3).map((event) => [event.date, event.assessedLoss])).toEqual([['2026-10-06', 5], ['2026-10-09', 2]])
    expect(repository.getLeafPunishmentBalance().availableLeafCount).toBe(0)
    repository.updatePracticeRecord(saved.id, practice('2026-10-04'))
    expect(repository.getLeafPunishmentBalance().availableLeafCount).toBe(5)
    repository.updatePracticeRecord(saved.id, practice('2026-10-03'))
    const repeated = repository.getLeafPunishmentLedger()!
    expect(repeated.events).toHaveLength(5)
    expect(repeated.events.slice(0, 3).map((event) => event.revisions[0])).toEqual(original.events.map((event) => event.revisions[0]))
    expect(repository.getLeafPunishmentBalance().availableLeafCount).toBe(0)
    const reloaded = createLocalRepository(storage, 'UTC')
    expect(reloaded.reconcileLeafPunishment()).toEqual(repeated)
    expect(reloaded.reconcileLeafPunishment()).toEqual(repeated)
  })

  it('does not let a new backdated leaf fund an old loss or collect a partial loss again', () => {
    const { repository } = setup(3)
    clock('2026-10-08')
    const original = repository.reconcileLeafPunishment()
    repository.savePracticeRecord(practice('2026-10-04', 20))
    expect(repository.getLeafPunishmentBalance()).toEqual({ earnedLeafCount: 4, appliedLoss: 0, availableLeafCount: 4 })
    expect(repository.getLeafPunishmentLedger()!.events[1]).toEqual(original.events[1])
    repository.savePracticeRecord(practice('2026-10-08', 20))
    expect(repository.getLeafPunishmentBalance().availableLeafCount).toBe(5)
  })

  it.each(['save', 'add', 'update'] as const)('rolls back a failed %s together with its correction and safely retries', (method) => {
    const { repository, storage } = setup(3)
    clock('2026-10-05')
    repository.reconcileLeafPunishment()
    if (method === 'update') repository.addPracticeRecord(record('2026-10-03', 4))
    const before = repository.exportBackupJson()
    const persisted = storage.getItem(STORAGE_KEY)
    const listener = vi.fn()
    repository.subscribeToPersistence(listener)
    const perform = () => {
      if (method === 'save') return repository.savePracticeRecord(practice('2026-10-03', 20))
      if (method === 'add') return repository.addPracticeRecord(record('2026-10-03', 20))
      return repository.updatePracticeRecord('correction', practice('2026-10-03', 20))
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    storage.setItem.mockImplementationOnce(() => { throw new Error('quota') })
    expect(perform).toThrow(/storage/)
    expect(repository.exportBackupJson()).toBe(before)
    expect(storage.getItem(STORAGE_KEY)).toBe(persisted)
    expect(listener).not.toHaveBeenCalled()
    perform()
    expect(repository.getPracticeRecords()).toHaveLength(1)
    expect(repository.getLeafPunishmentBalance()).toEqual({ earnedLeafCount: 4, appliedLoss: 0, availableLeafCount: 4 })
    expect(repository.getLeafPunishmentLedger()!.events[0].revisions).toHaveLength(2)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps practice growth, health, water, stages, roots and rewards independent', () => {
    const { repository: active } = setup()
    const inactive = createLocalRepository(new MemoryStorage(), 'UTC')
    clock('2026-10-11')
    active.reconcileLeafPunishment()
    for (const repository of [active, inactive]) repository.addPracticeRecord(record('2026-10-03', 20))
    const activeState = JSON.parse(active.exportBackupJson())
    const inactiveState = JSON.parse(inactive.exportBackupJson())
    expect(activeState).toEqual({ ...inactiveState, leafPunishment: active.getLeafPunishmentLedger() })
    expect(active.getHealthReplay()).toEqual(inactive.getHealthReplay())
    expect(active.getLeafState().earnedLeafCount).toBe(inactive.getLeafState().earnedLeafCount)
    expect(active.getLeafState().visibleLeafCount).toBe(inactive.getLeafState().visibleLeafCount - active.getLeafPunishmentBalance().appliedLoss)
    expect(active.getDailyWater('2026-10-03')).toBe(inactive.getDailyWater('2026-10-03'))
    expect(active.getCurrentStageProgression()).toEqual(inactive.getCurrentStageProgression())
  })
})
