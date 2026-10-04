import {
  TREE_BRANCHES,
  TREE_FLOWER_SLOTS,
  TREE_STAGE_BLUEPRINTS,
  type TreeStage,
} from '../../domain/treeStageBlueprints'
import { createMusicFruitRenderPlan } from '../../domain/fruitRendering'

type TreeStructureProps = {
  stage: TreeStage
  flowerCount: number
  fruitCount: number
  crownTransform: string
  onFlowerSelect?: (slotId: string) => void
  onFruitSelect?: (slotId: string) => void
}

export function TreeStructure({ stage, flowerCount, fruitCount, crownTransform, onFlowerSelect, onFruitSelect }: TreeStructureProps) {
  const blueprint = TREE_STAGE_BLUEPRINTS[stage]
  const branchIds = new Set(blueprint.branchIds)
  const branches = TREE_BRANCHES.filter((branch) => branchIds.has(branch.id) && branch.visible !== false)
  const flowers = TREE_FLOWER_SLOTS.filter((slot) => blueprint.availableFlowerSlotIds.includes(slot.id)).slice(0, Math.max(0, flowerCount))
  const fruitPlan = createMusicFruitRenderPlan(stage, fruitCount)

  return (
    <g className="tree-structure">
      <g className="tree-roots">
        {blueprint.rootPaths.map((path) => (
          <path key={path} d={path} className="tree-root" />
        ))}
      </g>

      <path d={blueprint.trunkPath} className="tree-trunk-silhouette" />
      <path d={blueprint.trunkHighlightPath} className="tree-trunk-highlight" />
      {stage === 5 && <g className="stage-five-trunk-magic" aria-hidden="true">
        <path className="mature-wood-glow" d="M191 389 C198 355 194 326 199 296 C204 268 200 237 203 208" />
        <path className="mature-wood-engraving" d="M187 350 C178 337 181 322 193 315 C204 308 211 296 207 283 M207 359 C218 344 218 328 208 320" />
        <path className="root-rune" d="M166 404 Q184 394 199 405 Q216 394 233 404" />
        <circle cx="199" cy="316" r="3" />
      </g>}

      <g transform={crownTransform}>
      <g className="tree-branches">
        {branches.map((branch) => (
          <g key={branch.id} data-branch={branch.id}>
            <path d={branch.silhouettePath} className="tree-branch-organic" />
            <path d={branch.pathDefinition} className="tree-branch-highlight" strokeWidth={Math.max(1.5, branch.width * 0.22)} />
          </g>
        ))}
      </g>

      {stage === 5 && <g className="stage-five-signature" aria-hidden="true">
        <ellipse className="final-crown-halo" cx="200" cy="118" rx="78" ry="63" />
        <path className="final-melody-ribbon" d="M137 132 C163 112 181 141 205 119 C227 99 244 118 265 102" />
        <g className="crystal-music-crown" transform="translate(200 66)">
          <path d="M-20 7 L-14 -9 L-2 2 L8 -13 L15 3 L23 -6 L19 12 Q0 18 -20 7 Z" />
          <circle cx="-14" cy="-9" r="2.8" /><circle cx="8" cy="-13" r="3.2" /><circle cx="23" cy="-6" r="2.8" />
          <path className="crown-note" d="M-3 7 V-5 L8 -8 V3 M-3 7 Q-8 4 -8 9 Q-7 13 -3 10 M8 3 Q3 1 3 6 Q4 10 8 7" />
        </g>
        <g className="memory-star-fruit" transform="translate(200 112)">
          <path className="hero-stem" d="M0 -13 C-1 -20 3 -25 7 -29" />
          <path className="hero-fruit" d="M0 -12 L5 -4 L14 -2 L8 5 L9 14 L0 10 L-9 14 L-8 5 L-14 -2 L-5 -4 Z" />
          <path className="hero-note" d="M-2 6 V-5 L6 -7 V2 M-2 6 Q-7 4 -7 8 Q-6 11 -2 9 M6 2 Q2 0 2 4 Q3 7 6 5" />
        </g>
        {[
          { x: 135, y: 185, note: '♪' },
          { x: 268, y: 174, note: '♫' },
          { x: 235, y: 230, note: '♪' },
        ].map((charm) => <g key={`${charm.x}-${charm.y}`} className="memory-charm" transform={`translate(${charm.x} ${charm.y})`}>
          <path d="M0 -11 V-3" /><path className="charm-crystal" d="M0 -4 L7 3 L0 11 L-7 3 Z" /><text x="-4" y="7">{charm.note}</text>
        </g>)}
        <g className="branch-tip-sparks">
          <circle cx="141" cy="67" r="3" /><circle cx="269" cy="59" r="3" /><circle cx="63" cy="177" r="2.6" /><circle cx="336" cy="168" r="2.6" />
        </g>
      </g>}

      <g className="tree-flowers">
        {flowers.map((flower) => (
          <g key={flower.id} transform={`translate(${flower.x} ${flower.y})`} className={onFlowerSelect ? 'crystal-flower interactive-tree-item' : 'crystal-flower'} role={onFlowerSelect ? 'button' : undefined} tabIndex={onFlowerSelect ? 0 : undefined} aria-label={onFlowerSelect ? 'Crystal flower' : undefined} onClick={onFlowerSelect ? () => onFlowerSelect(flower.id) : undefined} onKeyDown={onFlowerSelect ? (event) => { if (event.key === 'Enter' || event.key === ' ') onFlowerSelect(flower.id) } : undefined}>
            {[0, 72, 144, 216, 288].map((rotation) => (
              <path key={rotation} d="M0 -3 L-6 -14 L0 -20 L6 -14 Z" transform={`rotate(${rotation})`} />
            ))}
            <circle r="4.5" />
          </g>
        ))}
      </g>

      <g className="tree-fruits">
        {fruitPlan.fruits.map((fruit) => (
          <g key={fruit.id} transform={`translate(${fruit.x} ${fruit.y})`} className={onFruitSelect ? 'crystal-fruit interactive-tree-item' : 'crystal-fruit'} role={onFruitSelect ? 'button' : undefined} tabIndex={onFruitSelect ? 0 : undefined} aria-label={onFruitSelect ? 'Completed-piece fruit' : undefined} onClick={onFruitSelect ? () => onFruitSelect(fruit.id) : undefined} onKeyDown={onFruitSelect ? (event) => { if (event.key === 'Enter' || event.key === ' ') onFruitSelect(fruit.id) } : undefined}>
            {onFruitSelect && <circle className="fruit-hit-target" r="22" aria-hidden="true" />}
            <path d="M0 -10 L10 -3 L7 10 L-7 10 L-10 -3 Z" />
          </g>
        ))}
        {fruitPlan.clusters.map((cluster) => (
          <g key={cluster.id} transform={`translate(${cluster.x} ${cluster.y})`} className={onFruitSelect ? 'crystal-fruit music-fruit-cluster interactive-tree-item' : 'crystal-fruit music-fruit-cluster'} role={onFruitSelect ? 'button' : undefined} tabIndex={onFruitSelect ? 0 : undefined} aria-label={onFruitSelect ? `${cluster.representedFruitCount} completed-piece fruits` : undefined} data-fruit-count={cluster.representedFruitCount} onClick={onFruitSelect ? () => onFruitSelect(cluster.id) : undefined} onKeyDown={onFruitSelect ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onFruitSelect(cluster.id) } } : undefined}>
            {onFruitSelect && <circle className="fruit-hit-target" r="22" aria-hidden="true" />}
            <path d="M0 -12 L11 -4 L8 10 L-8 10 L-11 -4 Z" />
            {cluster.representedFruitCount > 1 && <>
              <circle className="music-fruit-count-disc" cx="8" cy="-9" r="8" />
              <text className="music-fruit-count" x="8" y="-6" textAnchor="middle">{cluster.representedFruitCount}</text>
            </>}
          </g>
        ))}
      </g>
      </g>
    </g>
  )
}
