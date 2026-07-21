import type { WorkerProfile } from './domain'

export const WAR_ROOM_RETIRED_AGENT_ALIASES = {
  'signal-runner': {
    canonicalOwner: 'heimdall',
    reason: 'Gateway transport and delivery readback belong to Heimdall.',
    legacyProfileIds: ['gateway-discord-command'],
  },
  'merchant-scout': {
    canonicalOwner: 'loki',
    reason: 'Supplier intelligence belongs to Loki in Merchant Harbor.',
    legacyProfileIds: ['harbor-scout-store-evidence'],
  },
  'harbor-scout': {
    canonicalOwner: 'loki',
    reason: 'Supplier intelligence belongs to Loki in Merchant Harbor.',
    legacyProfileIds: ['harbor-scout-store-evidence'],
  },
  'atlantis-archivist': {
    canonicalOwner: 'poseidon',
    reason: 'Atlantis Vault index, archive integrity and retrieval belong to Poseidon.',
    legacyProfileIds: ['atlantis-archive-memory'],
  },
  'treasury-guardian': {
    canonicalOwner: 'dwarf',
    reason: 'Treasury cost, margin and live-action locks belong to Dwarf.',
    legacyProfileIds: ['treasury-cost-approval-locks'],
  },
  'athena-agent': {
    canonicalOwner: 'goblin',
    reason: 'Opportunity discovery belongs to Goblin; Athena visual assets remain preserved until replacement.',
    legacyProfileIds: ['athena-strategy-product-review'],
  },
} as const

export type RetiredWarRoomAgentAlias = keyof typeof WAR_ROOM_RETIRED_AGENT_ALIASES

export class RetiredWarRoomAgentAliasError extends Error {
  readonly code = 'RETIRED_WAR_ROOM_AGENT_ALIAS'
  readonly alias: RetiredWarRoomAgentAlias
  readonly canonicalOwner: string

  constructor(alias: RetiredWarRoomAgentAlias) {
    const retirement = WAR_ROOM_RETIRED_AGENT_ALIASES[alias]
    super(`Retired agent alias ${alias} cannot receive new routing or assignments. Use canonical owner ${retirement.canonicalOwner}.`)
    this.name = 'RetiredWarRoomAgentAliasError'
    this.alias = alias
    this.canonicalOwner = retirement.canonicalOwner
  }
}

export function retiredWarRoomAgentAlias(value: string) {
  return Object.hasOwn(WAR_ROOM_RETIRED_AGENT_ALIASES, value)
    ? value as RetiredWarRoomAgentAlias
    : null
}

export function canonicalWarRoomOwnerFor(value: string) {
  const alias = retiredWarRoomAgentAlias(value)
  return alias ? WAR_ROOM_RETIRED_AGENT_ALIASES[alias].canonicalOwner : value
}

export function assertWarRoomAgentCanReceiveNewAssignment(value: string) {
  const alias = retiredWarRoomAgentAlias(value)
  if (alias) throw new RetiredWarRoomAgentAliasError(alias)
}

export const WAR_ROOM_WORKER_PROFILES: Array<WorkerProfile> = [
  {
    agentId: 'goblin',
    profileId: 'goblin-opportunity-discovery',
    displayName: 'Goblin',
    roomId: 'agora-opportunity',
    role: 'research',
    description: 'Opportunity discovery, comparative shop/product research, ranking, caveats, and evidence-linked Opportunity Packets for Oracle review.',
    hermesProfileKey: 'research.opportunity_discovery',
  },
  {
    agentId: 'athena',
    profileId: 'athena-strategy-product-review',
    displayName: 'Athena',
    roomId: 'agora-opportunity',
    role: 'strategy',
    description: 'Strategy, QA, product opportunity review, and prioritization.',
    hermesProfileKey: 'strategy.product_review',
  },
  {
    agentId: 'loki',
    profileId: 'loki-product-discovery',
    displayName: 'Loki',
    roomId: 'etsy-market-lab',
    role: 'research',
    description: 'Local Etsy Market Lab product discovery and source-lead hunter for future Hermes product-finder routing.',
    hermesProfileKey: 'research.product_discovery',
  },
  {
    agentId: 'thor',
    profileId: 'thor-metrics-ledger',
    displayName: 'Thor',
    roomId: 'etsy-market-lab',
    role: 'archivist',
    description: 'Local Etsy Market Lab SEO, ShotLab prep, source-truth, and QA forge body.',
    hermesProfileKey: 'archive.metrics_ledger',
  },
  {
    agentId: 'odin',
    profileId: 'odin-draft-handoff',
    displayName: 'Odin',
    roomId: 'etsy-market-lab',
    role: 'merchant',
    description: 'Local draft-only approval king for QA readback, DLV gates, and future listing handoffs.',
    hermesProfileKey: 'merchant.draft_handoff',
  },
  {
    agentId: 'hephaestus',
    profileId: 'hephaestus-forge-shotlab-prep',
    displayName: 'Hephaestus',
    roomId: 'forge-hephaestus',
    role: 'forge',
    description: 'Build, Forge work, ShotLab preparation, and automation tools.',
    hermesProfileKey: 'build.forge_shotlab',
  },
  {
    agentId: 'hermes',
    profileId: 'hermes-router-dispatcher',
    displayName: 'Hermes',
    roomId: 'olympus-command',
    role: 'router',
    description: 'Router, messenger, dispatcher, and command bus operator.',
    hermesProfileKey: 'router.dispatcher',
  },
  {
    agentId: 'julius',
    profileId: 'julius-caesar-release-gate',
    displayName: 'Julius Caesar',
    roomId: 'council-strategists',
    role: 'council',
    description: 'Council profile backed by the real Hermes profile `julius`: structure, ownership, choices, and release gates.',
    hermesProfileKey: 'council.julius',
  },
  {
    agentId: 'alexander',
    profileId: 'alexander-momentum-strategist',
    displayName: 'Alexander',
    roomId: 'council-strategists',
    role: 'council',
    description: 'Council profile backed by the real Hermes profile `alexander`: momentum, ambition, visible wins, and morale.',
    hermesProfileKey: 'council.alexander',
  },
  {
    agentId: 'napoleon',
    profileId: 'napoleon-execution-marshal',
    displayName: 'Napoleon',
    roomId: 'council-strategists',
    role: 'council',
    description: 'Council profile backed by the real Hermes profile `napoleon`: logistics, milestones, execution order, QA, and acceptance criteria.',
    hermesProfileKey: 'council.napoleon',
  },
  {
    agentId: 'saladin',
    profileId: 'saladin-trust-guardian',
    displayName: 'Saladin',
    roomId: 'council-strategists',
    role: 'council',
    description: 'Council profile backed by the real Hermes profile `saladin`: truthfulness, restraint, reputation, and user comfort.',
    hermesProfileKey: 'council.saladin',
  },
  {
    agentId: 'genghis',
    profileId: 'genghis-systems-khan',
    displayName: 'Genghis',
    roomId: 'council-strategists',
    role: 'council',
    description: 'Council profile backed by the real Hermes profile `genghis`: simple laws, scalable systems, routing, and repeatability.',
    hermesProfileKey: 'council.genghis',
  },
  {
    agentId: 'hannibal',
    profileId: 'hannibal-risk-flanker',
    displayName: 'Hannibal',
    roomId: 'council-strategists',
    role: 'council',
    description: 'Council profile backed by the real Hermes profile `hannibal`: creative flanks, hidden risks, edge cases, and adversarial review.',
    hermesProfileKey: 'council.hannibal',
  },
  {
    agentId: 'oracle',
    profileId: 'oracle-seo-trend-signals',
    displayName: 'Oracle',
    roomId: 'oracle-signals',
    role: 'research',
    description: 'Research, SEO, trend signals, forecasts, and market evidence.',
    hermesProfileKey: 'research.seo_trends',
  },

  {
    agentId: 'roster-keeper',
    profileId: 'pantheon-roster-rest',
    displayName: 'Roster Keeper',
    roomId: 'pantheon-quarters',
    role: 'roster',
    description: 'Agent roster, rest state, idle state, and assignment awareness.',
    hermesProfileKey: 'roster.rest_state',
  },
  {
    agentId: 'daedalus',
    profileId: 'daedalus-dev-qa-automation',
    displayName: 'Daedalus',
    roomId: 'daedalus-workshop',
    role: 'engineering',
    description: 'Development, QA, routing logic, test passes, and automation prototypes.',
    hermesProfileKey: 'engineering.qa_automation',
  },
]
