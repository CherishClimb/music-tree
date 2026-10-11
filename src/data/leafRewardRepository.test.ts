import { describe, expect, it } from 'vitest'
import { DEFAULT_LEAF_REWARD_CONFIG } from '../domain/leafReward'
import { validateCloudState } from './cloudState'
import { createFreshState, createLocalRepository, parseBackup, STORAGE_KEY } from './localRepository'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

const legacySnapshot = () => {
  const state = createFreshState() as unknown as Record<string, unknown>
  delete state.leafRewardConfig
  return state
}

describe('leaf reward settings persistence', () => {
  it('gives new profiles defaults and persists custom settings including disabled conditions', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    expect(repository.getLeafRewardConfig()).toEqual(DEFAULT_LEAF_REWARD_CONFIG)
    repository.updateLeafRewardConfig({ targetMinutes: 45, rewardOnTarget: false, rewardOnBreakthrough: false })
    expect(createLocalRepository(storage).getLeafRewardConfig()).toEqual({
      targetMinutes: 45,
      rewardOnTarget: false,
      rewardOnFocusedPractice: true,
      rewardOnBreakthrough: false,
    })
  })

  it('rejects invalid updates without changing persisted settings', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    expect(() => repository.updateLeafRewardConfig({ targetMinutes: 0 })).toThrow(/whole number/i)
    expect(createLocalRepository(storage).getLeafRewardConfig()).toEqual(DEFAULT_LEAF_REWARD_CONFIG)
  })

  it('hydrates legacy localStorage with defaults while preserving history and earned leaves', () => {
    const storage = new MemoryStorage()
    const legacy = legacySnapshot()
    const event = { id: 'leaf_existing', childId: 'child_001', date: '2026-10-01', sourceWater: 3, sourceHealth: 80, createdAt: '2026-10-01T12:00:00.000Z' }
    legacy.leafGrowthEvents = [event]
    storage.setItem(STORAGE_KEY, JSON.stringify(legacy))
    const repository = createLocalRepository(storage)
    expect(repository.getLeafRewardConfig()).toEqual(DEFAULT_LEAF_REWARD_CONFIG)
    expect(repository.getLeafGrowthEvents()).toEqual([event])
  })

  it('normalizes legacy backup and restore data without changing leaf events', () => {
    const legacy = legacySnapshot()
    const event = { id: 'leaf_existing', childId: 'child_001', date: '2026-10-01', sourceWater: 3, sourceHealth: 80, createdAt: '2026-10-01T12:00:00.000Z' }
    legacy.leafGrowthEvents = [event]
    expect(parseBackup(JSON.stringify(legacy)).leafRewardConfig).toEqual(DEFAULT_LEAF_REWARD_CONFIG)
    const repository = createLocalRepository(new MemoryStorage())
    repository.restoreBackupJson(JSON.stringify(legacy))
    expect(repository.getLeafRewardConfig()).toEqual(DEFAULT_LEAF_REWARD_CONFIG)
    expect(repository.getLeafGrowthEvents()).toEqual([event])
  })

  it('normalizes legacy cloud data and preserves explicit cloud preferences', () => {
    expect(validateCloudState(legacySnapshot()).leafRewardConfig).toEqual(DEFAULT_LEAF_REWARD_CONFIG)
    const custom = { ...createFreshState(), leafRewardConfig: { ...DEFAULT_LEAF_REWARD_CONFIG, rewardOnFocusedPractice: false } }
    expect(validateCloudState(custom).leafRewardConfig.rewardOnFocusedPractice).toBe(false)
  })

  it('changes settings without changing rewards, punishment, growth, or history', () => {
    const repository = createLocalRepository(new MemoryStorage())
    const before = JSON.parse(repository.exportBackupJson()) as Record<string, unknown>
    repository.updateLeafRewardConfig({ targetMinutes: 35 })
    const after = JSON.parse(repository.exportBackupJson()) as Record<string, unknown>
    delete before.leafRewardConfig
    delete after.leafRewardConfig
    expect(after).toEqual(before)
  })
})
