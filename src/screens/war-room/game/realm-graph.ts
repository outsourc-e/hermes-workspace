import type { OlympusBox } from './types'

export type OlympusRealmStatus = 'active' | 'foundation' | 'reserved'
export type OlympusRealmKind = 'command' | 'agents' | 'market' | 'signals' | 'forge' | 'suppliers' | 'archive' | 'finance'
export type OlympusToolActivity = 'idle' | 'active' | 'review' | 'blocked' | 'error'

export type RealmMapHotspot = {
  roomId: string
  label: string
  x: number
  y: number
  w: number
  h: number
}

export type OlympusExpansionSlot = {
  id: string
  label: string
  purpose: string
  status: 'locked' | 'reserved' | 'ready'
}

export type OlympusRealmNode = {
  id: string
  roomId: string
  label: string
  kind: OlympusRealmKind
  status: OlympusRealmStatus
  parentId?: string
  mapHotspot: RealmMapHotspot
  palette: {
    primary: string
    secondary: string
    glow: string
  }
  dataAdapters: Array<'swarm' | 'sessions' | 'cron' | 'product-research' | 'alura' | 'etsy-stats' | 'shotlab' | 'files' | 'skills' | 'finance'>
  expansionSlots: Array<OlympusExpansionSlot>
}

export type OlympusToolCockpitContract = {
  id: string
  roomId: string
  stationId: string
  label: string
  activity: OlympusToolActivity
  reason: string
  liveSources: OlympusRealmNode['dataAdapters']
  historyKinds: Array<'runs' | 'searches' | 'screenshots' | 'assets' | 'approvals' | 'costs' | 'reports'>
  safeActions: Array<string>
  lockedActions: Array<string>
}

export type OlympusNavigationContract = {
  roomId: string
  walkableBounds: OlympusBox
  collisionRadius: number
  pathMode: 'authored-lanes-now-a-star-next'
  rules: Array<string>
}

export const olympusRealmGraph: Array<OlympusRealmNode> = [
  {
    id: 'realm-olympus-command',
    roomId: 'olympus-command',
    label: 'Olympus Command',
    kind: 'command',
    status: 'active',
    mapHotspot: { roomId: 'olympus-command', label: 'Olympus Command', x: 50, y: 47, w: 20, h: 20 },
    palette: { primary: '#67e8f9', secondary: '#ffeeb0', glow: 'rgba(103,232,249,.44)' },
    dataAdapters: ['swarm', 'sessions', 'cron'],
    expansionSlots: [{ id: 'command-omen-wall', label: 'Omen Wall', purpose: 'mission forecasts and blockers', status: 'reserved' }],
  },
  {
    id: 'realm-pantheon',
    roomId: 'pantheon-quarters',
    label: 'Pantheon Quarters',
    kind: 'agents',
    status: 'foundation',
    mapHotspot: { roomId: 'pantheon-quarters', label: 'Pantheon Quarters', x: 24, y: 21, w: 18, h: 18 },
    palette: { primary: '#fbbf24', secondary: '#fde68a', glow: 'rgba(251,191,36,.38)' },
    dataAdapters: ['swarm', 'sessions', 'skills'],
    expansionSlots: [{ id: 'model-hall', label: 'Model Hall', purpose: 'provider/model roster and worker health', status: 'reserved' }],
  },
  {
    id: 'realm-agora',
    roomId: 'agora',
    label: 'Agora of Opportunity',
    kind: 'market',
    status: 'foundation',
    mapHotspot: { roomId: 'agora', label: 'Agora of Opportunity', x: 50, y: 19, w: 18, h: 18 },
    palette: { primary: '#6ee7b7', secondary: '#bef264', glow: 'rgba(110,231,183,.38)' },
    dataAdapters: ['product-research', 'alura', 'etsy-stats', 'files'],
    expansionSlots: [{ id: 'shop-stalls', label: 'Shop Stalls', purpose: 'future shop opportunity lanes', status: 'reserved' }],
  },
  {
    id: 'realm-oracle',
    roomId: 'oracle',
    label: 'Oracle of Signals',
    kind: 'signals',
    status: 'foundation',
    mapHotspot: { roomId: 'oracle', label: 'Oracle of Signals', x: 79, y: 22, w: 18, h: 18 },
    palette: { primary: '#c4b5fd', secondary: '#7dd3fc', glow: 'rgba(196,181,253,.42)' },
    dataAdapters: ['cron', 'product-research', 'alura', 'etsy-stats', 'sessions'],
    expansionSlots: [{ id: 'keyword-constellation', label: 'Keyword Constellation', purpose: 'Alura/trend keyword history and charts', status: 'ready' }],
  },
  {
    id: 'realm-forge',
    roomId: 'forge',
    label: 'Forge of Hephaestus',
    kind: 'forge',
    status: 'active',
    mapHotspot: { roomId: 'forge', label: 'Forge of Hephaestus', x: 82, y: 53, w: 18, h: 18 },
    palette: { primary: '#fb923c', secondary: '#facc15', glow: 'rgba(251,146,60,.42)' },
    dataAdapters: ['shotlab', 'files', 'swarm', 'sessions'],
    expansionSlots: [{ id: 'shotlab-annex', label: 'ShotLab Annex', purpose: 'image batches, base/variant sets, approvals', status: 'ready' }],
  },
  {
    id: 'realm-harbor',
    roomId: 'merchant-harbor',
    label: 'Merchant Harbor',
    kind: 'suppliers',
    status: 'foundation',
    mapHotspot: { roomId: 'merchant-harbor', label: 'Merchant Harbor', x: 18, y: 54, w: 18, h: 18 },
    palette: { primary: '#22d3ee', secondary: '#a7f3d0', glow: 'rgba(34,211,238,.38)' },
    dataAdapters: ['product-research', 'files', 'swarm', 'sessions'],
    expansionSlots: [{ id: 'supplier-docks', label: 'Supplier Docks', purpose: 'AliExpress/Alibaba evidence lanes', status: 'reserved' }],
  },
  {
    id: 'realm-atlantis',
    roomId: 'atlantis-vault',
    label: 'Atlantis Vault',
    kind: 'archive',
    status: 'foundation',
    mapHotspot: { roomId: 'atlantis-vault', label: 'Atlantis Vault', x: 35, y: 77, w: 18, h: 18 },
    palette: { primary: '#5eead4', secondary: '#93c5fd', glow: 'rgba(94,234,212,.38)' },
    dataAdapters: ['files', 'skills', 'product-research', 'shotlab'],
    expansionSlots: [{ id: 'evidence-vault', label: 'Evidence Vault', purpose: 'screenshots, reports, old searches, generated assets', status: 'ready' }],
  },
  {
    id: 'realm-treasury',
    roomId: 'treasury',
    label: 'Treasury of Commerce',
    kind: 'finance',
    status: 'foundation',
    mapHotspot: { roomId: 'treasury', label: 'Treasury of Commerce', x: 70, y: 76, w: 18, h: 18 },
    palette: { primary: '#fde047', secondary: '#fbbf24', glow: 'rgba(253,224,71,.38)' },
    dataAdapters: ['finance', 'cron', 'swarm', 'sessions'],
    expansionSlots: [{ id: 'margin-ledger', label: 'Margin Ledger', purpose: 'cost, fees, paid locks, approval packets', status: 'reserved' }],
  },
]

export const realmMapHotspots: Array<RealmMapHotspot> = olympusRealmGraph.map((realm) => realm.mapHotspot)

export const olympusToolCockpits: Array<OlympusToolCockpitContract> = [
  {
    id: 'oracle-keyword-crystal',
    roomId: 'oracle',
    stationId: 'keyword-crystal',
    label: 'Keyword Crystal',
    activity: 'idle',
    reason: 'Will glow when product research, cron, Alura, or trend sessions are active.',
    liveSources: ['cron', 'product-research', 'alura', 'etsy-stats', 'sessions'],
    historyKinds: ['searches', 'runs', 'reports'],
    safeActions: ['Browse old keyword searches', 'Inspect trend snapshots', 'Open product-research history'],
    lockedActions: ['No paid tools without approval', 'No Etsy edits'],
  },
  {
    id: 'forge-shotlab-listing-easel',
    roomId: 'forge',
    stationId: 'listing-easel',
    label: 'Listing Easel',
    activity: 'review',
    reason: 'Draft package/ShotLab state must remain review-only until DLV approval.',
    liveSources: ['shotlab', 'files', 'swarm', 'sessions'],
    historyKinds: ['assets', 'screenshots', 'approvals'],
    safeActions: ['Inspect draft package', 'Compare image sets', 'Read approval notes'],
    lockedActions: ['No Etsy publish', 'No renew', 'No live listing edit'],
  },
]

export const olympusNavigationContracts: Array<OlympusNavigationContract> = olympusRealmGraph.map((realm) => ({
  roomId: realm.roomId,
  walkableBounds: { x: 12, y: 32, w: 76, h: 52 },
  collisionRadius: realm.roomId === 'olympus-command' ? 4.5 : 3.6,
  pathMode: 'authored-lanes-now-a-star-next',
  rules: [
    'Use station.operatorSpot for interactions; never path through station.hotspot boxes.',
    'Reserve destination/operator spot before walking when multiple agents are present.',
    'If a station is blocked, route to the nearest open holding point instead of clipping.',
  ],
}))

export function realmForRoom(roomId: string) {
  return olympusRealmGraph.find((realm) => realm.roomId === roomId) ?? null
}

export function cockpitForStation(roomId: string, stationId: string) {
  return olympusToolCockpits.find((cockpit) => cockpit.roomId === roomId && cockpit.stationId === stationId) ?? null
}
