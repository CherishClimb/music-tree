import { describe, expect, it } from 'vitest'
import { createInitialTreeState, calculatePracticeGrowth } from './treeGrowthEngine'
import type { DailyGrowthChange, PracticeRecord, QualityLevel } from './types'

const makePractice = (
  minutes: number,
  quality: QualityLevel,
  achievements: string[] = ['assigned_section'],
  improvement: PracticeRecord['improvement'] = 'small',
): PracticeRecord => ({
  id: `practice-${minutes}`,
  childId: 'child_001',
  date: '2026-08-02',
  minutes,
  quality,
  achievements,
  improvement,
  customAchievement: '',
  parentNote: '',
  createdAt: '2026-08-02T12:00:00.000Z',
  updatedAt: '2026-08-02T12:00:00.000Z',
})

describe('practice growth engine', () => {
  it('gives no water for zero minutes', () => {
    const next = calculatePracticeGrowth(createInitialTreeState(), makePractice(0, 'normal'))
    expect(next.updatedState.waterBalance).toBe(0)
    expect(next.changes.some((change: DailyGrowthChange) => change.type === 'water')).toBe(false)
  })

  it('gives the expected water for 10 minutes', () => {
    const next = calculatePracticeGrowth(createInitialTreeState(), makePractice(10, 'normal'))
    expect(next.updatedState.waterBalance).toBeGreaterThanOrEqual(2)
    expect(next.updatedState.waterBalance).toBeLessThanOrEqual(3)
  })

  it('caps daily water at the normal maximum for 30 minutes', () => {
    const next = calculatePracticeGrowth(createInitialTreeState(), makePractice(30, 'focused'))
    expect(next.updatedState.waterBalance).toBe(3)
  })

  it('does not exceed the daily reward cap at 60 minutes', () => {
    const next = calculatePracticeGrowth(createInitialTreeState(), makePractice(60, 'focused'))
    expect(next.updatedState.waterBalance).toBe(3)
  })

  it('does not advance the permanent stage from practice minutes', () => {
    const next = calculatePracticeGrowth(createInitialTreeState(), makePractice(120, 'focused'))
    expect(next.updatedState.stage).toBe(1)
  })

  it('does not add permanent Root from Parent practice alone', () => {
    const initial = createInitialTreeState()
    const next = calculatePracticeGrowth(initial, makePractice(15, 'focused'))
    expect(next.updatedState.rootStrength).toBe(initial.rootStrength)
  })

  it('does not create permanent leaves directly from achievements', () => {
    const next = calculatePracticeGrowth(createInitialTreeState(), makePractice(20, 'focused', ['assigned_section', 'rhythm_improved']))
    expect(next.updatedState.leafCount).toBe(16)
  })

  it('creates a flower for clear improvement', () => {
    const next = calculatePracticeGrowth(createInitialTreeState(), makePractice(20, 'focused', ['assigned_section'], 'clear'))
    expect(next.updatedState.flowerCount).toBeGreaterThan(2)
  })
})
