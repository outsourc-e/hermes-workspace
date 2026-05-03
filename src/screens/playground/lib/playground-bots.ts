/**
 * Convincing fake multiplayer for hackathon.
 *
 * Real WS multiplayer is in the spec for v0.2 but is not safe to ship in
 * the same-day window — TanStack Start would need a custom WS plugin or
 * sidecar process. Instead, render 2-4 "online" bots per world with
 * generated names + persona avatars. They wander via a lightweight
 * waypoint walker that looks like real player movement.
 */
import type { PlaygroundWorldId } from './playground-rpg'

export type BotProfile = {
  id: string
  name: string
  avatar: string
  color: string
  spawn: [number, number, number]
  lines: string[]
}

const COMMUNITY_NAMES = [
  'GrokKnight', 'NousPilgrim', 'KimiArtisan', 'OpusBard', 'CodexSmith',
  'ClaudeWanderer', 'GeminiLore', 'MixtralOracle', 'LlamaScribe', 'HermesFan',
  'BuilderAva', 'GroveSpirit', 'ForgeBaron', 'OracleNote', 'ArenaRook',
]

export const BOT_PROFILES: Record<PlaygroundWorldId, BotProfile[]> = {
  agora: [
    {
      id: 'bot-agora-1',
      name: COMMUNITY_NAMES[0],
      avatar: 'iris',
      color: '#22d3ee',
      spawn: [-7, 0, 7],
      lines: ['anyone tried the new Forge generator?', 'gm builders', 'lvl 3 already, sheesh'],
    },
    {
      id: 'bot-agora-2',
      name: COMMUNITY_NAMES[1],
      avatar: 'eros',
      color: '#f472b6',
      spawn: [7, 0, 7],
      lines: ['promptcraft is wildly fun', 'who else is on Hermes Workspace?', 'see u in the Grove'],
    },
    {
      id: 'bot-agora-3',
      name: COMMUNITY_NAMES[2],
      avatar: 'apollo',
      color: '#f59e0b',
      spawn: [-7, 0, -7],
      lines: ['composing the agora theme', 'kimi sounds like an oracle', 'let me know if u finish chapter 2'],
    },
  ],
  forge: [
    {
      id: 'bot-forge-1',
      name: COMMUNITY_NAMES[3],
      avatar: 'pan',
      color: '#34d399',
      spawn: [-6, 0, 5],
      lines: ['shipped a new prompt scroll', 'forge feels like a real workshop tonight', 'wanna co-build a quest?'],
    },
    {
      id: 'bot-forge-2',
      name: COMMUNITY_NAMES[4],
      avatar: 'chronos',
      color: '#facc15',
      spawn: [6, 0, -5],
      lines: ['archiving runs from last hour', 'mission terminal is online', 'who broke the medallion'],
    },
  ],
  grove: [
    {
      id: 'bot-grove-1',
      name: COMMUNITY_NAMES[5],
      avatar: 'apollo',
      color: '#f59e0b',
      spawn: [-5, 0, 4],
      lines: ['the grove sounds different at night', 'two song fragments down', 'apollo here keeps writing in my head'],
    },
    {
      id: 'bot-grove-2',
      name: COMMUNITY_NAMES[6],
      avatar: 'pan',
      color: '#34d399',
      spawn: [5, 0, -4],
      lines: ['trees are alive', 'who else is gathering', 'one more leaf!'],
    },
  ],
  oracle: [
    {
      id: 'bot-oracle-1',
      name: COMMUNITY_NAMES[7],
      avatar: 'athena',
      color: '#a78bfa',
      spawn: [-4, 0, 4],
      lines: ['the riddle is recursive', 'memory crystals are heavy tonight', 'sage mode'],
    },
    {
      id: 'bot-oracle-2',
      name: COMMUNITY_NAMES[8],
      avatar: 'eros',
      color: '#f472b6',
      spawn: [4, 0, -4],
      lines: ['ask softly', 'the oracle hears prompts as poems', 'this place is gorgeous'],
    },
  ],
  arena: [
    {
      id: 'bot-arena-1',
      name: COMMUNITY_NAMES[9],
      avatar: 'nike',
      color: '#fb7185',
      spawn: [-5, 0, 0],
      lines: ['undefeated tonight', 'kimi vs claude — go', 'who\u2019s next'],
    },
    {
      id: 'bot-arena-2',
      name: COMMUNITY_NAMES[10],
      avatar: 'hermes',
      color: '#2dd4bf',
      spawn: [5, 0, 0],
      lines: ['no judges, just judges', 'duel me', 'the model wars are heating up'],
    },
  ],
}

export function botsFor(worldId: PlaygroundWorldId): BotProfile[] {
  return BOT_PROFILES[worldId] ?? []
}
