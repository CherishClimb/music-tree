import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoState, createLocalRepository, STORAGE_KEY } from './localRepository'
import type { PracticeRecord } from '../domain/types'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T12:00:00.000Z')) })
afterEach(() => vi.useRealTimers())

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

const input = (minutes: number, note: string, date = '2026-10-04') => ({ date, minutes, quality: 'normal' as const, achievements: [], customAchievement: '', improvement: 'none' as const, parentNote: note })
const externalRecord = (id: string, childId: string, date: string): PracticeRecord => ({ id, childId, date, minutes: 5, quality: 'normal', achievements: [], customAchievement: '', improvement: 'none', parentNote: '', createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z` })

describe('daily Water repository enforcement', () => {
  it('accepts three same-day records and rejects the fourth without persisting or changing Water', () => {
    const repository = createLocalRepository(new MemoryStorage())
    repository.savePracticeRecord(input(5, 'one'))
    repository.savePracticeRecord(input(5, 'two'))
    repository.savePracticeRecord(input(5, 'three'))
    const recordsBefore = repository.getPracticeRecords()
    const waterBefore = repository.getDailyWater('2026-10-04')
    expect(waterBefore).toBe(3)
    expect(() => repository.savePracticeRecord(input(20, 'four'))).toThrow(/three practice moments/i)
    expect(repository.getPracticeRecords()).toEqual(recordsBefore)
    expect(repository.getDailyWater('2026-10-04')).toBe(waterBefore)
  })

  it('edits an existing same-day record without consuming a fourth slot', () => {
    const repository = createLocalRepository(new MemoryStorage())
    const first = repository.savePracticeRecord(input(5, 'one')).record
    repository.savePracticeRecord(input(5, 'two'))
    repository.savePracticeRecord(input(5, 'three'))
    repository.updatePracticeRecord(first.id, input(20, 'edited'))
    expect(repository.getPracticeRecords().filter((record) => record.date === '2026-10-04')).toHaveLength(3)
    expect(repository.getDailyWater('2026-10-04')).toBe(3)
  })

  it('enforces independent limits for another child and another date', () => {
    const repository = createLocalRepository(new MemoryStorage())
    for (let index = 0; index < 3; index += 1) repository.addPracticeRecord(externalRecord(`a${index}`, 'child-a', '2026-10-04'))
    repository.addPracticeRecord(externalRecord('other-child', 'child-b', '2026-10-04'))
    repository.addPracticeRecord(externalRecord('other-date', 'child-a', '2026-10-05'))
    expect(repository.getDailyWater('2026-10-04', 'child-a')).toBe(3)
    expect(repository.getDailyWater('2026-10-04', 'child-b')).toBe(1)
    expect(repository.getDailyWater('2026-10-05', 'child-a')).toBe(1)
    expect(() => repository.addPracticeRecord(externalRecord('fourth', 'child-a', '2026-10-04'))).toThrow(/three practice moments/i)
  })

  it('reproduces derived Water after reload and export/import while retaining history', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    const historicalIds = repository.getPracticeRecords().map((record) => record.id)
    repository.savePracticeRecord(input(5, 'one'))
    repository.savePracticeRecord(input(10, 'two'))
    expect(createLocalRepository(storage).getDailyWater('2026-10-04')).toBe(3)
    const restored = createLocalRepository(new MemoryStorage())
    restored.restoreBackupJson(repository.exportBackupJson())
    expect(restored.getDailyWater('2026-10-04')).toBe(3)
    expect(historicalIds.every((id) => restored.getPracticeRecords().some((record) => record.id === id))).toBe(true)
  })

  it('preserves the legacy stored Water field without using it as the daily selector', () => {
    const storage = new MemoryStorage()
    const state = createDemoState()
    state.treeState.waterBalance = 3
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    const repository = createLocalRepository(storage)
    expect(repository.getTreeState().waterBalance).toBe(3)
    expect(repository.getDailyWater('2030-01-01')).toBe(0)
  })

  it('uses the local calendar date for repository defaults', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T23:30:00.000Z'))
    try {
      const repository = createLocalRepository(new MemoryStorage(), 'Europe/Berlin')
      repository.savePracticeRecord(input(20, 'midnight', '2026-01-02'))
      expect(repository.getDailyWater()).toBe(3)
    } finally { vi.useRealTimers() }
  })
})
