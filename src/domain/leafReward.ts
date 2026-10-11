import type { LeafGrowthEvent } from './leafGrowth'
import type { PracticeRecord } from './types'

export type LeafRewardConfig = {
  targetMinutes: number
  rewardOnTarget: boolean
  rewardOnFocusedPractice: boolean
  rewardOnBreakthrough: boolean
}

export const DEFAULT_LEAF_REWARD_CONFIG: Readonly<LeafRewardConfig> = Object.freeze({
  targetMinutes: 20,
  rewardOnTarget: true,
  rewardOnFocusedPractice: true,
  rewardOnBreakthrough: true,
})

export class LeafRewardConfigDataError extends Error {}

export type LeafRewardReason = 'target' | 'focusedPractice' | 'breakthrough'

export type LeafRewardEligibility = {
  eligible: boolean
  qualifyingReasons: LeafRewardReason[]
}

// Missing settings (including individual fields) use defaults. Invalid supplied
// values are rejected, never coerced into different parent choices.
export function normalizeLeafRewardConfig(value: unknown): LeafRewardConfig {
  if (value === undefined) return { ...DEFAULT_LEAF_REWARD_CONFIG }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LeafRewardConfigDataError('Leaf reward settings must be an object.')
  }
  const config = { ...DEFAULT_LEAF_REWARD_CONFIG, ...value }
  if (!Number.isInteger(config.targetMinutes) || config.targetMinutes < 1 || config.targetMinutes > 180) {
    throw new LeafRewardConfigDataError('Leaf reward target must be a whole number of minutes from 1 to 180.')
  }
  if (typeof config.rewardOnTarget !== 'boolean' || typeof config.rewardOnFocusedPractice !== 'boolean' || typeof config.rewardOnBreakthrough !== 'boolean') {
    throw new LeafRewardConfigDataError('Leaf reward conditions must be enabled or disabled.')
  }
  return {
    targetMinutes: config.targetMinutes,
    rewardOnTarget: config.rewardOnTarget,
    rewardOnFocusedPractice: config.rewardOnFocusedPractice,
    rewardOnBreakthrough: config.rewardOnBreakthrough,
  }
}

type LeafPracticeRecord = Pick<PracticeRecord, 'childId' | 'date' | 'minutes' | 'quality' | 'improvement'>

// Eligibility only: the existing automatic award path remains responsible for
// creating events. Activity dates, never audit timestamps, define a practice day.
export function evaluateLeafRewardEligibility({ records, childId, date, config = DEFAULT_LEAF_REWARD_CONFIG, existingEvents = [] }: {
  records: readonly LeafPracticeRecord[]
  childId: string
  date: string
  config?: LeafRewardConfig
  existingEvents?: readonly Pick<LeafGrowthEvent, 'childId' | 'date'>[]
}): LeafRewardEligibility {
  const settings = normalizeLeafRewardConfig(config)
  if (existingEvents.some((event) => event.childId === childId && event.date === date)) {
    return { eligible: false, qualifyingReasons: [] }
  }

  const daily = records.filter((record) => record.childId === childId && record.date === date &&
    Number.isFinite(record.minutes) && record.minutes >= 0)
  const totalMinutes = daily.reduce((sum, record) => sum + record.minutes, 0)
  const focusedMinutes = daily.reduce((sum, record) => sum + (record.quality === 'focused' ? record.minutes : 0), 0)
  const qualifyingReasons: LeafRewardReason[] = []
  if (settings.rewardOnTarget && totalMinutes >= settings.targetMinutes) qualifyingReasons.push('target')
  if (settings.rewardOnFocusedPractice && totalMinutes * 5 >= settings.targetMinutes * 3 && focusedMinutes * 2 > totalMinutes) qualifyingReasons.push('focusedPractice')
  if (settings.rewardOnBreakthrough && totalMinutes > 0 && daily.some((record) => record.improvement === 'breakthrough')) qualifyingReasons.push('breakthrough')
  return { eligible: qualifyingReasons.length > 0, qualifyingReasons }
}
