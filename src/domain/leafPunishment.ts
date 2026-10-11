import { isCalendarDate } from './localCalendarDate'
import type { QualityLevel } from './types'
import { isVacationDay, type VacationPeriod } from './vacation'

export const LEAF_PUNISHMENT_INTERVAL = 3
export const LEAF_PUNISHMENT_LOSS = 5

export type LeafPunishmentPracticeRecord = {
  childId: string
  date: string
  minutes: number
  quality?: QualityLevel | null
}

export type LeafPunishmentInput = {
  childId: string
  // First eligible local calendar date, inclusive. The caller must supply a
  // prospective boundary; use the next date to exclude a partial activation day.
  startDate: string
  // Explicit local calendar date, not a timestamp or an implicit system clock.
  currentDate: string
  practiceRecords: readonly LeafPunishmentPracticeRecord[]
  vacationPeriods?: readonly VacationPeriod[]
}

export type ScheduledLeafPunishment = {
  id: string
  ruleVersion: 1
  childId: string
  startDate: string
  // The third missed date. This event is eligible only AFTER that date ends.
  date: string
  missedDates: [string, string, string]
  scheduledLoss: typeof LEAF_PUNISHMENT_LOSS
}

export type LeafPunishmentSchedule = {
  penalties: ScheduledLeafPunishment[]
  // Completed missed dates since the last qualifying practice. Today's known
  // practice resets this counter without removing earlier scheduled penalties.
  consecutiveMissedDays: number
  totalScheduledLoss: number
}

// UTC is used only to step date labels, matching the existing holiday helpers.
// Actual local days may contain 23 or 25 hours; elapsed clock hours are irrelevant.
const nextDate = (date: string) => new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)

/** Recalculate the entire prospective schedule; never apply it as an incremental debit. */
export function calculateLeafPunishment(input: LeafPunishmentInput): LeafPunishmentSchedule {
  const { childId, startDate, currentDate, practiceRecords, vacationPeriods = [] } = input
  if (!isCalendarDate(startDate) || !isCalendarDate(currentDate)) throw new Error('Leaf punishment requires valid local calendar dates.')

  // Preserve the existing per-record >=5 minutes plus quality definition.
  // Multiple short records do not combine into a qualifying practice day.
  const practiceDates = new Set(practiceRecords
    .filter((record) => record.childId === childId && record.minutes >= 5 && Boolean(record.quality))
    .map((record) => record.date))
  const holidays = vacationPeriods.filter((period) => period.childId === childId)
  const penalties: ScheduledLeafPunishment[] = []
  let consecutiveMissedDays = 0
  let blockDates: string[] = []

  for (let date = startDate; date < currentDate; date = nextDate(date)) {
    // Practice resets the streak even during an optional holiday practice day.
    if (practiceDates.has(date)) {
      consecutiveMissedDays = 0
      blockDates = []
    } else if (!isVacationDay(date, holidays)) {
      consecutiveMissedDays += 1
      blockDates.push(date)
      if (blockDates.length === LEAF_PUNISHMENT_INTERVAL) {
        const missedDates: ScheduledLeafPunishment['missedDates'] = [blockDates[0], blockDates[1], blockDates[2]]
        penalties.push({
          // Include every contributing date: corrections that change a block
          // replace its identity, while unchanged blocks keep theirs on replay.
          id: `leaf_punishment_v1_${encodeURIComponent(childId)}_${startDate}_${missedDates.join('_')}`,
          ruleVersion: 1,
          childId,
          startDate,
          date,
          missedDates,
          scheduledLoss: LEAF_PUNISHMENT_LOSS,
        })
        blockDates = []
      }
    }
  }

  if (currentDate >= startDate && practiceDates.has(currentDate)) consecutiveMissedDays = 0
  return { penalties, consecutiveMissedDays, totalScheduledLoss: penalties.length * LEAF_PUNISHMENT_LOSS }
}

export type LeafPunishmentLoss = { scheduledLoss: number; actualLoss: number; remainingLeafCount: number }

/** Cap ONE reconciled penalty against the balance available when it is applied.
 * The unapplied remainder is not debt. Later persistence must reconcile event
 * identities before using this helper; a schedule alone cannot reconstruct
 * historical balances or decide how to reverse a corrected penalty.
 */
export function calculateLeafPunishmentLoss(availableLeafCount: number): LeafPunishmentLoss {
  if (!Number.isSafeInteger(availableLeafCount) || availableLeafCount < 0) throw new Error('Available leaves must be a non-negative safe integer.')
  const actualLoss = Math.min(LEAF_PUNISHMENT_LOSS, availableLeafCount)
  return { scheduledLoss: LEAF_PUNISHMENT_LOSS, actualLoss, remainingLeafCount: availableLeafCount - actualLoss }
}
