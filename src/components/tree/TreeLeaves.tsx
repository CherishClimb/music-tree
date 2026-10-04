import { createLeafRenderPlan } from '../../domain/leafRendering'
import type { TreeStage } from '../../domain/treeStageBlueprints'
import { MusicLeaf } from './MusicLeaf'

type TreeLeavesProps = {
  stage: TreeStage
  leafCount: number
  onLeafSelect?: (slotId: string) => void
}

export function TreeLeaves({ stage, leafCount, onLeafSelect }: TreeLeavesProps) {
  const plan = createLeafRenderPlan(stage, leafCount)

  return (
    <g className="tree-leaves">
      {plan.leaves.map((slot, index) => (
        <MusicLeaf
          key={slot.id}
          id={slot.id}
          slotId={slot.id}
          branchId={slot.branchId}
          variant={slot.color}
          size={slot.size}
          rotation={slot.rotation}
          x={slot.x}
          y={slot.y}
          attachmentX={slot.attachmentX}
          attachmentY={slot.attachmentY}
          onSelect={plan.clusters.length === 0 && index === plan.leaves.length - 1 ? onLeafSelect : undefined}
        />
      ))}
      {plan.clusters.map((cluster) => (
        <g key={cluster.id} className={`leaf-overflow-cluster leaf-cluster-${cluster.color}`} data-cluster-id={cluster.id} data-branch={cluster.branchId} data-leaf-count={cluster.representedLeafCount}>
          {/* A singleton is still a crystal leaf, not a numbered group. */}
          {cluster.representedLeafCount === 1 ? (
            <MusicLeaf {...cluster} slotId={cluster.id} variant={cluster.color} size="medium" />
          ) : <>
          <path d={`M${cluster.attachmentX} ${cluster.attachmentY} L${cluster.x} ${cluster.y}`} className="leaf-twig" />
          <g transform={`translate(${cluster.x} ${cluster.y}) rotate(${cluster.rotation})`}>
            <ellipse cx="-8" cy="1" rx="8" ry="14" transform="rotate(-38 -8 1)" />
            <ellipse cx="8" cy="1" rx="8" ry="14" transform="rotate(38 8 1)" />
            <ellipse cx="0" cy="-7" rx="8" ry="14" />
            <circle cx="0" cy="4" r="9" className="leaf-cluster-count-disc" />
            <text x="0" y="7" textAnchor="middle" className="leaf-cluster-count">{cluster.representedLeafCount}</text>
          </g>
          </>}
        </g>
      ))}
    </g>
  )
}
