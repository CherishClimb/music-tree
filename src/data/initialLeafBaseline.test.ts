import { describe, expect, it } from 'vitest'
import { selectDeveloperPreviewStage } from '../domain/developmentPreview'
import { INITIAL_EARNED_LEAF_COUNT, INITIAL_LEAF_BASELINE_VERSION } from '../domain/initialLeafBaseline'
import { calculatePracticeGrowth, createInitialTreeState } from '../domain/treeGrowthEngine'
import { createDemoState, createFreshState, createLocalRepository, STORAGE_KEY } from './localRepository'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

const legacyDemo29 = () => {
  const state = JSON.parse(JSON.stringify(createDemoState())) as Record<string, unknown>
  delete state.initialLeafBaselineVersion
  state.migrationBaseEarnedLeafCount = 29
  state.rewardReminderBaselineLeafCount = 29
  ;(state.treeState as Record<string, unknown>).leafCount = 29
  return state
}

const previousFresh12 = () => {
  const state = JSON.parse(JSON.stringify(createFreshState())) as Record<string, unknown>
  state.initialLeafBaselineVersion = 1
  state.migrationBaseEarnedLeafCount = 12
  state.rewardReminderBaselineLeafCount = 12
  ;(state.treeState as Record<string, unknown>).leafCount = 12
  return state
}

describe('initial earned leaf baseline', () => {
  it('uses one 16-leaf source of truth for a genuinely fresh repository profile', () => {
    expect(INITIAL_EARNED_LEAF_COUNT).toBe(16)
    expect(createInitialTreeState().leafCount).toBe(INITIAL_EARNED_LEAF_COUNT)
    const repository = createLocalRepository(new MemoryStorage())
    expect(repository.getTreeState().leafCount).toBe(16)
    expect(repository.getLeafState().earnedLeafCount).toBe(16)
    expect(repository.getChildProfile()).toMatchObject({ id: 'child_001' })
    expect(repository.getCurrentHealth()).toBe(80)
    expect(repository.getDailyWater()).toBe(0)
    expect(repository.getTreeState().stage).toBe(1)
    expect(repository.getPracticeRecords()).toEqual([])
    expect(repository.getHomeworkItems()).toEqual([])
    expect(repository.getLessonEvaluations()).toEqual([])
    expect(repository.getCompletedPieces()).toEqual([])
    expect(repository.getLearningCycles()).toEqual([])
    expect(repository.getRootAwards()).toEqual([])
    expect(repository.getParentRewards()).toEqual([])
    expect(repository.getRewardReminders()).toEqual([])
    expect(repository.getLeafGrowthEvents()).toEqual([])
    expect(repository.getVacationPeriods()).toEqual([])
  })

  it('migrates an untouched previous fresh 12-leaf baseline once', () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(previousFresh12()))
    const repository = createLocalRepository(storage)
    expect(repository.getTreeState().leafCount).toBe(16)
    expect(repository.getLeafState()).toMatchObject({ migrationBaseEarnedLeafCount: 16, earnedLeafCount: 16 })
    const persisted = JSON.parse(storage.getItem(STORAGE_KEY)!) as Record<string, unknown>
    expect(persisted).toMatchObject({ migrationBaseEarnedLeafCount: 16, rewardReminderBaselineLeafCount: 16, initialLeafBaselineVersion: 2 })
    repository.reload()
    expect(repository.getLeafState().earnedLeafCount).toBe(16)
    expect(createLocalRepository(storage).getLeafState().earnedLeafCount).toBe(16)
  })

  it('preserves old-baseline states with genuine user progress', () => {
    const storage = new MemoryStorage()
    const state = previousFresh12()
    ;(state.practiceRecords as Array<Record<string, unknown>>).push({ id: 'real_practice', childId: 'child_001', date: '2026-08-03', minutes: 20, quality: 'focused', achievements: ['assigned_section'], customAchievement: '', improvement: 'none', parentNote: '', createdAt: '2026-08-03T12:00:00.000Z', updatedAt: '2026-08-03T12:00:00.000Z' })
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    const repository = createLocalRepository(storage)
    expect(repository.getLeafState()).toMatchObject({ migrationBaseEarnedLeafCount: 12, earnedLeafCount: 12 })
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).initialLeafBaselineVersion).toBe(1)

    const progressedStorage = new MemoryStorage()
    const progressed = previousFresh12()
    progressed.migrationBaseEarnedLeafCount = 20
    progressed.rewardReminderBaselineLeafCount = 20
    ;(progressed.treeState as Record<string, unknown>).leafCount = 20
    progressedStorage.setItem(STORAGE_KEY, JSON.stringify(progressed))
    expect(createLocalRepository(progressedStorage).getLeafState().earnedLeafCount).toBe(20)
  })

  it('keeps intentional demo content behind the explicit development reset', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    expect(repository.getPracticeRecords()).toEqual([])
    repository.resetDemoData()
    expect(repository.getLeafState().earnedLeafCount).toBe(16)
    expect(repository.getPracticeRecords().length).toBeGreaterThan(0)
    expect(repository.getHomeworkItems().length).toBeGreaterThan(0)
    expect(repository.getCompletedPieces().length).toBeGreaterThan(0)
  })

  it('fresh reset and refresh remain genuinely fresh', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    repository.resetDemoData()
    repository.clearStoredData()
    const refreshed = createLocalRepository(storage)
    expect(refreshed.getPracticeRecords()).toEqual([])
    expect(refreshed.getLeafState().earnedLeafCount).toBe(16)
    expect(refreshed.getCurrentHealth()).toBe(80)
  })

  it('export and import preserve the 16-leaf baseline', () => {
    const source = createLocalRepository(new MemoryStorage())
    const restored = createLocalRepository(new MemoryStorage())
    restored.restoreBackupJson(source.exportBackupJson())
    expect(restored.getLeafState().earnedLeafCount).toBe(16)
  })

  it('Developer Preview changes only the visual stage and persists no leaf value', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    expect(selectDeveloperPreviewStage(1, 5, true)).toBe(5)
    expect(repository.getLeafState().earnedLeafCount).toBe(16)
    expect(createLocalRepository(storage).getLeafState().earnedLeafCount).toBe(16)
    expect(createLocalRepository(storage).getPracticeRecords()).toEqual([])
  })

  it('keeps the fresh and demo factories purposefully separate', () => {
    expect(createFreshState().practiceRecords).toEqual([])
    expect(createFreshState().leafGrowthEvents).toEqual([])
    expect(createDemoState().practiceRecords.length).toBeGreaterThan(0)
  })

  it('migrates the exact untouched legacy demo 29 once', () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(legacyDemo29()))
    const first = createLocalRepository(storage)
    expect(first.getLeafState().earnedLeafCount).toBe(16)
    const persisted = JSON.parse(storage.getItem(STORAGE_KEY)!) as Record<string, unknown>
    expect(persisted.initialLeafBaselineVersion).toBe(INITIAL_LEAF_BASELINE_VERSION)
    expect(createLocalRepository(storage).getLeafState().earnedLeafCount).toBe(16)
  })

  it('preserves genuine progress above 16 instead of broadly rewriting 29', () => {
    const storage = new MemoryStorage()
    const state = legacyDemo29()
    const records = state.practiceRecords as Array<Record<string, unknown>>
    records.push({ ...records[0], id: 'real_user_practice', date: '2026-08-03' })
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    const repository = createLocalRepository(storage)
    expect(repository.getLeafState().earnedLeafCount).toBe(29)
  })

  it('does not alter the unrelated active leaf-growth rule', () => {
    const initial = createInitialTreeState()
    const result = calculatePracticeGrowth(initial, { id: 'practice', childId: 'child', date: '2026-08-05', minutes: 20, quality: 'focused', achievements: ['assigned_section'], customAchievement: '', improvement: 'none', parentNote: '', createdAt: 'now', updatedAt: 'now' })
    expect(result.updatedState.leafCount).toBe(INITIAL_EARNED_LEAF_COUNT)
    expect(result.changes.some((change) => change.type === 'leaf')).toBe(false)
  })
})
