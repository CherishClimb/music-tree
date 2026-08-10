import { describe, expect, it } from 'vitest'
import { createInitialTreeState } from './treeGrowthEngine'
import { deriveInactivityTreeState } from './treeInactivity'

describe('tree inactivity presentation', () => {
  it('keeps companions peaceful during the first three inactive days', () => {
    const state = { ...createInitialTreeState(), lastPracticeDate: '2026-08-01' }
    expect(deriveInactivityTreeState(state, '2026-08-04').creatureState).toBe('hidden')
  })

  it('shows the nibbler watching before temporary nibbling begins', () => {
    const state = { ...createInitialTreeState(), lastPracticeDate: '2026-08-01' }
    const shown = deriveInactivityTreeState(state, '2026-08-06')
    expect(shown.creatureState).toBe('watching')
    expect(shown.leafCount).toBe(state.leafCount)
  })

  it('does not suppress leaves from inactivity alone and may reduce glow', () => {
    const state = { ...createInitialTreeState(), stage: 3, branchLevel: 4, fruitCount: 2, completedPieces: ['piece_1'], lastPracticeDate: '2026-08-01' }
    const shown = deriveInactivityTreeState(state, '2026-08-11')
    expect(shown.creatureState).toBe('nibbling')
    expect(shown.leafCount).toBe(state.leafCount)
    expect(shown.glowLevel).toBeLessThan(state.glowLevel)
    expect(shown).toMatchObject({ stage: 3, branchLevel: 4, fruitCount: 2, completedPieces: ['piece_1'] })
    expect(state.leafCount).toBe(16)
  })

  it('hides the nibbler again when practice resumes today', () => {
    const state = { ...createInitialTreeState(), creatureState: 'nibbling' as const, lastPracticeDate: '2026-08-12' }
    expect(deriveInactivityTreeState(state, '2026-08-12').creatureState).toBe('hidden')
  })
})
