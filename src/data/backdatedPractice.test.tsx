import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import App from '../App'
import { localCalendarDate } from '../domain/localCalendarDate'
import { evaluateStageProgression } from '../domain/stageProgressionEngine'
import { PARENT_NOTE_FALLBACK, selectLatestParentNote } from '../domain/parentNote'
import { createDemoState, createFreshState, createLocalRepository, derivePracticeStats, STORAGE_KEY } from './localRepository'

const NOW = '2026-10-04T12:00:00.000Z'
const input = (date: string, parentNote = 'Missed practice') => ({ date, minutes: 20, quality: 'focused' as const, achievements: ['assigned_section'], customAchievement: '', improvement: 'none' as const, parentNote })
class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { throw new Error(`Unexpected data deletion: ${key}`) }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)) })
afterEach(() => vi.useRealTimers())

describe('MVP2 backdated parent practice', () => {
  it.each(['2026-10-04', '2026-10-03', '2026-10-02', '2026-09-20', '2024-02-29'])('saves activity on %s with separate creation and update timestamps', (date) => {
    const repository = createLocalRepository(new MemoryStorage(), 'Europe/Berlin')
    const { record } = repository.savePracticeRecord(input(date))
    expect(record).toMatchObject({ ...input(date), createdAt: NOW, updatedAt: NOW })
    expect(repository.getPracticeRecords()).toEqual([record])
  })

  it.each(['2026-10-05', '2027-01-01'])('rejects future date %s on both creation methods without changing state', (date) => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage, 'Europe/Berlin')
    const before = repository.exportBackupJson()
    const persisted = storage.getItem(STORAGE_KEY)
    expect(() => repository.savePracticeRecord(input(date))).toThrow(/future/i)
    expect(() => repository.addPracticeRecord({ ...input(date), id: 'external', childId: 'child_001', createdAt: NOW, updatedAt: NOW })).toThrow(/future/i)
    expect(repository.exportBackupJson()).toBe(before)
    expect(storage.getItem(STORAGE_KEY)).toBe(persisted)
  })

  it.each(['', '2026-02-30', '2026-02-29', '2026-13-01', '2026-2-01', '2026-10-02T12:00:00Z', '0000-01-01'])('rejects invalid calendar date %s', (date) => {
    const repository = createLocalRepository(new MemoryStorage())
    expect(() => repository.savePracticeRecord(input(date))).toThrow(/valid practice date/i)
    expect(repository.getPracticeRecords()).toEqual([])
  })

  it.each([
    ['Europe/Berlin', '2026-01-01T23:30:00.000Z', '2026-01-02', '2026-01-03'],
    ['America/Los_Angeles', '2026-10-04T01:00:00.000Z', '2026-10-03', '2026-10-04'],
    ['Europe/Berlin', '2026-03-29T22:30:00.000Z', '2026-03-30', '2026-03-31'],
  ])('validates today in %s at %s, independently of UTC', (zone, instant, date, future) => {
    vi.setSystemTime(new Date(instant))
    const repository = createLocalRepository(new MemoryStorage(), zone)
    expect(repository.savePracticeRecord(input(date)).record).toMatchObject({ date, createdAt: instant })
    expect(() => repository.savePracticeRecord(input(future))).toThrow(/future/i)
  })

  it('orders history by activity date, then creation time, and exports CSV in activity order', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    const first = repository.savePracticeRecord(input('2026-10-04', 'Today first')).record
    vi.setSystemTime(new Date('2026-10-04T13:00:00.000Z'))
    const oldest = repository.savePracticeRecord(input('2026-10-01')).record
    const middle = repository.savePracticeRecord(input('2026-10-03')).record
    const last = repository.savePracticeRecord(input('2026-10-04', 'Today second')).record
    expect(repository.getPracticeRecords().map((record) => record.id)).toEqual([last.id, first.id, middle.id, oldest.id])
    const beforeRead = storage.getItem(STORAGE_KEY)
    repository.getPracticeRecords().reverse()
    expect(storage.getItem(STORAGE_KEY)).toBe(beforeRead)
    expect(repository.exportPracticeCsv().split('\r\n').slice(1).map((line) => line.split(',')[0])).toEqual(['"2026-10-01"', '"2026-10-03"', '"2026-10-04"', '"2026-10-04"'])
    expect(createLocalRepository(storage).getPracticeRecords()).toEqual(repository.getPracticeRecords())
    repository.recalculateTreeStateFromHistory()
    expect(repository.getTreeState()).toMatchObject({ lastPracticeDate: '2026-10-04', totalPracticeDays: 3 })
  })

  it('preserves MVP1 records and progress after adding a missed record, reload, and backup restore', () => {
    const storage = new MemoryStorage()
    const old = createDemoState()
    old.treeState.stage = 2
    storage.setItem(STORAGE_KEY, JSON.stringify(old))
    const repository = createLocalRepository(storage)
    const saved = repository.savePracticeRecord(input('2026-10-02')).record
    const before = repository.exportBackupJson()
    repository.reload()
    const reopened = createLocalRepository(storage)
    const restored = createLocalRepository(new MemoryStorage())
    restored.restoreBackupJson(before)
    for (const repo of [repository, reopened, restored]) {
      expect(repo.getLoadWarning()).toBeNull()
      expect(repo.exportBackupJson()).toBe(before)
      expect(repo.getPracticeRecords()).toHaveLength(old.practiceRecords.length + 1)
      expect(repo.getPracticeRecords()).toEqual(expect.arrayContaining([...old.practiceRecords, saved]))
      expect(repo.getHomeworkItems()).toEqual(old.homeworkItems)
      expect(repo.getCompletedPieces()).toEqual(old.completedPieces)
      expect(repo.getTreeState().stage).toBe(2)
      expect(JSON.parse(repo.exportBackupJson()).version).toBe(1)
    }
    expect([...storage.values.keys()]).toEqual([STORAGE_KEY])
  })

  it('attributes water, health, notes, and a permanent daily leaf to the activity date', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    repository.savePracticeRecord(input('2026-10-02'))
    expect(repository.getDailyWater('2026-10-02')).toBe(3)
    expect(repository.getDailyWater('2026-10-04')).toBe(0)
    expect(repository.getHealthReplay('2026-10-04').days.map(({ date, parentContribution }) => ({ date, parentContribution }))).toEqual([
      { date: '2026-10-02', parentContribution: 20 },
      { date: '2026-10-03', parentContribution: 0 },
      { date: '2026-10-04', parentContribution: 0 },
    ])
    expect(repository.getLeafGrowthEvents()).toEqual([expect.objectContaining({ date: '2026-10-02', createdAt: NOW })])
    expect(selectLatestParentNote(repository.getPracticeRecords(), '2026-10-04')).toBe(PARENT_NOTE_FALLBACK)
    repository.savePracticeRecord(input('2026-10-02', 'Second moment'))
    expect(repository.getLeafGrowthEvents()).toHaveLength(1)
    expect(createLocalRepository(storage).getHealthReplay()).toEqual(repository.getHealthReplay())
  })

  it('attributes weekly and monthly windows to activity dates using existing progress calculations', () => {
    const repository = createLocalRepository(new MemoryStorage())
    for (const date of ['2026-09-20', '2026-09-30', '2026-10-02']) repository.savePracticeRecord(input(date))
    const records = repository.getPracticeRecords()
    for (const [start, end, days, minutes] of [
      ['2026-09-28', '2026-10-04', 2, 40],
      ['2026-09-01', '2026-09-30', 2, 40],
      ['2026-10-01', '2026-10-31', 1, 20],
    ] as const) {
      const progress = evaluateStageProgression({ currentStage: 1, stageEntryDate: start, currentDate: end, practiceRecords: records, learningCycles: [], lessonEvaluations: [], completedPieces: [], concertRecords: [] })
      expect(progress.requirements.find((item) => item.id === 'practice-days')?.actual).toBe(days)
      expect(derivePracticeStats(records.filter((record) => record.date >= start && record.date <= end))).toMatchObject({ totalPracticeDays: days, totalPracticeMinutes: minutes })
    }
  })

  it('keeps permanent stage snapshots and excludes backdated activity outside the current stage window', () => {
    const storage = new MemoryStorage()
    const state = createFreshState()
    state.treeState.stage = 2
    state.stageEntrySnapshots = [{ id: 'stage_2', previousStage: 1, newStage: 2, permanentStage: 2, stageEntryDate: '2026-10-01', qualifyingEventIds: ['saved_evidence'], cumulativeTotals: { practiceDays: 18, learningCycles: 4, completedPieces: 8 }, stageCounters: { practiceDays: 0 } }]
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    const repository = createLocalRepository(storage)
    repository.savePracticeRecord(input('2026-09-30'))
    repository.savePracticeRecord(input('2026-10-02'))
    expect(repository.getCurrentStageProgression().requirements.find((item) => item.id === 'practice-days')?.actual).toBe(1)
    expect(repository.getStageEntrySnapshots()).toEqual(state.stageEntrySnapshots)
    expect(repository.getTreeState().stage).toBe(2)
  })

  it('retains the existing streak rule when backdating fills a gap or duplicates a day', () => {
    const repository = createLocalRepository(new MemoryStorage())
    for (const date of ['2026-10-01', '2026-10-03', '2026-10-04']) repository.savePracticeRecord(input(date))
    expect(repository.getTreeState()).toMatchObject({ currentPracticeStreak: 2, longestPracticeStreak: 2 })
    repository.savePracticeRecord(input('2026-10-02'))
    repository.savePracticeRecord(input('2026-10-02', 'Same day again'))
    repository.savePracticeRecord({ ...input('2026-09-30'), minutes: 4 })
    expect(repository.getTreeState()).toMatchObject({ totalPracticeDays: 4, currentPracticeStreak: 4, longestPracticeStreak: 4, lastPracticeDate: '2026-10-04' })
    vi.setSystemTime(new Date('2026-10-10T12:00:00.000Z'))
    repository.reload()
    expect(repository.getTreeState().currentPracticeStreak).toBe(4)
  })

  it('edits an activity date while preserving identity, createdAt, and permanent awards', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    const saved = repository.savePracticeRecord(input('2026-10-01')).record
    const earnedBefore = repository.getLeafGrowthEvents()
    vi.setSystemTime(new Date('2026-10-04T14:00:00.000Z'))
    const edited = repository.updatePracticeRecord(saved.id, { ...saved, date: '2026-10-03', createdAt: '2000-01-01T00:00:00.000Z' } as typeof saved)
    expect(edited).toMatchObject({ id: saved.id, childId: saved.childId, date: '2026-10-03', createdAt: NOW, updatedAt: '2026-10-04T14:00:00.000Z' })
    expect(repository.getDailyWater('2026-10-01')).toBe(0)
    expect(repository.getDailyWater('2026-10-03')).toBe(3)
    expect(repository.getTreeState().lastPracticeDate).toBe('2026-10-03')
    expect(repository.getLeafGrowthEvents()).toEqual(expect.arrayContaining(earnedBefore))
    expect(createLocalRepository(storage).getPracticeRecords()).toEqual([edited])
    const before = repository.exportBackupJson()
    expect(() => repository.updatePracticeRecord(saved.id, input('2026-10-05'))).toThrow(/future/i)
    expect(() => repository.updatePracticeRecord(saved.id, input('2026-02-30'))).toThrow(/valid practice date/i)
    expect(repository.exportBackupJson()).toBe(before)
  })

  it('enforces the selected day limit on create and date correction while allowing today', () => {
    const repository = createLocalRepository(new MemoryStorage())
    for (const note of ['One', 'Two', 'Three']) repository.savePracticeRecord(input('2026-10-02', note))
    expect(() => repository.savePracticeRecord(input('2026-10-02', 'Fourth'))).toThrow(/that day already has three/i)
    const today = repository.savePracticeRecord(input('2026-10-04')).record
    expect(() => repository.updatePracticeRecord(today.id, input('2026-10-02'))).toThrow(/that day already has three/i)
    expect(repository.getPracticeRecords().find((record) => record.id === today.id)?.date).toBe('2026-10-04')
  })

  it('renders an accessible date picker defaulting to local today with a future-date limit', () => {
    const markup = renderToStaticMarkup(<App />)
    const date = localCalendarDate()
    expect(markup).toMatch(new RegExp(`Practice date<input[^>]+type="date"[^>]+max="${date}"[^>]+value="${date}"`))
    expect(markup).toContain('aria-describedby="practice-date-help"')
    expect(markup).toContain('Choose today or an earlier day when the practice happened.')
    expect(markup).toContain('Save practice')
  })
})
