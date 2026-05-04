import type { AvatarConfig } from './avatar-config'

/**
 * Hermes Playground RPG data model.
 *
 * Training Grounds is the new first-run loop for the Nous Research x Kimi
 * creative hackathon build. Legacy worlds and items remain additive.
 */

export type PlaygroundWorldId = 'training' | 'agora' | 'forge' | 'grove' | 'oracle' | 'arena'

export type PlaygroundSkillId =
  | 'promptcraft'
  | 'worldsmithing'
  | 'summoning'
  | 'engineering'
  | 'oracle'
  | 'diplomacy'

export type EquipmentSlot = 'weapon' | 'cloak' | 'head' | 'artifact'

export type PlaygroundItemId =
  | 'hermes-sigil'
  | 'training-blade'
  | 'novice-cloak'
  | 'initiate-circlet'
  | 'archive-lens'
  | 'wisp-core'
  | 'hermes-token'
  | 'athena-scroll'
  | 'forge-shard'
  | 'portal-key'
  | 'oracle-crystal'
  | 'kimi-sigil'
  | 'grove-leaf'
  | 'arena-medal'
  | 'song-fragment'
  | 'oracle-riddle'

export type QuestObjectiveType =
  | 'talk_to_npc'
  | 'collect_item'
  | 'visit_zone'
  | 'open_inventory'
  | 'equip_item'
  | 'send_chat'
  | 'inspect_docs'
  | 'build_prompt'
  | 'defeat_enemy'
  | 'enter_world'
  | 'gather_song'
  | 'duel_npc'
  | 'meet_player'
  | 'exchange_chat'
  | 'summon_familiar'

export type QuestObjective = {
  id: string
  type: QuestObjectiveType
  label: string
  target?: string
  hint?: string
}

export type QuestReward = {
  xp: number
  items?: PlaygroundItemId[]
  skillXp?: Partial<Record<PlaygroundSkillId, number>>
  unlockWorlds?: PlaygroundWorldId[]
  title?: string
}

export type PlaygroundQuest = {
  id: string
  chapter: string
  title: string
  description: string
  /** What this quest teaches about Hermes Agent / product-building. */
  lesson?: string
  /** Why the player should care, shown in the journal as practical payoff. */
  payoff?: string
  objectives: QuestObjective[]
  reward: QuestReward
  optional?: boolean
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
  slot?: EquipmentSlot
  accent?: string
  stat?: { label: string; value: number }
}

export type EquippedItems = Record<EquipmentSlot, PlaygroundItemId | null>

export type QuestProgressEntry = {
  completedObjectives: string[]
  completed: boolean
}

export type PlayerProfile = {
  displayName: string
  avatarConfig: AvatarConfig
  equipped: EquippedItems
  inventory: PlaygroundItemId[]
  questProgress: Record<string, QuestProgressEntry>
  level: number
  xp: number
  titlesUnlocked: string[]
  lastZone: PlaygroundWorldId
}

export const PLAYGROUND_WORLDS: PlaygroundWorld[] = [
  {
    id: 'training',
    name: 'Training Grounds',
    tagline: 'Starter zone',
    description: 'Arrival circle, trainers, archives, and the locked Forge Gate for first-time builders.',
    accent: '#5eead4',
  },
  {
    id: 'agora',
    name: 'Agora Commons',
    tagline: 'Social hub',
    description: 'The shared plaza where humans and agents mingle.',
    accent: '#d9b35f',
  },
  {
    id: 'forge',
    name: 'The Forge',
    tagline: 'Builder realm',
    description: 'A neon builder world where prompts harden into tools.',
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
    description: 'Shape agent behavior with clear instructions and reusable rituals.',
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
    id: 'hermes-sigil',
    name: 'Hermes Sigil',
    icon: '🜂',
    rarity: 'rare',
    description: 'A starter sigil that marks you as a builder entering the Training Grounds.',
    slot: 'artifact',
    accent: '#5eead4',
    stat: { label: 'Prompt Focus', value: 4 },
  },
  {
    id: 'training-blade',
    name: 'Training Blade',
    icon: '🗡️',
    rarity: 'common',
    description: 'A lightweight practice blade tuned for first combat drills.',
    slot: 'weapon',
    accent: '#fb7185',
    stat: { label: 'Power', value: 3 },
  },
  {
    id: 'novice-cloak',
    name: 'Novice Cloak',
    icon: '🧥',
    rarity: 'common',
    description: 'A teal field cloak stitched for new worldsmiths.',
    slot: 'cloak',
    accent: '#22d3ee',
    stat: { label: 'Guard', value: 2 },
  },
  {
    id: 'initiate-circlet',
    name: 'Initiate Circlet',
    icon: '👑',
    rarity: 'rare',
    description: 'A thin gold circlet awarded to builders who finish the first loop.',
    slot: 'head',
    accent: '#facc15',
    stat: { label: 'Command', value: 2 },
  },
  {
    id: 'archive-lens',
    name: 'Archive Lens',
    icon: '🔎',
    rarity: 'rare',
    description: 'Helps you see memory, docs, and hidden links between tools.',
    slot: 'artifact',
    accent: '#a78bfa',
    stat: { label: 'Recall', value: 5 },
  },
  {
    id: 'wisp-core',
    name: 'Wisp Core',
    icon: '🫧',
    rarity: 'rare',
    description: 'A tiny core left behind by a defeated Glitch Wisp.',
    slot: 'artifact',
    accent: '#f472b6',
    stat: { label: 'Burst', value: 4 },
  },
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
  {
    id: 'grove-leaf',
    name: 'Grove Leaf',
    icon: '🍃',
    rarity: 'rare',
    description: 'A glowing leaf from the bioluminescent forest. Sings on touch.',
  },
  {
    id: 'song-fragment',
    name: 'Song Fragment',
    icon: '🎶',
    rarity: 'epic',
    description: 'A piece of a generative agent symphony. Three fragments unlock the Grove ritual.',
  },
  {
    id: 'oracle-riddle',
    name: "Oracle's Riddle",
    icon: '🤔',
    rarity: 'epic',
    description: 'A sealed scroll of an unsolved question.',
  },
  {
    id: 'arena-medal',
    name: 'Arena Medal',
    icon: '🏅',
    rarity: 'legendary',
    description: 'Awarded for surviving the Duel of Models in the Benchmark Arena.',
  },
]

export const PLAYGROUND_QUESTS: PlaygroundQuest[] = [
  {
    id: 'training-q1',
    chapter: 'Training Grounds Tutorial',
    title: 'Move and Speak',
    description: 'Walk to Athena at the Arrival Circle and accept the Hermes Sigil.',
    lesson: 'Hermes Agent is the messenger layer for your workflow: one place to route prompts to models, tools, files, memory, and channels.',
    payoff: 'You learn the basic interaction loop: approach an agent, choose a response, receive useful work back.',
    objectives: [
      {
        id: 'speak-athena',
        type: 'talk_to_npc',
        label: 'Walk to Athena and speak with her',
        target: 'athena',
        hint: 'Athena waits by the Arrival Circle.',
      },
      {
        id: 'claim-sigil',
        type: 'collect_item',
        label: 'Receive the Hermes Sigil',
        target: 'hermes-sigil',
      },
    ],
    reward: {
      xp: 40,
      items: ['hermes-sigil', 'training-blade', 'novice-cloak'],
      skillXp: { promptcraft: 20, summoning: 10 },
    },
  },
  {
    id: 'training-q2',
    chapter: 'Training Grounds Tutorial',
    title: 'Open Your Kit',
    description: 'Open your inventory and equip the starter blade and cloak.',
    lesson: 'In Hermes, capabilities are modular. Skills, tools, profiles, and context files are your equipment loadout for different jobs.',
    payoff: 'You learn how to inspect, equip, and combine capabilities before starting real work.',
    objectives: [
      {
        id: 'open-kit',
        type: 'open_inventory',
        label: 'Open your kit panel',
        hint: 'Use the inventory tab on the right.',
      },
      {
        id: 'equip-blade',
        type: 'equip_item',
        label: 'Equip the Training Blade',
        target: 'training-blade',
      },
      {
        id: 'equip-cloak',
        type: 'equip_item',
        label: 'Equip the Novice Cloak',
        target: 'novice-cloak',
      },
    ],
    reward: {
      xp: 60,
      skillXp: { engineering: 20, worldsmithing: 20 },
    },
  },
  {
    id: 'training-q3',
    chapter: 'Training Grounds Tutorial',
    title: 'Learn Chat and Community',
    description: 'Send one local chat message to the builders around you.',
    lesson: 'Hermes can operate across chat surfaces and human workflows, not just inside one app window.',
    payoff: 'You learn how multiplayer/social context turns isolated agent work into collaborative product-building.',
    objectives: [
      {
        id: 'send-local-chat',
        type: 'send_chat',
        label: 'Send one local chat message',
        hint: 'Press T or use the top chat panel.',
      },
    ],
    reward: {
      xp: 75,
      skillXp: { diplomacy: 35 },
    },
  },
  {
    id: 'training-q4',
    chapter: 'Training Grounds Tutorial',
    title: 'Learn Memory and Docs',
    description: 'Visit the Archive Podium and inspect the docs and memory guidance.',
    lesson: 'Memory, docs, and context let Hermes remember what matters: goals, decisions, repo state, preferences, and project handoffs.',
    payoff: 'You learn why durable context beats repeating yourself every session.',
    objectives: [
      {
        id: 'visit-archive',
        type: 'visit_zone',
        label: 'Visit the Archive Podium',
        target: 'archive-podium',
        hint: 'Follow the violet lights near the podium.',
      },
      {
        id: 'inspect-memory',
        type: 'inspect_docs',
        label: 'Open the docs and memory briefing',
      },
    ],
    reward: {
      xp: 90,
      items: ['archive-lens'],
      skillXp: { oracle: 45, promptcraft: 15 },
    },
  },
  {
    id: 'training-q5',
    chapter: 'Training Grounds Tutorial',
    title: 'Build with Hermes',
    description: 'Travel to the Forge Gate and ask Athena to build something with you.',
    lesson: 'The Forge represents the core Hermes loop: describe an outcome, dispatch agents/tools, review progress, and turn prompts into products.',
    payoff: 'You graduate from learning the interface to using Hermes as a builder system.',
    objectives: [
      {
        id: 'visit-forge-gate',
        type: 'visit_zone',
        label: 'Travel to the Forge Gate',
        target: 'forge-gate',
        hint: 'The gate is locked until you finish this ritual.',
      },
      {
        id: 'build-something',
        type: 'build_prompt',
        label: 'Ask Athena or the Forge Guide to build something',
        target: 'build-demo',
      },
    ],
    reward: {
      xp: 140,
      items: ['initiate-circlet', 'portal-key'],
      unlockWorlds: ['forge'],
      title: 'Initiate Builder',
      skillXp: { worldsmithing: 55, engineering: 45 },
    },
  },
  {
    id: 'agora-diplomacy',
    chapter: 'Agora Bonus — Diplomacy',
    title: 'Pact of the Agora',
    description: 'Find another live builder in the Agora Commons. Stand within speaking distance and exchange a chat.',
    lesson: 'Hermes Diplomacy: agents shine when they coordinate with others. The first protocol is presence; the second is acknowledging another mind.',
    payoff: 'Multiplayer coordination is a real Hermes skill — not just a flourish. Every collab pipeline starts here.',
    optional: true,
    objectives: [
      { id: 'meet-builder', type: 'meet_player', label: 'Stand near another live builder in the Agora' },
      { id: 'exchange-chat', type: 'exchange_chat', label: 'Send a chat while another player is nearby' },
    ],
    reward: {
      xp: 80,
      skillXp: { diplomacy: 80 },
      title: 'Diplomat of the Realm',
    },
  },
  {
    id: 'forge-summon',
    chapter: 'Forge Bonus — Summoning',
    title: 'Summon a Forge Familiar',
    description: 'Channel a temporary Hermes familiar at the Forge. It walks beside you for one minute.',
    lesson: 'Hermes Summoning: orchestrate sub-agents on demand to extend your reach without bloating your context.',
    payoff: 'You learn the foundation of agent composition — spawn helpers, get value, dismiss cleanly.',
    optional: true,
    objectives: [
      { id: 'enter-forge-bonus', type: 'enter_world', label: 'Enter the Forge', target: 'forge' },
      { id: 'summon-familiar', type: 'summon_familiar', label: 'Use the action bar 4-key to summon a familiar' },
    ],
    reward: {
      xp: 80,
      skillXp: { summoning: 80 },
      title: 'Summoner of the Forge',
    },
  },
  {
    id: 'training-bonus-wisp',
    chapter: 'Training Grounds Bonus',
    title: 'Clear the Glitch Wisp',
    description: 'Defeat the unstable wisp haunting the Trainer’s Ring.',
    lesson: 'Real projects create glitches: bad prompts, broken tools, missing context, failing auth, and noisy feedback loops.',
    payoff: 'You learn the product habit Hermes rewards: detect the issue, choose the right tool, and clear the blocker.',
    optional: true,
    objectives: [
      {
        id: 'defeat-wisp',
        type: 'defeat_enemy',
        label: 'Defeat the Glitch Wisp',
        target: 'glitch-wisp',
      },
      {
        id: 'collect-core',
        type: 'collect_item',
        label: 'Collect the Wisp Core',
        target: 'wisp-core',
      },
    ],
    reward: {
      xp: 55,
      items: ['wisp-core'],
      skillXp: { engineering: 20 },
    },
  },
  {
    id: 'grove-ritual',
    chapter: 'Chapter II — The Grove Ritual',
    title: 'The Grove Ritual',
    description: 'Walk into the Grove and gather a Song Fragment from the bioluminescent forest.',
    objectives: [
      { id: 'enter-grove', type: 'enter_world', label: 'Enter The Grove', target: 'grove' },
      { id: 'song', type: 'gather_song', label: 'Gather a Song Fragment', target: 'song-fragment' },
    ],
    reward: {
      xp: 160,
      items: ['grove-leaf', 'song-fragment'],
      skillXp: { diplomacy: 80, oracle: 40 },
      unlockWorlds: ['oracle'],
    },
  },
  {
    id: 'oracle-riddle',
    chapter: 'Chapter III — Oracle’s Riddle',
    title: 'Oracle’s Riddle',
    description: 'Visit the Oracle Temple and accept a riddle from Athena the Oracle.',
    objectives: [
      { id: 'enter-oracle', type: 'enter_world', label: 'Enter the Oracle Temple', target: 'oracle' },
      { id: 'riddle', type: 'collect_item', label: 'Receive Oracle’s Riddle', target: 'oracle-riddle' },
    ],
    reward: {
      xp: 200,
      items: ['oracle-riddle', 'oracle-crystal'],
      skillXp: { oracle: 120, promptcraft: 60 },
      unlockWorlds: ['arena'],
    },
  },
  {
    id: 'arena-duel',
    chapter: 'Chapter IV — Arena of Models',
    title: 'Duel of Models',
    description: 'Step into the Benchmark Arena. Survive the duel and earn the Kimi Sigil.',
    objectives: [
      { id: 'enter-arena', type: 'enter_world', label: 'Enter the Benchmark Arena', target: 'arena' },
      { id: 'survive', type: 'duel_npc', label: 'Survive the Duel of Models' },
      { id: 'kimi', type: 'collect_item', label: 'Claim the Kimi Sigil', target: 'kimi-sigil' },
    ],
    reward: {
      xp: 320,
      items: ['arena-medal', 'kimi-sigil'],
      skillXp: { engineering: 80, summoning: 80, oracle: 40 },
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

export function isItemEquippable(itemId: PlaygroundItemId) {
  return Boolean(itemById(itemId)?.slot)
}
