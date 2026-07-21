import { ETSY_ROOM_LOCKED_ACTIONS } from './etsy-room-contracts'
import type { LivingV3RoomId, LivingV3StationId } from './living-v3-contract'

export type WorkspaceToolId =
  | 'command-room-manager'
  | 'etsy-research-lab'
  | 'smart-intake-v2'
  | 'etsy-sheet-intake'
  | 'etsy-product-gallery'
  | 'shotlab-handoff'
  | 'seo-workbench'
  | 'approval-inbox'
  | 'daily-news-board'

export type WorkspaceToolStatus = 'ready' | 'partial' | 'blocked' | 'future'
export type WorkspaceToolNeed = 'hermesWorker' | 'codex' | 'browser' | 'google' | 'shotlab' | 'etsy' | 'approval'
export type WorkspaceToolRecommendationDecision =
  | 'use_existing_tool'
  | 'improve_existing_tool'
  | 'create_new_tool'
  | 'create_new_room'
  | 'create_hidden_worker'

export type WorkspaceToolField = {
  id: string
  label: string
  kind: 'text' | 'csv' | 'tsv' | 'json' | 'local_path' | 'public_url' | 'packet' | 'approval'
  required: boolean
  status: 'ready' | 'partial' | 'missing' | 'blocked' | 'future'
}

export type WorkspaceToolArtifact = {
  id: string
  label: string
  kind: 'manifest' | 'markdown' | 'gallery' | 'packet' | 'approval' | 'board'
  status: 'ready' | 'partial' | 'blocked' | 'future'
}

export type WorkspaceToolContract = {
  id: WorkspaceToolId
  label: string
  description: string
  status: WorkspaceToolStatus
  inputs: Array<WorkspaceToolField>
  outputs: Array<WorkspaceToolArtifact>
  allowedActions: Array<string>
  lockedActions: Array<string>
  owningSurface: {
    roomId: LivingV3RoomId
    stationId?: LivingV3StationId
    label: string
  }
  needs: Record<WorkspaceToolNeed, boolean>
}

export type WorkspaceToolRecommendation = {
  decision: WorkspaceToolRecommendationDecision
  toolId?: WorkspaceToolId
  label: string
  reason: string
  ready: Array<string>
  missing: Array<string>
  blocked: Array<string>
  safety: {
    usageAllowed: false
    workerSpawnAllowed: false
    lockedActions: Array<string>
  }
}

export type WorkspaceToolSurfaceId =
  | 'command-room-manager'
  | 'etsy-scout'
  | 'smart-intake'
  | 'sheet-intake'
  | 'shotlab-handoff'
  | 'seo-workbench'
  | 'approval-inbox'
  | 'daily-news-board'
  | 'future-board'

export type WorkspaceToolRouteAction =
  | 'open_command_manager'
  | 'open_odin_scout'
  | 'open_and_prefill_smart_intake'
  | 'open_and_prefill_sheet_intake'
  | 'open_product_gallery'
  | 'open_shotlab_handoff'
  | 'open_seo_workbench'
  | 'open_approval_inbox'
  | 'open_daily_news_board'
  | 'blocked_hidden_worker'
  | 'explain_missing_tool'
  | 'explain_room_request'

export type WorkspaceToolRoute = {
  routeId: string
  createdAtMs: number
  taskText: string
  recommendation: WorkspaceToolRecommendation
  target: {
    roomId: LivingV3RoomId
    stationId?: LivingV3StationId
    surfaceId: WorkspaceToolSurfaceId
    action: WorkspaceToolRouteAction
  }
  stationHandoff: {
    toolId: WorkspaceToolId
    stationLabel: string
    status: 'ready' | 'partial' | 'blocked'
    readback: string
    nextUiStep: string
  }
  safety: {
    localOnly: true
    usageAllowed: false
    workerSpawnAllowed: false
    externalRequestsAllowed: false
    liveActionsAllowed: false
    lockedActions: Array<string>
  }
}

const baseLockedActions = [...ETSY_ROOM_LOCKED_ACTIONS]

const noLiveNeeds: Record<WorkspaceToolNeed, boolean> = {
  hermesWorker: false,
  codex: false,
  browser: false,
  google: false,
  shotlab: false,
  etsy: false,
  approval: false,
}

export const WORKSPACE_TOOL_REGISTRY: Array<WorkspaceToolContract> = [
  {
    id: 'command-room-manager',
    label: 'Command Room Manager',
    description: 'Local conductor surface that routes requests to existing tools and exposes safety gates.',
    status: 'ready',
    inputs: [
      { id: 'operator-request', label: 'Operator request', kind: 'text', required: false, status: 'ready' },
    ],
    outputs: [
      { id: 'tool-recommendation', label: 'Tool routing recommendation', kind: 'board', status: 'ready' },
      { id: 'safety-readback', label: 'Safety and lock readback', kind: 'approval', status: 'ready' },
    ],
    allowedActions: ['route to existing local tool', 'explain missing tool', 'recommend local-only next step'],
    lockedActions: baseLockedActions,
    owningSurface: { roomId: 'olympus-command', stationId: 'mission-router', label: 'Olympus Command / Mission Router' },
    needs: noLiveNeeds,
  },
  {
    id: 'etsy-research-lab',
    label: 'Etsy Research Lab',
    description: 'Verified local atlas for product, shop, and comparative market research with selectable investigation depth.',
    status: 'ready',
    inputs: [
      { id: 'research-target', label: 'Product, shop, or market target', kind: 'text', required: true, status: 'ready' },
      { id: 'research-url', label: 'Optional public source URL', kind: 'public_url', required: false, status: 'ready' },
      { id: 'research-depth', label: 'Quick, Standard, Deep, or Meta depth', kind: 'text', required: true, status: 'ready' },
      { id: 'research-modules', label: 'Selected evidence modules', kind: 'packet', required: true, status: 'ready' },
    ],
    outputs: [
      { id: 'verified-research-atlas', label: 'Verified three-shop Research Atlas', kind: 'board', status: 'ready' },
      { id: 'research-workbooks', label: 'Research workbooks and QA manifest', kind: 'manifest', status: 'ready' },
      { id: 'research-mission-packet', label: 'Reusable local research mission packet', kind: 'packet', status: 'ready' },
    ],
    allowedActions: ['read verified local research', 'open the local interactive atlas', 'download verified workbooks', 'stage a local research mission packet'],
    lockedActions: [...baseLockedActions, 'live research start without operator confirmation', 'supplier contact'],
    owningSurface: { roomId: 'etsy-market-lab', stationId: 'etsy-loki-product-hunt', label: 'Etsy Market Lab / Research Lab' },
    needs: noLiveNeeds,
  },
  {
    id: 'smart-intake-v2',
    label: 'Smart Intake V2',
    description: 'Local AI-swarm workbench that detects messy source refs, stages product/image matches, and builds markdown dossiers.',
    status: 'ready',
    inputs: [
      { id: 'mixed-mission-input', label: 'Mixed mission input', kind: 'text', required: true, status: 'ready' },
      { id: 'supplier-links', label: 'AliExpress or supplier links', kind: 'public_url', required: false, status: 'blocked' },
      { id: 'google-docs-sheets-drive', label: 'Google Docs, Sheets, Drive refs', kind: 'public_url', required: false, status: 'blocked' },
      { id: 'local-files-images', label: 'Local files and images', kind: 'local_path', required: false, status: 'ready' },
    ],
    outputs: [
      { id: 'smart-intake-mission', label: 'SmartIntakeMission', kind: 'board', status: 'ready' },
      { id: 'source-evidence-map', label: 'Sources, tasks, and evidence', kind: 'board', status: 'ready' },
      { id: 'product-image-matches', label: 'Product matches and image sets', kind: 'gallery', status: 'ready' },
      { id: 'smart-dossiers', label: 'Markdown dossiers', kind: 'markdown', status: 'ready' },
      { id: 'smart-odin-packet', label: 'Product Search / ShotLab handoff packet', kind: 'packet', status: 'ready' },
    ],
    allowedActions: ['detect local source refs', 'show staged local progress', 'preview markdown dossiers', 'create local product packet'],
    lockedActions: baseLockedActions,
    owningSurface: { roomId: 'etsy-market-lab', stationId: 'etsy-loki-product-hunt', label: 'Etsy Market Lab / Product Search' },
    needs: { ...noLiveNeeds, approval: true },
  },
  {
    id: 'etsy-sheet-intake',
    label: 'Etsy Sheet Intake',
    description: 'Reads pasted CSV, TSV, JSON, safe local files, or simple public CSV into normalized local products.',
    status: 'ready',
    inputs: [
      { id: 'pasted-text', label: 'Pasted CSV/TSV/JSON text', kind: 'text', required: false, status: 'ready' },
      { id: 'local-import-path', label: 'Safe local import path', kind: 'local_path', required: false, status: 'ready' },
      { id: 'public-csv-url', label: 'Public CSV URL', kind: 'public_url', required: false, status: 'partial' },
      { id: 'private-google-sheet', label: 'Private Google Sheet', kind: 'public_url', required: false, status: 'blocked' },
    ],
    outputs: [
      { id: 'manifest', label: 'Run manifest JSON', kind: 'manifest', status: 'ready' },
      { id: 'dossiers', label: 'Markdown product dossiers', kind: 'markdown', status: 'ready' },
      { id: 'normalized-products', label: 'Normalized product records', kind: 'gallery', status: 'ready' },
    ],
    allowedActions: ['read local/pasted data', 'write local dossiers', 'create local selected product packet'],
    lockedActions: baseLockedActions,
    owningSurface: { roomId: 'etsy-market-lab', stationId: 'etsy-loki-product-hunt', label: 'Etsy Market Lab / Product Search' },
    needs: { ...noLiveNeeds, approval: true },
  },
  {
    id: 'etsy-product-gallery',
    label: 'Etsy Product Gallery',
    description: 'Scrollable local gallery for scored products, warnings, source state, and dossier preview.',
    status: 'ready',
    inputs: [
      { id: 'normalized-products', label: 'Normalized products', kind: 'json', required: true, status: 'ready' },
    ],
    outputs: [
      { id: 'selected-product-packet', label: 'Selected Product Packet', kind: 'packet', status: 'ready' },
    ],
    allowedActions: ['filter local products', 'preview markdown dossier', 'choose product'],
    lockedActions: baseLockedActions,
    owningSurface: { roomId: 'etsy-market-lab', stationId: 'etsy-loki-product-hunt', label: 'Etsy Market Lab / Product Search' },
    needs: { ...noLiveNeeds, approval: true },
  },
  {
    id: 'shotlab-handoff',
    label: 'ShotLab Handoff',
    description: 'Local handoff packet for future ShotLab prep. Paid generation stays locked.',
    status: 'partial',
    inputs: [
      { id: 'selected-product', label: 'Selected product packet', kind: 'packet', required: true, status: 'ready' },
      { id: 'source-media', label: 'Source media truth', kind: 'json', required: true, status: 'missing' },
    ],
    outputs: [
      { id: 'shotlab-packet', label: 'ShotLab handoff packet', kind: 'packet', status: 'partial' },
    ],
    allowedActions: ['stage local ShotLab packet'],
    lockedActions: baseLockedActions,
    owningSurface: { roomId: 'etsy-market-lab', stationId: 'etsy-thor-shotlab-prep', label: 'Etsy Market Lab / ShotLab Prep' },
    needs: { ...noLiveNeeds, shotlab: true, approval: true },
  },
  {
    id: 'seo-workbench',
    label: 'SEO Workbench',
    description: 'Local SEO packet and keyword readback surface with explicit missing metric fields.',
    status: 'partial',
    inputs: [
      { id: 'selected-product', label: 'Selected product packet', kind: 'packet', required: true, status: 'ready' },
      { id: 'keyword-metrics', label: 'Keyword metrics', kind: 'json', required: false, status: 'missing' },
    ],
    outputs: [
      { id: 'seo-packet', label: 'SEO packet', kind: 'packet', status: 'partial' },
    ],
    allowedActions: ['stage local SEO packet', 'mark missing metrics'],
    lockedActions: baseLockedActions,
    owningSurface: { roomId: 'etsy-market-lab', stationId: 'etsy-thor-seo-metrics', label: 'Etsy Market Lab / SEO & Metrics' },
    needs: noLiveNeeds,
  },
  {
    id: 'approval-inbox',
    label: 'Approval Inbox',
    description: 'Local decision queue for evidence, readback, and locked live-action review.',
    status: 'partial',
    inputs: [
      { id: 'approval-packet', label: 'Approval packet', kind: 'approval', required: true, status: 'ready' },
    ],
    outputs: [
      { id: 'operator-decision', label: 'Operator decision', kind: 'approval', status: 'partial' },
    ],
    allowedActions: ['review local approval packets'],
    lockedActions: baseLockedActions,
    owningSurface: { roomId: 'olympus-command', stationId: 'approval-dais', label: 'Olympus Command / Approval Dais' },
    needs: { ...noLiveNeeds, approval: true },
  },
  {
    id: 'daily-news-board',
    label: 'Daily News Board',
    description: 'Core Gateway surface for existing daily news/content workflows. It stages local briefing packets; live delivery stays locked.',
    status: 'partial',
    inputs: [
      { id: 'news-brief-prompt', label: 'Briefing prompt', kind: 'text', required: true, status: 'ready' },
      { id: 'news-source', label: 'News source links', kind: 'public_url', required: false, status: 'partial' },
    ],
    outputs: [
      { id: 'news-brief-packet', label: 'Local news/content packet', kind: 'packet', status: 'partial' },
    ],
    allowedActions: ['stage local briefing packet', 'preview readback', 'keep Discord delivery locked'],
    lockedActions: baseLockedActions,
    owningSurface: { roomId: 'gateway-cockpit', stationId: 'gateway-console', label: 'Gateway Cockpit / Daily News Board' },
    needs: { ...noLiveNeeds, browser: true, approval: true },
  },
]

function terms(text: string) {
  return text.toLowerCase()
}

function includesAny(text: string, values: Array<string>) {
  return values.some((value) => text.includes(value))
}

function toolById(toolId: WorkspaceToolId) {
  return WORKSPACE_TOOL_REGISTRY.find((tool) => tool.id === toolId)
}

function missingFor(tool: WorkspaceToolContract) {
  return tool.inputs
    .filter((input) => input.status === 'missing' || input.status === 'blocked' || input.status === 'future')
    .map((input) => input.label)
}

function readyFor(tool: WorkspaceToolContract) {
  return [
    ...tool.inputs.filter((input) => input.status === 'ready').map((input) => input.label),
    ...tool.outputs.filter((output) => output.status === 'ready').map((output) => output.label),
  ]
}

function blockedFor(tool: WorkspaceToolContract) {
  return [
    ...tool.inputs.filter((input) => input.status === 'blocked').map((input) => input.label),
    ...tool.outputs.filter((output) => output.status === 'blocked').map((output) => output.label),
    ...Object.entries(tool.needs)
      .filter(([need, value]) => value && ['browser', 'google', 'shotlab', 'etsy', 'hermesWorker'].includes(need))
      .map(([need]) => `${need} not connected for live use`),
  ]
}

export function getWorkspaceToolRegistry() {
  return WORKSPACE_TOOL_REGISTRY
}

export function recommendWorkspaceTool(taskText: string): WorkspaceToolRecommendation {
  const text = terms(taskText)
  let decision: WorkspaceToolRecommendationDecision = 'use_existing_tool'
  let tool = toolById('command-room-manager')!
  let reason = 'Use the Command Room Manager to route this local-only request.'

  if (includesAny(text, ['research atlas', 'shop research', 'store research', 'market research', 'meta analysis', 'meta-analysis', 'competitor shop', 'מחקר חנות', 'מחקר חנויות', 'מטא אנליזה', 'חנויות'])) {
    tool = toolById('etsy-research-lab')!
    reason = 'Use the existing Research Lab for product/shop research, selectable depth, verified source proof, and reusable local mission packets.'
  } else if (includesAny(text, ['smart intake', 'aliexpress', 'ali express', 'google doc', 'google sheet', 'google drive', 'drive folder', 'mixed input', 'mixed source', 'image match', 'local image', 'free-form prompt', 'freeform prompt'])) {
    tool = toolById('smart-intake-v2')!
    reason = 'This request has mixed source refs, so use Smart Intake V2 instead of the rigid sheet importer.'
  } else if (includesAny(text, ['sheet', 'csv', 'tsv', 'json', 'import', 'product gallery', 'gallery', 'dossier'])) {
    const ingestionRequest = includesAny(text, ['sheet', 'csv', 'tsv', 'json', 'import', 'paste'])
    tool = toolById(!ingestionRequest && includesAny(text, ['gallery', 'choose', 'select']) ? 'etsy-product-gallery' : 'etsy-sheet-intake')!
    reason = 'This request matches the Etsy Sheet Intake and Product Gallery surface.'
  } else if (includesAny(text, ['shotlab', 'image prep', 'generation', 'visual'])) {
    tool = toolById('shotlab-handoff')!
    decision = 'improve_existing_tool'
    reason = 'Use the existing ShotLab handoff surface; live generation remains locked.'
  } else if (includesAny(text, ['seo', 'keyword', 'alura', 'tag', 'title'])) {
    tool = toolById('seo-workbench')!
    reason = 'Use the SEO Workbench and mark missing metric evidence explicitly.'
  } else if (includesAny(text, ['approval', 'approve', 'publish', 'upload'])) {
    tool = toolById('approval-inbox')!
    reason = 'Route this through the Approval Inbox because live actions are locked.'
  } else if (includesAny(text, ['news', 'daily bulletin', 'bulletin'])) {
    tool = toolById('daily-news-board')!
    reason = 'Daily news is now a core Gateway module; use the existing local board and keep delivery locked.'
  } else if (includesAny(text, ['new room', 'room for', 'workspace area'])) {
    decision = 'create_new_room'
    reason = 'A new room should only be created for a durable operating domain, not a one-off task.'
  } else if (includesAny(text, ['worker', 'agent', 'scout', 'hermes'])) {
    decision = 'create_hidden_worker'
    reason = 'A hidden worker may be useful later, but Batch 1 keeps worker spawning blocked.'
  }

  if (decision === 'use_existing_tool' && tool.status === 'partial') {
    decision = 'improve_existing_tool'
  }
  if (tool.status === 'future' && decision === 'use_existing_tool') {
    decision = 'create_new_tool'
  }

  return {
    decision,
    toolId: tool.id,
    label: tool.label,
    reason,
    ready: readyFor(tool),
    missing: missingFor(tool),
    blocked: decision === 'create_hidden_worker'
      ? [...blockedFor(tool), 'hidden worker creation is blocked until an approved controlled runner is explicitly connected']
      : blockedFor(tool),
    safety: {
      usageAllowed: false,
      workerSpawnAllowed: false,
      lockedActions: tool.lockedActions,
    },
  }
}

function routeIdFor(taskText: string, createdAtMs: number) {
  const slug = taskText
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'workspace-task'
  return `tool-route-${createdAtMs}-${slug}`
}

function routeActionFor(toolId: WorkspaceToolId, decision: WorkspaceToolRecommendationDecision): { surfaceId: WorkspaceToolSurfaceId; action: WorkspaceToolRouteAction } {
  if (decision === 'create_hidden_worker') return { surfaceId: 'command-room-manager', action: 'blocked_hidden_worker' }
  if (decision === 'create_new_room') return { surfaceId: 'command-room-manager', action: 'explain_room_request' }
  if (decision === 'create_new_tool') return { surfaceId: 'future-board', action: 'explain_missing_tool' }

  switch (toolId) {
    case 'smart-intake-v2':
      return { surfaceId: 'smart-intake', action: 'open_and_prefill_smart_intake' }
    case 'etsy-sheet-intake':
      return { surfaceId: 'sheet-intake', action: 'open_and_prefill_sheet_intake' }
    case 'etsy-product-gallery':
      return { surfaceId: 'sheet-intake', action: 'open_product_gallery' }
    case 'shotlab-handoff':
      return { surfaceId: 'shotlab-handoff', action: 'open_shotlab_handoff' }
    case 'seo-workbench':
      return { surfaceId: 'seo-workbench', action: 'open_seo_workbench' }
    case 'approval-inbox':
      return { surfaceId: 'approval-inbox', action: 'open_approval_inbox' }
    case 'command-room-manager':
      return { surfaceId: 'command-room-manager', action: 'open_command_manager' }
    case 'daily-news-board':
      return { surfaceId: 'daily-news-board', action: 'open_daily_news_board' }
    default:
      return { surfaceId: 'etsy-scout', action: 'open_odin_scout' }
  }
}

function routeStatusFor(tool: WorkspaceToolContract, decision: WorkspaceToolRecommendationDecision): WorkspaceToolRoute['stationHandoff']['status'] {
  if (decision === 'create_hidden_worker' || decision === 'create_new_tool' || decision === 'create_new_room' || tool.status === 'blocked' || tool.status === 'future') return 'blocked'
  if (tool.status === 'partial' || decision === 'improve_existing_tool') return 'partial'
  return 'ready'
}

function nextUiStepFor(action: WorkspaceToolRouteAction) {
  switch (action) {
    case 'open_and_prefill_smart_intake':
      return 'Open Smart Intake V2, keep the messy prompt in the mission input, then run local Smart Intake.'
    case 'open_and_prefill_sheet_intake':
      return 'Open Sheet Intake with pasted text selected; import only if the data is a safe local/pasted source.'
    case 'open_product_gallery':
      return 'Open the existing local gallery and choose a product packet; no live marketplace read occurs.'
    case 'open_shotlab_handoff':
      return 'Open the ShotLab handoff station and stage a local packet only if a selected product exists.'
    case 'open_seo_workbench':
      return 'Open the SEO station and create a local SEO packet with missing metrics labelled honestly.'
    case 'open_approval_inbox':
      return 'Open the approval gate; review only local packets and keep upload/publish locked.'
    case 'blocked_hidden_worker':
      return 'Do not spawn a worker. Use the approved controlled runner only after an explicit gate.'
    case 'explain_missing_tool':
      return 'Explain the missing/future tool before building anything new.'
    case 'explain_room_request':
      return 'Explain why a new room is or is not justified before creating one.'
    case 'open_odin_scout':
      return 'Open Loki Scout and prepare a local search packet only.'
    case 'open_command_manager':
    default:
      return 'Stay in the Command Room Manager and refine the route.'
  }
}

export function routeWorkspaceToolIntent(taskText: string, createdAtMs = Date.now()): WorkspaceToolRoute {
  const trimmed = taskText.trim().slice(0, 8_000)
  const safeTaskText = trimmed || 'Workspace task routing request'
  const recommendation = recommendWorkspaceTool(safeTaskText)
  const tool = toolById(recommendation.toolId ?? 'command-room-manager') ?? toolById('command-room-manager')!
  const target = routeActionFor(tool.id, recommendation.decision)
  const status = routeStatusFor(tool, recommendation.decision)
  const blockedSuffix = status === 'blocked'
    ? ` Blocked: ${recommendation.blocked.slice(0, 2).join('; ') || 'requires explicit approval before use'}.`
    : ''

  return {
    routeId: routeIdFor(safeTaskText, createdAtMs),
    createdAtMs,
    taskText: safeTaskText,
    recommendation,
    target: {
      roomId: tool.owningSurface.roomId,
      stationId: tool.owningSurface.stationId,
      surfaceId: target.surfaceId,
      action: target.action,
    },
    stationHandoff: {
      toolId: tool.id,
      stationLabel: tool.owningSurface.label,
      status,
      readback: `${recommendation.label}: ${recommendation.reason}${blockedSuffix}`,
      nextUiStep: nextUiStepFor(target.action),
    },
    safety: {
      localOnly: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
      lockedActions: recommendation.safety.lockedActions,
    },
  }
}
