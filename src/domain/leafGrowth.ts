export type LeafGrowthEvent = { id: string; childId: string; date: string; sourceWater: number; sourceHealth: number; createdAt: string }

export type LeafState = { migrationBaseEarnedLeafCount: number; eventLeafCount: number; earnedLeafCount: number; visibleLeafCount: number }

export const leafGrowthEventId = (childId: string, date: string) => `leaf_growth_${childId}_${date}`

export const createLeafGrowthEvent = ({ childId, date, eligible, water, health, existingEvents, createdAt }: { childId: string; date: string; eligible: boolean; water: number; health: number; existingEvents: LeafGrowthEvent[]; createdAt: string }) => {
  if (!eligible || existingEvents.some((event) => event.childId === childId && event.date === date)) return null
  return { id: leafGrowthEventId(childId, date), childId, date, sourceWater: water, sourceHealth: health, createdAt } satisfies LeafGrowthEvent
}

// Health remains an accepted input for existing callers, but never changes foliage.
// Lifetime earnings continue to drive rewards; only the visible balance loses leaves.
export const selectLeafState = ({ migrationBaseEarnedLeafCount, events, childId, appliedPunishmentLoss = 0 }: { migrationBaseEarnedLeafCount: number; events: LeafGrowthEvent[]; childId: string; health?: number; appliedPunishmentLoss?: number }): LeafState => {
  const eventLeafCount = new Set(events.filter((event) => event.childId === childId).map((event) => event.date)).size
  const earnedLeafCount = Math.max(0, migrationBaseEarnedLeafCount) + eventLeafCount
  return { migrationBaseEarnedLeafCount, eventLeafCount, earnedLeafCount, visibleLeafCount: Math.max(0, earnedLeafCount - appliedPunishmentLoss) }
}
