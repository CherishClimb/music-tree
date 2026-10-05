import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MusicTree } from '../components/tree/MusicTree'
import { createInitialTreeState } from './treeGrowthEngine'
import { createMusicFruitRenderPlan } from './fruitRendering'
import { createLeafRenderPlan } from './leafRendering'
import { TREE_STAGE_BLUEPRINTS, type TreeStage } from './treeStageBlueprints'
import { createDemoState, createLocalRepository, derivePracticeStats, STORAGE_KEY } from '../data/localRepository'

const svgDigest = async (markup: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(markup)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const treeState = { ...createInitialTreeState(), leafCount: 29, flowerCount: 12, glowLevel: 5, fruitCount: 5 }
const render = (stage: TreeStage, fruitCount = 5) => renderToStaticMarkup(<MusicTree treeState={{ ...treeState, stage, fruitCount }} />)

// Captured before the fix: protect every SVG attribute and element outside the removed fruit nodes.
describe('Stage 2 polygon regression', () => {
  it.each([1, 3, 4, 5] as const)('preserves the complete Stage %i SVG', async (stage) => {
    expect(await svgDigest(render(stage))).toMatchSnapshot()
  })

  it('preserves the complete Stage 2 SVG apart from the five fruit polygons', async () => {
    // Zero fruits is the previous layout without the unwanted nodes, not a change to saved progress.
    expect(await svgDigest(render(2, 0))).toMatchSnapshot()
    expect(render(2)).toBe(render(2, 0))
  })

  it.each([1, 5, 6, 100])('does not create fixed or fallback fruit nodes for Stage 2 with %i saved fruits', (fruitCount) => {
    const plan = createMusicFruitRenderPlan(2, fruitCount)
    expect(plan.fruits).toEqual([])
    expect(plan.clusters).toEqual([])
    const markup = render(2, fruitCount)
    expect(markup).not.toContain('class="crystal-fruit')
    expect(markup).not.toContain('music-fruit-cluster')
    expect(markup).not.toContain('data-fruit-count=')
    expect(markup).not.toContain('M0 -10 L10 -3 L7 10 L-7 10 L-10 -3 Z')
    expect(markup).not.toContain('M0 -12 L11 -4 L8 10 L-8 10 L-11 -4 Z')
    const leaves = createLeafRenderPlan(2, 29)
    expect(leaves.leaves).toHaveLength(29)
    expect(leaves.clusters).toHaveLength(0)
    for (const leaf of leaves.leaves) expect(markup).toContain(`data-slot="${leaf.id}"`)
    expect((markup.match(/class="leaf-silhouette"/g) ?? []).length).toBe(29)
    expect((markup.match(/class="crystal-flower"/g) ?? []).length).toBe(TREE_STAGE_BLUEPRINTS[2].availableFlowerSlotIds.length)
  })

  it.each([false, true])('preserves saved counters and completed pieces through reload (legacy baseline: %s)', (legacy) => {
    const state = createDemoState()
    state.treeState = { ...state.treeState, ...treeState, ...derivePracticeStats(state.practiceRecords), stage: 2 }
    state.completedPieces = Array.from({ length: 5 }, (_, index) => ({ ...state.completedPieces[0], id: `saved_piece_${index}` }))
    state.treeState.completedPieces = state.completedPieces.map((piece) => piece.id)
    state.migrationBaseEarnedLeafCount = 29
    const saved: Partial<typeof state> = { ...state }
    if (legacy) {
      delete saved.initialLeafBaselineVersion
      delete saved.migrationBaseEarnedLeafCount
      delete saved.rewardReminderBaselineLeafCount
      delete saved.leafGrowthEvents
    }
    const values = new Map([[STORAGE_KEY, JSON.stringify(saved)]])
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: () => { throw new Error('Progress must not be deleted') } }
    const repository = createLocalRepository(storage)
    const original = repository.exportBackupJson()
    repository.reload()
    const reopened = createLocalRepository(storage)
    for (const repo of [repository, reopened]) {
      expect(repo.getLoadWarning()).toBeNull()
      expect(repo.exportBackupJson()).toBe(original)
      expect(repo.getTreeState()).toMatchObject({ stage: 2, leafCount: 29, flowerCount: 12, glowLevel: 5, fruitCount: 5 })
      expect(repo.getCompletedPieces()).toEqual(state.completedPieces)
      expect(repo.getPracticeRecords()).toEqual(expect.arrayContaining(state.practiceRecords))
      const markup = renderToStaticMarkup(<MusicTree treeState={repo.getTreeState()} />)
      expect(markup).not.toContain('class="crystal-fruit')
      expect((markup.match(/class="leaf-silhouette"/g) ?? []).length).toBe(29)
    }
    expect([...values.keys()]).toEqual([STORAGE_KEY])
  })
})
