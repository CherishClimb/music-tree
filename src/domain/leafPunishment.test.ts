import { describe, expect, it } from 'vitest'
import { calculateLeafPunishment, calculateLeafPunishmentLoss, type LeafPunishmentInput, type LeafPunishmentPracticeRecord } from './leafPunishment'
import { localCalendarDate } from './localCalendarDate'
import type { VacationPeriod } from './vacation'

const practice = (date: string, overrides: Partial<LeafPunishmentPracticeRecord> = {}): LeafPunishmentPracticeRecord => ({ childId: 'child', date, minutes: 5, quality: 'normal', ...overrides })
const holiday = (startDate: string, endDate: string, overrides: Partial<VacationPeriod> = {}): VacationPeriod => ({ id: 'holiday', childId: 'child', startDate, endDate, createdAt: '2026-01-01T12:00:00Z', ...overrides })
const input = (overrides: Partial<LeafPunishmentInput> = {}): LeafPunishmentInput => ({ childId: 'child', startDate: '2026-01-01', currentDate: '2026-01-10', practiceRecords: [], ...overrides })

describe('prospective leaf punishment schedule', () => {
  it.each([
    ['2026-01-02', 1, []],
    ['2026-01-03', 2, []],
    ['2026-01-04', 3, ['2026-01-03']],
    ['2026-01-07', 6, ['2026-01-03', '2026-01-06']],
    ['2026-01-10', 9, ['2026-01-03', '2026-01-06', '2026-01-09']],
    ['2026-01-13', 12, ['2026-01-03', '2026-01-06', '2026-01-09', '2026-01-12']],
  ])('counts only completed dates through %s', (currentDate, missedDays, dates) => {
    const result = calculateLeafPunishment(input({ currentDate }))
    expect(result.consecutiveMissedDays).toBe(missedDays)
    expect(result.penalties.map((penalty) => penalty.date)).toEqual(dates)
    expect(result.totalScheduledLoss).toBe(dates.length * 5)
    expect(result.penalties.every((penalty) => penalty.scheduledLoss === 5)).toBe(true)
  })

  it('does not carry missed days or practice history across the activation boundary', () => {
    const values = input({ startDate: '2026-01-08', practiceRecords: [practice('2025-01-01')] })
    expect(calculateLeafPunishment(values)).toEqual({ penalties: [], consecutiveMissedDays: 2, totalScheduledLoss: 0 })
    const activatedToday = input({ startDate: '2026-01-10' })
    expect(calculateLeafPunishment(activatedToday).consecutiveMissedDays).toBe(0)
    expect(calculateLeafPunishment(input({ startDate: '2026-01-11' })).penalties).toEqual([])
    expect(calculateLeafPunishment(input({ startDate: '2026-01-08', currentDate: '2026-01-11' })).penalties[0].missedDates)
      .toEqual(['2026-01-08', '2026-01-09', '2026-01-10'])
  })

  it('resets on qualifying practice and retains penalties from earlier completed blocks', () => {
    const result = calculateLeafPunishment(input({ practiceRecords: [practice('2026-01-05')] }))
    expect(result.penalties.map((penalty) => penalty.date)).toEqual(['2026-01-03', '2026-01-08'])
    expect(result.consecutiveMissedDays).toBe(4)
  })

  it.each(['difficult', 'normal', 'focused'] as const)('accepts existing %s quality with five minutes', (quality) => {
    const result = calculateLeafPunishment(input({ currentDate: '2026-01-04', practiceRecords: [practice('2026-01-03', { quality })] }))
    expect(result.penalties).toEqual([])
    expect(result.consecutiveMissedDays).toBe(0)
  })

  it('requires one qualifying record, not aggregated short records or a record without quality', () => {
    const practiceRecords = [practice('2026-01-01', { minutes: 3 }), practice('2026-01-01', { minutes: 3 }), practice('2026-01-02', { quality: undefined }), practice('2026-01-03', { minutes: 0 })]
    expect(calculateLeafPunishment(input({ currentDate: '2026-01-04', practiceRecords })).penalties).toHaveLength(1)
  })

  it('today can reset the counter but cannot cancel yesterday’s completed penalty', () => {
    const result = calculateLeafPunishment(input({ currentDate: '2026-01-04', practiceRecords: [practice('2026-01-04')] }))
    expect(result.penalties.map((penalty) => penalty.date)).toEqual(['2026-01-03'])
    expect(result.consecutiveMissedDays).toBe(0)
  })

  it('ignores future records and evidence belonging to another child', () => {
    const values = input({ practiceRecords: [practice('2026-01-20'), practice('2026-01-03', { childId: 'other' })], vacationPeriods: [holiday('2026-01-01', '2026-01-10', { childId: 'other' })] })
    expect(calculateLeafPunishment(values)).toEqual(calculateLeafPunishment(input()))
  })

  it('pauses across holidays and resumes the same block afterward', () => {
    const values = input({ vacationPeriods: [holiday('2026-01-03', '2026-01-05')] })
    expect(calculateLeafPunishment({ ...values, currentDate: '2026-01-05' }).consecutiveMissedDays).toBe(2)
    const result = calculateLeafPunishment(values)
    expect(result.penalties.map((penalty) => penalty.date)).toEqual(['2026-01-06', '2026-01-09'])
    expect(result.penalties[0].missedDates).toEqual(['2026-01-01', '2026-01-02', '2026-01-06'])
    expect(result.consecutiveMissedDays).toBe(6)
  })

  it('allows optional qualifying practice during a holiday to reset the streak', () => {
    const result = calculateLeafPunishment(input({ vacationPeriods: [holiday('2026-01-03', '2026-01-05')], practiceRecords: [practice('2026-01-04')] }))
    expect(result.penalties.map((penalty) => penalty.date)).toEqual(['2026-01-08'])
    expect(result.consecutiveMissedDays).toBe(4)
  })

  it('counts overlapping holidays once and ignores cancelled holidays', () => {
    const overlapping = [holiday('2026-01-02', '2026-01-04'), holiday('2026-01-03', '2026-01-05', { id: 'overlap' }), holiday('2026-01-06', '2026-01-09', { id: 'cancelled', cancelledAt: '2026-01-01T12:00:00Z' })]
    expect(calculateLeafPunishment(input({ vacationPeriods: overlapping })))
      .toEqual(calculateLeafPunishment(input({ vacationPeriods: [holiday('2026-01-02', '2026-01-05')] })))
    expect(calculateLeafPunishment(input({ vacationPeriods: overlapping })).penalties[0].date).toBe('2026-01-07')
  })

  it('uses the existing early-ending holiday boundary', () => {
    const result = calculateLeafPunishment(input({ vacationPeriods: [holiday('2026-01-02', '2026-01-09', { endedEarlyAt: '2026-01-04T12:00:00Z' })] }))
    expect(result.penalties[0].missedDates).toEqual(['2026-01-01', '2026-01-04', '2026-01-05'])
  })

  it('replays frozen inputs identically regardless of evidence order or duplicate practice dates', () => {
    const practiceRecords = Object.freeze([Object.freeze(practice('2026-01-02')), Object.freeze(practice('2026-01-05'))])
    const vacationPeriods = Object.freeze([Object.freeze(holiday('2026-01-06', '2026-01-07'))])
    const values = Object.freeze(input({ practiceRecords, vacationPeriods }))
    const before = JSON.stringify(values)
    const result = calculateLeafPunishment(values)
    expect(calculateLeafPunishment(values)).toEqual(result)
    expect(calculateLeafPunishment({ ...values, practiceRecords: [...practiceRecords].reverse().concat(practiceRecords[0]) })).toEqual(result)
    expect(JSON.stringify(values)).toBe(before)
  })

  it('gives stable, unique identities to unchanged blocks as time advances', () => {
    const first = calculateLeafPunishment(input({ currentDate: '2026-01-07' }))
    const later = calculateLeafPunishment(input())
    expect(later.penalties.slice(0, 2)).toEqual(first.penalties)
    expect(new Set(later.penalties.map((penalty) => penalty.id)).size).toBe(3)
    expect(first.penalties[0]).toEqual({ id: 'leaf_punishment_v1_child_2026-01-01_2026-01-01_2026-01-02_2026-01-03', ruleVersion: 1, childId: 'child', startDate: '2026-01-01', date: '2026-01-03', missedDates: ['2026-01-01', '2026-01-02', '2026-01-03'], scheduledLoss: 5 })
    expect(calculateLeafPunishment(input({ childId: 'another' })).penalties[0].id).not.toBe(first.penalties[0].id)
  })

  it('replaces the affected schedule when backdated practice is added or corrected', () => {
    const original = calculateLeafPunishment(input())
    const correctedInput = input({ practiceRecords: [practice('2026-01-02')] })
    const corrected = calculateLeafPunishment(correctedInput)
    expect(corrected.penalties.map((penalty) => penalty.date)).toEqual(['2026-01-05', '2026-01-08'])
    expect(corrected.penalties.every((penalty) => !original.penalties.some((old) => old.id === penalty.id))).toBe(true)
    expect(calculateLeafPunishment(correctedInput)).toEqual(corrected)
    expect(calculateLeafPunishment(input({ practiceRecords: [practice('2026-01-02', { minutes: 4 })] }))).toEqual(original)
  })

  it('changes block identities for corrected holiday dates even if the due date is unchanged', () => {
    const before = calculateLeafPunishment(input({ vacationPeriods: [holiday('2026-01-01', '2026-01-01')] }))
    const after = calculateLeafPunishment(input({ vacationPeriods: [holiday('2026-01-02', '2026-01-02')] }))
    expect(before.penalties[0].date).toBe(after.penalties[0].date)
    expect(before.penalties[0].id).not.toBe(after.penalties[0].id)
    expect(before.penalties[1]).toEqual(after.penalties[1])
  })

  it.each(['', '2026-02-30', '2026-01-01T12:00:00Z'])('rejects invalid date-only boundaries: %s', (date) => {
    expect(() => calculateLeafPunishment(input({ startDate: date }))).toThrow(/calendar dates/)
    expect(() => calculateLeafPunishment(input({ currentDate: date }))).toThrow(/calendar dates/)
  })

  it.each([
    ['2026-01-01', '2026-01-03T22:59:59Z', '2026-01-03T23:00:00Z', '2026-01-03'],
    ['2026-03-27', '2026-03-29T21:59:59Z', '2026-03-29T22:00:00Z', '2026-03-29'],
    ['2026-10-23', '2026-10-25T22:59:59Z', '2026-10-25T23:00:00Z', '2026-10-25'],
    ['2026-12-29', '2026-12-31T22:59:59Z', '2026-12-31T23:00:00Z', '2026-12-31'],
    ['2028-02-27', '2028-02-29T22:59:59Z', '2028-02-29T23:00:00Z', '2028-02-29'],
  ])('uses completed local days across midnight/DST from %s', (startDate, beforeMidnight, afterMidnight, dueDate) => {
    const before = calculateLeafPunishment(input({ startDate, currentDate: localCalendarDate(beforeMidnight, 'Europe/Berlin') }))
    const after = calculateLeafPunishment(input({ startDate, currentDate: localCalendarDate(afterMidnight, 'Europe/Berlin') }))
    expect(before.penalties).toEqual([])
    expect(after.penalties.map((penalty) => penalty.date)).toEqual([dueDate])
  })
})

describe('one reconciled leaf loss', () => {
  it.each([[0, 0, 0], [3, 3, 0], [5, 5, 0], [16, 5, 11]])('caps a five-leaf loss against %i available leaves', (available, actualLoss, remainingLeafCount) => {
    expect(calculateLeafPunishmentLoss(available)).toEqual({ scheduledLoss: 5, actualLoss, remainingLeafCount })
  })

  it('schedules all blocks independently of available leaves and caps repeated actual losses', () => {
    const schedule = calculateLeafPunishment(input())
    let balance = 7
    const losses = schedule.penalties.map(() => {
      const loss = calculateLeafPunishmentLoss(balance)
      balance = loss.remainingLeafCount
      return loss.actualLoss
    })
    expect(schedule.totalScheduledLoss).toBe(15)
    expect(losses).toEqual([5, 2, 0])
    expect(balance).toBe(0)
    expect(calculateLeafPunishmentLoss(7)).toEqual(calculateLeafPunishmentLoss(7))
  })

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid leaf balances: %s', (balance) => {
    expect(() => calculateLeafPunishmentLoss(balance)).toThrow(/non-negative safe integer/)
  })
})
