import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LEAF_REWARD_CONFIG,
  evaluateLeafRewardEligibility,
  normalizeLeafRewardConfig,
  type LeafRewardConfig,
} from './leafReward'

const date = '2026-10-09'
const childId = 'child_001'
const record = (minutes: number, quality: 'difficult' | 'normal' | 'focused' = 'normal', improvement: 'none' | 'small' | 'clear' | 'breakthrough' = 'none') => ({
  childId, date, minutes, quality, improvement,
})
const config = (values: Partial<LeafRewardConfig> = {}): LeafRewardConfig => ({
  ...DEFAULT_LEAF_REWARD_CONFIG,
  ...values,
})
const evaluate = (records: ReturnType<typeof record>[], settings = config(), existingEvents: Array<{ childId: string; date: string }> = []) =>
  evaluateLeafRewardEligibility({ records, childId, date, config: settings, existingEvents })

describe('leaf reward configuration', () => {
  it('uses all enabled 20-minute defaults and preserves explicit disabled choices', () => {
    expect(normalizeLeafRewardConfig(undefined)).toEqual(DEFAULT_LEAF_REWARD_CONFIG)
    expect(normalizeLeafRewardConfig({ rewardOnTarget: false })).toEqual({
      ...DEFAULT_LEAF_REWARD_CONFIG,
      rewardOnTarget: false,
    })
  })

  it.each([1, 180])('accepts the target boundary %i', (targetMinutes) => {
    expect(normalizeLeafRewardConfig({ ...DEFAULT_LEAF_REWARD_CONFIG, targetMinutes }).targetMinutes).toBe(targetMinutes)
  })

  it.each([0, 181, 20.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid target %s', (targetMinutes) => {
    expect(() => normalizeLeafRewardConfig({ ...DEFAULT_LEAF_REWARD_CONFIG, targetMinutes })).toThrow(/whole number/i)
  })

  it.each([null, [], { ...DEFAULT_LEAF_REWARD_CONFIG, rewardOnTarget: 'yes' }])('rejects malformed settings', (value) => {
    expect(() => normalizeLeafRewardConfig(value)).toThrow()
  })
})

describe('leaf reward eligibility', () => {
  it('supports the default goal and a custom goal', () => {
    expect(evaluate([record(19)])).toEqual({ eligible: false, qualifyingReasons: [] })
    expect(evaluate([record(20)])).toEqual({ eligible: true, qualifyingReasons: ['target'] })
    expect(evaluate([record(30)], config({ targetMinutes: 30 }))).toEqual({ eligible: true, qualifyingReasons: ['target'] })
  })

  it('honors each disabled condition', () => {
    expect(evaluate([record(20)], config({ rewardOnTarget: false, rewardOnFocusedPractice: false, rewardOnBreakthrough: false }))).toEqual({ eligible: false, qualifyingReasons: [] })
    expect(evaluate([record(12, 'focused')], config({ rewardOnFocusedPractice: false }))).toEqual({ eligible: false, qualifyingReasons: [] })
    expect(evaluate([record(1, 'normal', 'breakthrough')], config({ rewardOnBreakthrough: false }))).toEqual({ eligible: false, qualifyingReasons: [] })
  })

  it('uses OR logic and returns every enabled qualifying reason', () => {
    expect(evaluate([record(20, 'focused', 'breakthrough')])).toEqual({
      eligible: true,
      qualifyingReasons: ['target', 'focusedPractice', 'breakthrough'],
    })
  })

  it('accepts the exact 60% threshold only with a strict focused-minute majority', () => {
    expect(evaluate([record(7, 'focused'), record(5)])).toEqual({ eligible: true, qualifyingReasons: ['focusedPractice'] })
    expect(evaluate([record(6, 'focused'), record(6)])).toEqual({ eligible: false, qualifyingReasons: [] })
    expect(evaluate([record(7, 'focused'), record(4)])).toEqual({ eligible: false, qualifyingReasons: [] })
  })

  it('aggregates multiple sessions for totals and focused minutes', () => {
    expect(evaluate([record(4, 'focused'), record(5, 'normal'), record(5, 'focused')])).toEqual({
      eligible: true,
      qualifyingReasons: ['focusedPractice'],
    })
  })

  it('requires positive daily duration for a breakthrough', () => {
    expect(evaluate([record(1, 'normal', 'breakthrough')])).toEqual({ eligible: true, qualifyingReasons: ['breakthrough'] })
    expect(evaluate([record(0, 'normal', 'breakthrough')])).toEqual({ eligible: false, qualifyingReasons: [] })
  })

  it('is ineligible when that child and activity date already have a leaf event', () => {
    expect(evaluate([record(20)], config(), [{ childId, date }])).toEqual({ eligible: false, qualifyingReasons: [] })
    expect(evaluate([record(20)], config(), [{ childId: 'other', date }]).eligible).toBe(true)
  })

  it('ignores records belonging to another child or activity date', () => {
    expect(evaluateLeafRewardEligibility({
      records: [{ ...record(20), childId: 'other' }, { ...record(20), date: '2026-10-08' }],
      childId,
      date,
    })).toEqual({ eligible: false, qualifyingReasons: [] })
  })
})
