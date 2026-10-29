import { isCreatureId, type CreatureId } from './creatureCatalog'

export type CreaturePosition = { x: number; y: number }
export type CreaturePositions = Partial<Record<CreatureId, CreaturePosition>>

export const isCreaturePosition = (value: unknown): value is CreaturePosition => {
  if (!value || typeof value !== 'object') return false
  const position = value as CreaturePosition
  return Number.isFinite(position.x) && position.x >= 0 && position.x <= 1 &&
    Number.isFinite(position.y) && position.y >= 0 && position.y <= 1
}

export function parseCreaturePositions(value: unknown): CreaturePositions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([id, position]) => isCreatureId(id) && isCreaturePosition(position))) as CreaturePositions
}
