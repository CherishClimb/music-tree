import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MusicTree } from '../components/tree/MusicTree'
import { TreeLeaves } from '../components/tree/TreeLeaves'
import { TreeStructure } from '../components/tree/TreeStructure'
import { createLeafRenderPlan } from '../domain/leafRendering'
import { createMusicFruitRenderPlan } from '../domain/fruitRendering'
import { TREE_LEAF_SLOTS, TREE_STAGE_BLUEPRINTS } from '../domain/treeStageBlueprints'
import { createDemoState, createLocalRepository, derivePracticeStats, STORAGE_KEY } from './localRepository'

const badgeCounts = (markup: string, className: string) =>
  [...markup.matchAll(new RegExp(`<text[^>]*class="${className}"[^>]*>(\\d+)</text>`, 'g'))].map((match) => Number(match[1]))

describe('tree overflow content', () => {
  it.each([1, 2, 3, 4, 5] as const)('renders singleton overflow as artwork at Stage %i and retains real group counts', (stage) => {
    const capacity = createLeafRenderPlan(stage, 0).fixedSlotCapacity
    const fruitCapacity = createMusicFruitRenderPlan(stage, 0).fixedSlotCapacity
    for (const overflow of [0, 1, 4, 8, 9, 15, 16, 100]) {
      const leafCount = capacity + 24 + overflow
      const leafPlan = createLeafRenderPlan(stage, leafCount)
      const leaves = renderToStaticMarkup(<svg><TreeLeaves stage={stage} leafCount={leafCount} /></svg>)
      expect(badgeCounts(leaves, 'leaf-cluster-count')).toEqual(leafPlan.clusters.filter((cluster) => cluster.representedLeafCount > 1).map((cluster) => cluster.representedLeafCount))
      expect((leaves.match(/class="leaf-silhouette"/g) ?? []).length).toBe(leafPlan.leaves.length + leafPlan.clusters.filter((cluster) => cluster.representedLeafCount === 1).length)
      expect(leafPlan.representedLeafCount).toBe(leafCount)

      const fruitCount = fruitCapacity + overflow
      const fruitPlan = createMusicFruitRenderPlan(stage, fruitCount)
      const fruits = renderToStaticMarkup(<svg><TreeStructure stage={stage} flowerCount={0} fruitCount={fruitCount} crownTransform="" onFruitSelect={() => {}} /></svg>)
      expect(badgeCounts(fruits, 'music-fruit-count')).toEqual(fruitPlan.clusters.filter((cluster) => cluster.representedFruitCount > 1).map((cluster) => cluster.representedFruitCount))
      expect((fruits.match(/class="fruit-hit-target"/g) ?? []).length).toBe(fruitPlan.fruits.length + fruitPlan.clusters.length)
      expect(fruitPlan.representedFruitCount).toBe(fruitCount)
    }
  })

  it('renders every authored Stage 2 leaf with its configured identity and artwork', () => {
    const configured = TREE_LEAF_SLOTS.filter((slot) => TREE_STAGE_BLUEPRINTS[2].availableLeafSlotIds.includes(slot.id))
    const plan = createLeafRenderPlan(2, 52)
    expect(plan.leaves.slice(0, configured.length)).toEqual(configured.map((slot) => ({ ...slot, generated: false, representedLeafCount: 1 })))
    const markup = renderToStaticMarkup(<svg><TreeLeaves stage={2} leafCount={52} /></svg>)
    for (const slot of configured) {
      expect(markup).toContain(`data-slot="${slot.id}" data-branch="${slot.branchId}"`)
      expect(markup).toContain(`translate(${slot.x} ${slot.y}) rotate(${slot.rotation})`)
      expect(markup).toContain(`id="leaf-gradient-${slot.id}"`)
    }
    expect(badgeCounts(markup, 'leaf-cluster-count')).toEqual([])
    expect((markup.match(/class="leaf-silhouette"/g) ?? []).length).toBe(52)
  })

  it.each([false, true])('preserves progress and Stage 2 artwork after saved-state reload (legacy: %s)', (legacy) => {
    const state = createDemoState()
    state.treeState.stage = 2
    state.treeState.leafCount = 52
    state.treeState.fruitCount = 5
    state.migrationBaseEarnedLeafCount = 52
    state.completedPieces = Array.from({ length: 5 }, (_, index) => ({ ...state.completedPieces[0], id: `piece_${index}`, pieceName: `Saved piece ${index}` }))
    state.treeState.completedPieces = state.completedPieces.map((piece) => piece.id)
    Object.assign(state.treeState, derivePracticeStats(state.practiceRecords))
    const saved = { ...state } as Partial<typeof state>
    if (legacy) {
      delete saved.leafGrowthEvents
      delete saved.migrationBaseEarnedLeafCount
      delete saved.rewardReminderBaselineLeafCount
    }
    const values = new Map([[STORAGE_KEY, JSON.stringify(saved)]])
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { throw new Error(`Unexpected progress deletion: ${key}`) } }
    const repository = createLocalRepository(storage)
    const before = repository.exportBackupJson()
    const render = (repo: ReturnType<typeof createLocalRepository>) => renderToStaticMarkup(<MusicTree treeState={{ ...repo.getTreeState(), leafCount: repo.getLeafState('2026-08-02').visibleLeafCount }} />)
    const markup = render(repository)
    expect(markup).toContain('Music tree stage 2')
    expect(badgeCounts(markup, 'leaf-cluster-count')).toEqual([])
    expect(badgeCounts(markup, 'music-fruit-count')).toEqual([])
    expect(repository.getLeafState('2026-08-02').earnedLeafCount).toBe(52)
    expect(repository.getPracticeRecords()).toEqual([...state.practiceRecords].sort((left, right) => right.date.localeCompare(left.date)))
    expect(repository.getCompletedPieces()).toEqual(state.completedPieces)
    repository.reload()
    const reopened = createLocalRepository(storage)
    for (const repo of [repository, reopened]) {
      expect(repo.getLoadWarning()).toBeNull()
      expect(repo.exportBackupJson()).toBe(before)
      expect(render(repo)).toBe(markup)
    }
    expect([...values.keys()]).toEqual([STORAGE_KEY])
    expect(JSON.parse(values.get(STORAGE_KEY)!)).toEqual(JSON.parse(before))
  })
})
