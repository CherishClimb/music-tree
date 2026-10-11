import { calculateLeafPunishment, calculateLeafPunishmentLoss, type LeafPunishmentPracticeRecord, type ScheduledLeafPunishment } from '../domain/leafPunishment'
import { isCalendarDate, localCalendarDate } from '../domain/localCalendarDate'
import type { LeafGrowthEvent } from '../domain/leafGrowth'
import type { VacationPeriod } from '../domain/vacation'

export type LeafPunishmentRevision = {
  id: string
  revision: number
  active: boolean
  appliedLoss: number
  reconciledAt: string
}

export type PersistedLeafPenalty = ScheduledLeafPunishment & {
  // Immutable cap assessed when this block is first discovered. Never debt.
  assessedLoss: number
  assessedAt: string
  revisions: LeafPunishmentRevision[]
}

export type LeafPunishmentLedger = {
  version: 1
  childId: string
  activatedAt: string
  startDate: string
  timeZone: string
  openingEarnedLeafCount: number
  openingAwardDates: string[]
  evaluatedThrough: string | null
  events: PersistedLeafPenalty[]
}

export const shiftPunishmentDate = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
const latestRevision = (event: PersistedLeafPenalty) => event.revisions[event.revisions.length - 1]
export const appliedLeafPunishmentLoss = (ledger: LeafPunishmentLedger | null | undefined) =>
  ledger?.events.reduce((sum, event) => sum + latestRevision(event).appliedLoss, 0) ?? 0

export class LeafPunishmentDataError extends Error {}

/** Fail closed rather than replacing an invalid activation/ledger with defaults. */
export function validateLeafPunishmentLedger(value: unknown, childId: string, earnedLeaves: number): void {
  if (value === null || value === undefined) return
  const fail = (): never => { throw new LeafPunishmentDataError('Invalid leaf punishment ledger. The saved snapshot has been kept.') }
  const object = (item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)
  const count = (item: unknown): item is number => Number.isSafeInteger(item) && (item as number) >= 0
  const stamp = (item: unknown): item is string => typeof item === 'string' && Number.isFinite(Date.parse(item))
  if (!object(value) || value.version !== 1 || value.childId !== childId || !stamp(value.activatedAt) ||
    !isCalendarDate(value.startDate) || typeof value.timeZone !== 'string' || !count(value.openingEarnedLeafCount) ||
    !Array.isArray(value.openingAwardDates) || !value.openingAwardDates.every(isCalendarDate) ||
    new Set(value.openingAwardDates).size !== value.openingAwardDates.length ||
    value.openingEarnedLeafCount < value.openingAwardDates.length || value.openingEarnedLeafCount > earnedLeaves ||
    (value.evaluatedThrough !== null && (!isCalendarDate(value.evaluatedThrough) || value.evaluatedThrough < value.startDate)) || !Array.isArray(value.events)) fail()
  const ledger = value as LeafPunishmentLedger
  try {
    if (ledger.startDate !== shiftPunishmentDate(localCalendarDate(ledger.activatedAt, ledger.timeZone), 1)) fail()
  } catch { fail() }
  const ids = new Set<string>()
  for (const event of ledger.events) {
    if (!object(event) || event.ruleVersion !== 1 || event.childId !== childId || event.startDate !== ledger.startDate ||
      !isCalendarDate(event.date) || !Array.isArray(event.missedDates) || event.missedDates.length !== 3 ||
      !event.missedDates.every(isCalendarDate) || event.missedDates[0] < ledger.startDate ||
      event.missedDates[0] >= event.missedDates[1] || event.missedDates[1] >= event.missedDates[2] ||
      event.date !== event.missedDates[2] || !ledger.evaluatedThrough || event.date > ledger.evaluatedThrough ||
      event.id !== `leaf_punishment_v1_${encodeURIComponent(childId)}_${ledger.startDate}_${event.missedDates.join('_')}` ||
      ids.has(event.id) || event.scheduledLoss !== 5 || !count(event.assessedLoss) || event.assessedLoss > 5 ||
      !stamp(event.assessedAt) || !Array.isArray(event.revisions) || !event.revisions.length) fail()
    ids.add(event.id)
    event.revisions.forEach((revision, index) => {
      if (!object(revision) || revision.revision !== index + 1 || revision.id !== `${event.id}:revision:${index + 1}` ||
        typeof revision.active !== 'boolean' || !count(revision.appliedLoss) || revision.appliedLoss > event.assessedLoss ||
        (!revision.active && revision.appliedLoss !== 0) || !stamp(revision.reconciledAt) ||
        (index === 0 && (!revision.active || revision.appliedLoss !== event.assessedLoss))) fail()
    })
  }
  if (appliedLeafPunishmentLoss(ledger) > earnedLeaves) fail()
}

/** Full projection from corrected evidence, with append-only per-event revisions.
 * A later earning cannot raise an existing block's original assessed cap.
 */
export function reconcileLeafPunishmentLedger({ ledger, currentDate, reconciledAt, practiceRecords, vacationPeriods, leafGrowthEvents }: {
  ledger: LeafPunishmentLedger
  currentDate: string
  reconciledAt: string
  practiceRecords: readonly LeafPunishmentPracticeRecord[]
  vacationPeriods: readonly VacationPeriod[]
  leafGrowthEvents: readonly LeafGrowthEvent[]
}): LeafPunishmentLedger {
  const completedThrough = shiftPunishmentDate(currentDate, -1)
  if (ledger.evaluatedThrough && completedThrough < ledger.evaluatedThrough) throw new Error('The local date moved backwards. Retry leaf reconciliation after the saved evaluation date.')
  const schedule = calculateLeafPunishment({ childId: ledger.childId, startDate: ledger.startDate, currentDate, practiceRecords, vacationPeriods })
  const openingDates = new Set(ledger.openingAwardDates)
  const earnedOn = new Map<string, string>()
  for (const event of leafGrowthEvents) {
    if (event.childId !== ledger.childId || openingDates.has(event.date)) continue
    if (!isCalendarDate(event.date)) throw new LeafPunishmentDataError('A leaf award has an invalid activity date.')
    // Award audit time prevents a newly backdated earning funding an old loss.
    const date = [event.date, localCalendarDate(event.createdAt, ledger.timeZone)].sort()[1]
    const previous = earnedOn.get(event.date)
    if (!previous || date < previous) earnedOn.set(event.date, date)
  }
  const existing = new Map(ledger.events.map((event) => [event.id, event]))
  const desired = new Map<string, { active: boolean; appliedLoss: number }>()
  const added: PersistedLeafPenalty[] = []
  let spent = 0
  for (const penalty of schedule.penalties) {
    const available = Math.max(0, ledger.openingEarnedLeafCount + [...earnedOn.values()].filter((date) => date <= penalty.date).length - spent)
    const previous = existing.get(penalty.id)
    const appliedLoss = Math.min(previous?.assessedLoss ?? 5, calculateLeafPunishmentLoss(available).actualLoss)
    spent += appliedLoss
    desired.set(penalty.id, { active: true, appliedLoss })
    if (!previous) added.push({ ...penalty, assessedLoss: appliedLoss, assessedAt: reconciledAt, revisions: [{ id: `${penalty.id}:revision:1`, revision: 1, active: true, appliedLoss, reconciledAt }] })
  }
  const events = ledger.events.map((event) => {
    const target = desired.get(event.id) ?? { active: false, appliedLoss: 0 }
    const previous = latestRevision(event)
    if (previous.active === target.active && previous.appliedLoss === target.appliedLoss) return event
    const revision = previous.revision + 1
    return { ...event, revisions: [...event.revisions, { id: `${event.id}:revision:${revision}`, revision, ...target, reconciledAt }] }
  }).concat(added)
  return { ...ledger, evaluatedThrough: completedThrough >= ledger.startDate ? completedThrough : null, events }
}
