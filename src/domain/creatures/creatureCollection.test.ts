import { describe, expect, it, vi } from 'vitest'
import { CREATURE_CATALOG } from './creatureCatalog'
import { createCreatureCollection, isCreatureCollection, migrateCreatureCollection, sendCreatureHome, showCreatureOnTree, selectVisibleCreatures, selectCreatureProgress, unlockEarnedCreatures } from './creatureCollection'

const stamp = '2026-10-07T12:00:00.000Z'

describe('magical creature collection', () => {
  it('defines only the six approved standard creatures', () => {
    expect(CREATURE_CATALOG.map((creature) => creature.id)).toEqual([
      'bellwing-bird', 'tempo-squirrel', 'melody-moth', 'chordling', 'humming-bunny', 'rhythm-sprite',
    ])
    expect(new Set(CREATURE_CATALOG.map((creature) => creature.id)).size).toBe(6)
  })
  it.each([1, 2, 3, 4])('%s new leaves keep progress without unlocking', (newLeaves) => {
    const collection = createCreatureCollection(42)
    const random = vi.fn(() => 0)
    expect(unlockEarnedCreatures(collection, 42 + newLeaves, stamp, random)).toBe(collection)
    expect(selectCreatureProgress(collection, 42 + newLeaves)).toMatchObject({ progressLeaves: newLeaves, missingRewards: 0 })
    expect(random).not.toHaveBeenCalled()
  })

  it('unlocks once at five, then once more at ten, preserving earlier rewards', () => {
    const random = vi.fn(() => 0)
    const first = unlockEarnedCreatures(createCreatureCollection(42), 47, stamp, random)
    expect(first.ownedCreatures).toEqual([{ creatureId: CREATURE_CATALOG[0].id, unlockedAt: stamp, newlyUnlocked: true, atHome: false, visibleSlotId: 'left' }])
    const later = '2026-10-12T12:00:00.000Z'
    const second = unlockEarnedCreatures(first, 52, later, random)
    expect(second.ownedCreatures).toEqual([...first.ownedCreatures, { creatureId: CREATURE_CATALOG[1].id, unlockedAt: later, newlyUnlocked: true, atHome: false, visibleSlotId: null }])
    expect(first.ownedCreatures).toHaveLength(1)
    expect(random).toHaveBeenCalledTimes(2)
    expect(unlockEarnedCreatures(second, 52, later, random)).toBe(second)
    expect(random).toHaveBeenCalledTimes(2)
  })

  it.each([0, 16, 20, 25, 27, 29])('starts a tree at %s on the fixed 30/35/40 schedule', (current) => {
    const collection = createCreatureCollection(current)
    expect(collection.baselinePermanentLeafCount).toBe(0)
    expect(unlockEarnedCreatures(collection, current, stamp, () => 0)).toBe(collection)
    for (const count of [30, 35, 40, 45]) {
      const result = unlockEarnedCreatures(collection, count, stamp, () => 0)
      expect(result.ownedCreatures).toHaveLength(1 + (count - 30) / 5)
    }
  })

  it.each([30, 35, 42])('migrates an existing tree at %s without historical rewards', (current) => {
    const collection = createCreatureCollection(current)
    expect(collection.baselinePermanentLeafCount).toBe(current)
    expect(unlockEarnedCreatures(collection, current + 4, stamp, () => 0)).toBe(collection)
    expect(unlockEarnedCreatures(collection, current + 5, stamp, () => 0).ownedCreatures).toHaveLength(1)
    expect(unlockEarnedCreatures(collection, current + 10, stamp, () => 0).ownedCreatures).toHaveLength(2)
  })

  it('uses the injected sample to select from only the remaining pool', () => {
    const first = unlockEarnedCreatures(createCreatureCollection(), 30, stamp, () => 0.999)
    expect(first.ownedCreatures[0].creatureId).toBe(CREATURE_CATALOG[5].id)
    const second = unlockEarnedCreatures(first, 35, stamp, () => 0.999)
    expect(second.ownedCreatures[1].creatureId).toBe(CREATURE_CATALOG[4].id)
  })

  it('creates only missing milestones when multiple are due', () => {
    const first = unlockEarnedCreatures(createCreatureCollection(), 30, stamp, () => 0)
    const result = unlockEarnedCreatures(first, 41, stamp, () => 0)
    expect(result.ownedCreatures).toHaveLength(3)
    expect(selectCreatureProgress(result, 41)).toMatchObject({ progressLeaves: 1, missingRewards: 0 })
  })

  it('collects all six once and gracefully stops for later milestones', () => {
    const random = vi.fn(() => 0.5)
    let collection = createCreatureCollection(42)
    for (let count = 1; count <= 6; count += 1) {
      collection = unlockEarnedCreatures(collection, 42 + count * 5, stamp, random)
      expect(collection.ownedCreatures).toHaveLength(count)
    }
    expect(new Set(collection.ownedCreatures.map((owned) => owned.creatureId)).size).toBe(6)
    expect(selectCreatureProgress(collection, 127)).toMatchObject({ collectionComplete: true, missingRewards: 0 })
    expect(unlockEarnedCreatures(collection, 1000, stamp, random)).toBe(collection)
    expect(random).toHaveBeenCalledTimes(6)
  })

  it('caps a large catch-up at the available catalog and never removes owned creatures', () => {
    const collection = unlockEarnedCreatures(createCreatureCollection(42), 1000, stamp, () => 0)
    expect(collection.ownedCreatures).toHaveLength(6)
    expect(unlockEarnedCreatures(collection, 20, stamp, () => 0)).toBe(collection)
    expect(selectCreatureProgress(collection, 20).newLeaves).toBe(0)
  })

  it('validates persisted IDs, uniqueness, dates, visit flags and baselines', () => {
    const collection = unlockEarnedCreatures(createCreatureCollection(42), 47, stamp, () => 0)
    expect(isCreatureCollection(collection)).toBe(true)
    expect(isCreatureCollection({ ...collection, baselinePermanentLeafCount: -1 })).toBe(false)
    expect(isCreatureCollection({ ...collection, ownedCreatures: [...collection.ownedCreatures, ...collection.ownedCreatures] })).toBe(false)
    for (const invalid of [{ creatureId: 'unknown' }, { unlockedAt: 'invalid' }, { newlyUnlocked: 'yes' }]) {
      expect(isCreatureCollection({ ...collection, ownedCreatures: [{ ...collection.ownedCreatures[0], ...invalid }] })).toBe(false)
    }
  })
})
describe('creature visits and old variant migration', () => {
  it('shows one arrival at a time and promotes the next only after acknowledgement', () => {
    const collection = unlockEarnedCreatures(createCreatureCollection(), 40, stamp, () => 0)
    expect(selectVisibleCreatures(collection).map((owned) => owned.creatureId)).toEqual(['bellwing-bird'])
    const next = sendCreatureHome(collection, 'bellwing-bird')
    expect(next.ownedCreatures[0]).toMatchObject({ newlyUnlocked: false, atHome: true, visibleSlotId: null })
    expect(selectVisibleCreatures(next).map((owned) => owned.creatureId)).toEqual(['tempo-squirrel'])
    expect(isCreatureCollection(next)).toBe(true)
  })

  it('limits visitors to two and never silently acknowledges a new arrival', () => {
    let collection = unlockEarnedCreatures(createCreatureCollection(), 40, stamp, () => 0)
    for (const owned of collection.ownedCreatures) collection = sendCreatureHome(collection, owned.creatureId)
    collection = showCreatureOnTree(collection, 'bellwing-bird')
    collection = showCreatureOnTree(collection, 'tempo-squirrel')
    expect(selectVisibleCreatures(collection)).toHaveLength(2)
    expect(() => showCreatureOnTree(collection, 'melody-moth')).toThrow('Two friends')
    collection = unlockEarnedCreatures(collection, 45, stamp, () => 0)
    expect(selectVisibleCreatures(collection)).toHaveLength(2)
    expect(selectVisibleCreatures(collection).find((owned) => owned.newlyUnlocked)?.creatureId).toBe('chordling')
    expect(collection.ownedCreatures.find((owned) => owned.creatureId === 'tempo-squirrel')?.atHome).toBe(true)
    expect(isCreatureCollection(collection)).toBe(true)
  })

  it('rejects unowned actions and colliding or malformed slots', () => {
    const empty = createCreatureCollection()
    expect(() => showCreatureOnTree(empty, 'chordling')).toThrow('not arrived')
    expect(() => sendCreatureHome(empty, 'chordling')).toThrow('not arrived')
    const collection = unlockEarnedCreatures(empty, 35, stamp, () => 0)
    expect(isCreatureCollection({ ...collection, ownedCreatures: collection.ownedCreatures.map((owned) => ({ ...owned, visibleSlotId: 'left' })) })).toBe(false)
    expect(isCreatureCollection({ ...collection, ownedCreatures: [{ ...collection.ownedCreatures[0], visibleSlotId: 'roof' }] })).toBe(false)
  })

  it('folds old variants into species while preserving dates, pending arrivals and consumed milestones', () => {
    const old = {
      baselinePermanentLeafCount: 0,
      ownedCreatures: [
        { creatureId: 'bellwing-bird-blue-curious', unlockedAt: stamp, seen: true },
        { creatureId: 'bellwing-bird-gold-green-cheerful', unlockedAt: stamp, seen: false },
        { creatureId: 'tempo-squirrel-mint-patient', unlockedAt: stamp, seen: true },
      ],
    }
    const migrated = migrateCreatureCollection(old)
    expect(isCreatureCollection(migrated)).toBe(true)
    if (!isCreatureCollection(migrated)) throw new Error('migration failed')
    expect(migrated).toMatchObject({ legacyDuplicateUnlocks: 1, ownedCreatures: [
      { creatureId: 'bellwing-bird', unlockedAt: stamp, newlyUnlocked: true, atHome: false, visibleSlotId: 'left' },
      { creatureId: 'tempo-squirrel', unlockedAt: stamp, newlyUnlocked: false, atHome: true, visibleSlotId: null },
    ] })
    expect(unlockEarnedCreatures(migrated, 40, stamp, () => 0)).toBe(migrated)
    expect(unlockEarnedCreatures(migrated, 45, stamp, () => 0).ownedCreatures).toHaveLength(3)
    expect(migrateCreatureCollection(migrated)).toBe(migrated)
  })
})
