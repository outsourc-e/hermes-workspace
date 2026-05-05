export type CharacterArchetypeId =
  | 'player-adventurer'
  | 'oracle-scholar'
  | 'forge-blacksmith'
  | 'guard-knight'
  | 'merchant-villager'
  | 'villager-common'

export type CharacterAnimationClip =
  | 'idle'
  | 'walk'
  | 'run'
  | 'talk'
  | 'inspect'
  | 'use'

export type CharacterArchetype = {
  id: CharacterArchetypeId
  label: string
  zone: 'agora' | 'oracle' | 'forge' | 'grove' | 'arena' | 'training-grounds'
  role: 'player' | 'npc'
  modelPath: string
  defaultScale: number
  paletteHint: string
  notes: string
}

export const CHARACTER_ANIMATION_PRIORITY: CharacterAnimationClip[] = [
  'idle',
  'walk',
  'run',
  'talk',
  'inspect',
  'use',
]

export const HERMESWORLD_CHARACTER_ARCHETYPES: CharacterArchetype[] = [
  {
    id: 'player-adventurer',
    label: 'Player Adventurer',
    zone: 'agora',
    role: 'player',
    modelPath: '/assets/hermesworld/characters/player-adventurer.glb',
    defaultScale: 1,
    paletteHint: 'Blue-gold hero silhouette with cleaner semi-real proportions.',
    notes: 'First believable player base. Use as camera / control reference for the Agora pass.',
  },
  {
    id: 'oracle-scholar',
    label: 'Oracle Scholar',
    zone: 'oracle',
    role: 'npc',
    modelPath: '/assets/hermesworld/characters/oracle-scholar.glb',
    defaultScale: 1,
    paletteHint: 'Violet-blue robes, mystic trim, readable scholar silhouette.',
    notes: 'High-value NPC for questing, prophecy, and talk/gesture animation validation.',
  },
  {
    id: 'forge-blacksmith',
    label: 'Forge Blacksmith',
    zone: 'forge',
    role: 'npc',
    modelPath: '/assets/hermesworld/characters/forge-blacksmith.glb',
    defaultScale: 1,
    paletteHint: 'Warm leather, metal, ember-orange accents.',
    notes: 'Use for prop interaction, forge-zone silhouette, and stronger grounded body type.',
  },
  {
    id: 'guard-knight',
    label: 'Guard Knight',
    zone: 'agora',
    role: 'npc',
    modelPath: '/assets/hermesworld/characters/guard-knight.glb',
    defaultScale: 1,
    paletteHint: 'Structured armor silhouette with readable guard posture.',
    notes: 'Important for believable town square presence and stronger social framing.',
  },
  {
    id: 'merchant-villager',
    label: 'Merchant Villager',
    zone: 'agora',
    role: 'npc',
    modelPath: '/assets/hermesworld/characters/merchant-villager.glb',
    defaultScale: 1,
    paletteHint: 'Civilian clothing, softer colors, market readability.',
    notes: 'Supports prop clusters and makes Agora feel inhabited rather than staged.',
  },
  {
    id: 'villager-common',
    label: 'Common Villager',
    zone: 'training-grounds',
    role: 'npc',
    modelPath: '/assets/hermesworld/characters/villager-common.glb',
    defaultScale: 1,
    paletteHint: 'Simple but believable peasant/traveler look.',
    notes: 'Cheap repeatable baseline for believable crowd fill before deeper variety.',
  },
]

export const HERMESWORLD_CHARACTER_PIPELINE_NOTES = {
  sourcePriority: ['Ready Player Me', 'Mixamo', 'custom GLB cleanup'],
  immediateSprint: 'Agora believable',
  firstZoneGoal: 'Replace placeholder/toy-like figures with semi-real fantasy humans in Agora first.',
  performanceRules: [
    'Prefer GLB with compressed textures.',
    'Cap material count aggressively.',
    'Reuse rigs and animation clips across archetypes.',
    'Avoid shipping many unique characters before the first 4-6 feel real.',
  ],
} as const
