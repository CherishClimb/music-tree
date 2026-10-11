// Phase 1 has one standard creature per species. IDs are permanent save keys.
export const CREATURE_CATALOG = [
  { id: 'bellwing-bird', displayName: 'Bellwing Bird', musicalConcept: 'Pitch', description: 'Little wing bells sing a bright, gentle note.' },
  { id: 'tempo-squirrel', displayName: 'Tempo Squirrel', musicalConcept: 'Tempo', description: 'A curly-tailed friend with a tiny, steady tap.' },
  { id: 'melody-moth', displayName: 'Melody Moth', musicalConcept: 'Melody', description: 'Soft wings trace a tune through the winter air.' },
  { id: 'chordling', displayName: 'Chordling', musicalConcept: 'Harmony', description: 'Three glowing notes sing together as one.' },
  { id: 'humming-bunny', displayName: 'Humming Bunny', musicalConcept: 'Singing', description: 'A quiet hum and a soft musical breath.' },
  { id: 'rhythm-sprite', displayName: 'Rhythm Sprite', musicalConcept: 'Rhythm', description: 'A trail of tiny beats dances through the snow.' },
] as const

export type CreatureId = typeof CREATURE_CATALOG[number]['id']
export type CreatureDefinition = typeof CREATURE_CATALOG[number]
const ids: ReadonlySet<string> = new Set(CREATURE_CATALOG.map((creature) => creature.id))
export const isCreatureId = (value: unknown): value is CreatureId => typeof value === 'string' && ids.has(value)

// Read compatibility only: these variants are no longer offered as rewards.
const legacyVariants: Record<CreatureId, readonly string[]> = {
  'bellwing-bird': ['blue-curious', 'gold-green-cheerful', 'violet-grey-sleepy'],
  'tempo-squirrel': ['amber-bouncy', 'mint-patient', 'coral-daring'],
  'melody-moth': ['lilac-dreamy', 'pearl-gentle', 'teal-playful'],
  chordling: ['rose-friendly', 'indigo-thoughtful', 'honey-joyful'],
  'humming-bunny': ['cream-tender', 'lavender-shy', 'peach-confident'],
  'rhythm-sprite': ['aqua-mischievous', 'silver-focused', 'raspberry-giggly'],
}
export function standardCreatureId(value: unknown): CreatureId | null {
  if (isCreatureId(value)) return value
  for (const creature of CREATURE_CATALOG) {
    if (legacyVariants[creature.id].some((variant) => value === creature.id + '-' + variant)) return creature.id
  }
  return null
}
