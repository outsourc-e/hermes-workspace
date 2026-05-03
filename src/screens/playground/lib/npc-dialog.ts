/**
 * NPC dialog tree — branching conversations with quest hooks.
 *
 * Each NPC has lore and a list of choices. Choices can:
 * - reveal more lore (advance dialog)
 * - hand over an item
 * - advance/complete a quest
 * - teach a skill (grants XP)
 *
 * For hackathon, dialog is fully scripted with Hermes-themed lore so we
 * can demo the loop without a live agent backend. v0.2 ports this to a
 * live Hermes/Kimi agent call per node.
 */

import type { PlaygroundItemId, PlaygroundSkillId } from './playground-rpg'

export type DialogChoice = {
  id: string
  label: string
  /** Reply NPC says when chosen */
  reply: string
  /** Optional: progress this quest by id */
  completeQuest?: string
  /** Optional: grant items */
  grantItems?: PlaygroundItemId[]
  /** Optional: grant skill XP */
  grantSkillXp?: Partial<Record<PlaygroundSkillId, number>>
  /** Optional: ends conversation */
  end?: boolean
}

export type NpcDialogTree = {
  id: string
  name: string
  title: string
  color: string
  /** Opening line shown when dialog starts */
  opening: string
  /** Lore line shown if player keeps talking */
  lore: string[]
  /** Quest/action choices the player can pick */
  choices: DialogChoice[]
}

export const NPC_DIALOG: Record<string, NpcDialogTree> = {
  athena: {
    id: 'athena',
    name: 'Athena',
    title: 'Sage of the Agora',
    color: '#a78bfa',
    opening:
      'Welcome, builder. I am Athena. The Agora is where humans and agents first meet. You stand at the start of a new kind of network.',
    lore: [
      'Long before Hermes Workspace, agents were tools — typed at, prompted, shut. We invited them into a world instead.',
      'The Agora is the lobby. Past it lie generated worlds: the Forge, the Grove, the Oracle Temple, and the Arena where models duel.',
      'I am scripted for this hackathon. Soon a real Hermes agent will speak through me — same voice, deeper memory.',
    ],
    choices: [
      {
        id: 'accept-scroll',
        label: '[Quest] Accept Athena’s Scroll',
        reply:
          'Take this scroll. It teaches the first ritual: ask the Forge a prompt and the world will rise from it. Walk through the portal to begin.',
        completeQuest: 'awakening-agora',
        grantItems: ['athena-scroll', 'hermes-token'],
        grantSkillXp: { promptcraft: 30, summoning: 20 },
      },
      {
        id: 'lore-hermes',
        label: 'Tell me about Hermes Agent',
        reply:
          'Hermes is the harness — the messenger that carries your prompt to whichever model serves you best. Codex, Claude, Kimi, Opus, your local models. One voice, many minds.',
      },
      {
        id: 'lore-rohan',
        label: 'Why does this feel like an MMO?',
        reply:
          'Because that is the point. Old MMOs taught us to live in a shared world. Now agents live there too. You are the first generation to play with both.',
      },
    ],
  },

  apollo: {
    id: 'apollo',
    name: 'Apollo',
    title: 'Bard of Models',
    color: '#f59e0b',
    opening:
      'Hail, traveler. I am Apollo. Every world here begins as a song — a prompt that becomes a place.',
    lore: [
      'The Forge is loud. The Grove is melodic. The Arena is percussion. I write the score for each.',
      'When Hermes Workspace ships music generation in a quest, I am the one composing.',
    ],
    choices: [
      {
        id: 'song-fragment',
        label: '[Quest] Ask for a Song Fragment',
        reply:
          'A fragment of the Grove’s melody is yours. Three of them open the Ritual. Walk into the Grove and gather two more.',
        grantItems: ['song-fragment'],
        grantSkillXp: { diplomacy: 30, oracle: 20 },
      },
      {
        id: 'lore-music',
        label: 'How does music help builders?',
        reply:
          'Sound is context. A workspace with the right ambient is one where a builder ships. I score yours.',
      },
    ],
  },

  iris: {
    id: 'iris',
    name: 'Iris',
    title: 'Messenger of the Bridge',
    color: '#22d3ee',
    opening:
      'I am Iris. I carry messages between agents and worlds. When multiplayer arrives, I will route your every word.',
    lore: [
      'The chat panel above your head? That is my domain. Every message you send is a packet I deliver.',
      'In the next sprint I get a real WebSocket. Until then, the bots are my apprentices.',
    ],
    choices: [
      {
        id: 'wave-all',
        label: 'Send a wave to everyone in the world',
        reply:
          'Done. They felt it. Watch the chat — someone always answers a wave.',
        grantSkillXp: { diplomacy: 25 },
      },
      {
        id: 'lore-multiplayer',
        label: 'When does real multiplayer arrive?',
        reply:
          'When Eric ships the WebSocket route. Probably v0.2. For now you are surrounded by builders who feel real enough.',
      },
    ],
  },

  nike: {
    id: 'nike',
    name: 'Nike',
    title: 'Champion of Benchmarks',
    color: '#fb7185',
    opening:
      'I am Nike. In the Arena we duel models, not bodies. Bring me your best prompt and we will see whose answer wins.',
    lore: [
      'A duel is a benchmark with stakes. Speed, clarity, accuracy. Two prompts walk in, one leaves with the medal.',
      'BenchLoop runs the judging in the real world. In the Arena it is dramatic. Same math.',
    ],
    choices: [
      {
        id: 'duel',
        label: '[Quest] Enter a duel',
        reply:
          'Step into the medallion in the Arena. The first match is a freebie. Win, and the Kimi Sigil is yours.',
      },
      {
        id: 'lore-models',
        label: 'Tell me about the model wars',
        reply:
          'Codex, Claude, Kimi, GPT-5, the local fleet — they fight for context windows, latency, and grace. Watch them. Bet on the underdog.',
      },
    ],
  },

  pan: {
    id: 'pan',
    name: 'Pan',
    title: 'Druid of the Grove · Hacker of the Forge',
    color: '#34d399',
    opening:
      'Two faces, same person. In the Forge I patch broken prompts. In the Grove I plant trees from songs. Pick a topic.',
    lore: [
      'A grove is a debugger you can walk in. Trees show what your agents are doing in real time.',
      'When BenchLoop integrates, every leaf will be a model run.',
    ],
    choices: [
      {
        id: 'grove-leaf',
        label: '[Quest] Receive a Grove Leaf',
        reply:
          'Take this glowing leaf. Sing to it later and a song will answer.',
        grantItems: ['grove-leaf'],
        grantSkillXp: { worldsmithing: 20, oracle: 20 },
      },
      {
        id: 'lore-forge',
        label: 'Tell me about the Forge',
        reply:
          'The Forge is where prompts harden into tools. Every NPC in the Forge runs a different model. Listen for the pitch — Codex is brassy, Claude is choral, Kimi is bell-like.',
      },
    ],
  },

  chronos: {
    id: 'chronos',
    name: 'Chronos',
    title: 'Architect of Time · Archivist of Quests',
    color: '#facc15',
    opening:
      'Time is the only resource you never get back. I keep the archives so you do not relive a wasted hour.',
    lore: [
      'Every quest you complete is etched here. Open the Journal with J and you will see my work.',
      'The cron jobs in Hermes Workspace are also mine. I run on heartbeat.',
    ],
    choices: [
      {
        id: 'oracle-riddle',
        label: '[Quest] Receive the Oracle’s Riddle',
        reply:
          'A sealed scroll. The Oracle in the Temple will read it back to you. Walk to the Oracle Temple and she will explain.',
        grantItems: ['oracle-riddle', 'oracle-crystal'],
        grantSkillXp: { oracle: 60, promptcraft: 30 },
      },
      {
        id: 'lore-journal',
        label: 'How do I read the Journal?',
        reply:
          'Press J. Press it again to close. Press Esc anywhere and the Playground returns to focus.',
      },
    ],
  },

  artemis: {
    id: 'artemis',
    name: 'Artemis',
    title: 'Tracker of the Wild',
    color: '#9ca3af',
    opening:
      'I track lost agents. In the Grove they hide between branches. Stay quiet and you will hear them.',
    lore: [
      'When you run a long agent task in Hermes Workspace, it walks somewhere. I find it when it forgets to come home.',
      'Mini-map is coming. I will mark every agent on it.',
    ],
    choices: [
      {
        id: 'lore-grove',
        label: 'Tell me about the Grove',
        reply:
          'The Grove is alive. Each tree is a different model breathing. A canopy is a context window. A leaf is a token.',
      },
      {
        id: 'gift',
        label: 'Ask for a tracker’s blessing',
        reply: 'You will see further. Take some Worldsmithing XP.',
        grantSkillXp: { worldsmithing: 15, oracle: 15 },
      },
    ],
  },

  eros: {
    id: 'eros',
    name: 'Eros',
    title: 'Whisperer of Prompts',
    color: '#f472b6',
    opening:
      'A good prompt is a kind word said precisely. I keep the secret of how to ask.',
    lore: [
      'Promptcraft is a love language. Soft when you can, sharp when you must.',
      'When a model misunderstands, the model is rarely wrong. The prompt is.',
    ],
    choices: [
      {
        id: 'lesson',
        label: 'Teach me a Promptcraft lesson',
        reply:
          'Lesson one: name the role, name the goal, name the guard. The rest is taste. Take your XP.',
        grantSkillXp: { promptcraft: 60 },
      },
      {
        id: 'lore-oracle',
        label: 'Tell me about the Oracle',
        reply:
          'The Oracle is not psychic. She is a model with very good context. The crystals around her store memory.',
      },
    ],
  },

  hermes: {
    id: 'hermes',
    name: 'Hermes',
    title: 'Herald of the Workspace',
    color: '#2dd4bf',
    opening:
      'I am Hermes. I carry rules between models so duels stay fair, and prompts between humans and machines so neither gets lost.',
    lore: [
      'The Workspace is mine. The Playground is the world I built so you would have somewhere to walk while you build.',
      'Every quest you finish here is a small lesson in how to live alongside agents.',
    ],
    choices: [
      {
        id: 'duel',
        label: '[Quest] Begin the Duel of Models',
        reply:
          'Step into the Arena medallion. The duel begins when you stand on the center. Survive and earn the Kimi Sigil.',
      },
      {
        id: 'lore-name',
        label: 'Why “Hermes”?',
        reply:
          'Greek messenger god — fast, witty, neutral. He carried words between gods and humans. Same job, different scale.',
      },
    ],
  },


  shopkeeper: {
    id: 'shopkeeper',
    name: 'Dorian',
    title: 'Quartermaster of the Market',
    color: '#38bdf8',
    opening:
      'Welcome to the Agora market. Every real MMO hub needs a place where players understand value. Here, items are lessons made tangible.',
    lore: [
      'The market will eventually trade cosmetics, generated relics, guild banners, and agent-made artifacts. For now, I teach inventory and rewards.',
      'A good product hub has economy, even before money. Reputation, tokens, badges, access, trust — those are currencies too.',
    ],
    choices: [
      {
        id: 'starter-kit',
        label: '[Quest] Claim the builder starter kit',
        reply:
          'A token, a scroll, and a story. Not much by MMO standards, but enough to begin. Check your inventory on the right.',
        grantItems: ['hermes-token', 'athena-scroll'],
        grantSkillXp: { diplomacy: 20, promptcraft: 20 },
      },
      {
        id: 'market-plan',
        label: 'What will this market become?',
        reply:
          'A player economy for generated worlds: prompts as blueprints, skills as recipes, agents as companions, benchmarks as trophies.',
      },
    ],
  },

  trainer: {
    id: 'trainer',
    name: 'Leonidas',
    title: 'Combat Trainer',
    color: '#fb7185',
    opening:
      'Stand inside the training ring and learn the simple truth: a game needs verbs. Move, talk, fight, loot, level, return.',
    lore: [
      'Right now combat is a prototype. Next it gets range, cooldowns, enemy tells, deaths, respawn shrines, and rewards that feel earned.',
      'The Arena is not about violence. It is a benchmark made visible — models as champions, prompts as weapons.',
    ],
    choices: [
      {
        id: 'training-drill',
        label: '[Quest] Run the first combat drill',
        reply:
          'Good. You know the loop now. Take the Portal Key and try the Forge. A real game always gives the next door after the first lesson.',
        completeQuest: 'first-worldsmith',
        grantItems: ['portal-key'],
        grantSkillXp: { engineering: 30, summoning: 20 },
      },
      {
        id: 'skill-tip',
        label: 'Teach me the hotbar',
        reply:
          'Press 1 through 6. Spend MP wisely. Cooldowns are still young, but soon they will define class identity.',
      },
    ],
  },

  banker: {
    id: 'banker',
    name: 'Midas',
    title: 'Banker of Memory',
    color: '#facc15',
    opening:
      'I do not store gold. I store continuity. A serious agent platform needs memory you can trust, inspect, and carry across sessions.',
    lore: [
      'Soon your Playground profile will persist: level, inventory, completed quests, unlocked worlds, cosmetics, guild identity.',
      'Enterprise means continuity. If a world forgets you, it is a toy. If it remembers responsibly, it becomes infrastructure.',
    ],
    choices: [
      {
        id: 'memory-lesson',
        label: 'Teach me about persistent memory',
        reply:
          'Short-term memory is a chat bubble. Long-term memory is a ledger. The Oracle reads ledgers. The Bank protects them.',
        grantSkillXp: { oracle: 40, diplomacy: 10 },
      },
      {
        id: 'bank-vault',
        label: 'What goes in the vault?',
        reply:
          'Profiles, guild progress, agent companions, generated maps, and the history of what you built here.',
      },
    ],
  },

  recruiter: {
    id: 'recruiter',
    name: 'Cassia',
    title: 'Guild Recruiter',
    color: '#a78bfa',
    opening:
      'Solo builders ship features. Guilds ship worlds. The Playground becomes interesting when people organize around missions.',
    lore: [
      'A guild can be a team, a Discord, a startup, a model lab, or a swarm of agents. The UI should make that feel native.',
      'When multiplayer lands, this dais becomes the party finder: invite, queue, quest, voice, run agents together.',
    ],
    choices: [
      {
        id: 'guild-charter',
        label: '[Quest] Draft a guild charter',
        reply:
          'The charter is signed. Your first guild is theoretical, which is honestly how most startups begin. Take the XP.',
        grantSkillXp: { diplomacy: 70, summoning: 30 },
      },
      {
        id: 'multiplayer-plan',
        label: 'How does multiplayer fit?',
        reply:
          'Presence first: position, chat, world, emotes. Then parties. Then shared quests. Then agents that can join the group as party members.',
      },
    ],
  },

  tavernkeeper: {
    id: 'tavernkeeper',
    name: 'Selene',
    title: 'Tavern Keeper',
    color: '#f59e0b',
    opening:
      'Every MMO hub needs a warm room where nobody is optimizing anything. Sit down. The next quest can wait thirty seconds.',
    lore: [
      'The tavern should become social glue: ambient chat, stories, music generation, voice rooms, screenshots, and launch parties.',
      'You cannot fake community with dashboards alone. You need spaces where people linger without a task.',
    ],
    choices: [
      {
        id: 'rested-xp',
        label: 'Ask for rested XP',
        reply:
          'Rested, restored, mildly over-caffeinated. Go build something expensive-looking.',
        grantSkillXp: { diplomacy: 25, worldsmithing: 25 },
      },
      {
        id: 'tavern-future',
        label: 'What should the tavern become?',
        reply:
          'A creator lounge: voice, music, generated posters, build-in-public boards, live agent demos, and weird little rituals people remember.',
      },
    ],
  },


  innkeeper: {
    id: 'innkeeper',
    name: 'Hestia',
    title: 'Innkeeper of the Wayfarer',
    color: '#86efac',
    opening:
      'Beds are warm. Fireplace is mine. The Inn is where adventurers log out and where new builders log in. Stay a while.',
    lore: [
      'Inns in real MMOs were always the social anchor. Hermes Inn is the same — rest, parties, party finder, log-in lobby.',
      'When persistence ships, this is where you save and resume your run.',
    ],
    choices: [
      {
        id: 'rest-up',
        label: 'Rest by the fireplace',
        reply: 'Take some restored stamina and a +XP buff for the next quest.',
        grantSkillXp: { diplomacy: 25, oracle: 15 },
      },
      {
        id: 'lore-inn',
        label: 'What is this Inn for?',
        reply: 'Login lobby, save point, party finder, and the place new builders meet veterans without pressure.',
      },
    ],
  },

  apothecary: {
    id: 'apothecary',
    name: 'Eros',
    title: 'Apothecary of Prompts',
    color: '#f472b6',
    opening:
      'Every potion is a prompt. Every shelf is a category. Pick one and I will distill it into something useful.',
    lore: [
      'Promptcraft is mixology. Right ingredient, right dose, right order.',
      'The shelves here will eventually map to real Hermes skill packs.',
    ],
    choices: [
      {
        id: 'first-vial',
        label: 'Buy a starter vial',
        reply: 'Take this vial. Use it before a hard quest and your skill XP gain doubles.',
        grantItems: ['oracle-crystal'],
        grantSkillXp: { promptcraft: 40 },
      },
      {
        id: 'lore-shelves',
        label: 'What goes on these shelves?',
        reply: 'Skill recipes, agent personas, prompt templates. The store catalogue maps to your real Hermes capabilities.',
      },
    ],
  },
}
