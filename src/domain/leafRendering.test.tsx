import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TreeLeaves } from '../components/tree/TreeLeaves'
import { MusicTree } from '../components/tree/MusicTree'
import { createInitialTreeState } from './treeGrowthEngine'
import { REWARD_FRUIT_SLOTS } from './parentReward'
import { selectLeafState } from './leafGrowth'
import { createLeafRenderPlan } from './leafRendering'
import { TREE_FRUIT_SLOTS } from './treeStageBlueprints'

const identity = (plan: ReturnType<typeof createLeafRenderPlan>) => ({
  leaves: plan.leaves.map(({ id, x, y, branchId }) => ({ id, x, y, branchId })),
  clusters: plan.clusters.map(({ id, x, y, branchId, representedLeafCount }) => ({ id, x, y, branchId, representedLeafCount })),
})

describe('unlimited deterministic leaf rendering', () => {
  it('uses stable fixed slots below and at fixed capacity', () => {
    const capacity = createLeafRenderPlan(5, 10_000).fixedSlotCapacity
    const below = createLeafRenderPlan(5, capacity - 1)
    const at = createLeafRenderPlan(5, capacity)
    expect(below.representedLeafCount).toBe(capacity - 1)
    expect(at.representedLeafCount).toBe(capacity)
    expect(at.clusters).toHaveLength(0)
    expect(at.leaves.slice(0, below.leaves.length).map((leaf) => leaf.id)).toEqual(below.leaves.map((leaf) => leaf.id))
  })

  it('adds deterministic generated leaves immediately above capacity', () => {
    const capacity = createLeafRenderPlan(5, 10_000).fixedSlotCapacity
    const plan = createLeafRenderPlan(5, capacity + 7)
    expect(plan.representedLeafCount).toBe(capacity + 7)
    expect(plan.leaves.slice(capacity).map((leaf) => leaf.id)).toEqual([
      'generated_leaf_s5_0001', 'generated_leaf_s5_0002', 'generated_leaf_s5_0003', 'generated_leaf_s5_0004', 'generated_leaf_s5_0005', 'generated_leaf_s5_0006', 'generated_leaf_s5_0007',
    ])
  })

  it('uses bounded clusters while preserving a significantly larger exact count', () => {
    const plan = createLeafRenderPlan(5, 1_000)
    expect(plan.representedLeafCount).toBe(1_000)
    expect(plan.clusters).toHaveLength(8)
    expect(plan.leaves.length).toBe(plan.fixedSlotCapacity + 24)
    expect(plan.clusters.every((cluster) => cluster.representedLeafCount > 1)).toBe(true)
  })

  it('produces identical ids and coordinates after refresh or import-equivalent replay', () => {
    expect(identity(createLeafRenderPlan(4, 347))).toEqual(identity(createLeafRenderPlan(4, 347)))
  })

  it('keeps all overflow visuals away from Music Fruit and Parent Reward Fruit centers', () => {
    const plan = createLeafRenderPlan(5, 1_000)
    const overflow = [...plan.leaves.filter((leaf) => leaf.generated), ...plan.clusters]
    for (const leaf of overflow) {
      for (const fruit of [...TREE_FRUIT_SLOTS, ...REWARD_FRUIT_SLOTS]) expect(Math.hypot(leaf.x - fruit.x, leaf.y - fruit.y)).toBeGreaterThanOrEqual(31)
    }
  })

  it('keeps earned totals across stage plans and renders only health-visible leaves', () => {
    const earned = 175
    expect(createLeafRenderPlan(2, earned).representedLeafCount).toBe(earned)
    expect(createLeafRenderPlan(5, earned).representedLeafCount).toBe(earned)
    const leafState = selectLeafState({ migrationBaseEarnedLeafCount: earned, events: [], childId: 'child-1', health: 40 })
    const plan = createLeafRenderPlan(5, leafState.visibleLeafCount)
    expect(plan.representedLeafCount).toBe(leafState.visibleLeafCount)
    expect(leafState.earnedLeafCount).toBe(earned)
  })

  it('marks overflow as non-interactive while keeping leaf totals in SVG output', () => {
    const markup = renderToStaticMarkup(<svg><TreeLeaves stage={5} leafCount={1_000} /></svg>)
    expect(markup).toContain('leaf-overflow-cluster')
    expect(markup).toContain('data-leaf-count=')
    expect(markup).not.toContain('role="button"')
  })
})

describe('SVG gradient rendering context', () => {
  it('preserves native gradient casing and renders fragments inside SVG without React errors', () => {
    // A spy without a mock implementation still forwards every diagnostic.
    const errors = vi.spyOn(console, 'error')
    try {
      const fragment = renderToStaticMarkup(<svg><TreeLeaves stage={2} leafCount={52} /></svg>)
      const tree = renderToStaticMarkup(<MusicTree treeState={{ ...createInitialTreeState(), stage: 2, leafCount: 52 }} />)
      for (const markup of [fragment, tree]) {
        expect(markup).toMatch(/^<svg[ >]/)
        expect(markup).toContain('<defs><linearGradient')
        expect(markup).toContain('<stop offset="0%"')
        expect(markup).toContain('</linearGradient>')
        expect(markup).toMatch(/<\/svg>$/)
      }
      expect(errors).not.toHaveBeenCalled()
    } finally { errors.mockRestore() }
  })
})
