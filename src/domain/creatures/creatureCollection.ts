import { CREATURE_CATALOG, isCreatureId, standardCreatureId, type CreatureId } from './creatureCatalog'

export const LEAVES_PER_CREATURE = 5
export const FIRST_CREATURE_LEAF_COUNT = 30
export const VISIBLE_CREATURE_LIMIT = 2
export type CreatureSlot = 'left' | 'right'
export type OwnedCreature = {
  creatureId: CreatureId
  unlockedAt: string
  newlyUnlocked: boolean
  atHome: boolean
  visibleSlotId: CreatureSlot | null
}
export type CreatureCollection = {
  baselinePermanentLeafCount: number
  ownedCreatures: OwnedCreature[]
  // Old variant rewards still consume their milestones after species are merged.
  legacyDuplicateUnlocks?: number
}
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

export function createCreatureCollection(currentPermanentLeafCount = 0): CreatureCollection {
  if (!isCount(currentPermanentLeafCount)) throw new Error('Invalid creature leaf baseline.')
  const baselinePermanentLeafCount = currentPermanentLeafCount >= FIRST_CREATURE_LEAF_COUNT ? currentPermanentLeafCount : 0
  return { baselinePermanentLeafCount, ownedCreatures: [] }
}

// Only the first pending arrival takes a slot. Other arrivals wait until it is
// acknowledged. A new arrival may send an already-acknowledged visitor home.
export function arrangeCreatureVisits(collection: CreatureCollection): CreatureCollection {
  const arrival = collection.ownedCreatures.find((owned) => owned.newlyUnlocked)
  const slots: CreatureSlot[] = arrival ? ['right'] : ['left', 'right']
  return { ...collection, ownedCreatures: collection.ownedCreatures.map((owned) => {
    if (owned.newlyUnlocked) return { ...owned, atHome: false, visibleSlotId: owned === arrival ? 'left' : null }
    if (owned.atHome) return { ...owned, visibleSlotId: null }
    const slot = slots.shift()
    return { ...owned, atHome: !slot, visibleSlotId: slot ?? null }
  }) }
}

export function isCreatureCollection(value: unknown): value is CreatureCollection {
  if (!value || typeof value !== 'object') return false
  const collection = value as CreatureCollection
  if (!isCount(collection.baselinePermanentLeafCount) || !Array.isArray(collection.ownedCreatures) ||
    (collection.legacyDuplicateUnlocks !== undefined && !isCount(collection.legacyDuplicateUnlocks))) return false
  const ids = new Set<string>()
  const slots = new Set<string>()
  let visibleArrivals = 0
  return collection.ownedCreatures.every((owned) => {
    if (!owned || !isCreatureId(owned.creatureId) || ids.has(owned.creatureId) ||
      typeof owned.newlyUnlocked !== 'boolean' || typeof owned.atHome !== 'boolean' ||
      typeof owned.unlockedAt !== 'string' || !Number.isFinite(Date.parse(owned.unlockedAt)) ||
      ![null, 'left', 'right'].includes(owned.visibleSlotId) ||
      (owned.atHome && (owned.newlyUnlocked || owned.visibleSlotId !== null)) ||
      (!owned.atHome && !owned.newlyUnlocked && owned.visibleSlotId === null)) return false
    if (owned.visibleSlotId !== null) {
      if (slots.has(owned.visibleSlotId)) return false
      slots.add(owned.visibleSlotId)
      if (owned.newlyUnlocked && ++visibleArrivals > 1) return false
    }
    ids.add(owned.creatureId)
    return true
  }) && (!collection.ownedCreatures.some((owned) => owned.newlyUnlocked) || visibleArrivals === 1)
}

// Called only at save boundaries. Invalid data is rejected by the existing
// backup validator; modern collections are preserved exactly, without rerolls.
export function migrateCreatureCollection(value: unknown): unknown {
  if (isCreatureCollection(value)) return value
  if (!value || typeof value !== 'object') return value
  const old = value as { baselinePermanentLeafCount: number; ownedCreatures: Array<Record<string, unknown>> }
  if (!isCount(old.baselinePermanentLeafCount) || !Array.isArray(old.ownedCreatures)) return value
  const oldIds = new Set<string>()
  const ownedCreatures: OwnedCreature[] = []
  for (const owned of old.ownedCreatures) {
    if (!owned || typeof owned.creatureId !== 'string' || oldIds.has(owned.creatureId) ||
      typeof owned.seen !== 'boolean' || typeof owned.unlockedAt !== 'string' ||
      !Number.isFinite(Date.parse(owned.unlockedAt)) || 'newlyUnlocked' in owned || 'atHome' in owned) return value
    const creatureId = standardCreatureId(owned.creatureId)
    if (!creatureId) return value
    oldIds.add(owned.creatureId)
    const existing = ownedCreatures.find((item) => item.creatureId === creatureId)
    if (existing) {
      existing.newlyUnlocked ||= !owned.seen
      existing.atHome = !existing.newlyUnlocked
      if (owned.unlockedAt < existing.unlockedAt) existing.unlockedAt = owned.unlockedAt
    } else ownedCreatures.push({ creatureId, unlockedAt: owned.unlockedAt, newlyUnlocked: !owned.seen, atHome: owned.seen, visibleSlotId: null })
  }
  const duplicates = old.ownedCreatures.length - ownedCreatures.length
  return arrangeCreatureVisits({
    baselinePermanentLeafCount: old.baselinePermanentLeafCount, ownedCreatures,
    ...(duplicates > 0 ? { legacyDuplicateUnlocks: duplicates } : {}),
  })
}

export function selectCreatureProgress(collection: CreatureCollection, currentPermanentLeafCount: number) {
  if (!isCount(currentPermanentLeafCount)) throw new Error('Invalid permanent leaf count.')
  const newLeaves = Math.max(0, currentPermanentLeafCount - collection.baselinePermanentLeafCount)
  const firstCreatureLeaves = collection.baselinePermanentLeafCount === 0 ? FIRST_CREATURE_LEAF_COUNT : LEAVES_PER_CREATURE
  const earnedCreatureMilestones = Math.max(0, Math.floor((newLeaves - firstCreatureLeaves) / LEAVES_PER_CREATURE) + 1)
  const ownedCount = collection.ownedCreatures.length
  const rewardedCount = ownedCount + (collection.legacyDuplicateUnlocks ?? 0)
  return {
    newLeaves, earnedCreatureMilestones,
    progressLeaves: newLeaves < firstCreatureLeaves ? newLeaves : (newLeaves - firstCreatureLeaves) % LEAVES_PER_CREATURE,
    leavesPerCreature: newLeaves < firstCreatureLeaves ? firstCreatureLeaves : LEAVES_PER_CREATURE,
    ownedCount, collectionComplete: ownedCount === CREATURE_CATALOG.length,
    missingRewards: Math.min(CREATURE_CATALOG.length - ownedCount, Math.max(0, earnedCreatureMilestones - rewardedCount)),
  }
}

export function unlockEarnedCreatures(collection: CreatureCollection, currentPermanentLeafCount: number, unlockedAt: string, random: () => number = Math.random): CreatureCollection {
  const { missingRewards } = selectCreatureProgress(collection, currentPermanentLeafCount)
  if (missingRewards === 0) return collection
  const ownedIds = new Set(collection.ownedCreatures.map((owned) => owned.creatureId))
  const remaining = CREATURE_CATALOG.filter((creature) => !ownedIds.has(creature.id))
  const ownedCreatures = [...collection.ownedCreatures]
  for (let index = 0; index < missingRewards; index += 1) {
    const sample = random()
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error('Creature randomness must be in [0, 1).')
    const [creature] = remaining.splice(Math.floor(sample * remaining.length), 1)
    ownedCreatures.push({ creatureId: creature.id, unlockedAt, newlyUnlocked: true, atHome: false, visibleSlotId: null })
  }
  return arrangeCreatureVisits({ ...collection, ownedCreatures })
}

export const selectVisibleCreatures = (collection: CreatureCollection) =>
  collection.ownedCreatures.filter((owned) => !owned.atHome && owned.visibleSlotId !== null)

export function sendCreatureHome(collection: CreatureCollection, creatureId: CreatureId): CreatureCollection {
  if (!collection.ownedCreatures.some((owned) => owned.creatureId === creatureId)) throw new Error('This friend has not arrived yet.')
  return arrangeCreatureVisits({ ...collection, ownedCreatures: collection.ownedCreatures.map((owned) =>
    owned.creatureId === creatureId ? { ...owned, newlyUnlocked: false, atHome: true, visibleSlotId: null } : owned) })
}

export function showCreatureOnTree(collection: CreatureCollection, creatureId: CreatureId): CreatureCollection {
  const owned = collection.ownedCreatures.find((item) => item.creatureId === creatureId)
  if (!owned) throw new Error('This friend has not arrived yet.')
  if (!owned.atHome) return collection
  if (selectVisibleCreatures(collection).length >= VISIBLE_CREATURE_LIMIT) throw new Error('Two friends are visiting. Send one home first.')
  return arrangeCreatureVisits({ ...collection, ownedCreatures: collection.ownedCreatures.map((item) =>
    item.creatureId === creatureId ? { ...item, atHome: false } : item) })
}
