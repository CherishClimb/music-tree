import { describe, expect, it } from 'vitest'
import { TREE_BRANCHES, TREE_LEAF_SLOTS, TREE_STAGE_BLUEPRINTS, type TreeStage } from './treeStageBlueprints'

describe('tree stage structural growth', () => {
  it('keeps Stage 1 young, readable, and smaller than later stages', () => {
    const stageOne = TREE_STAGE_BLUEPRINTS[1]
    expect(stageOne.structureScale).toEqual({ x: 0.72, y: 0.72 })
    expect(stageOne.branchIds).toHaveLength(8)
    expect(stageOne.availableLeafSlotIds).toHaveLength(14)
    expect(stageOne.availableFlowerSlotIds).toHaveLength(2)
    expect(stageOne.availableFruitSlotIds).toHaveLength(0)
    expect(stageOne.availableCreatureSlotIds).toHaveLength(0)
    expect(stageOne.structureScale.x).toBeLessThan(TREE_STAGE_BLUEPRINTS[2].structureScale.x)
    expect(stageOne.structureScale.y).toBeLessThan(TREE_STAGE_BLUEPRINTS[2].structureScale.y)
  })

  it('gives Stage 1 three main branches and five connected secondary branches', () => {
    const stageOneIds = new Set(TREE_STAGE_BLUEPRINTS[1].branchIds)
    const stageOneBranches = TREE_BRANCHES.filter((branch) => stageOneIds.has(branch.id))
    expect(stageOneBranches.filter((branch) => branch.parentBranchId === 'trunk')).toHaveLength(3)
    expect(stageOneBranches.filter((branch) => branch.parentBranchId !== 'trunk')).toHaveLength(5)
    stageOneBranches.filter((branch) => branch.parentBranchId !== 'trunk').forEach((branch) => {
      expect(stageOneIds.has(branch.parentBranchId)).toBe(true)
    })
  })

  it('attaches every Stage 1 leaf slot to an available stable branch', () => {
    const stageOne = TREE_STAGE_BLUEPRINTS[1]
    const branchIds = new Set(stageOne.branchIds)
    const slots = TREE_LEAF_SLOTS.filter((slot) => stageOne.availableLeafSlotIds.includes(slot.id))
    expect(new Set(slots.map((slot) => slot.id)).size).toBe(14)
    slots.forEach((slot) => {
      expect(branchIds.has(slot.branchId)).toBe(true)
      expect(Number.isFinite(slot.attachmentX)).toBe(true)
      expect(Number.isFinite(slot.attachmentY)).toBe(true)
    })
  })

  it('increases structural and decorative capacity across stages', () => {
    for (let stage = 2; stage <= 5; stage += 1) {
      const previous = TREE_STAGE_BLUEPRINTS[(stage - 1) as 1 | 2 | 3 | 4]
      const current = TREE_STAGE_BLUEPRINTS[stage as 2 | 3 | 4 | 5]
      expect(current.branchIds.length).toBeGreaterThanOrEqual(previous.branchIds.length)
      expect(current.availableLeafSlotIds.length).toBeGreaterThanOrEqual(previous.availableLeafSlotIds.length)
      expect(current.availableFlowerSlotIds.length).toBeGreaterThanOrEqual(previous.availableFlowerSlotIds.length)
      expect(current.availableFruitSlotIds.length).toBeGreaterThanOrEqual(previous.availableFruitSlotIds.length)
    }
  })

  it.each([
    [1, 3, 5, 14, 2, 0, 0],
    [2, 4, 9, 24, 4, 0, 0],
    [3, 6, 14, 36, 6, 3, 1],
    [4, 8, 20, 52, 9, 6, 3],
    [5, 10, 27, 64, 12, 10, 5],
  ] as const)('implements Stage %i target capacities', (stage, main, secondary, leaves, flowers, fruits, creatures) => {
    const blueprint = TREE_STAGE_BLUEPRINTS[stage]
    const ids = new Set(blueprint.branchIds)
    const branches = TREE_BRANCHES.filter((branch) => ids.has(branch.id))
    expect(branches.filter((branch) => branch.parentBranchId === 'trunk')).toHaveLength(main)
    expect(branches.filter((branch) => branch.parentBranchId !== 'trunk')).toHaveLength(secondary)
    expect(blueprint.availableLeafSlotIds).toHaveLength(leaves)
    expect(blueprint.availableFlowerSlotIds).toHaveLength(flowers)
    expect(blueprint.availableFruitSlotIds).toHaveLength(fruits)
    expect(blueprint.availableCreatureSlotIds).toHaveLength(creatures)
  })

  it('keeps every introduced branch and slot available in all later stages', () => {
    for (let stage = 2; stage <= 5; stage += 1) {
      const previous = TREE_STAGE_BLUEPRINTS[(stage - 1) as TreeStage]
      const current = TREE_STAGE_BLUEPRINTS[stage as TreeStage]
      previous.branchIds.forEach((id) => expect(current.branchIds).toContain(id))
      previous.availableLeafSlotIds.forEach((id) => expect(current.availableLeafSlotIds).toContain(id))
      previous.availableFlowerSlotIds.forEach((id) => expect(current.availableFlowerSlotIds).toContain(id))
      previous.availableFruitSlotIds.forEach((id) => expect(current.availableFruitSlotIds).toContain(id))
      previous.availableCreatureSlotIds.forEach((id) => expect(current.availableCreatureSlotIds).toContain(id))
    }
  })

  it('does not unlock a child branch before its parent branch', () => {
    const branches = new Map(TREE_BRANCHES.map((branch) => [branch.id, branch]))
    TREE_BRANCHES.filter((branch) => branch.parentBranchId !== 'trunk').forEach((branch) => {
      const parent = branches.get(branch.parentBranchId)
      expect(parent).toBeDefined()
      expect(parent!.unlockedAtStage).toBeLessThanOrEqual(branch.unlockedAtStage)
    })
  })

  it('renders every production branch as an organic filled silhouette', () => {
    TREE_BRANCHES.forEach((branch) => {
      expect(branch.silhouettePath).toMatch(/^M.+Z$/)
    })
  })
})
