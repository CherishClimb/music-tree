import { TREE_FRUIT_SLOTS, TREE_STAGE_BLUEPRINTS, type TreeOrnamentSlot, type TreeStage } from './treeStageBlueprints'

export type MusicFruitCluster = TreeOrnamentSlot & { representedFruitCount: number }
export type MusicFruitRenderPlan = { fruits: TreeOrnamentSlot[]; clusters: MusicFruitCluster[]; fixedSlotCapacity: number; representedFruitCount: number }

const MAX_MUSIC_FRUIT_CLUSTERS = 6

export function createMusicFruitRenderPlan(stage: TreeStage, requestedFruitCount: number): MusicFruitRenderPlan {
  const fruitCount = Math.max(0, Math.floor(requestedFruitCount))
  const blueprint = TREE_STAGE_BLUEPRINTS[stage]
  const fixedSlots = TREE_FRUIT_SLOTS.filter((slot) => blueprint.availableFruitSlotIds.includes(slot.id))
  const fruits = fixedSlots.slice(0, fruitCount)
  const overflowCount = blueprint.allowFruitOverflow === false ? 0 : Math.max(0, fruitCount - fruits.length)
  const clusterCount = Math.min(overflowCount, MAX_MUSIC_FRUIT_CLUSTERS)
  const clusterAnchors = fixedSlots.length > 0 ? fixedSlots : TREE_FRUIT_SLOTS.slice(0, 3)
  const clusters: MusicFruitCluster[] = []
  for (let index = 0; index < clusterCount; index += 1) {
    const anchor = clusterAnchors[(index * 3 + stage) % clusterAnchors.length]
    const base = Math.floor(overflowCount / clusterCount)
    clusters.push({ id: `music_fruit_cluster_s${stage}_${String(index + 1).padStart(2, '0')}`, branchId: anchor.branchId, x: Math.max(42, Math.min(358, anchor.x + (index % 2 === 0 ? -24 : 24))), y: Math.max(72, Math.min(310, anchor.y + (index % 3 - 1) * 28)), representedFruitCount: base + (index < overflowCount % clusterCount ? 1 : 0) })
  }
  return { fruits, clusters, fixedSlotCapacity: fixedSlots.length, representedFruitCount: fruits.length + clusters.reduce((sum, cluster) => sum + cluster.representedFruitCount, 0) }
}
