/**
 * Hermes Playground RPG data model.
 *
 * Hackathon MVP: data-driven RuneScape/Sims-style progression layered on
 * the GPU-safe Playground world. Later, generated world manifests can append
 * to these registries without changing renderer code.
 */

export type PlaygroundWorldId = 'agora' | 'forge' | 'grove' | 'oracle' | 'arena'
export type PlaygroundSkillId =
  | 'promptcraft'
  | 'worldsmithing'
  | 'summoning'
  | 'engineering'
  | 'oracle'
  | 'diplomacy'

export type PlaygroundItemId =
  | 'hermes-token'
  | 'athena-scroll'
  | 'forge-shard'
  | 'portal-key'
  | 'oracle-crystal'
  | 'kimi-sigil'

export type QuestObjectiveType =
  | 'talk_to_athena'
  | 'generate_world'
  | 'enter_world'
  | 'open_world_map'
  | 'collect_item'
  | 'use_skill'

export type QuestObjective = {
  id: string
  type: QuestObjectiveType
  label: string
  target?: string
}

export type QuestReward = {
  xp: number
  items?: PlaygroundItemId[]
  skillXp?: Partial<Record<PlaygroundSkillId, number>>
  unlockWorlds?: PlaygroundWorldId[]
}

export type PlaygroundQuest = {
  id: string
  chapter: string
  title: string
  description: string
  objectives: QuestObjective[]
  reward: QuestReward
}

export type PlaygroundWorld = {
  id: PlaygroundWorldId
  name: string
  tagline: string
  description: string
  accent: string
  lockedByDefault?: boolean
  requiredItem?: PlaygroundItemId
}

export type PlaygroundSkill = {
  id: PlaygroundSkillId
  name: string
  icon: string
  description: string
}

export type PlaygroundItem = {
  id: PlaygroundItemId
  name: string
  icon: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  description: string
}

export const PLAYGROUND_WORLDS: PlaygroundWorld[] = [
  {
    id: 'agora',
    name: 'The Agora',
    tagline: 'Starting realm',
    description: 'The central plaza where humans and agents first meet.',
    accent: '#d9b35f',
  },
  {
    id: 'forge',
    name: 'The Forge',
    tagline: 'Generated world',
    description: 'A neon builder realm where prompts harden into tools.',
    accent: '#22d3ee',
    lockedByDefault: true,
    requiredItem: 'portal-key',
  },
  {
    id: 'grove',
    name: 'The Grove',
    tagline: 'Social world',
    description: 'A living forest for music, chat, and creative rituals.',
    accent: '#34d399',
    lockedByDefault: true,
    requiredItem: 'forge-shard',
  },
  {
    id: 'oracle',
    name: 'Oracle Temple',
    tagline: 'Research world',
    description: 'A quiet archive where Sage agents answer lore and search.',
    accent: '#a78bfa',
    lockedByDefault: true,
    requiredItem: 'oracle-crystal',
  },
  {
    id: 'arena',
    name: 'Benchmark Arena',
    tagline: 'Combat world',
    description: 'Models duel through evals, prompts, and agent battles.',
    accent: '#fb7185',
    lockedByDefault: true,
    requiredItem: 'kimi-sigil',
  },
]

export const PLAYGROUND_SKILLS: PlaygroundSkill[] = [
  {
    id: 'promptcraft',
    name: 'Promptcraft',
    icon: '📜',
    description: 'Shape agent behavior with scrolls, rituals, and reusable prompt patterns.',
  },
  {
    id: 'worldsmithing',
    name: 'Worldsmithing',
    icon: '🏗️',
    description: 'Generate playable realms from lore, art, music, and code.',
  },
  {
    id: 'summoning',
    name: 'Summoning',
    icon: '🧬',
    description: 'Bring specialized AI agents into the world as companions and NPCs.',
  },
  {
    id: 'engineering',
    name: 'Engineering',
    icon: '⚙️',
    description: 'Turn quests into working tools, PRs, integrations, and automations.',
  },
  {
    id: 'oracle',
    name: 'Oracle',
    icon: '🔮',
    description: 'Research, remember, and reveal hidden context from the knowledge graph.',
  },
  {
    id: 'diplomacy',
    name: 'Diplomacy',
    icon: '🤝',
    description: 'Coordinate with humans, guilds, and agents in shared missions.',
  },
]

export const PLAYGROUND_ITEMS: PlaygroundItem[] = [
  {
    id: 'hermes-token',
    name: 'Hermes Token',
    icon: '🪽',
    rarity: 'common',
    description: 'Proof you entered the Playground. Warm to the touch, weirdly useful.',
  },
  {
    id: 'athena-scroll',
    name: "Athena's Scroll",
    icon: '📜',
    rarity: 'rare',
    description: 'Unlocks guided agent dialogue and the first world generation ritual.',
  },
  {
    id: 'portal-key',
    name: 'Portal Key',
    icon: '🗝️',
    rarity: 'rare',
    description: 'Opens the first generated world: The Forge.',
  },
  {
    id: 'forge-shard',
    name: 'Forge Shard',
    icon: '💠',
    rarity: 'epic',
    description: 'A shard of generated world-state. Used to unlock deeper realms.',
  },
  {
    id: 'oracle-crystal',
    name: 'Oracle Crystal',
    icon: '🔮',
    rarity: 'epic',
    description: 'Stores lore, context, and memories from completed quests.',
  },
  {
    id: 'kimi-sigil',
    name: 'Kimi Sigil',
    icon: '🌙',
    rarity: 'legendary',
    description: 'A hackathon relic. Opens the Benchmark Arena.',
  },
]

export const PLAYGROUND_QUESTS: PlaygroundQuest[] = [
  {
    id: 'awakening-agora',
    chapter: 'Chapter I — Awakening the Agora',
    title: 'Awakening the Agora',
    description: 'Meet Athena and initialize your agent companion.',
    objectives: [
      { id: 'talk-athena', type: 'talk_to_athena', label: 'Talk to Athena' },
      { id: 'collect-scroll', type: 'collect_item', label: "Receive Athena's Scroll", target: 'athena-scroll' },
    ],
    reward: {
      xp: 50,
      items: ['hermes-token', 'athena-scroll'],
      skillXp: { promptcraft: 40, summoning: 20 },
    },
  },
  {
    id: 'first-worldsmith',
    chapter: 'Chapter I — Awakening the Agora',
    title: 'The First Worldsmith',
    description: 'Ask Athena to generate a new world from a prompt.',
    objectives: [
      { id: 'generate-forge', type: 'generate_world', label: 'Generate The Forge', target: 'forge' },
      { id: 'receive-key', type: 'collect_item', label: 'Claim the Portal Key', target: 'portal-key' },
    ],
    reward: {
      xp: 80,
      items: ['portal-key'],
      skillXp: { worldsmithing: 80, promptcraft: 30 },
      unlockWorlds: ['forge'],
    },
  },
  {
    id: 'enter-forge',
    chapter: 'Chapter I — Awakening the Agora',
    title: 'Enter the Forge',
    description: 'Step through the portal into the generated builder realm.',
    objectives: [
      { id: 'enter-forge-world', type: 'enter_world', label: 'Enter The Forge', target: 'forge' },
      { id: 'forge-shard', type: 'collect_item', label: 'Recover a Forge Shard', target: 'forge-shard' },
    ],
    reward: {
      xp: 120,
      items: ['forge-shard'],
      skillXp: { engineering: 60, worldsmithing: 60 },
      unlockWorlds: ['grove'],
    },
  },
]

export function itemById(id: PlaygroundItemId) {
  return PLAYGROUND_ITEMS.find((item) => item.id === id)
}

export function worldById(id: PlaygroundWorldId) {
  return PLAYGROUND_WORLDS.find((world) => world.id === id)
}

export function questById(id: string) {
  return PLAYGROUND_QUESTS.find((quest) => quest.id === id)
}
