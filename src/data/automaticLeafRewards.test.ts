import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFreshState, createLocalRepository, STORAGE_KEY } from './localRepository'
import type { LeafRewardConfig } from '../domain/leafReward'
import type { PracticeRecord } from '../domain/types'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

const childId = 'child_001'
const activityDate = '2026-10-07'
const input = (overrides: Partial<PracticeRecord> = {}) => ({
  date: activityDate,
  minutes: 1,
  quality: 'normal' as const,
  achievements: [],
  customAchievement: '',
  improvement: 'none' as const,
  parentNote: '',
  ...overrides,
})
const importedRecord = (overrides: Partial<PracticeRecord> = {}): PracticeRecord => ({
  id: 'practice_imported',
  childId,
  createdAt: `${activityDate}T10:00:00.000Z`,
  updatedAt: `${activityDate}T10:00:00.000Z`,
  ...input(),
  ...overrides,
})
const only = (condition: keyof Pick<LeafRewardConfig, 'rewardOnTarget' | 'rewardOnFocusedPractice' | 'rewardOnBreakthrough'>): LeafRewardConfig => ({
  targetMinutes: 20,
  rewardOnTarget: condition === 'rewardOnTarget',
  rewardOnFocusedPractice: condition === 'rewardOnFocusedPractice',
  rewardOnBreakthrough: condition === 'rewardOnBreakthrough',
})

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${activityDate}T12:00:00.000Z`)) })
afterEach(() => vi.useRealTimers())

describe('configurable automatic leaf awards', () => {
  it.each([
    ['target', only('rewardOnTarget'), input({ minutes: 20 })],
    ['focused practice', only('rewardOnFocusedPractice'), input({ minutes: 12, quality: 'focused' })],
    ['breakthrough', only('rewardOnBreakthrough'), input({ minutes: 1, improvement: 'breakthrough' })],
  ] as const)('automatically awards one leaf for enabled %s', (_name, config, practice) => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC')
    repository.updateLeafRewardConfig(config)
    repository.savePracticeRecord(practice)
    expect(repository.getLeafGrowthEvents()).toEqual([expect.objectContaining({ childId, date: activityDate })])
    expect(repository.getLeafState().earnedLeafCount).toBe(17)
  })

  it.each([
    ['target', { rewardOnTarget: false }, input({ minutes: 20 })],
    ['focused practice', { rewardOnFocusedPractice: false }, input({ minutes: 12, quality: 'focused' })],
    ['breakthrough', { rewardOnBreakthrough: false }, input({ minutes: 1, improvement: 'breakthrough' })],
  ] as const)('does not award for disabled %s', (_name, setting, practice) => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC')
    repository.updateLeafRewardConfig(setting)
    repository.savePracticeRecord(practice)
    expect(repository.getLeafGrowthEvents()).toHaveLength(0)
  })

  it('records actual Water and Health when a custom target qualifies below Water 3', () => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC')
    repository.updateLeafRewardConfig({ targetMinutes: 10, rewardOnFocusedPractice: false, rewardOnBreakthrough: false })
    repository.savePracticeRecord(input({ minutes: 10 }))
    expect(repository.getLeafGrowthEvents()).toEqual([
      expect.objectContaining({ date: activityDate, sourceWater: 2, sourceHealth: repository.getCurrentHealth(activityDate) }),
    ])
  })

  it('creates only one event when all conditions qualify and further same-day saves occur', () => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC')
    const first = repository.savePracticeRecord(input({ minutes: 20, quality: 'focused', improvement: 'breakthrough', parentNote: 'first' })).record
    repository.savePracticeRecord(input({ minutes: 5, quality: 'focused', improvement: 'breakthrough', parentNote: 'second' }))
    repository.updatePracticeRecord(first.id, input({ minutes: 25, quality: 'focused', improvement: 'breakthrough', parentNote: 'first' }))
    expect(repository.getLeafGrowthEvents()).toHaveLength(1)
  })

  it('does not award below the target and focused thresholds', () => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC')
    repository.savePracticeRecord(input({ minutes: 11, quality: 'focused' }))
    expect(repository.getLeafGrowthEvents()).toHaveLength(0)
  })

  it('uses the shared rule for imported practice and practice edits', () => {
    const imported = createLocalRepository(new MemoryStorage(), 'UTC')
    imported.addPracticeRecord(importedRecord({ minutes: 12, quality: 'focused' }))
    expect(imported.getLeafGrowthEvents()).toHaveLength(1)

    const edited = createLocalRepository(new MemoryStorage(), 'UTC')
    const saved = edited.savePracticeRecord(input({ minutes: 11, quality: 'focused' })).record
    expect(edited.getLeafGrowthEvents()).toHaveLength(0)
    edited.updatePracticeRecord(saved.id, input({ minutes: 12, quality: 'focused' }))
    expect(edited.getLeafGrowthEvents()).toHaveLength(1)
  })

  it('uses the shared rule when lesson evaluation checks existing practice', () => {
    const storage = new MemoryStorage()
    const state = createFreshState()
    state.practiceRecords = [importedRecord({ minutes: 20 })]
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    const repository = createLocalRepository(storage, 'UTC')
    const homework = repository.addHomeworkItem({ title: 'Scale', type: 'scale' })
    repository.saveLessonEvaluation([{ homeworkItemId: homework.id, score: 60, improvement: 'small', completed: false }])
    expect(repository.getLeafGrowthEvents()).toEqual([expect.objectContaining({ date: activityDate })])
  })

  it('keeps a backdated award unique through reload and reverses the related punishment loss', () => {
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'))
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage, 'UTC')
    repository.activateLeafPunishment()
    vi.setSystemTime(new Date('2026-10-05T12:00:00.000Z'))
    expect(repository.reconcileLeafPunishment().events).toHaveLength(1)
    expect(repository.getLeafPunishmentBalance()).toEqual({ earnedLeafCount: 16, appliedLoss: 5, availableLeafCount: 11 })

    repository.savePracticeRecord(input({ date: '2026-10-03', minutes: 20, parentNote: 'backdated' }))
    expect(repository.getLeafGrowthEvents()).toEqual([expect.objectContaining({ date: '2026-10-03' })])
    expect(repository.getLeafPunishmentBalance()).toEqual({ earnedLeafCount: 17, appliedLoss: 0, availableLeafCount: 17 })
    expect(createLocalRepository(storage, 'UTC').getLeafGrowthEvents()).toHaveLength(1)
  })

  it('does not grant or revoke an existing leaf when settings change', () => {
    const repository = createLocalRepository(new MemoryStorage(), 'UTC')
    repository.savePracticeRecord(input({ minutes: 20 }))
    const events = repository.getLeafGrowthEvents()
    const balance = repository.getLeafPunishmentBalance()
    repository.updateLeafRewardConfig({ rewardOnTarget: false, rewardOnFocusedPractice: false, rewardOnBreakthrough: false })
    expect(repository.getLeafGrowthEvents()).toEqual(events)
    expect(repository.getLeafPunishmentBalance()).toEqual(balance)
  })
})
