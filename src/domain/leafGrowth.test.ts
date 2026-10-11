import { describe, expect, it } from 'vitest'
import { createLeafGrowthEvent, leafGrowthEventId, selectLeafState, type LeafGrowthEvent } from './leafGrowth'
import { ensureCrossedRewardReminders } from './rewardReminder'

const event = (date: string, childId = 'child'): LeafGrowthEvent => ({ id: leafGrowthEventId(childId, date), childId, date, sourceWater: 3, sourceHealth: 100, createdAt: `${date}T12:00:00.000Z` })

describe('permanent LeafGrowthEvents', () => {
  it('requires eligibility while retaining actual Water as metadata', () => {
    expect(createLeafGrowthEvent({ childId: 'child', date: '2026-01-01', eligible: false, water: 3, health: 100, existingEvents: [], createdAt: 'now' })).toBeNull()
    expect(createLeafGrowthEvent({ childId: 'child', date: '2026-01-01', eligible: true, water: 2, health: 100, existingEvents: [], createdAt: 'now' }))
      .toMatchObject({ sourceWater: 2 })
  })

  it.each([0, 1, 2, 3])('Health 59 does not block an eligible event with Water %s', (water) => {
    const result = createLeafGrowthEvent({ childId: 'child', date: '2026-01-01', eligible: true, water, health: 59, existingEvents: [], createdAt: 'now' })
    expect(result).toMatchObject({ sourceWater: water, sourceHealth: 59 })
    expect(createLeafGrowthEvent({ childId: 'child', date: '2026-01-01', eligible: true, water, health: 59, existingEvents: [result!], createdAt: 'later' })).toBeNull()
  })

  it.each([0, 59, 60, 84, 99, 100])('earns a leaf at Health %s and records Health only as source metadata', (health) => {
    expect(createLeafGrowthEvent({ childId: 'child', date: '2026-01-01', eligible: true, water: 3, health, existingEvents: [], createdAt: 'now' }))
      .toMatchObject({ id: 'leaf_growth_child_2026-01-01', sourceWater: 3, sourceHealth: health })
  })

  it.each([0, 40, 59, 60, 61, 80, 100])('shows all earned leaves without punishment at Health %s', (health) => {
    expect(selectLeafState({ migrationBaseEarnedLeafCount: 10, events: [event('2026-01-01')], childId: 'child', health }))
      .toMatchObject({ earnedLeafCount: 11, visibleLeafCount: 11 })
  })

  it('allows maximum one stable event per child/date and another date may earn one', () => {
    const existing = [event('2026-01-01')]
    expect(createLeafGrowthEvent({ childId: 'child', date: '2026-01-01', eligible: true, water: 3, health: 100, existingEvents: existing, createdAt: 'later' })).toBeNull()
    expect(createLeafGrowthEvent({ childId: 'child', date: '2026-01-02', eligible: true, water: 3, health: 100, existingEvents: existing, createdAt: 'later' })?.id).toBe('leaf_growth_child_2026-01-02')
  })

  it('keeps earned count independent of Stage slot capacity', () => {
    const events = Array.from({ length: 80 }, (_, index) => event(`2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}`))
    expect(selectLeafState({ migrationBaseEarnedLeafCount: 24, events, childId: 'child', health: 100 }).earnedLeafCount).toBe(104)
  })

  it.each([0, 59, 60, 100])('subtracts only actual punishment loss at Health %s', (health) => {
    expect(selectLeafState({ migrationBaseEarnedLeafCount: 10, events: [], childId: 'child', health, appliedPunishmentLoss: 5 }))
      .toMatchObject({ earnedLeafCount: 10, visibleLeafCount: 5 })
  })

  it('clamps the remaining balance at zero without a minimum visible floor', () => {
    expect(selectLeafState({ migrationBaseEarnedLeafCount: 2, events: [], childId: 'child', health: 0, appliedPunishmentLoss: 2 })).toMatchObject({ earnedLeafCount: 2, visibleLeafCount: 0 })
    expect(selectLeafState({ migrationBaseEarnedLeafCount: 4, events: [], childId: 'child', health: 100, appliedPunishmentLoss: 5 }).visibleLeafCount).toBe(0)
  })

  it('creates every crossed milestone once, including a 4 to 6 jump', () => {
    const reminders = ensureCrossedRewardReminders([], 'child', 4, 6, 'now')
    expect(reminders.map((item) => item.leafMilestone)).toEqual([5])
    expect(ensureCrossedRewardReminders(reminders, 'child', 4, 6, 'later')).toEqual(reminders)
    expect(ensureCrossedRewardReminders(reminders, 'child', 6, 11, 'later').map((item) => item.leafMilestone)).toEqual([5, 10])
  })

  it('does not flood reminders below a legacy migration baseline', () => expect(ensureCrossedRewardReminders([], 'child', 24, 25, 'now', 28)).toEqual([]))
})
