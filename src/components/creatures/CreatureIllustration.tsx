import bird from '../../../artifacts/creatures/current/bellwing-bird.svg'
import squirrel from '../../../artifacts/creatures/current/tempo-squirrel.svg'
import moth from '../../../artifacts/creatures/current/melody-moth.svg'
import chordling from '../../../artifacts/creatures/current/chordling.svg'
import bunny from '../../../artifacts/creatures/current/humming-bunny.svg'
import sprite from '../../../artifacts/creatures/current/rhythm-sprite.svg'
import { CREATURE_CATALOG, type CreatureId } from '../../domain/creatures/creatureCatalog'

const assets: Record<CreatureId, string> = {
  'bellwing-bird': bird, 'tempo-squirrel': squirrel, 'melody-moth': moth,
  chordling, 'humming-bunny': bunny, 'rhythm-sprite': sprite,
}
export function CreatureIllustration({ creatureId, idle = false, decorative = false }: { creatureId: CreatureId; idle?: boolean; decorative?: boolean }) {
  const creature = CREATURE_CATALOG.find((item) => item.id === creatureId)!
  return <img className={`creature-illustration creature-${creatureId}${idle ? ' creature-idle' : ''}`} src={assets[creatureId]} alt={decorative ? '' : creature.displayName} width="200" height="200" draggable={false} />
}
