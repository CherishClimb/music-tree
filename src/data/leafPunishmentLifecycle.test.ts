// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startLeafPunishmentLifecycle } from './leafPunishmentLifecycle'
import { createDemoState, createFreshState, createLocalRepository, STORAGE_KEY } from './localRepository'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem = vi.fn((key: string, value: string) => { this.values.set(key, value) })
  removeItem(key: string) { this.values.delete(key) }
}
const clock = (instant: string) => vi.setSystemTime(new Date(instant))
const stops: (() => void)[] = []
const setup = (timeZone = 'UTC', initial = createFreshState()) => {
  const storage = new MemoryStorage()
  storage.setItem(STORAGE_KEY, JSON.stringify(initial))
  const random = vi.fn(() => 0)
  const repository = createLocalRepository(storage, timeZone, random)
  storage.setItem.mockClear()
  return { repository, storage, random }
}
const start = (repository: ReturnType<typeof createLocalRepository>, onError = vi.fn()) => {
  const stop = startLeafPunishmentLifecycle(repository, onError)
  stops.push(stop)
  return { stop, onError }
}
const focus = () => window.dispatchEvent(new Event('focus'))

beforeEach(() => { vi.useFakeTimers(); clock('2026-10-01T12:00:00Z') })
afterEach(() => { stops.splice(0).forEach((stop) => stop()); vi.useRealTimers(); vi.restoreAllMocks() })

describe('punishment app lifecycle', () => {
  it('activates once in the local calendar and never counts pre-activation history', () => {
    clock('2026-10-01T22:30:00Z') // October 2 in Berlin.
    const { repository, storage } = setup('Europe/Berlin', createDemoState())
    const before = JSON.parse(repository.exportBackupJson())
    const first = start(repository)
    const ledger = repository.getLeafPunishmentLedger()!
    expect(ledger).toMatchObject({ activatedAt: '2026-10-01T22:30:00.000Z', startDate: '2026-10-03', timeZone: 'Europe/Berlin', events: [], evaluatedThrough: null })
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(JSON.parse(repository.exportBackupJson())).toEqual({ ...before, leafPunishment: ledger })
    focus()
    first.stop()
    const second = start(repository)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    second.stop()
    clock('2026-10-02T22:30:00Z') // Day after activation, first eligible day incomplete.
    const reloaded = createLocalRepository(storage, 'UTC')
    storage.setItem.mockClear()
    start(reloaded)
    expect(reloaded.getLeafPunishmentLedger()).toEqual(ledger)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(reloaded.getLeafPunishmentBalance().appliedLoss).toBe(0)
  })

  it('reconciles the third and sixth completed missed days on focus without duplicate writes', () => {
    const { repository, storage } = setup()
    const lifecycle = start(repository)
    clock('2026-10-05T12:00:00Z')
    focus()
    expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(5)
    clock('2026-10-08T12:00:00Z')
    focus()
    const ledger = repository.getLeafPunishmentLedger()!
    expect(ledger.events.map((event) => event.date)).toEqual(['2026-10-04', '2026-10-07'])
    expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(10)
    storage.setItem.mockClear()
    focus()
    focus()
    lifecycle.stop()
    start(repository).stop()
    expect(storage.setItem).not.toHaveBeenCalled()
    const reloaded = createLocalRepository(storage, 'UTC')
    storage.setItem.mockClear()
    start(reloaded)
    expect(reloaded.getLeafPunishmentLedger()).toEqual(ledger)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('catches up on visibility after backgrounding without needing focus', () => {
    const { repository } = setup()
    start(repository)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    clock('2026-10-05T12:00:00Z')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(0)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(5)
  })

  it('updates across midnight while left open, using only one pending timer', () => {
    const { repository } = setup()
    const notify = vi.fn()
    repository.subscribeToPersistence(notify)
    start(repository)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(3.5 * 86_400_000 - 1)
    expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(0)
    vi.advanceTimersByTime(1)
    expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(5)
    expect(JSON.parse(notify.mock.lastCall![0]).leafPunishment.events).toHaveLength(1)
    vi.advanceTimersByTime(3 * 86_400_000)
    expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(10)
    expect(vi.getTimerCount()).toBe(1)
  })

  it.each([
    ['2026-03-27T23:00:00Z', 23, '2026-03-29'],
    ['2026-10-23T22:00:00Z', 25, '2026-10-25'],
  ])('uses the saved zone across DST from %s', (instant, hours, completedDate) => {
    clock(instant)
    const { repository, storage } = setup('Europe/Berlin')
    start(repository).stop()
    // The device/repository default zone may differ on the next launch.
    const reloaded = createLocalRepository(storage, 'America/Los_Angeles')
    start(reloaded)
    vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    expect(reloaded.getLeafPunishmentLedger()!.evaluatedThrough).toBeNull()
    vi.advanceTimersByTime(hours * 60 * 60 * 1000 - 1)
    expect(reloaded.getLeafPunishmentLedger()!.evaluatedThrough).toBeNull()
    vi.advanceTimersByTime(1)
    expect(reloaded.getLeafPunishmentLedger()!.evaluatedThrough).toBe(completedDate)
  })

  it('pauses counting on holidays and resets it on qualifying practice', () => {
    const { repository } = setup()
    start(repository)
    repository.addVacationPeriod({ startDate: '2026-10-03', endDate: '2026-10-05' })
    clock('2026-10-07T12:00:00Z')
    focus()
    expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(0)
    clock('2026-10-08T12:00:00Z')
    focus()
    expect(repository.getLeafPunishmentLedger()!.events[0].missedDates).toEqual(['2026-10-02', '2026-10-06', '2026-10-07'])
    repository.savePracticeRecord({ date: '2026-10-08', minutes: 5, quality: 'normal', achievements: [], customAchievement: '', improvement: 'none', parentNote: '' })
    clock('2026-10-11T12:00:00Z')
    focus()
    expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(5)
    clock('2026-10-12T12:00:00Z')
    focus()
    expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(10)
  })

  it('retains historical corrections on same-day focus and restart, without debt', () => {
    const initial = createFreshState()
    initial.migrationBaseEarnedLeafCount = 3
    initial.treeState.leafCount = 3
    const { repository, storage } = setup('UTC', initial)
    start(repository).stop()
    clock('2026-10-05T12:00:00Z')
    const lifecycle = start(repository)
    expect(repository.getLeafPunishmentBalance()).toMatchObject({ appliedLoss: 3, availableLeafCount: 0 })
    repository.savePracticeRecord({ date: '2026-10-03', minutes: 5, quality: 'normal', achievements: [], customAchievement: '', improvement: 'none', parentNote: '' })
    const corrected = repository.getLeafPunishmentLedger()
    expect(repository.getLeafPunishmentBalance()).toMatchObject({ appliedLoss: 0, availableLeafCount: 3 })
    focus()
    lifecycle.stop()
    const reloaded = createLocalRepository(storage, 'UTC')
    start(reloaded)
    expect(reloaded.getLeafPunishmentLedger()).toEqual(corrected)
    expect(reloaded.getLeafPunishmentBalance().availableLeafCount).toBe(3)
  })

  it('changes only the ledger, preserving saved growth, health, rewards and creatures', () => {
    const { repository, random } = setup('UTC', createDemoState())
    const before = JSON.parse(repository.exportBackupJson())
    start(repository)
    clock('2026-11-01T12:00:00Z')
    const health = repository.getHealthReplay()
    focus()
    expect(repository.getLeafPunishmentBalance().availableLeafCount).toBe(0)
    expect(JSON.parse(repository.exportBackupJson())).toEqual({ ...before, leafPunishment: repository.getLeafPunishmentLedger() })
    expect(repository.getHealthReplay()).toEqual(health)
    expect(random).not.toHaveBeenCalled()
  })

  it.each(['activation', 'reconciliation'])('retries failed %s on same-day focus without losing history', (operation) => {
    const { repository, storage } = setup()
    if (operation === 'reconciliation') {
      repository.activateLeafPunishment()
      clock('2026-10-05T12:00:00Z')
    }
    const before = repository.exportBackupJson()
    const notify = vi.fn()
    repository.subscribeToPersistence(notify)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    storage.setItem.mockImplementationOnce(() => { throw new Error('quota') })
    const { onError } = start(repository)
    expect(onError).toHaveBeenLastCalledWith(expect.stringMatching(/storage/i))
    expect(repository.exportBackupJson()).toBe(before)
    expect(notify).not.toHaveBeenCalled()
    focus()
    expect(onError).toHaveBeenLastCalledWith(null)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(operation === 'reconciliation' ? 5 : 0)
  })

  it('removes timers and listeners when unmounted', () => {
    const { repository, storage } = setup()
    const { stop } = start(repository)
    stop()
    storage.setItem.mockClear()
    expect(vi.getTimerCount()).toBe(0)
    clock('2026-10-08T12:00:00Z')
    focus()
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(10 * 86_400_000)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(0)
  })
})
