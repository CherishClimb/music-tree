import { describe, expect, it } from 'vitest'
import { createFreshState, type PersistedState } from './localRepository'
import { canonicalJson, isMeaningfulLocalState, validateCloudState } from './cloudState'

describe('meaningful local Music Tree data', () => {
  it('ignores only harmless default timestamps and key ordering', () => {
    const state = createFreshState()
    state.rewardProgress.updatedAt = '2020-01-01'
    state.rewards.forEach((reward) => { reward.createdAt = '2020-01-01'; reward.updatedAt = '2025-01-01' })
    const reordered = Object.fromEntries(Object.entries(state).reverse()) as PersistedState
    const before = JSON.stringify(reordered)
    expect(isMeaningfulLocalState(reordered)).toBe(false)
    expect(JSON.stringify(reordered)).toBe(before)
  })
  it.each([
    'practiceRecords', 'homeworkItems', 'teacherEvaluations', 'lessonEvaluations',
    'completedPieces', 'concerts', 'specialFruits', 'stageEntrySnapshots', 'learningCycles',
    'rewardReminders', 'vacationPeriods', 'rootAwards', 'parentRewards', 'leafGrowthEvents',
  ] as const)('recognizes history in %s', (field) => {
    const state = createFreshState()
    ;(state[field] as unknown[]).push({ id: 'user-change' })
    expect(isMeaningfulLocalState(state)).toBe(true)
  })
  it.each([
    (state: PersistedState) => { state.childProfile.displayName = 'My child' },
    (state: PersistedState) => { state.childProfile.avatarId = 'rainbow_unicorn' },
    (state: PersistedState) => { state.treeState.stage = 2 },
    (state: PersistedState) => { state.treeState.rootStrength += 1 },
    (state: PersistedState) => { state.rewards[0].active = false },
    (state: PersistedState) => { state.rewards[0].name = 'A new reward' },
    (state: PersistedState) => { state.rewards = [] },
    (state: PersistedState) => { state.rewardProgress.rewardPracticeDates.push('2026-10-01') },
    (state: PersistedState) => { state.migrationBaseEarnedLeafCount += 1 },
  ])('recognizes customized defaults', (customize) => {
    const state = createFreshState()
    customize(state)
    expect(isMeaningfulLocalState(state)).toBe(true)
  })
  it('treats unknown persisted fields conservatively as user changes', () => {
    const state = { ...createFreshState(), futureUserSetting: 'keep me' }
    expect(isMeaningfulLocalState(state)).toBe(true)
    expect(validateCloudState(state)).toEqual(state)
    expect(canonicalJson(state)).toBe(canonicalJson(Object.fromEntries(Object.entries(state).reverse())))
  })
  it.each([null, {}, { ...createFreshState(), version: 2 }, { ...createFreshState(), treeState: {} },
    { ...createFreshState(), rewardProgress: null }, { ...createFreshState(), practiceRecords: [null] },
  ])('rejects an invalid or incomplete cloud snapshot', (value) => {
    expect(() => validateCloudState(value)).toThrow()
  })

  it.each([
    'homeworkItems', 'teacherEvaluations', 'lessonEvaluations', 'completedPieces',
    'concerts', 'rewards', 'specialFruits', 'stageEntrySnapshots', 'learningCycles',
    'rewardReminders', 'vacationPeriods', 'rootAwards', 'parentRewards', 'leafGrowthEvents',
  ] as const)('rejects malformed nested records in %s before hydration', (field) => {
    expect(() => validateCloudState({ ...createFreshState(), [field]: [null] })).toThrow()
    expect(() => validateCloudState({ ...createFreshState(), [field]: [{}] })).toThrow()
  })
  it('rejects corrupt nested lesson data and unsupported tree rendering values', () => {
    const state = createFreshState()
    expect(() => validateCloudState({ ...state, lessonEvaluations: [{ id: 'l', childId: 'c', lessonDate: '2026-10-07', createdAt: '2026-10-07', itemEvaluations: [null] }] })).toThrow()
    expect(() => validateCloudState({ ...state, treeState: { ...state.treeState, stage: 999 } })).toThrow()
    expect(() => validateCloudState({ ...state, childProfile: { ...state.childProfile, avatarId: 'invalid' } })).toThrow()
  })})