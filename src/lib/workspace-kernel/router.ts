import { livingV3RoomById, livingV3StationById } from '../war-room/living-v3/living-v3-contract'
import { routeWorkspaceToolIntent } from '../war-room/living-v3/workspace-tool-registry'
import {
  WORKSPACE_BLUEPRINT_REGISTRY,
  WORKSPACE_KERNEL_LOCKED_ACTIONS,
  getWorkspaceBlueprintById,
  riskAtLeast,
} from './blueprints'
import {
  WORKSPACE_KERNEL_SAFETY









} from './contracts'
import type {WorkspaceAction, WorkspaceActionRouteResult, WorkspaceActionSource, WorkspaceApprovalStatus, WorkspaceBlueprint, WorkspaceBlueprintId, WorkspaceDomain, WorkspaceRiskClass, WorkspaceWorkerProfileId} from './contracts';

const actionSources: Array<WorkspaceActionSource> = ['operator', 'hermes', 'controlled-worker', 'codex', 'ui', 'cron', 'discord', 'file']
const riskClasses: Array<WorkspaceRiskClass> = ['R0_LOCAL_VIEW', 'R1_LOCAL_WRITE', 'R2_EXTERNAL_READ', 'R3_EXTERNAL_WRITE', 'R4_COST_OR_ACCOUNT', 'R5_DESTRUCTIVE']
const domains: Array<WorkspaceDomain> = ['command', 'data-vault', 'etsy', 'shotlab', 'seo-alura', 'supplier', 'cad-3d-print', 'content-news', 'gateway-discord', 'approval', 'agent-ops']
const workerProfileIds: Array<WorkspaceWorkerProfileId> = [
  'hermes-manager',
  'chatgpt-5-5-manager',
  'chatgpt-5-3-fast-worker',
  'codex-ui-builder',
  'kimi-code-worker',
  'claude-reviewer-pending-approval',
  'council-julius',
  'council-alexander',
  'council-napoleon',
  'council-saladin',
  'council-genghis',
  'council-hannibal',
  'controlled-hermes-v1',
  'controlled-scout-v2',
  'controlled-terra-v1',
  'controlled-poseidon-vault-v1',
]

function safeString(value: unknown, max = 8_000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function safeStringArray(value: unknown, maxItems = 16, maxChars = 1_000) {
  if (!Array.isArray(value)) return undefined
  const values = value
    .map((item) => safeString(item, maxChars))
    .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index)
    .slice(0, maxItems)
  return values.length ? values : undefined
}

function safePayloadValue(value: unknown): unknown {
  if (typeof value === 'string') return safeString(value, 1_200)
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return safeStringArray(value, 12, 500)
  if (value && typeof value === 'object') return '[object omitted]'
  return undefined
}

function safePayload(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const output: Record<string, unknown> = {}
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 24)) {
    const key = safeString(rawKey, 80)
    const nextValue = safePayloadValue(rawValue)
    if (key && nextValue !== undefined) output[key] = nextValue
  }
  return Object.keys(output).length ? output : undefined
}

function slugFor(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'workspace-action'
}

export function isWorkspaceBlueprintId(value: unknown): value is WorkspaceBlueprintId {
  return typeof value === 'string' && Boolean(getWorkspaceBlueprintById(value as WorkspaceBlueprintId))
}

export function normalizeWorkspaceActionInput(input: unknown, nowMs = Date.now()): WorkspaceAction {
  const candidate = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const text = safeString(candidate.text ?? candidate.taskText ?? candidate.prompt ?? candidate.operatorNote)
  const nestedInput = candidate.input && typeof candidate.input === 'object' && !Array.isArray(candidate.input)
    ? candidate.input as Record<string, unknown>
    : {}
  const nestedText = safeString(nestedInput.text)
  const summary = safeString(candidate.summary) || text || nestedText || 'Workspace kernel action'
  const intent = safeString(candidate.intent, 800) || summary
  const createdAtMs = typeof candidate.createdAtMs === 'number' && Number.isFinite(candidate.createdAtMs) ? candidate.createdAtMs : nowMs
  const source = typeof candidate.source === 'string' && actionSources.includes(candidate.source as WorkspaceActionSource)
    ? candidate.source as WorkspaceActionSource
    : 'operator'
  const domain = typeof candidate.domain === 'string' && domains.includes(candidate.domain as WorkspaceDomain)
    ? candidate.domain as WorkspaceDomain
    : undefined
  const riskClass = typeof candidate.riskClass === 'string' && riskClasses.includes(candidate.riskClass as WorkspaceRiskClass)
    ? candidate.riskClass as WorkspaceRiskClass
    : undefined
  const requestedWorkerProfileId = typeof candidate.requestedWorkerProfileId === 'string' && workerProfileIds.includes(candidate.requestedWorkerProfileId as WorkspaceWorkerProfileId)
    ? candidate.requestedWorkerProfileId as WorkspaceWorkerProfileId
    : undefined
  const preferredBlueprintId = isWorkspaceBlueprintId(candidate.preferredBlueprintId) ? candidate.preferredBlueprintId : undefined
  const preferredRoomId = typeof candidate.preferredRoomId === 'string' && livingV3RoomById(candidate.preferredRoomId as never)
    ? candidate.preferredRoomId as WorkspaceAction['preferredRoomId']
    : undefined
  const preferredStationId = typeof candidate.preferredStationId === 'string' && livingV3StationById(candidate.preferredStationId as never)
    ? candidate.preferredStationId as WorkspaceAction['preferredStationId']
    : undefined

  return {
    actionId: safeString(candidate.actionId, 140) || `workspace-action-${createdAtMs}-${slugFor(summary)}`,
    createdAtMs,
    source,
    intent,
    summary,
    domain,
    riskClass,
    requiresApproval: typeof candidate.requiresApproval === 'boolean' ? candidate.requiresApproval : undefined,
    input: {
      text: nestedText || text || summary,
      urls: safeStringArray(nestedInput.urls ?? candidate.urls),
      localPaths: safeStringArray(nestedInput.localPaths ?? candidate.localPaths),
      files: safeStringArray(nestedInput.files ?? candidate.files),
      payload: safePayload(nestedInput.payload ?? candidate.payload),
    },
    requestedWorkerProfileId,
    preferredBlueprintId,
    preferredRoomId,
    preferredStationId,
  }
}

export function createWorkspaceAction(input: Partial<WorkspaceAction> & { summary?: string; intent?: string }, nowMs = Date.now()): WorkspaceAction {
  return normalizeWorkspaceActionInput({ ...input, createdAtMs: input.createdAtMs ?? nowMs }, nowMs)
}

function includesAny(text: string, values: Array<string>) {
  return values.some((value) => text.includes(value))
}

function actionText(action: WorkspaceAction) {
  return [
    action.intent,
    action.summary,
    action.input.text,
    ...(action.input.urls ?? []),
    ...(action.input.localPaths ?? []),
    ...(action.input.files ?? []),
  ].join(' ').toLowerCase()
}

function blueprintByRoomOrStation(action: WorkspaceAction, registry: Array<WorkspaceBlueprint>) {
  if (action.preferredStationId) {
    const exactStation = registry.find((blueprint) => blueprint.stationId === action.preferredStationId)
    if (exactStation) return exactStation
  }
  if (action.preferredRoomId) {
    const exactRoom = registry.find((blueprint) => blueprint.roomId === action.preferredRoomId)
    if (exactRoom) return exactRoom
  }
  return undefined
}

function blueprintByDomain(action: WorkspaceAction, registry: Array<WorkspaceBlueprint>) {
  return action.domain ? registry.find((blueprint) => blueprint.domain === action.domain) : undefined
}

function blueprintByToolRouter(action: WorkspaceAction, registry: Array<WorkspaceBlueprint>) {
  const route = routeWorkspaceToolIntent(`${action.intent} ${action.summary} ${action.input.text ?? ''}`, action.createdAtMs)
  const toolId = route.stationHandoff.toolId
  const map: Partial<Record<typeof toolId, WorkspaceBlueprintId>> = {
    'smart-intake-v2': 'etsy-smart-product-intake-v1',
    'etsy-sheet-intake': 'etsy-smart-product-intake-v1',
    'etsy-product-gallery': 'etsy-smart-product-intake-v1',
    'shotlab-handoff': 'shotlab-media-prep-v1',
    'seo-workbench': 'seo-alura-keyword-v1',
    'approval-inbox': 'approval-gate-v1',
    'daily-news-board': 'daily-news-content-v1',
    'command-room-manager': 'generic-project-status-v1',
  }
  const blueprintId = map[toolId]
  return blueprintId ? registry.find((blueprint) => blueprint.blueprintId === blueprintId) : undefined
}

function blueprintByTerms(action: WorkspaceAction, registry: Array<WorkspaceBlueprint>) {
  const text = actionText(action)
  const liveRiskText = text
    .replace(/do not\s+(publish|upload|purchase|buy|pay|send message|send discord)/g, '')
    .replace(/no\s+(publish|upload|purchase|buy|pay|send)/g, '')
    .replace(/without\s+(publish|upload|purchase|buy|pay|sending)/g, '')
    .replace(/publish\/upload\s+remains\s+locked/g, '')
    .replace(/(publish|upload|printer control|production)\s+remains\s+locked/g, '')
    .replace(/(publish|upload|printer control|production)\s+locked/g, '')
    .replace(/לא\s+(לפרסם|להעלות|לקנות|לשלוח|להדפיס)/g, '')
  const directLiveRisk = includesAny(liveRiskText, [
    'publish',
    'upload',
    'purchase',
    'buy ',
    'pay ',
    'paid generation',
    'edit live',
    'live listing',
  ])
  if (directLiveRisk) return registry.find((blueprint) => blueprint.blueprintId === 'approval-gate-v1')
  if (includesAny(text, ['stl', 'step', 'cad', 'openscad', '3d print', '3d-print', 'g-code', 'gcode', 'slicer'])) {
    return registry.find((blueprint) => blueprint.blueprintId === 'cad-3d-print-design-v1')
  }
  if (includesAny(text, ['newspaper', 'daily news', 'daily briefing', 'briefing', 'content calendar', 'content packet', 'video script'])) {
    return registry.find((blueprint) => blueprint.blueprintId === 'daily-news-content-v1')
  }
  if (includesAny(text, ['supplier message', 'message supplier', 'supplier', 'factory', 'alibaba', 'aliexpress supplier', 'vendor proof'])) {
    return registry.find((blueprint) => blueprint.blueprintId === 'supplier-proof-v1')
  }
  if (includesAny(text, ['live read-only scout', 'live readonly scout', 'read-only product research', 'live product research'])) {
    return registry.find((blueprint) => blueprint.blueprintId === 'etsy-live-readonly-research-v1')
  }
  if (includesAny(text, ['aliexpress', 'ali express', 'google drive', 'google sheet', 'google docs', 'drive folder', 'local image', 'image match', 'dolaro', 'etsy product', 'smart intake', 'freeform prompt', 'free-form prompt'])) {
    return registry.find((blueprint) => blueprint.blueprintId === 'etsy-smart-product-intake-v1')
  }
  if (includesAny(text, ['shotlab', 'media prep', 'image prep', 'image generation', 'visual generation', 'product image'])) {
    return registry.find((blueprint) => blueprint.blueprintId === 'shotlab-media-prep-v1')
  }
  if (includesAny(text, ['seo', 'alura', 'keyword', 'keywords', 'tags', 'title'])) {
    return registry.find((blueprint) => blueprint.blueprintId === 'seo-alura-keyword-v1')
  }
  if (includesAny(text, ['atlantis', 'atlantis vault', 'data vault', 'database audit', 'db audit', 'database', 'db ', 'supabase', 'obsidian', 'vault catalog', 'data catalog', 'memory catalog', 'דאטאבייס', 'דאטהבייס', 'db', 'אובסידיאן', 'אטלנטיס', 'כספת', 'קטלוג', 'זיכרון'])) {
    return registry.find((blueprint) => blueprint.blueprintId === 'atlantis-vault-governance-v1')
  }
  if (includesAny(text, ['discord readback', 'remote readback'])) {
    return registry.find((blueprint) => blueprint.blueprintId === 'discord-readback-v1')
  }
  if (includesAny(text, ['send discord', 'discord send', 'send message'])) {
    return registry.find((blueprint) => blueprint.blueprintId === 'approval-gate-v1')
  }
  return undefined
}

function routeBlueprint(action: WorkspaceAction, registry: Array<WorkspaceBlueprint>) {
  if (action.preferredBlueprintId) {
    const explicit = registry.find((blueprint) => blueprint.blueprintId === action.preferredBlueprintId)
    if (explicit) return explicit
  }
  return blueprintByRoomOrStation(action, registry)
    ?? blueprintByTerms(action, registry)
    ?? blueprintByDomain(action, registry)
    ?? blueprintByToolRouter(action, registry)
    ?? registry.find((blueprint) => blueprint.blueprintId === 'generic-project-status-v1')
    ?? registry[0]
}

function approvalStatusFor(action: WorkspaceAction, blueprint: WorkspaceBlueprint): WorkspaceApprovalStatus {
  if (action.requiresApproval || blueprint.approvalPolicy.mode === 'operator_required') return 'waiting_operator'
  if (action.riskClass && riskAtLeast(action.riskClass, 'R3_EXTERNAL_WRITE')) return 'waiting_operator'
  if (riskAtLeast(blueprint.riskClass, 'R3_EXTERNAL_WRITE')) return 'waiting_operator'
  return 'not_required'
}

export function routeWorkspaceActionToBlueprint(
  rawAction: WorkspaceAction | unknown,
  registry: Array<WorkspaceBlueprint> = WORKSPACE_BLUEPRINT_REGISTRY,
): WorkspaceActionRouteResult {
  const action = normalizeWorkspaceActionInput(rawAction, typeof (rawAction as { createdAtMs?: unknown })?.createdAtMs === 'number' ? (rawAction as { createdAtMs: number }).createdAtMs : Date.now())
  const blueprint = routeBlueprint(action, registry)
  const approvalStatus = approvalStatusFor(action, blueprint)
  const requiresApproval = approvalStatus !== 'not_required'
  const artifactKind = blueprint.outputKinds[0] ?? 'generic-workspace-packet'
  const lockedActions = Array.from(new Set([...WORKSPACE_KERNEL_LOCKED_ACTIONS, ...blueprint.lockedActions]))
  const reason = requiresApproval
    ? `${blueprint.label} is staged locally and waits at an approval gate for live, paid, account, or physical actions.`
    : `${blueprint.label} can run as a local-only kernel run.`
  return {
    action,
    blueprint,
    approvalStatus,
    requiresApproval,
    reason,
    artifactKind,
    lockedActions,
    safety: WORKSPACE_KERNEL_SAFETY,
    readback: `${blueprint.label}: ${blueprint.defaultNextStep}`,
  }
}
