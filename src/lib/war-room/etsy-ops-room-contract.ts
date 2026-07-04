export type EtsyOpsStationId =
  | 'product-intake'
  | 'seo-oracle'
  | 'supplier-proof'
  | 'shotlab-prep'
  | 'listing-draft'
  | 'price-margin'
  | 'dlv-approval'
  | 'archive-vault'
  | 'media-sources'
  | 'rest-lounge'

export type EtsyOpsActionId =
  | 'inspect-product'
  | 'open-media-source'
  | 'prepare-listing-draft'
  | 'queue-shotlab-prep'
  | 'stage-upload-preview'
  | 'request-dlv-approval'
  | 'simulate-live-publish'
  | 'edit-live-listing'
  | 'message-supplier'
  | 'buy-sample'
  | 'hold-for-review'
  | 'agent-chat-note'

export type EtsyOpsStationKind =
  | 'product'
  | 'seo'
  | 'supplier'
  | 'shotlab'
  | 'listing'
  | 'finance'
  | 'approval'
  | 'archive'
  | 'media'
  | 'rest'

export type EtsyOpsRiskClass = 'read-only' | 'local-write' | 'approval-required' | 'blocked'

export type EtsyOpsPoint = { x: number; y: number }

export type EtsyOpsRoomPluginVersion = 'etsy-ops-room-v2'

export type EtsyOpsDirection =
  | 'north'
  | 'south'
  | 'east'
  | 'west'
  | 'north-east'
  | 'north-west'
  | 'south-east'
  | 'south-west'
  | 'still'

export type EtsyOpsAgentActivity =
  | 'idle'
  | 'walking'
  | 'working'
  | 'carrying'
  | 'talking'
  | 'waiting-approval'
  | 'resting'
  | 'blocked'

export type EtsyOpsAnimationState =
  | 'idle'
  | 'walk-north'
  | 'walk-south'
  | 'walk-east'
  | 'walk-west'
  | 'walk-north-east'
  | 'walk-north-west'
  | 'walk-south-east'
  | 'walk-south-west'
  | 'carry-packet'
  | 'work-at-station'
  | 'talk-status'
  | 'wait-approval'
  | 'rest-or-blocked'

export type EtsyOpsAnimationClip = {
  state: EtsyOpsAnimationState
  /**
   * Source art frames in the referenced strip/sheet. Runtime motion can sample
   * this art across a larger motionFrameCount without lying about the source.
   */
  frameCount: number
  motionFrameCount: number
  assetPath: string | null
  runtime: 'sprite-strip' | 'sprite-sheet' | 'runtime-sampled-strip' | 'css-pixel-proxy' | 'pending-generation'
  directions: Array<EtsyOpsDirection>
  fallbackState?: EtsyOpsAnimationState
}

export type EtsyOpsAnimationManifest = {
  id: string
  label: string
  status: 'style-lock-candidate' | 'runtime-ready' | 'pending-full-generation'
  frameSizePx: { w: number; h: number }
  targetFrames: number
  availableFrames: number
  alphaRequired: true
  bakedTextAllowed: false
  clips: Array<EtsyOpsAnimationClip>
  qa: {
    requiresStyleLockApproval: boolean
    requiresFrameValidation: boolean
    notes: Array<string>
  }
}

export type EtsyOpsAgentRouteStep = {
  id: string
  label: string
  stationId: EtsyOpsStationId
  point: EtsyOpsPoint
  path?: Array<EtsyOpsPoint>
  durationMs: number
  activity: EtsyOpsAgentActivity
  directionHint?: EtsyOpsDirection
  carryingPacket: string | null
  message: string
  actionId?: EtsyOpsActionId
}

export type EtsyOpsAgentMessage = {
  id: string
  fromAgentId: string
  toAgentId: string | 'operator'
  stationId: EtsyOpsStationId
  kind: 'handoff' | 'status' | 'approval' | 'operator-chat'
  text: string
  atMs: number
}

export type EtsyOpsStationVisualState = 'idle' | 'working' | 'packet' | 'approval' | 'chat'

export type EtsyOpsRoomPlugin = {
  id: typeof ETSY_OPS_ROOM_ID
  version: EtsyOpsRoomPluginVersion
  label: string
  cameraModes: Array<'world' | 'room'>
  defaultCameraMode: 'world' | 'room'
  gridSize: { w: number; h: number }
  safety: {
    allExternalActionsApprovalOnly: true
    liveExternalMutation: false
  }
}

export type EtsyOpsStationSpec = {
  id: EtsyOpsStationId
  label: string
  shortLabel: string
  kind: EtsyOpsStationKind
  role: string
  output: string
  agentId: string
  grid: EtsyOpsPoint
  size: { w: number; h: number }
  actions: Array<EtsyOpsActionId>
  riskClass: EtsyOpsRiskClass
}

export type EtsyOpsRouteSpec = {
  id: string
  from: EtsyOpsStationId
  to: EtsyOpsStationId
  label: string
  manualOnly?: boolean
  rail: { x: number; y: number; w: number; h: number }
}

export type EtsyOpsActionPolicy = {
  id: EtsyOpsActionId
  label: string
  riskClass: EtsyOpsRiskClass
  mode: 'read-only-preview' | 'safe-local-write' | 'manual-approval-packet' | 'blocked-packet'
  targetSystem: 'workspace-local' | 'media-source' | 'etsy-shop' | 'supplier-marketplace' | 'shotlab' | 'commerce'
  createsKanbanCard: boolean
  liveExternalMutation: false
  description: string
}

export type EtsyOpsProductSummary = {
  id: string
  title: string
  niche: string | null
  status: string
  currentRoom: string | null
  etsyAngle: string | null
  shotlabStatus: string | null
  sourceFile: string | null
  supplierLinkCount: number
  keywords: Array<string>
  opportunityScore: number | null
  nextAction: string | null
  priority: string | null
}

export type EtsyOpsKeywordSummary = {
  keyword: string
  signalScore: number | null
  score: number | null
  avgSales: number | null
  competitionLevel: string | null
  avgPrice: number | null
  nextAction: string | null
}

export type EtsyOpsSupplierLink = {
  productId: string
  platform: string
  url: string
  status: string
}

export type EtsyOpsMediaFile = {
  id: string
  name: string
  path: string
  relativePath: string
  kind: 'image' | 'source-file'
  extension: string
  size: number
  modifiedAt: string
  previewUrl: string | null
}

export type EtsyOpsMediaSource = {
  id: string
  label: string
  rootPath: string
  exists: boolean
  purpose: string
  imageCount: number
  sourceFileCount: number
}

export type EtsyOpsAgentState = {
  id: string
  label: string
  shortLabel: string
  role: string
  persona: string
  mythology: string
  historicalMirror: string
  modelProfileId: 'chatgpt-5.5'
  stationId: EtsyOpsStationId
  targetStationId: EtsyOpsStationId
  homeStationId: EtsyOpsStationId
  primaryStationIds: Array<EtsyOpsStationId>
  movementState: EtsyOpsAgentActivity
  spriteUrl: string
  portraitUrl: string
  accent: string
  carryingPacket: string | null
  speech: string
  capabilities: Array<string>
  route: Array<EtsyOpsAgentRouteStep>
  animation: EtsyOpsAnimationManifest
  chat: {
    workerId: string
    modelProfileId: 'chatgpt-5.5'
    systemPrompt: string
    suggestedPrompts: Array<string>
  }
}

export type EtsyOpsSafetyState = {
  liveEtsyEnabled: false
  supplierMessagesEnabled: false
  paidGenerationEnabled: false
  accountWritesEnabled: false
  workspaceWritesAllowed: true
  allowedWriteClasses: Array<string>
  blockedWriteClasses: Array<string>
}

export type EtsyOpsRoomState = {
  ok: true
  mode: EtsyOpsRoomPluginVersion
  store: { id: 'dolaro_boutique'; name: 'DolaroBoutique'; status: string }
  generatedAt: string
  plugin: EtsyOpsRoomPlugin
  room: {
    id: 'etsy-ops-dolaro'
    label: string
    theme: string
    stations: Array<EtsyOpsStationSpec>
    routes: Array<EtsyOpsRouteSpec>
    actions: Array<EtsyOpsActionPolicy>
  }
  safety: EtsyOpsSafetyState
  products: Array<EtsyOpsProductSummary>
  keywords: Array<EtsyOpsKeywordSummary>
  supplierLinks: Array<EtsyOpsSupplierLink>
  media: {
    sources: Array<EtsyOpsMediaSource>
    images: Array<EtsyOpsMediaFile>
    sourceFiles: Array<EtsyOpsMediaFile>
  }
  agents: Array<EtsyOpsAgentState>
  counts: {
    products: number
    keywords: number
    supplierLinks: number
    mediaImages: number
    mediaSourceFiles: number
  }
  notes: Array<string>
}

export const ETSY_OPS_ROOM_ID = 'etsy-ops-dolaro' as const

export const ETSY_OPS_ROOM_PLUGIN: EtsyOpsRoomPlugin = {
  id: ETSY_OPS_ROOM_ID,
  version: 'etsy-ops-room-v2',
  label: 'DolaroBoutique Living Etsy Ops',
  cameraModes: ['world', 'room'],
  defaultCameraMode: 'room',
  gridSize: { w: 100, h: 100 },
  safety: {
    allExternalActionsApprovalOnly: true,
    liveExternalMutation: false,
  },
}

export const ETSY_OPS_PRIMARY_AGENT_IDS = [
  'athena-market-strategist',
  'hephaestus-shotlab-artificer',
  'caesar-hermes-approval-commander',
] as const

export type EtsyOpsPrimaryAgentId = typeof ETSY_OPS_PRIMARY_AGENT_IDS[number]

const V4_RUNTIME_QA = {
  requiresStyleLockApproval: false,
  requiresFrameValidation: true,
  notes: [
    'V4 runtime art was generated from scratch with the image generation workflow in scripts/chatgpt-etsy-ops-v4-generate.mjs.',
    'Processed runtime assets are stored under public/war-room/etsy-ops-v4.',
    'Each primary agent uses 96 source frames across 12 generated rows and 8 frames per row.',
    'No text is baked into generated art; all labels and decisions render in React.',
  ],
} satisfies EtsyOpsAnimationManifest['qa']

const JULIUS_RUNTIME_QA = {
  requiresStyleLockApproval: false,
  requiresFrameValidation: true,
  notes: [
    'Julius v1 is packaged independently under public/war-room/etsy-ops-julius-v1.',
    'The pack preserves source-cell alignment to avoid side-to-side anchor wobble in walk cycles.',
    'Each runtime strip is validated as 8 nonblank alpha frames at 192px.',
    'No text is baked into generated art; all labels and decisions render in React.',
  ],
} satisfies EtsyOpsAnimationManifest['qa']

const MOTION_FRAMES = {
  idle: 24,
  walk: 48,
  work: 36,
  talk: 32,
  carry: 48,
  wait: 36,
  rest: 30,
} as const

const V4_SOURCE_FRAMES: Record<EtsyOpsAnimationState, number> = {
  idle: 8,
  'walk-north': 8,
  'walk-south': 8,
  'walk-east': 8,
  'walk-west': 8,
  'walk-north-east': 8,
  'walk-north-west': 8,
  'walk-south-east': 8,
  'walk-south-west': 8,
  'carry-packet': 8,
  'work-at-station': 8,
  'talk-status': 8,
  'wait-approval': 8,
  'rest-or-blocked': 8,
}

const V4_AGENT_SLUGS: Record<EtsyOpsPrimaryAgentId, string> = {
  'athena-market-strategist': 'athena-market-strategist',
  'hephaestus-shotlab-artificer': 'hephaestus-shotlab-artificer',
  'caesar-hermes-approval-commander': 'caesar-hermes-approval-commander',
}

const V4_AGENT_ASSET_VERSION = 'heph-clean-20260619'
const JULIUS_AGENT_ASSET_VERSION = 'julius-v1-20260619'

export function etsyOpsV4AgentAssetPath(slug: string, fileName: string) {
  return `/war-room/etsy-ops-v4/agents/${slug}/${fileName}?v=${V4_AGENT_ASSET_VERSION}`
}

export function etsyOpsJuliusAgentAssetPath(fileName: string) {
  return `/war-room/etsy-ops-julius-v1/agents/julius-caesar/${fileName}?v=${JULIUS_AGENT_ASSET_VERSION}`
}

export function etsyOpsPrimaryAgentAssetPath(agentId: EtsyOpsPrimaryAgentId, fileName: string) {
  if (agentId === 'caesar-hermes-approval-commander') {
    return etsyOpsJuliusAgentAssetPath(fileName)
  }
  return etsyOpsV4AgentAssetPath(V4_AGENT_SLUGS[agentId], fileName)
}

function clip(
  state: EtsyOpsAnimationState,
  frameCount: number,
  assetPath: string | null,
  runtime: EtsyOpsAnimationClip['runtime'],
  directions: Array<EtsyOpsDirection>,
  motionFrameCount: number,
  fallbackState?: EtsyOpsAnimationState,
): EtsyOpsAnimationClip {
  return { state, frameCount, motionFrameCount, assetPath, runtime, directions, fallbackState }
}

function v4Clip(
  agentId: EtsyOpsPrimaryAgentId,
  state: EtsyOpsAnimationState,
  directions: Array<EtsyOpsDirection>,
  motionFrameCount: number,
): EtsyOpsAnimationClip {
  return clip(
    state,
    V4_SOURCE_FRAMES[state],
    etsyOpsPrimaryAgentAssetPath(agentId, `${state}.png`),
    'runtime-sampled-strip',
    directions,
    motionFrameCount,
  )
}

function v4AgentManifest(
  agentId: EtsyOpsPrimaryAgentId,
  label: string,
): EtsyOpsAnimationManifest {
  const slug = V4_AGENT_SLUGS[agentId]
  const isJulius = agentId === 'caesar-hermes-approval-commander'
  return {
    id: isJulius ? 'julius-caesar-v1-runtime' : `${slug}-v4-generated-runtime`,
    label,
    status: 'runtime-ready',
    frameSizePx: { w: 192, h: 192 },
    targetFrames: 96,
    availableFrames: 96,
    alphaRequired: true,
    bakedTextAllowed: false,
    clips: [
      v4Clip(agentId, 'idle', ['still'], MOTION_FRAMES.idle),
      v4Clip(agentId, 'walk-south', ['south'], MOTION_FRAMES.walk),
      v4Clip(agentId, 'walk-north', ['north'], MOTION_FRAMES.walk),
      v4Clip(agentId, 'walk-east', ['east'], MOTION_FRAMES.walk),
      v4Clip(agentId, 'walk-west', ['west'], MOTION_FRAMES.walk),
      v4Clip(agentId, 'walk-north-east', ['north-east'], MOTION_FRAMES.walk),
      v4Clip(agentId, 'walk-north-west', ['north-west'], MOTION_FRAMES.walk),
      v4Clip(agentId, 'walk-south-east', ['south-east'], MOTION_FRAMES.walk),
      v4Clip(agentId, 'walk-south-west', ['south-west'], MOTION_FRAMES.walk),
      v4Clip(agentId, 'carry-packet', ['still'], MOTION_FRAMES.carry),
      v4Clip(agentId, 'work-at-station', ['still'], MOTION_FRAMES.work),
      v4Clip(agentId, 'talk-status', ['still'], MOTION_FRAMES.talk),
      v4Clip(agentId, 'wait-approval', ['still'], MOTION_FRAMES.wait),
      v4Clip(agentId, 'rest-or-blocked', ['still'], MOTION_FRAMES.rest),
    ],
    qa: isJulius ? JULIUS_RUNTIME_QA : V4_RUNTIME_QA,
  }
}

export const ETSY_OPS_AGENT_ANIMATION_MANIFESTS: Record<EtsyOpsPrimaryAgentId, EtsyOpsAnimationManifest> = {
  'athena-market-strategist': v4AgentManifest('athena-market-strategist', 'Athena market strategist'),
  'hephaestus-shotlab-artificer': v4AgentManifest('hephaestus-shotlab-artificer', 'Hephaestus / Da Vinci media artificer'),
  'caesar-hermes-approval-commander': v4AgentManifest('caesar-hermes-approval-commander', 'Caesar / Hermes approval commander'),
}

export const ETSY_OPS_STATIONS: Array<EtsyOpsStationSpec> = [
  {
    id: 'product-intake',
    label: 'Product Intake',
    shortLabel: 'Intake',
    kind: 'product',
    role: 'Turns Product Intelligence rows into local product packets.',
    output: 'Opportunity packet',
    agentId: 'athena-market-strategist',
    grid: { x: 21, y: 31 },
    size: { w: 17, h: 13 },
    actions: ['inspect-product', 'prepare-listing-draft', 'hold-for-review'],
    riskClass: 'local-write',
  },
  {
    id: 'seo-oracle',
    label: 'SEO Oracle',
    shortLabel: 'SEO',
    kind: 'seo',
    role: 'Matches real keyword signals to the selected product.',
    output: 'Tag and title signal packet',
    agentId: 'athena-market-strategist',
    grid: { x: 45, y: 29 },
    size: { w: 16, h: 13 },
    actions: ['inspect-product', 'prepare-listing-draft'],
    riskClass: 'read-only',
  },
  {
    id: 'supplier-proof',
    label: 'Supplier Proof',
    shortLabel: 'Proof',
    kind: 'supplier',
    role: 'Reviews supplier links as evidence only.',
    output: 'Supplier proof packet',
    agentId: 'athena-market-strategist',
    grid: { x: 69, y: 31 },
    size: { w: 17, h: 13 },
    actions: ['inspect-product', 'message-supplier', 'buy-sample', 'request-dlv-approval'],
    riskClass: 'approval-required',
  },
  {
    id: 'media-sources',
    label: 'Media Sources',
    shortLabel: 'Media',
    kind: 'media',
    role: 'Connects approved local folders and real files.',
    output: 'Local preview shelf',
    agentId: 'hephaestus-shotlab-artificer',
    grid: { x: 21, y: 53 },
    size: { w: 17, h: 13 },
    actions: ['open-media-source', 'queue-shotlab-prep'],
    riskClass: 'read-only',
  },
  {
    id: 'shotlab-prep',
    label: 'ShotLab Prep',
    shortLabel: 'ShotLab',
    kind: 'shotlab',
    role: 'Prepares image briefs from real media and product evidence.',
    output: 'ShotLab prep packet',
    agentId: 'hephaestus-shotlab-artificer',
    grid: { x: 45, y: 53 },
    size: { w: 17, h: 14 },
    actions: ['queue-shotlab-prep', 'request-dlv-approval'],
    riskClass: 'approval-required',
  },
  {
    id: 'listing-draft',
    label: 'Listing Draft',
    shortLabel: 'Draft',
    kind: 'listing',
    role: 'Builds title, tags, description, and upload preview as a local draft.',
    output: 'Listing draft packet',
    agentId: 'caesar-hermes-approval-commander',
    grid: { x: 69, y: 53 },
    size: { w: 17, h: 13 },
    actions: ['prepare-listing-draft', 'stage-upload-preview', 'edit-live-listing'],
    riskClass: 'approval-required',
  },
  {
    id: 'price-margin',
    label: 'Price / Margin',
    shortLabel: 'Margin',
    kind: 'finance',
    role: 'Holds pricing evidence and margin review before commerce approval.',
    output: 'Margin review packet',
    agentId: 'caesar-hermes-approval-commander',
    grid: { x: 21, y: 74 },
    size: { w: 17, h: 13 },
    actions: ['inspect-product', 'request-dlv-approval'],
    riskClass: 'approval-required',
  },
  {
    id: 'dlv-approval',
    label: 'DLV Approval Gate',
    shortLabel: 'Approval',
    kind: 'approval',
    role: 'Stops every live Etsy, supplier, paid, and account action.',
    output: 'Manual approval packet',
    agentId: 'caesar-hermes-approval-commander',
    grid: { x: 46, y: 74 },
    size: { w: 17, h: 13 },
    actions: ['request-dlv-approval', 'simulate-live-publish', 'edit-live-listing', 'message-supplier', 'buy-sample'],
    riskClass: 'approval-required',
  },
  {
    id: 'archive-vault',
    label: 'Archive Vault',
    shortLabel: 'Archive',
    kind: 'archive',
    role: 'Stores source files, decisions, and proof without touching live systems.',
    output: 'Evidence bundle',
    agentId: 'caesar-hermes-approval-commander',
    grid: { x: 69, y: 74 },
    size: { w: 17, h: 13 },
    actions: ['open-media-source', 'hold-for-review'],
    riskClass: 'read-only',
  },
]

export const ETSY_OPS_EXTERNAL_STATIONS: Array<EtsyOpsStationSpec> = [
  {
    id: 'rest-lounge',
    label: 'Rest Hall',
    shortLabel: 'Rest',
    kind: 'rest',
    role: 'External rest room for idle agents between work cycles.',
    output: 'Rest state',
    agentId: 'warroomagent',
    grid: { x: 50, y: 112 },
    size: { w: 18, h: 12 },
    actions: ['hold-for-review'],
    riskClass: 'read-only',
  },
]

export const ETSY_OPS_ALL_STATIONS: Array<EtsyOpsStationSpec> = [
  ...ETSY_OPS_STATIONS,
  ...ETSY_OPS_EXTERNAL_STATIONS,
]

export const ETSY_OPS_ROUTES: Array<EtsyOpsRouteSpec> = [
  { id: 'route-intake-seo', from: 'product-intake', to: 'seo-oracle', label: 'Opportunity to keyword signal', rail: { x: 29, y: 28, w: 18, h: 4 } },
  { id: 'route-seo-proof', from: 'seo-oracle', to: 'supplier-proof', label: 'Keyword proof to supplier review', rail: { x: 54, y: 28, w: 19, h: 4 } },
  { id: 'route-intake-media', from: 'product-intake', to: 'media-sources', label: 'Product packet to media shelf', rail: { x: 21, y: 34, w: 4, h: 18 } },
  { id: 'route-media-shotlab', from: 'media-sources', to: 'shotlab-prep', label: 'Real media to ShotLab prep', manualOnly: true, rail: { x: 29, y: 54, w: 17, h: 4 } },
  { id: 'route-shotlab-draft', from: 'shotlab-prep', to: 'listing-draft', label: 'Image brief to listing draft', manualOnly: true, rail: { x: 55, y: 54, w: 19, h: 4 } },
  { id: 'route-draft-approval', from: 'listing-draft', to: 'dlv-approval', label: 'Draft stops at approval gate', manualOnly: true, rail: { x: 62, y: 60, w: 4, h: 21 } },
  { id: 'route-margin-approval', from: 'price-margin', to: 'dlv-approval', label: 'Margin review to DLV', manualOnly: true, rail: { x: 38, y: 80, w: 18, h: 4 } },
  { id: 'route-approval-archive', from: 'dlv-approval', to: 'archive-vault', label: 'Decision evidence to archive', rail: { x: 65, y: 81, w: 15, h: 4 } },
]

export const ETSY_OPS_ACTION_POLICIES: Array<EtsyOpsActionPolicy> = [
  {
    id: 'inspect-product',
    label: 'Inspect product evidence',
    riskClass: 'read-only',
    mode: 'read-only-preview',
    targetSystem: 'workspace-local',
    createsKanbanCard: false,
    liveExternalMutation: false,
    description: 'Reads the selected local Product Intelligence product, keywords, and supplier evidence.',
  },
  {
    id: 'open-media-source',
    label: 'Inspect media/source files',
    riskClass: 'read-only',
    mode: 'read-only-preview',
    targetSystem: 'media-source',
    createsKanbanCard: false,
    liveExternalMutation: false,
    description: 'Lists only approved local media/source folders and never scans outside the allowlist.',
  },
  {
    id: 'prepare-listing-draft',
    label: 'Prepare local listing draft',
    riskClass: 'local-write',
    mode: 'safe-local-write',
    targetSystem: 'workspace-local',
    createsKanbanCard: true,
    liveExternalMutation: false,
    description: 'Creates a local Workspace/Kanban card for a draft title, tags, description, and evidence checklist.',
  },
  {
    id: 'queue-shotlab-prep',
    label: 'Queue ShotLab prep packet',
    riskClass: 'approval-required',
    mode: 'manual-approval-packet',
    targetSystem: 'shotlab',
    createsKanbanCard: true,
    liveExternalMutation: false,
    description: 'Prepares a ShotLab brief packet only; paid generation remains locked until DLV approval.',
  },
  {
    id: 'stage-upload-preview',
    label: 'Stage Etsy upload preview',
    riskClass: 'approval-required',
    mode: 'manual-approval-packet',
    targetSystem: 'etsy-shop',
    createsKanbanCard: true,
    liveExternalMutation: false,
    description: 'Creates a local upload preview packet without opening or editing a live Etsy listing.',
  },
  {
    id: 'request-dlv-approval',
    label: 'Request DLV approval',
    riskClass: 'approval-required',
    mode: 'manual-approval-packet',
    targetSystem: 'commerce',
    createsKanbanCard: true,
    liveExternalMutation: false,
    description: 'Creates a manual approval packet with risk, evidence, and next action.',
  },
  {
    id: 'simulate-live-publish',
    label: 'Live publish request',
    riskClass: 'approval-required',
    mode: 'manual-approval-packet',
    targetSystem: 'etsy-shop',
    createsKanbanCard: true,
    liveExternalMutation: false,
    description: 'Converts a publish request into an approval packet. It never publishes.',
  },
  {
    id: 'edit-live-listing',
    label: 'Edit live listing request',
    riskClass: 'approval-required',
    mode: 'manual-approval-packet',
    targetSystem: 'etsy-shop',
    createsKanbanCard: true,
    liveExternalMutation: false,
    description: 'Converts a live listing edit request into an approval packet. It never edits Etsy.',
  },
  {
    id: 'message-supplier',
    label: 'Supplier message request',
    riskClass: 'approval-required',
    mode: 'manual-approval-packet',
    targetSystem: 'supplier-marketplace',
    createsKanbanCard: true,
    liveExternalMutation: false,
    description: 'Converts a supplier contact request into an approval packet. It never sends a message.',
  },
  {
    id: 'buy-sample',
    label: 'Buy sample request',
    riskClass: 'approval-required',
    mode: 'manual-approval-packet',
    targetSystem: 'supplier-marketplace',
    createsKanbanCard: true,
    liveExternalMutation: false,
    description: 'Converts purchase/order intent into an approval packet. It never spends money.',
  },
  {
    id: 'hold-for-review',
    label: 'Hold for review',
    riskClass: 'local-write',
    mode: 'safe-local-write',
    targetSystem: 'workspace-local',
    createsKanbanCard: true,
    liveExternalMutation: false,
    description: 'Creates a local review/blocked card when evidence is missing or the worker should pause.',
  },
  {
    id: 'agent-chat-note',
    label: 'Send agent chat packet',
    riskClass: 'local-write',
    mode: 'safe-local-write',
    targetSystem: 'workspace-local',
    createsKanbanCard: true,
    liveExternalMutation: false,
    description: 'Stores an operator question or instruction as a local Hermes agent packet using the agent model profile context.',
  },
]

export function etsyOpsStationById(stationId: EtsyOpsStationId) {
  return ETSY_OPS_ALL_STATIONS.find((station) => station.id === stationId) ?? null
}

export function etsyOpsActionPolicyById(actionId: EtsyOpsActionId) {
  return ETSY_OPS_ACTION_POLICIES.find((action) => action.id === actionId) ?? null
}
