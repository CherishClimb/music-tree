import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFreshState, createLocalRepository, parseBackup, STORAGE_KEY, type PersistedState } from './localRepository'
import { isMeaningfulLocalState, validateCloudState } from './cloudState'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem = vi.fn((key: string, value: string) => { this.values.set(key, value) })
  removeItem(key: string) { this.values.delete(key) }
}
const clock = (date: string) => vi.setSystemTime(new Date(date.includes('T') ? date : `${date}T12:00:00Z`))
beforeEach(() => { vi.useFakeTimers(); clock('2026-10-01') })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
const practice = (date: string, minutes = 5) => ({ date, minutes, quality: 'normal' as const, achievements: [], customAchievement: '', improvement: 'none' as const, parentNote: '' })
const snapshot = (repository: ReturnType<typeof createLocalRepository>): PersistedState => JSON.parse(repository.exportBackupJson())
const latest = (event: NonNullable<PersistedState['leafPunishment']>['events'][number]) => event.revisions[event.revisions.length - 1]
function setup(leaves = 16, timeZone = 'UTC') {
  const storage = new MemoryStorage()
  const state = createFreshState()
  state.migrationBaseEarnedLeafCount = leaves
  state.treeState.leafCount = leaves
  storage.setItem(STORAGE_KEY, JSON.stringify(state))
  const repository = createLocalRepository(storage, timeZone)
  return { storage, repository }
}

describe('explicit persisted leaf punishment', () => {
  it('keeps legacy snapshots inactive and activates prospectively exactly once', () => {
    const old: Partial<PersistedState> = createFreshState()
    delete old.leafPunishment
    const json = JSON.stringify(old)
    expect(parseBackup(json)).toEqual({ ...old, leafPunishment: null })
    expect(validateCloudState(old)).toEqual(old)
    expect(isMeaningfulLocalState(old as PersistedState)).toBe(false)
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, json)
    const repository = createLocalRepository(storage, 'UTC')
    expect(repository.getLeafPunishmentLedger()).toBeNull()
    expect(() => repository.reconcileLeafPunishment()).toThrow(/Activate/)
    repository.savePracticeRecord(practice('2020-01-01', 20))
    const before = snapshot(repository)
    const activated = repository.activateLeafPunishment()
    expect(activated).toMatchObject({ startDate: '2026-10-02', openingEarnedLeafCount: 17, openingAwardDates: ['2020-01-01'], evaluatedThrough: null, events: [] })
    expect(snapshot(repository)).toEqual({ ...before, leafPunishment: activated })
    clock('2026-10-04')
    expect(repository.activateLeafPunishment()).toEqual(activated)
    expect(repository.reconcileLeafPunishment().events).toEqual([])
    expect(createLocalRepository(storage, 'UTC').getLeafPunishmentLedger()?.startDate).toBe('2026-10-02')
  })

  it.each([['2026-10-05', 1, 5], ['2026-10-08', 2, 10], ['2026-10-11', 3, 15]] as const)('persists completed day 3/6/9 at %s without practice history', (date, count, loss) => {
    const { repository, storage } = setup()
    repository.activateLeafPunishment()
    clock(date)
    const before = snapshot(repository)
    const ledger = repository.reconcileLeafPunishment()
    expect(ledger.events).toHaveLength(count)
    expect(ledger.events.map((event) => event.date)).toEqual(['2026-10-04', '2026-10-07', '2026-10-10'].slice(0, count))
    expect(repository.getLeafPunishmentBalance()).toEqual({ earnedLeafCount: 16, appliedLoss: loss, availableLeafCount: 16 - loss })
    expect(snapshot(repository)).toEqual({ ...before, leafPunishment: ledger })
    expect(createLocalRepository(storage, 'UTC').getLeafPunishmentLedger()).toEqual(ledger)
    expect(repository.getLeafState().earnedLeafCount).toBe(16)
  })

  it('makes repeat reconciliation, reads and reloads financially idempotent', () => {
    const { repository, storage } = setup()
    repository.activateLeafPunishment()
    clock('2026-10-11')
    const ledger = repository.reconcileLeafPunishment()
    const listener = vi.fn()
    repository.subscribeToPersistence(listener)
    storage.setItem.mockClear()
    repository.getLeafState(); repository.getLeafPunishmentBalance(); repository.getLeafPunishmentLedger()
    expect(repository.reconcileLeafPunishment()).toEqual(ledger)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(listener).not.toHaveBeenCalled()
    repository.reload()
    storage.setItem.mockClear()
    expect(repository.reconcileLeafPunishment()).toEqual(ledger)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('handles a long offline gap with all blocks and no negative balance', () => {
    const { repository } = setup(7)
    repository.activateLeafPunishment()
    clock('2026-11-01')
    const ledger = repository.reconcileLeafPunishment()
    expect(ledger.events).toHaveLength(10)
    expect(ledger.events.map((event) => latest(event).appliedLoss)).toEqual([5, 2, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(repository.getLeafPunishmentBalance().availableLeafCount).toBe(0)
  })

  it('freezes through overlapping holidays and resumes the partial block', () => {
    const { repository } = setup()
    repository.activateLeafPunishment()
    repository.addVacationPeriod({ startDate: '2026-10-04', endDate: '2026-10-06' })
    repository.addVacationPeriod({ startDate: '2026-10-05', endDate: '2026-10-07' })
    clock('2026-10-08')
    expect(repository.reconcileLeafPunishment().events).toEqual([])
    clock('2026-10-09')
    expect(repository.reconcileLeafPunishment().events[0].missedDates).toEqual(['2026-10-02', '2026-10-03', '2026-10-08'])
  })

  it('handles holiday cancellation and early ending with existing repository rules', () => {
    const { repository } = setup()
    repository.activateLeafPunishment()
    const cancelled = repository.addVacationPeriod({ startDate: '2026-10-02', endDate: '2026-10-03' })
    repository.cancelVacationPeriod(cancelled.id)
    const active = repository.addVacationPeriod({ startDate: '2026-10-04', endDate: '2026-10-10' })
    clock('2026-10-06')
    repository.endVacationPeriodEarly(active.id)
    clock('2026-10-07')
    expect(repository.reconcileLeafPunishment().events[0].missedDates).toEqual(['2026-10-02', '2026-10-03', '2026-10-06'])
  })

  it('reverses invalid penalties after backdated holiday creation without repeating refunds', () => {
    const { repository } = setup()
    repository.activateLeafPunishment()
    clock('2026-10-05')
    const original = repository.reconcileLeafPunishment().events[0]
    repository.addVacationPeriod({ startDate: '2026-10-02', endDate: '2026-10-04' })
    const corrected = repository.reconcileLeafPunishment()
    expect(corrected.events[0]).toMatchObject({ ...original, revisions: [...original.revisions, expect.objectContaining({ revision: 2, active: false, appliedLoss: 0 })] })
    expect(repository.getLeafPunishmentBalance().availableLeafCount).toBe(16)
    expect(repository.reconcileLeafPunishment()).toEqual(corrected)
  })

  it('reverses and reapplies a corrected practice block using the same event and capped revisions', () => {
    const { repository, storage } = setup()
    repository.activateLeafPunishment()
    clock('2026-10-05')
    const original = repository.reconcileLeafPunishment().events[0]
    const record = repository.savePracticeRecord(practice('2026-10-03')).record
    let ledger = repository.reconcileLeafPunishment()
    expect(latest(ledger.events[0])).toMatchObject({ active: false, appliedLoss: 0 })
    expect(repository.getLeafPunishmentBalance().availableLeafCount).toBe(16)
    repository.updatePracticeRecord(record.id, practice('2026-10-03', 4))
    ledger = repository.reconcileLeafPunishment()
    expect(ledger.events).toHaveLength(1)
    expect(ledger.events[0].id).toBe(original.id)
    expect(ledger.events[0].revisions[0]).toEqual(original.revisions[0])
    expect(latest(ledger.events[0])).toMatchObject({ revision: 3, active: true, appliedLoss: 5 })
    const reloaded = createLocalRepository(storage, 'UTC')
    expect(reloaded.reconcileLeafPunishment()).toEqual(ledger)
  })

  it('deducts against available leaves after earlier penalties, not lifetime earnings', () => {
    const { repository } = setup(6)
    repository.activateLeafPunishment()
    clock('2026-10-08')
    expect(repository.reconcileLeafPunishment().events.map((event) => event.assessedLoss)).toEqual([5, 1])
    expect(repository.getLeafPunishmentBalance()).toEqual({ earnedLeafCount: 6, appliedLoss: 6, availableLeafCount: 0 })
  })

  it('replaces multiple corrected blocks without double deductions or refunds', () => {
    const { repository } = setup()
    repository.activateLeafPunishment()
    clock('2026-10-11')
    const original = repository.reconcileLeafPunishment()
    repository.savePracticeRecord(practice('2026-10-03'))
    const corrected = repository.reconcileLeafPunishment()
    expect(corrected.events.slice(0, 3).map(latest).every((revision) => !revision.active && revision.appliedLoss === 0)).toBe(true)
    expect(corrected.events.slice(3).map((event) => event.date)).toEqual(['2026-10-06', '2026-10-09'])
    expect(corrected.events.slice(0, 3).map((event) => event.revisions[0])).toEqual(original.events.map((event) => event.revisions[0]))
    expect(repository.getLeafPunishmentBalance()).toEqual({ earnedLeafCount: 16, appliedLoss: 10, availableLeafCount: 6 })
    expect(repository.reconcileLeafPunishment()).toEqual(corrected)
  })

  it('saves backdated practice and its correction together, rolling both back on failure', () => {
    const { repository, storage } = setup()
    repository.activateLeafPunishment()
    clock('2026-10-05')
    repository.reconcileLeafPunishment()
    const before = repository.exportBackupJson()
    const raw = storage.getItem(STORAGE_KEY)
    const listener = vi.fn()
    repository.subscribeToPersistence(listener)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    storage.setItem.mockImplementationOnce(() => { throw new Error('quota') })
    expect(() => repository.savePracticeRecord(practice('2026-10-03'))).toThrow(/storage/)
    expect(repository.exportBackupJson()).toBe(before)
    expect(storage.getItem(STORAGE_KEY)).toBe(raw)
    expect(listener).not.toHaveBeenCalled()
    expect(repository.getLeafPunishmentBalance().availableLeafCount).toBe(11)
    storage.setItem.mockClear()
    repository.savePracticeRecord(practice('2026-10-03'))
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledTimes(1)
    const ledger = repository.reconcileLeafPunishment()
    expect(ledger.events[0].revisions).toHaveLength(2)
    expect(repository.getLeafPunishmentBalance().availableLeafCount).toBe(16)
    expect(repository.reconcileLeafPunishment()).toEqual(ledger)
  })

  it.each([0, 3, 5])('backdated practice restores exactly the %i leaves actually lost', (leaves) => {
    const { repository, storage } = setup(leaves)
    repository.activateLeafPunishment()
    clock('2026-10-05')
    const original = repository.reconcileLeafPunishment().events[0]
    expect(latest(original).appliedLoss).toBe(leaves)
    storage.setItem.mockClear()
    repository.savePracticeRecord(practice('2026-10-03'))
    const corrected = repository.getLeafPunishmentLedger()!
    expect(corrected.events[0].assessedLoss).toBe(leaves)
    expect(corrected.events[0].revisions[0]).toEqual(original.revisions[0])
    expect(latest(corrected.events[0])).toMatchObject({ active: false, appliedLoss: 0 })
    expect(repository.getLeafPunishmentBalance()).toEqual({ earnedLeafCount: leaves, appliedLoss: 0, availableLeafCount: leaves })
    expect(repository.getLeafGrowthEvents()).toEqual([])
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    const reloaded = createLocalRepository(storage, 'UTC')
    storage.setItem.mockClear()
    expect(reloaded.reconcileLeafPunishment()).toEqual(corrected)
    expect(reloaded.reconcileLeafPunishment()).toEqual(corrected)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('retains a still-valid low-balance penalty when an earlier penalty is invalidated', () => {
    const { repository, storage } = setup(6)
    repository.activateLeafPunishment()
    clock('2026-10-05')
    repository.savePracticeRecord(practice('2026-10-05'))
    clock('2026-10-09')
    const original = repository.reconcileLeafPunishment()
    expect(original.events.map((event) => latest(event).appliedLoss)).toEqual([5, 1])
    repository.savePracticeRecord(practice('2026-10-03'))
    const corrected = repository.getLeafPunishmentLedger()!
    expect(latest(corrected.events[0])).toMatchObject({ active: false, appliedLoss: 0 })
    expect(corrected.events[1]).toEqual(original.events[1])
    expect(repository.getLeafPunishmentBalance()).toEqual({ earnedLeafCount: 6, appliedLoss: 1, availableLeafCount: 5 })
    expect(createLocalRepository(storage, 'UTC').reconcileLeafPunishment()).toEqual(corrected)
  })

  it('replaces several low-balance blocks without over-refunding or creating debt', () => {
    const { repository, storage } = setup(7)
    repository.activateLeafPunishment()
    clock('2026-10-11')
    const original = repository.reconcileLeafPunishment()
    expect(original.events.map((event) => latest(event).appliedLoss)).toEqual([5, 2, 0])
    repository.savePracticeRecord(practice('2026-10-03'))
    const corrected = repository.getLeafPunishmentLedger()!
    expect(corrected.events.slice(0, 3).map((event) => latest(event).appliedLoss)).toEqual([0, 0, 0])
    expect(corrected.events.slice(0, 3).map((event) => event.assessedLoss)).toEqual([5, 2, 0])
    expect(corrected.events.slice(3).map((event) => [event.date, latest(event).appliedLoss])).toEqual([['2026-10-06', 5], ['2026-10-09', 2]])
    expect(repository.getLeafPunishmentBalance().availableLeafCount).toBe(0)
    repository.savePracticeRecord(practice('2026-10-11', 20))
    expect(repository.getLeafPunishmentLedger()).toEqual(corrected)
    expect(repository.getLeafPunishmentBalance().availableLeafCount).toBe(1)
    expect(createLocalRepository(storage, 'UTC').reconcileLeafPunishment()).toEqual(corrected)
  })

  it.each(['add', 'update'] as const)('reconciles the %s practice entry point as well as parent saves', (operation) => {
    const { repository } = setup(3)
    repository.activateLeafPunishment()
    clock('2026-10-05')
    repository.reconcileLeafPunishment()
    if (operation === 'add') {
      repository.addPracticeRecord({ ...practice('2026-10-03'), id: 'imported-practice', childId: 'child_001', createdAt: '2026-10-05T12:00:00Z', updatedAt: '2026-10-05T12:00:00Z' })
    } else {
      const record = repository.savePracticeRecord(practice('2026-10-03', 4)).record
      expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(3)
      repository.updatePracticeRecord(record.id, practice('2026-10-03'))
    }
    expect(repository.getLeafPunishmentBalance()).toEqual({ earnedLeafCount: 3, appliedLoss: 0, availableLeafCount: 3 })
    expect(repository.reconcileLeafPunishment()).toEqual(repository.getLeafPunishmentLedger())
  })

  it('backdated practice has the same health and growth effects with punishment active or inactive', () => {
    const active = setup().repository
    const control = setup().repository
    active.activateLeafPunishment()
    clock('2026-10-05')
    active.reconcileLeafPunishment()
    active.savePracticeRecord(practice('2026-10-03', 20))
    control.savePracticeRecord(practice('2026-10-03', 20))
    expect(active.getLeafPunishmentBalance()).toEqual({ earnedLeafCount: 17, appliedLoss: 0, availableLeafCount: 17 })
    expect(active.getHealthReplay()).toEqual(control.getHealthReplay())
    expect(active.getLeafState()).toEqual(control.getLeafState())
    expect(active.getLeafGrowthEvents()).toEqual(control.getLeafGrowthEvents())
    expect(active.getTreeState()).toEqual(control.getTreeState())
    expect(active.getDailyWater('2026-10-03')).toEqual(control.getDailyWater('2026-10-03'))
    expect(active.getRootAwards()).toEqual(control.getRootAwards())
    expect(active.getStageEntrySnapshots()).toEqual(control.getStageEntrySnapshots())
    expect(active.getRewardReminders()).toEqual(control.getRewardReminders())
    expect(active.getCreatureCollection()).toEqual(control.getCreatureCollection())
  })

  it('keeps the existing invalid-JSON reload recovery while inactive', () => {
    const { repository, storage } = setup()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    storage.setItem(STORAGE_KEY, '{broken')
    repository.reload()
    expect(repository.getLeafPunishmentLedger()).toBeNull()
    expect(repository.getLoadWarning()).toMatch(/could not be loaded/)
  })

  it('preserves an active in-memory ledger if the stored snapshot disappears', () => {
    const { repository, storage } = setup()
    const activation = repository.activateLeafPunishment()
    storage.removeItem(STORAGE_KEY)
    expect(() => repository.reload()).toThrow(/activation is missing/)
    expect(repository.getLeafPunishmentLedger()).toEqual(activation)
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })

  it.each([0, 3])('does not collect old punishment debt after earning from a %i-leaf balance', (leaves) => {
    const { repository } = setup(leaves)
    repository.activateLeafPunishment()
    clock('2026-10-05')
    const original = repository.reconcileLeafPunishment().events[0]
    repository.savePracticeRecord(practice('2026-10-05', 20))
    expect(repository.reconcileLeafPunishment().events[0]).toEqual(original)
    expect(repository.getLeafPunishmentBalance().availableLeafCount).toBe(1)
    clock('2026-10-09')
    expect(repository.reconcileLeafPunishment().events.map((event) => event.assessedLoss)).toEqual([leaves, 1])
  })

  it('does not fund undiscovered old penalties with later or newly backdated earnings', () => {
    const { repository } = setup(0)
    repository.activateLeafPunishment()
    clock('2026-10-11')
    repository.savePracticeRecord({ ...practice('2026-10-03', 1), improvement: 'breakthrough' })
    repository.savePracticeRecord(practice('2026-10-11', 20))
    const ledger = repository.reconcileLeafPunishment()
    expect(ledger.events.map((event) => event.assessedLoss)).toEqual([0, 0, 0])
    expect(repository.getLeafPunishmentBalance().availableLeafCount).toBe(2)
  })

  it('preserves the ledger and activation through backup, cloud validation and hydration', () => {
    const { repository } = setup()
    repository.activateLeafPunishment()
    clock('2026-10-11')
    const ledger = repository.reconcileLeafPunishment()
    const json = repository.exportBackupJson()
    const restored = createLocalRepository(new MemoryStorage(), 'Europe/Berlin')
    restored.restoreBackupJson(json)
    const hydrated = createLocalRepository(new MemoryStorage(), 'America/New_York')
    hydrated.loadSnapshot(JSON.stringify(validateCloudState(JSON.parse(json))))
    for (const saved of [restored, hydrated]) {
      expect(saved.getLeafPunishmentLedger()).toEqual(ledger)
      expect(saved.reconcileLeafPunishment()).toEqual(ledger)
      expect(saved.getLeafPunishmentBalance().appliedLoss).toBe(15)
    }
  })

  it('normalizes an older cloud snapshot without activating or echo-saving it', () => {
    const { repository } = setup()
    const old: Partial<PersistedState> = createFreshState()
    delete old.leafPunishment
    const listener = vi.fn()
    repository.subscribeToPersistence(listener)
    repository.loadSnapshot(JSON.stringify(validateCloudState(old)))
    expect(repository.getLeafPunishmentLedger()).toBeNull()
    expect(listener).not.toHaveBeenCalled()
  })

  it('refuses to silently replace activation with a missing or different activation', () => {
    const { repository } = setup()
    const old = repository.exportBackupJson()
    repository.activateLeafPunishment()
    const before = repository.exportBackupJson()
    expect(() => repository.loadSnapshot(old)).toThrow(/activation/)
    expect(() => repository.restoreBackupJson(old)).toThrow(/activation/)
    clock('2026-10-02')
    const other = setup().repository
    other.activateLeafPunishment()
    expect(() => repository.loadSnapshot(other.exportBackupJson())).toThrow(/activation/)
    expect(repository.exportBackupJson()).toBe(before)
  })

  it.each(['activation', 'loss', 'identity', 'revision', 'timezone'] as const)('rejects malformed %s without replacing saved local data', (kind) => {
    const { repository, storage } = setup()
    repository.activateLeafPunishment()
    clock('2026-10-05')
    repository.reconcileLeafPunishment()
    const bad = snapshot(repository)
    const ledger = bad.leafPunishment!
    if (kind === 'activation') ledger.startDate = '2020-01-01'
    if (kind === 'loss') ledger.events[0].assessedLoss = 99
    if (kind === 'identity') ledger.events[0].id = 'wrong'
    if (kind === 'revision') ledger.events[0].revisions[0].appliedLoss = -1
    if (kind === 'timezone') ledger.timeZone = 'invalid/timezone'
    const before = repository.exportBackupJson()
    expect(() => validateCloudState(bad)).toThrow(/ledger/)
    expect(() => repository.restoreBackupJson(JSON.stringify(bad))).toThrow(/ledger/)
    expect(repository.exportBackupJson()).toBe(before)
    const raw = JSON.stringify(bad)
    storage.setItem(STORAGE_KEY, raw)
    expect(() => createLocalRepository(storage)).toThrow(/ledger/)
    expect(storage.getItem(STORAGE_KEY)).toBe(raw)
  })

  it.each(['activate', 'reconcile'] as const)('rolls back failed %s writes and safely retries once', (operation) => {
    const { repository, storage } = setup()
    if (operation === 'reconcile') { repository.activateLeafPunishment(); clock('2026-10-05') }
    const perform = () => operation === 'activate' ? repository.activateLeafPunishment() : repository.reconcileLeafPunishment()
    const before = repository.exportBackupJson()
    const raw = storage.getItem(STORAGE_KEY)
    const listener = vi.fn()
    repository.subscribeToPersistence(listener)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    storage.setItem.mockImplementationOnce(() => { throw new Error('quota') })
    expect(perform).toThrow(/storage/)
    expect(repository.exportBackupJson()).toBe(before)
    expect(storage.getItem(STORAGE_KEY)).toBe(raw)
    expect(listener).not.toHaveBeenCalled()
    const saved = perform()
    expect(perform()).toEqual(saved)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('rejects a stale local tab before overwriting a newer snapshot', () => {
    const { repository, storage } = setup()
    repository.activateLeafPunishment()
    const other = createLocalRepository(storage, 'UTC')
    clock('2026-10-05')
    const ledger = other.reconcileLeafPunishment()
    const saved = storage.getItem(STORAGE_KEY)
    expect(() => repository.reconcileLeafPunishment()).toThrow(/another tab/)
    expect(storage.getItem(STORAGE_KEY)).toBe(saved)
    repository.reload()
    expect(repository.reconcileLeafPunishment()).toEqual(ledger)
  })

  it.each([
    ['2026-03-26T12:00:00Z', '2026-03-29T21:59:59Z', '2026-03-29T22:00:00Z', '2026-03-29'],
    ['2026-10-22T12:00:00Z', '2026-10-25T22:59:59Z', '2026-10-25T23:00:00Z', '2026-10-25'],
  ])('uses the stored local zone across DST starting %s', (activation, beforeMidnight, afterMidnight, date) => {
    clock(activation)
    const { repository } = setup(16, 'Europe/Berlin')
    repository.activateLeafPunishment()
    clock(beforeMidnight)
    expect(repository.reconcileLeafPunishment().events).toEqual([])
    clock(afterMidnight)
    expect(repository.reconcileLeafPunishment().events[0].date).toBe(date)
  })

  it('rejects clock rollback rather than refunding completed penalties', () => {
    const { repository } = setup()
    repository.activateLeafPunishment()
    clock('2026-10-05')
    repository.reconcileLeafPunishment()
    const before = repository.exportBackupJson()
    clock('2026-10-04')
    expect(() => repository.reconcileLeafPunishment()).toThrow(/backwards/)
    expect(repository.exportBackupJson()).toBe(before)
  })
})
