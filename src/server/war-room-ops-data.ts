import { olympusGameManifest } from '../screens/war-room/game/scene-manifest'
import { WAR_ROOM_ROOM_MAP, apiRoomForUiRoom, roomMapForApiRoom, roomMapForUiRoom } from '../screens/war-room/game/ops-room-map'
import { ensureGatewayProbed, listSessions, toSessionSummary } from './claude-api'
import { listLocalSessions } from './local-session-store'
import {   listSwarmMissions } from './swarm-missions'
import { getProductIntelligence } from './product-intelligence-data'
import type {SwarmMission, SwarmMissionAssignment} from './swarm-missions';
import type { WarRoomActionPermission, WarRoomAgentRoomOps, WarRoomAgentWorkerSummary, WarRoomApprovalGate, WarRoomDesignNorthStar, WarRoomFeedItem, WarRoomHealth, WarRoomProductIntelligenceDetail, WarRoomProductIntelligenceRoom, WarRoomRoomDetailResponse, WarRoomRoomSummary, WarRoomSideEffect, WarRoomSummaryResponse, WarRoomWorkflowPacket } from '../screens/war-room/game/ops-contracts'
import type { OlympusStation } from '../screens/war-room/game/types'

type LiveAgentState = 'idle' | 'running' | 'failed' | 'complete' | 'unknown'
type SessionSummary = {
  key?: string
  id?: string
  title?: string
  derivedTitle?: string
  label?: string
  task?: string
  status?: string
  updatedAt?: number | string
  totalTokens?: number
  tokenCount?: number
  error?: string
  errorMessage?: string
  [key: string]: unknown
}

const MAX_SUMMARY_TEXT = 220
const MAX_TITLE_TEXT = 120

const roomKeywords: Record<string, Array<string>> = {
  olympus: ['mission', 'discord', 'workspace', 'approval', 'swarm', 'orchestrator'],
  pantheon: ['agent', 'worker', 'profile', 'chatgptheavy', 'workerkimi', 'swarm1', 'swarm6', 'swarm11', 'swarm12'],
  agora: ['product research', 'product', 'research', 'alura', 'niche', 'opportunity', 'competitor'],
  oracle: ['signal', 'stats', 'keyword', 'trend', 'analytics', 'kpi', 'etsy stats'],
  shotlab: ['shotlab', 'image', 'prompt', 'asset', 'mockup', 'visual', 'forge'],
  harbor: ['supplier', 'aliexpress', 'alibaba', 'sourcing', 'vendor', 'logistics', 'scouting'],
  atlantis: ['archive', 'summary', 'history', 'report', 'automation', 'etsy'],
  treasury: ['approval', 'review', 'margin', 'cost', 'finance', 'gate', 'blocked', 'needs_input'],
}

const categoryKeywords: Record<string, Array<string>> = {
  'discord-missions': ['discord', 'hercules', 'workspace', 'mission', 'swarm'],
  'product-research': ['product research', 'research', 'alura', 'niche', 'competitor', 'opportunity'],
  shotlab: ['shotlab', 'image', 'prompt', 'asset', 'mockup', 'visual'],
  'supplier-scouting': ['supplier', 'aliexpress', 'alibaba', 'sourcing', 'scouting', 'vendor'],
  'approval-queue': ['approval', 'review', 'gate', 'approve', 'human', 'blocked', 'needs_input'],
  'etsy-summaries': ['etsy', 'dolaroboutique', 'summary', 'automation', 'listing'],
}

type ProductIntelligencePayload = ReturnType<typeof getProductIntelligence> & {
  ok?: boolean
  counts?: Record<string, number | null>
  products?: Array<Record<string, unknown>>
  opportunities?: Array<Record<string, unknown>>
  keyword_opportunities?: Array<Record<string, unknown>>
  action_queue?: Array<Record<string, unknown>>
  workflow_funnel?: Array<Record<string, unknown>>
  room_counts?: Array<Record<string, unknown>>
  keyword_room_counts?: Array<Record<string, unknown>>
  safety?: Record<string, unknown>
}

const PRODUCT_INTELLIGENCE_RULE_NOTE = 'Temporary Phase B scoring/product-strength rules are only a working heuristic until DLV defines the durable rulebook with the responsible room brother.'

const WAR_ROOM_DESIGN_NORTH_STAR: WarRoomDesignNorthStar = {
  version: 'phase-e-interactive-money-os-v1',
  style: 'Premium interactive command world: every room is a working scene, every brother/god has a job, every station shows a concrete artifact instead of a boring form.',
  promise: 'No dull dashboards. The War Room should feel like a living business operating system that prepares money-making decisions while keeping DLV approval locks visible.',
  bannedPatterns: [
    'generic SaaS forms as the primary experience',
    'plain table-only workflows',
    'floating dashboard cards that cover the room art',
    'fake live-action buttons without approval gates',
    'CSS-only props pretending to be final assets',
  ],
  interactionRules: [
    'first click moves the room brother/god to the tool; second click opens the station cockpit',
    'station cockpit must show input, output, blocked risks, and next handoff immediately',
    'approval gates are diegetic seals/shrines/vaults, not hidden settings',
    'read-only data can be explored; live marketplace, supplier, account, purchase, message, paid generation, refund, renewal, and listing-edit actions stay blocked until DLV explicitly approves',
    'future visual redesign can swap assets without changing the typed room/action contracts',
  ],
  roomUpgradeOrder: ['Treasury approval gates', 'Agora opportunity workbench', 'Oracle signal instruments', 'Merchant Harbor supplier proof', 'Forge artifact workstations', 'Atlantis evidence vault', 'Pantheon brother/agent quarters', 'Olympus command table'],
  assetPrep: [
    'keep room/station ids stable for the redesign',
    'each station needs a real prop asset, hover plaque, selected/work state, and generated frame target',
    'each brother/god needs idle, walk/work state, speech line, responsibility, and approval posture',
    'all live data must enter through typed ops contracts before UI polish',
  ],
}

const LIVE_ACTION_LOCKS = ['Publish/listing edit', 'Supplier message', 'Purchase/order', 'Paid generation/spend', 'Refund/renewal/account change']

const WORKER_ROOM_BOOK: Record<string, Omit<WarRoomAgentWorkerSummary, 'status' | 'assignmentCount' | 'activeCount' | 'blockedCount' | 'reviewCount' | 'doneCount'>> = {
  default: {
    id: 'default',
    label: 'ChatGPT Manager',
    role: 'Executive manager / mission router',
    model: 'gpt-5.5',
    provider: 'openai-codex',
    roomId: 'olympus',
    qualityRule: 'Plans, assigns, combines; does not do hidden live actions.',
  },
  chatgptheavy: {
    id: 'chatgptheavy',
    label: 'Premium Reviewer',
    role: 'Heavy reasoning and final quality pass',
    model: 'gpt-5.5',
    provider: 'openai-codex',
    roomId: 'pantheon',
    qualityRule: 'Must review important strategy/business decisions before final use.',
  },
  workerkimi: {
    id: 'workerkimi',
    label: 'Kimi K3 Worker',
    role: 'Long-horizon coding, visual/code analysis, research and comparison',
    model: 'kimi-k3',
    provider: 'kimi-coding',
    roomId: 'oracle',
    qualityRule: 'Frontier Kimi worker; manager still combines, verifies, and owns final actions.',
  },
  swarm1: {
    id: 'swarm1',
    label: 'Gemma Support 1',
    role: 'Cheap extraction / summaries / cleanup',
    model: 'gemma4:latest',
    provider: 'ollama-local',
    roomId: 'atlantis',
    qualityRule: 'Support only; never final decision maker.',
  },
  swarm6: {
    id: 'swarm6',
    label: 'Gemma Support 6',
    role: 'Simple organizing and repetitive checks',
    model: 'gemma4:latest',
    provider: 'ollama-local',
    roomId: 'harbor',
    qualityRule: 'Support only; keep tasks small and read-only.',
  },
  swarm11: {
    id: 'swarm11',
    label: 'Gemma Support 11',
    role: 'Draft cleanup and extraction',
    model: 'gemma4:latest',
    provider: 'ollama-local',
    roomId: 'shotlab',
    qualityRule: 'Support only; no paid generation or shop changes.',
  },
  swarm12: {
    id: 'swarm12',
    label: 'Gemma Support 12',
    role: 'Queue/status helper',
    model: 'gemma4:latest',
    provider: 'ollama-local',
    roomId: 'treasury',
    qualityRule: 'Support only; approval gates stay with DLV.',
  },
}

const ROOM_LEAD_WORKER: Record<string, string> = {
  olympus: 'default',
  pantheon: 'chatgptheavy',
  agora: 'workerkimi',
  oracle: 'workerkimi',
  harbor: 'swarm6',
  shotlab: 'swarm11',
  atlantis: 'swarm1',
  treasury: 'swarm12',
}

const APPROVED_SWARM_WORKERS = new Set(Object.keys(WORKER_ROOM_BOOK))
const BLOCKED_SWARM_WORKERS = /^(workspace|dashboard|swarm4|swarm7|claude|managerclaude|anthropic)/i

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asText(value: unknown): string {
  return String(value ?? '').trim()
}

function readProductIntelligence(): ProductIntelligencePayload | null {
  try {
    const payload = getProductIntelligence({ limit: 24, minScore: 0 }) as ProductIntelligencePayload
    return payload?.ok ? payload : null
  } catch {
    return null
  }
}

function productIntelligenceMetrics(apiRoomId: string, data: ProductIntelligencePayload | null): WarRoomProductIntelligenceRoom | undefined {
  const linkedRooms = new Set(['agora', 'oracle', 'harbor', 'shotlab', 'atlantis', 'treasury'])
  if (!linkedRooms.has(apiRoomId) || !data?.counts) return undefined
  const counts = data.counts
  const opportunities = data.opportunities ?? []
  const keywordOpportunities = data.keyword_opportunities ?? []
  const actionQueue = data.action_queue ?? []
  const workflowFunnel = data.workflow_funnel ?? []
  const roomCounts = new Map((data.room_counts ?? []).map((row) => [asText(row.room), asNumber(row.count)]))
  const keywordRoomCounts = new Map((data.keyword_room_counts ?? []).map((row) => [asText(row.room), asNumber(row.count)]))
  const productsForRoom = roomCounts.get(apiRoomId) ?? 0
  const keywordsForRoom = keywordRoomCounts.get(apiRoomId) ?? 0
  const opportunityCount = apiRoomId === 'agora' ? opportunities.length : apiRoomId === 'oracle' ? keywordOpportunities.length : apiRoomId === 'treasury' ? actionQueue.length : apiRoomId === 'atlantis' ? asNumber(counts.products) + asNumber(counts.keywords) : apiRoomId === 'harbor' ? asNumber(counts.supplier_links) : apiRoomId === 'shotlab' ? workflowFunnel.filter((row) => asText(row.status).toLowerCase().includes('verification')).length : 0
  const topScore = apiRoomId === 'oracle'
    ? Math.max(0, ...keywordOpportunities.map((row) => asNumber(row.signal_score))) || null
    : Math.max(0, ...opportunities.map((row) => asNumber(row.opportunity_score))) || null

  const signalLineByRoom: Record<string, string> = {
    agora: `${productsForRoom || asNumber(counts.products)} products in the opportunity market`,
    oracle: `${keywordsForRoom || asNumber(counts.keywords)} keyword signals in the Oracle`,
    harbor: `${asNumber(counts.supplier_links)} supplier proof links docked`,
    shotlab: `${workflowFunnel.length} workflow lanes feeding Forge/ShotLab readiness`,
    atlantis: `${asNumber(counts.products)} products + ${asNumber(counts.keywords)} keywords archived`,
    treasury: `${actionQueue.length} approval/action queues remain locked`,
  }

  return {
    productCount: apiRoomId === 'oracle' ? 0 : productsForRoom || (apiRoomId === 'agora' ? asNumber(counts.products) : 0),
    keywordCount: apiRoomId === 'oracle' ? keywordsForRoom || asNumber(counts.keywords) : 0,
    supplierLinkCount: apiRoomId === 'harbor' ? asNumber(counts.supplier_links) : 0,
    opportunityCount,
    actionCount: actionQueue.reduce((sum, row) => sum + asNumber(row.count), 0),
    topScore,
    signalLine: signalLineByRoom[apiRoomId] ?? 'Product Intelligence is linked read-only',
    temporaryScoring: true,
    responsibleRoomPending: true,
  }
}

function buildProductIntelligenceFeed(data: ProductIntelligencePayload | null): Array<WarRoomFeedItem> {
  if (!data) return []
  const now = Date.now()
  const opportunityFeed = (data.opportunities ?? []).slice(0, 8).map((item, index): WarRoomFeedItem => ({
    id: `product-intelligence:opportunity:${asText(item.id) || index}`,
    kind: 'product-opportunity',
    title: compactText(item.title ?? 'Product opportunity', MAX_TITLE_TEXT),
    subtitle: `Score ${asNumber(item.opportunity_score)} • ${asText(item.priority) || 'temporary priority'}`,
    state: asText(item.priority) || 'candidate',
    updatedAt: now,
    roomId: 'agora',
    categoryIds: ['product-research'],
    sourceId: asText(item.id) || `opportunity-${index}`,
    summary: compactText(`${asText(item.etsy_angle) || 'Imported product candidate'} — ${asText(item.next_action) || 'Review next action'}`),
    nextAction: asText(item.next_action) || 'Review temporary score before any decision',
    blocker: 'Scoring rule is temporary until DLV defines durable rules with the room owner.',
  }))

  const keywordFeed = (data.keyword_opportunities ?? []).slice(0, 8).map((item, index): WarRoomFeedItem => ({
    id: `product-intelligence:keyword:${asText(item.keyword) || index}`,
    kind: 'keyword-signal',
    title: compactText(item.keyword ?? 'Keyword signal', MAX_TITLE_TEXT),
    subtitle: `Signal ${Math.round(asNumber(item.signal_score))} • ${asText(item.competition_level) || 'competition pending'}`,
    state: 'signal',
    updatedAt: now,
    roomId: 'oracle',
    categoryIds: ['product-research', 'etsy-summaries'],
    sourceId: asText(item.keyword) || `keyword-${index}`,
    summary: compactText(`Avg sales ${asNumber(item.avg_sales)} • ${asText(item.next_action) || 'Use as SEO support'}`),
    nextAction: asText(item.next_action) || 'Attach to a candidate only after review',
    blocker: 'Keyword strength rules are temporary until the Oracle owner is defined.',
  }))

  const supplierFeed = (data.opportunities ?? [])
    .filter((item) => asNumber(item.supplier_link_count) > 0)
    .slice(0, 6)
    .map((item, index): WarRoomFeedItem => ({
      id: `product-intelligence:supplier:${asText(item.id) || index}`,
      kind: 'supplier-proof',
      title: compactText(item.title ?? 'Supplier proof candidate', MAX_TITLE_TEXT),
      subtitle: `${asNumber(item.supplier_link_count)} supplier links`,
      state: 'proof-linked',
      updatedAt: now,
      roomId: 'harbor',
      categoryIds: ['supplier-scouting'],
      sourceId: asText(item.id) || `supplier-${index}`,
      summary: compactText('Supplier links are stored for read-only verification; no messages, purchases, or supplier contact are enabled.'),
      nextAction: 'Verify source page and supplier fit before Forge handoff',
      blocker: null,
    }))

  const actionFeed = (data.action_queue ?? []).slice(0, 6).map((item, index): WarRoomFeedItem => ({
    id: `product-intelligence:approval:${asText(item.next_action) || index}`,
    kind: 'approval-gate',
    title: compactText(item.next_action ?? 'Approval queue', MAX_TITLE_TEXT),
    subtitle: `${asNumber(item.count)} records`,
    state: 'locked-read-only',
    updatedAt: now,
    roomId: 'treasury',
    categoryIds: ['approval-queue'],
    sourceId: asText(item.next_action) || `approval-${index}`,
    summary: compactText('Queue is visible for decision prep only; every live marketplace/supplier/paid action remains sealed.'),
    nextAction: 'Prepare DLV review packet later; do not execute live action',
    blocker: 'Requires explicit DLV approval for any side effect.',
  }))

  const forgeFeed = (data.workflow_funnel ?? [])
    .filter((item) => asText(item.room) === 'agora' || asText(item.status).toLowerCase().includes('verification') || asText(item.status).toLowerCase().includes('shotlab'))
    .slice(0, 6)
    .map((item, index): WarRoomFeedItem => ({
      id: `product-intelligence:forge:${asText(item.room)}:${asText(item.status) || index}`,
      kind: 'product-opportunity',
      title: compactText(`Forge handoff lane: ${asText(item.status) || 'workflow state'}`, MAX_TITLE_TEXT),
      subtitle: `${asNumber(item.count)} records • draft prep only`,
      state: 'forge-readiness',
      updatedAt: now,
      roomId: 'shotlab',
      categoryIds: ['shotlab', 'product-research'],
      sourceId: asText(item.status) || `forge-${index}`,
      summary: compactText('Forge sees candidates that may need prompt/image/listing draft preparation, but paid generation and Etsy actions remain locked.'),
      nextAction: 'Use Forge for draft/readiness thinking only until DLV approval',
      blocker: 'No Chrome assets or live listing changes without explicit approval.',
    }))

  const archiveFeed: Array<WarRoomFeedItem> = data.counts ? [{
    id: 'product-intelligence:archive:atlantis-vault',
    kind: 'archive-snapshot',
    title: 'Product Intelligence DB snapshot',
    subtitle: `${asNumber(data.counts.products)} products • ${asNumber(data.counts.keywords)} keywords`,
    state: 'read-only-db',
    updatedAt: now,
    roomId: 'atlantis',
    categoryIds: ['etsy-summaries'],
    sourceId: 'product-intelligence-db',
    summary: compactText(`${asNumber(data.counts.keyword_edges)} keyword edges • ${asNumber(data.counts.supplier_links)} supplier links • source DB copy only.`),
    nextAction: 'Use Archive as the evidence vault for room-specific decisions',
    blocker: null,
  }] : []

  return [...opportunityFeed, ...keywordFeed, ...supplierFeed, ...actionFeed, ...forgeFeed, ...archiveFeed]
}

function productIntelligenceDetailFor(apiRoomId: string, data: ProductIntelligencePayload | null): WarRoomProductIntelligenceDetail | null {
  const metrics = productIntelligenceMetrics(apiRoomId, data)
  if (!data || !metrics) return null
  const roleByRoom: Record<string, string> = {
    agora: 'Agora owns product opportunity review and candidate market sorting.',
    oracle: 'Oracle owns keyword, tag, demand, competition, and signal interpretation.',
    harbor: 'Merchant Harbor owns supplier proof, sourceability, and logistics risk review.',
    shotlab: 'Forge of Hephaestus owns draft/visual readiness handoffs; no paid generation or Etsy action is enabled.',
    atlantis: 'Atlantis Vault owns the read-only DB copy, evidence history, and imported source ledger.',
    treasury: 'Treasury owns approval locks, risk gates, and DLV decision queues.',
  }
  return {
    roomId: apiRoomId,
    label: roomMapForApiRoom(apiRoomId)?.label ?? apiRoomId,
    role: roleByRoom[apiRoomId] ?? 'Linked read-only Product Intelligence room.',
    metrics,
    opportunities: apiRoomId === 'oracle' ? [] : (data.opportunities ?? []).slice(0, 12),
    keywordOpportunities: apiRoomId === 'oracle' ? (data.keyword_opportunities ?? []).slice(0, 12) : [],
    actionQueue: (apiRoomId === 'treasury' || apiRoomId === 'shotlab') ? (data.action_queue ?? []).slice(0, 12) : [],
    workflowFunnel: (data.workflow_funnel ?? []).filter((row) => apiRoomId === 'atlantis' || apiRoomId === 'shotlab' || asText(row.room) === apiRoomId).slice(0, 12),
    rules: {
      temporaryScoring: true,
      ownerPending: 'DLV will define the durable product-strength/demand/scoring rulebook with the responsible room brother later.',
      note: PRODUCT_INTELLIGENCE_RULE_NOTE,
    },
  }
}

function compactText(value: unknown, limit = MAX_SUMMARY_TEXT): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1).trimEnd()}…`
}

function textBlob(...parts: Array<unknown>): string {
  return parts
    .filter((part) => part !== null && part !== undefined)
    .map((part) => String(part).toLowerCase())
    .join(' ')
}

function assignmentText(assignment: SwarmMissionAssignment): string {
  return textBlob(
    assignment.id,
    assignment.workerId,
    assignment.task,
    assignment.rationale,
    assignment.state,
    assignment.checkpoint?.result,
    assignment.checkpoint?.nextAction,
    assignment.checkpoint?.blocker,
  )
}

function missionText(mission: SwarmMission): string {
  return textBlob(
    mission.id,
    mission.title,
    mission.state,
    mission.assignments.map((assignment) => assignmentText(assignment)).join(' '),
    mission.events.map((event) => event.message).join(' '),
  )
}

function sessionText(session: SessionSummary): string {
  return textBlob(session.key, session.id, session.title, session.derivedTitle, session.label, session.task, session.status)
}

function scoreKeywords(text: string, keywords: Array<string>): number {
  return keywords.reduce((score, keyword) => score + (text.includes(keyword.toLowerCase()) ? keyword.length : 0), 0)
}

function bestApiRoom(text: string): string {
  let bestRoom = 'olympus'
  let bestScore = 0
  for (const entry of WAR_ROOM_ROOM_MAP) {
    const score = scoreKeywords(text, roomKeywords[entry.apiRoomId] ?? [])
    if (score > bestScore) {
      bestScore = score
      bestRoom = entry.apiRoomId
    }
  }
  return bestRoom
}

function categoriesForText(text: string): Array<string> {
  return Object.entries(categoryKeywords)
    .filter(([, keywords]) => scoreKeywords(text, keywords) > 0)
    .map(([category]) => category)
}

function deriveSessionState(session: SessionSummary): LiveAgentState {
  const raw = textBlob(session.status)
  const hasError = Boolean(session.error || session.errorMessage)
  if (hasError || raw.includes('error') || raw.includes('failed') || raw.includes('cancel')) return 'failed'
  if (raw.includes('complete') || raw.includes('done') || raw.includes('success')) return 'complete'
  if (raw.includes('idle') || raw.includes('waiting') || raw.includes('sleep')) return 'idle'
  if (raw.includes('running') || raw.includes('thinking') || raw.includes('reasoning') || raw.includes('active')) return 'running'
  const updatedAt = typeof session.updatedAt === 'number' ? session.updatedAt : session.updatedAt ? new Date(session.updatedAt).getTime() : 0
  if (updatedAt && Date.now() - updatedAt < 120_000) return 'running'
  return 'unknown'
}

function assignmentNeedsApproval(assignment: SwarmMissionAssignment): boolean {
  return Boolean(assignment.reviewRequired || ['reviewing', 'needs_input', 'blocked'].includes(assignment.state))
}

function statusForWorkerAssignments(assignments: Array<SwarmMissionAssignment>): WarRoomAgentWorkerSummary['status'] {
  if (assignments.some((assignment) => assignment.state === 'blocked' || assignment.state === 'needs_input')) return 'blocked'
  if (assignments.some((assignment) => assignmentNeedsApproval(assignment))) return 'review'
  if (assignments.some((assignment) => ['dispatched', 'checkpointed'].includes(assignment.state))) return 'running'
  if (assignments.some((assignment) => assignment.state === 'queued')) return 'queued'
  if (assignments.length > 0 && assignments.every((assignment) => assignment.state === 'done')) return 'done'
  return 'idle'
}

function workerRoomFor(workerId: string, assignments: Array<SwarmMissionAssignment>): string {
  const bookRoom = WORKER_ROOM_BOOK[workerId]?.roomId
  if (bookRoom) return bookRoom
  const assignmentBlob = assignments.map((assignment) => assignmentText(assignment)).join(' ')
  return assignmentBlob ? bestApiRoom(assignmentBlob) : 'pantheon'
}

function workerSummary(workerId: string, assignments: Array<SwarmMissionAssignment>): WarRoomAgentWorkerSummary {
  const book = WORKER_ROOM_BOOK[workerId] ?? {
    id: workerId,
    label: workerId,
    role: 'Kanban/Swarm worker',
    model: 'unknown',
    provider: 'unknown',
    roomId: workerRoomFor(workerId, assignments),
    qualityRule: 'Unmapped worker; treat as read-only until configured.',
  }
  return {
    ...book,
    roomId: workerRoomFor(workerId, assignments),
    status: statusForWorkerAssignments(assignments),
    assignmentCount: assignments.length,
    activeCount: assignments.filter((assignment) => ['queued', 'dispatched', 'checkpointed'].includes(assignment.state)).length,
    blockedCount: assignments.filter((assignment) => assignment.state === 'blocked' || assignment.state === 'needs_input').length,
    reviewCount: assignments.filter((assignment) => assignmentNeedsApproval(assignment)).length,
    doneCount: assignments.filter((assignment) => assignment.state === 'done').length,
  }
}

function buildAgentOps(missions: Array<SwarmMission>): Record<string, WarRoomAgentRoomOps> {
  const byWorker = new Map<string, Array<SwarmMissionAssignment>>()
  for (const id of Object.keys(WORKER_ROOM_BOOK)) byWorker.set(id, [])
  for (const mission of missions) {
    for (const assignment of mission.assignments) {
      if (BLOCKED_SWARM_WORKERS.test(assignment.workerId) || !APPROVED_SWARM_WORKERS.has(assignment.workerId)) continue
      const bucket = byWorker.get(assignment.workerId) ?? []
      bucket.push(assignment)
      byWorker.set(assignment.workerId, bucket)
    }
  }

  const workers = Array.from(byWorker.entries()).map(([workerId, assignments]) => workerSummary(workerId, assignments))
  const ops: Record<string, WarRoomAgentRoomOps> = {}
  for (const entry of WAR_ROOM_ROOM_MAP) {
    const roomWorkers = workers.filter((worker) => worker.roomId === entry.apiRoomId)
    const leadWorkerId = ROOM_LEAD_WORKER[entry.apiRoomId] ?? entry.primaryAgentId ?? roomWorkers[0]?.id ?? 'default'
    const leadWorker = workers.find((worker) => worker.id === leadWorkerId)
    const includedWorkers = roomWorkers.some((worker) => worker.id === leadWorkerId) || !leadWorker ? roomWorkers : [leadWorker, ...roomWorkers]
    const assignmentCount = includedWorkers.reduce((sum, worker) => sum + worker.assignmentCount, 0)
    const activeAssignments = includedWorkers.reduce((sum, worker) => sum + worker.activeCount, 0)
    const queuedAssignments = includedWorkers.reduce((sum, worker) => sum + (worker.status === 'queued' ? worker.activeCount : 0), 0)
    const blockedAssignments = includedWorkers.reduce((sum, worker) => sum + worker.blockedCount, 0)
    const reviewAssignments = includedWorkers.reduce((sum, worker) => sum + worker.reviewCount, 0)
    const doneAssignments = includedWorkers.reduce((sum, worker) => sum + worker.doneCount, 0)
    ops[entry.apiRoomId] = {
      roomId: entry.apiRoomId,
      leadWorkerId,
      workerCount: includedWorkers.length,
      assignmentCount,
      activeAssignments,
      queuedAssignments,
      blockedAssignments,
      reviewAssignments,
      doneAssignments,
      line: `${leadWorker?.label ?? leadWorkerId} leads ${entry.label}; ${assignmentCount} Kanban/Swarm assignments visible read-only`,
      workers: includedWorkers,
    }
  }
  return ops
}

function healthForFeed(feed: Array<WarRoomFeedItem>): WarRoomHealth {
  if (feed.some((item) => ['blocked', 'needs_input', 'failed', 'error'].includes(item.state))) return 'blocked'
  if (feed.some((item) => ['reviewing', 'checkpointed'].includes(item.state))) return 'review'
  if (feed.some((item) => ['executing', 'dispatching', 'dispatched', 'running'].includes(item.state))) return 'active'
  return feed.length ? 'idle' : 'idle'
}

async function readSessions(): Promise<{ sessions: Array<SessionSummary>; source: string; error: string | null }> {
  try {
    const capabilities = await ensureGatewayProbed()
    const sessions: Array<SessionSummary> = []
    let source = capabilities.sessions ? 'gateway' : 'local-only'

    let sessionError: string | null = null

    if (capabilities.sessions) {
      try {
        const rawGatewaySessions = await listSessions(50, 0) as unknown
        const responseObject = rawGatewaySessions && typeof rawGatewaySessions === 'object' && !Array.isArray(rawGatewaySessions)
          ? rawGatewaySessions as { sessions?: unknown; items?: unknown; data?: unknown }
          : null
        const gatewaySessions = Array.isArray(rawGatewaySessions)
          ? rawGatewaySessions
          : Array.isArray(responseObject?.sessions)
            ? responseObject.sessions
            : Array.isArray(responseObject?.items)
              ? responseObject.items
              : Array.isArray(responseObject?.data)
                ? responseObject.data
                : null
        if (gatewaySessions) {
          sessions.push(...gatewaySessions.map((session) => toSessionSummary(session as never) as SessionSummary))
        } else {
          source = 'local-with-gateway-error'
          sessionError = 'Gateway sessions endpoint returned an unexpected response shape.'
        }
      } catch (error) {
        source = 'local-with-gateway-error'
        sessionError = error instanceof Error ? error.message : String(error)
      }
    }

    const localSessions = listLocalSessions()
    const existingIds = new Set(sessions.map((session) => session.key || session.id))
    for (const localSession of localSessions) {
      if (existingIds.has(localSession.id)) continue
      sessions.push({
        key: localSession.id,
        id: localSession.id,
        title: localSession.title || 'Local Chat',
        updatedAt: localSession.updatedAt,
        totalTokens: 0,
        source: 'local',
      })
    }

    if (!capabilities.sessions && localSessions.length === 0) source = 'unavailable'
    return { sessions, source, error: sessionError }
  } catch (error) {
    return { sessions: [], source: 'error', error: error instanceof Error ? error.message : String(error) }
  }
}

function sortFeed(feed: Array<WarRoomFeedItem>): Array<WarRoomFeedItem> {
  return [...feed].sort((a, b) => {
    const aTime = typeof a.updatedAt === 'number' ? a.updatedAt : a.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const bTime = typeof b.updatedAt === 'number' ? b.updatedAt : b.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return bTime - aTime
  })
}

function buildFeed(missions: Array<SwarmMission>, sessions: Array<SessionSummary>): Array<WarRoomFeedItem> {
  const feed: Array<WarRoomFeedItem> = []

  for (const mission of missions) {
    const text = missionText(mission)
    const roomId = bestApiRoom(text)
    feed.push({
      id: `mission:${mission.id}:${roomId}`,
      kind: 'mission',
      title: compactText(mission.title || mission.id, MAX_TITLE_TEXT),
      subtitle: `${mission.assignments.length} assignments`,
      state: mission.state,
      updatedAt: mission.updatedAt,
      roomId,
      categoryIds: categoriesForText(text),
      sourceId: mission.id,
      summary: compactText(mission.events.at(-1)?.message || 'Mission record is present.'),
      nextAction: null,
      blocker: null,
    })

    for (const assignment of mission.assignments) {
      const assignmentBlob = assignmentText(assignment)
      const assignmentRoomId = bestApiRoom(`${assignmentBlob} ${mission.title}`)
      feed.push({
        id: `assignment:${mission.id}:${assignment.id}:${assignmentRoomId}`,
        kind: 'assignment',
        title: compactText(mission.title || mission.id, MAX_TITLE_TEXT),
        subtitle: `${assignment.workerId} • ${assignment.id}`,
        state: assignment.state,
        updatedAt: assignment.completedAt || assignment.dispatchedAt || mission.updatedAt,
        roomId: assignmentRoomId,
        categoryIds: categoriesForText(`${assignmentBlob} ${text}`),
        sourceId: assignment.id,
        summary: compactText(assignment.checkpoint?.result || assignment.task),
        nextAction: assignment.checkpoint?.nextAction ? compactText(assignment.checkpoint.nextAction, 160) : null,
        blocker: assignment.checkpoint?.blocker ? compactText(assignment.checkpoint.blocker, 160) : null,
      })
    }
  }

  for (const session of sessions) {
    const text = sessionText(session)
    const roomId = bestApiRoom(text)
    const state = deriveSessionState(session)
    feed.push({
      id: `session:${session.key || session.id || session.title}:${roomId}`,
      kind: 'session',
      title: compactText(session.title || session.derivedTitle || session.label || session.key || session.id || 'Workspace session', MAX_TITLE_TEXT),
      subtitle: `${session.totalTokens ?? session.tokenCount ?? 0} tokens`,
      state,
      updatedAt: session.updatedAt ?? null,
      roomId,
      categoryIds: categoriesForText(text),
      sourceId: session.key || session.id || session.title || 'session',
      summary: compactText(session.task || session.status || 'Workspace session record is present.'),
      nextAction: null,
      blocker: state === 'failed' ? compactText(session.errorMessage || session.error || 'Session failed', 160) : null,
    })
  }

  return sortFeed(feed)
}

function roomSummaryFor(apiRoomId: string, feed: Array<WarRoomFeedItem>, approvalCount: number, productIntelligence: ProductIntelligencePayload | null, agentOpsByRoom: Record<string, WarRoomAgentRoomOps>, workflowPackets: Array<WarRoomWorkflowPacket>): WarRoomRoomSummary {
  const entry = roomMapForApiRoom(apiRoomId)
  const roomFeed = feed.filter((item) => item.roomId === apiRoomId)
  const roomPackets = workflowPackets.filter((packet) => packet.sourceRoomId === apiRoomId || packet.targetRoomId === apiRoomId)
  const missionIds = new Set(roomFeed.filter((item) => item.kind !== 'session' && !String(item.kind).startsWith('product-') && item.kind !== 'keyword-signal' && item.kind !== 'supplier-proof' && item.kind !== 'approval-gate' && item.kind !== 'archive-snapshot').map((item) => item.sourceId))
  const productMetrics = productIntelligenceMetrics(apiRoomId, productIntelligence)
  const agentOps = agentOpsByRoom[apiRoomId]
  const health = healthForFeed(roomFeed)
  return {
    id: apiRoomId,
    apiRoomId,
    uiRoomId: entry?.uiRoomId ?? apiRoomId,
    label: entry?.label ?? apiRoomId,
    health: productMetrics?.opportunityCount || roomPackets.length ? (health === 'idle' ? 'active' : health) : health,
    missionCount: missionIds.size,
    approvalCount: roomFeed.filter((item) => item.categoryIds.includes('approval-queue') || ['reviewing', 'needs_input', 'blocked'].includes(item.state)).length || (apiRoomId === 'treasury' ? approvalCount : 0),
    eventCount: roomFeed.length,
    workflowPacketCount: roomPackets.length,
    primaryAgentId: entry?.primaryAgentId,
    source: productMetrics || agentOps?.assignmentCount || roomPackets.length ? 'mixed' : 'local',
    productIntelligence: productMetrics,
    agentOps,
  }
}

function slugAction(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 54) || 'action'
}

function sideEffectForAction(label: string, locked: boolean): WarRoomSideEffect {
  const text = label.toLowerCase()
  if (text.includes('paid') || text.includes('generation') || text.includes('spend')) return 'paid-action'
  if (text.includes('account') || text.includes('refund') || text.includes('renewal')) return 'account-action'
  if (text.includes('publish') || text.includes('purchase') || text.includes('supplier message') || text.includes('etsy edit') || text.includes('upload')) return 'external-write'
  if (text.includes('draft') || text.includes('stage') || text.includes('task') || text.includes('packet')) return 'workspace-local-write'
  if (text.includes('read') || text.includes('view') || text.includes('inspect') || text.includes('sync') || text.includes('scan')) return 'external-read'
  return locked ? 'external-write' : 'none'
}

function stationPermissions(station: OlympusStation): Array<WarRoomActionPermission> {
  const allowed = station.allowedActions.map((label) => {
    const sideEffect = sideEffectForAction(label, false)
    const scope = sideEffect === 'workspace-local-write' ? 'workspace:draft-write' : sideEffect === 'external-read' ? 'external:read' : 'war-room:view'
    return {
      id: `${station.id}:${slugAction(label)}`,
      label,
      sideEffect,
      status: 'allowed' as const,
      requiredScopes: [scope],
      grants: [{ scope, granted: true, source: 'safe-mode' as const, reason: sideEffect === 'workspace-local-write' ? 'Workspace draft writes are allowed; external actions remain locked.' : 'Read-only safe mode allows this action.' }],
      auditLabel: `allowed:${station.id}:${slugAction(label)}`,
    }
  })

  const locked = station.forbiddenActions.map((label) => {
    const sideEffect = sideEffectForAction(label, true)
    const scope = sideEffect === 'paid-action' ? 'billing:spend' : sideEffect === 'account-action' ? 'account:manage' : 'external:write'
    return {
      id: `${station.id}:${slugAction(label)}`,
      label,
      sideEffect,
      status: 'locked' as const,
      requiredScopes: [scope, 'human:dlv-approval'],
      grants: [
        { scope, granted: false, source: 'safe-mode' as const, reason: 'External/live side effects are sealed in War Room safe mode.' },
        { scope: 'human:dlv-approval', granted: false, source: 'human-approval' as const, reason: 'DLV has not approved this specific action in this chat.' },
      ],
      lockReason: 'Requires explicit DLV approval before any live shop, supplier, paid, or account action.',
      auditLabel: `locked:${station.id}:${slugAction(label)}`,
    }
  })

  return [...allowed, ...locked]
}

function actionsForUiRoom(uiRoomId: string): Record<string, Array<WarRoomActionPermission>> {
  const room = olympusGameManifest.rooms.find((candidate) => candidate.id === uiRoomId)
  if (!room) return {}
  return Object.fromEntries(room.stations.map((station) => [station.id, stationPermissions(station)]))
}

function approvalGateForStation(uiRoomId: string, station: OlympusStation): WarRoomApprovalGate | null {
  const apiRoomId = apiRoomForUiRoom(uiRoomId)
  const lockedPermissions = stationPermissions(station).filter((permission) => permission.status === 'locked')
  const isApprovalStation = station.kind === 'approval' || lockedPermissions.length > 0 || station.kind === 'finance' || station.kind === 'listing' || station.kind === 'supplier'
  if (!isApprovalStation) return null
  const risky = lockedPermissions.find((permission) => permission.sideEffect !== 'none')
  const status: WarRoomApprovalGate['status'] = station.kind === 'approval'
    ? 'ready-for-review'
    : station.allowedActions.some((action) => action.toLowerCase().includes('draft') || action.toLowerCase().includes('stage'))
      ? 'draft-only'
      : 'blocked-until-dlv'
  return {
    id: `${apiRoomId}:${station.id}:approval-gate`,
    roomId: apiRoomId,
    stationId: station.id,
    label: `${station.name} Gate`,
    owner: 'DLV',
    status,
    sideEffectClass: risky?.sideEffect ?? 'external-write',
    trigger: station.description,
    allowedNow: station.allowedActions,
    lockedUntilApproved: Array.from(new Set([...station.forbiddenActions, ...LIVE_ACTION_LOCKS])).slice(0, 8),
    reviewPacket: `${station.name} must show source/input, concrete output, risk notes, missing fields, and exact locked action before DLV can approve anything live.`,
    uiMetaphor: station.kind === 'finance' ? 'vault seal' : station.kind === 'supplier' ? 'harbor customs gate' : station.kind === 'listing' ? 'sealed listing easel' : station.kind === 'approval' ? 'approval shrine' : 'aegis lock',
    auditLabel: `phase-e-gate:${apiRoomId}:${station.id}`,
  }
}

function approvalGatesForUiRoom(uiRoomId: string): Array<WarRoomApprovalGate> {
  const room = olympusGameManifest.rooms.find((candidate) => candidate.id === uiRoomId)
  if (!room) return []
  return room.stations
    .map((station) => approvalGateForStation(uiRoomId, station))
    .filter((gate): gate is WarRoomApprovalGate => Boolean(gate))
}

function allApprovalGates(): Array<WarRoomApprovalGate> {
  return olympusGameManifest.rooms.flatMap((room) => approvalGatesForUiRoom(room.id))
}

function stationIdForPacket(kind: WarRoomWorkflowPacket['artifactType'], targetRoomId: string): string {
  if (kind === 'supplier-proof') return 'supplier-dock'
  if (kind === 'keyword') return 'keyword-obelisk'
  if (kind === 'draft') return 'prompt-anvil'
  if (kind === 'approval') return 'approval-shrine'
  if (kind === 'archive') return 'evidence-vault'
  if (targetRoomId === 'agora') return 'opportunity-market'
  return 'war-table'
}

function packetOwner(targetRoomId: string): string {
  return ROOM_LEAD_WORKER[targetRoomId] ?? 'default'
}

function buildWorkflowPackets(feed: Array<WarRoomFeedItem>, approvalGates: Array<WarRoomApprovalGate>): Array<WarRoomWorkflowPacket> {
  const packets: Array<WarRoomWorkflowPacket> = []
  const pushPacket = (packet: WarRoomWorkflowPacket) => packets.push(packet)

  for (const item of feed.slice(0, 80)) {
    if (item.kind === 'product-opportunity') {
      const hasForgeSignal = item.roomId === 'shotlab' || item.title.toLowerCase().includes('forge')
      const targetRoomId = hasForgeSignal ? 'shotlab' : 'harbor'
      pushPacket({
        id: `packet:${item.id}:opportunity`,
        sourceRoomId: item.roomId,
        targetRoomId,
        stationId: stationIdForPacket(hasForgeSignal ? 'draft' : 'opportunity', targetRoomId),
        title: item.title,
        state: hasForgeSignal ? 'draft-ready' : 'source-ready',
        artifactType: hasForgeSignal ? 'draft' : 'opportunity',
        input: item.summary || item.subtitle,
        output: hasForgeSignal ? 'Forge draft brief for prompt/listing readiness; paid generation stays locked.' : 'Supplier/proof review packet before any sourcing decision.',
        risk: item.blocker || 'Temporary scoring; responsible room brother must review before acting.',
        nextHandoff: hasForgeSignal ? 'Forge → Treasury Approval Shrine' : 'Agora → Merchant Harbor supplier proof',
        ownerWorkerId: packetOwner(targetRoomId),
        lockedActions: LIVE_ACTION_LOCKS,
        sourceFeedId: item.id,
      })
    } else if (item.kind === 'keyword-signal') {
      pushPacket({
        id: `packet:${item.id}:keyword`,
        sourceRoomId: item.roomId,
        targetRoomId: 'agora',
        stationId: stationIdForPacket('keyword', 'agora'),
        title: item.title,
        state: 'source-ready',
        artifactType: 'keyword',
        input: item.summary || item.subtitle,
        output: 'SEO/signal note that can attach to a product candidate after review.',
        risk: item.blocker || 'Keyword rules are temporary until Oracle rulebook is approved.',
        nextHandoff: 'Oracle → Agora opportunity market',
        ownerWorkerId: packetOwner('agora'),
        lockedActions: LIVE_ACTION_LOCKS,
        sourceFeedId: item.id,
      })
    } else if (item.kind === 'supplier-proof') {
      pushPacket({
        id: `packet:${item.id}:supplier`,
        sourceRoomId: item.roomId,
        targetRoomId: 'shotlab',
        stationId: stationIdForPacket('supplier-proof', 'shotlab'),
        title: item.title,
        state: 'needs-proof',
        artifactType: 'supplier-proof',
        input: item.summary || item.subtitle,
        output: 'Supplier evidence packet for Forge draft prep; no supplier contact.',
        risk: item.blocker || 'Supplier quality/logistics must be verified before any order or message.',
        nextHandoff: 'Merchant Harbor → Forge of Hephaestus',
        ownerWorkerId: packetOwner('shotlab'),
        lockedActions: LIVE_ACTION_LOCKS,
        sourceFeedId: item.id,
      })
    } else if (item.kind === 'approval-gate') {
      pushPacket({
        id: `packet:${item.id}:approval`,
        sourceRoomId: item.roomId,
        targetRoomId: 'treasury',
        stationId: stationIdForPacket('approval', 'treasury'),
        title: item.title,
        state: 'approval-waiting',
        artifactType: 'approval',
        input: item.summary || item.subtitle,
        output: 'DLV decision packet only; no live action can execute from this packet.',
        risk: item.blocker || 'Requires explicit DLV approval for side effects.',
        nextHandoff: 'Treasury → DLV review',
        ownerWorkerId: packetOwner('treasury'),
        lockedActions: LIVE_ACTION_LOCKS,
        sourceFeedId: item.id,
      })
    } else if (item.kind === 'archive-snapshot') {
      pushPacket({
        id: `packet:${item.id}:archive`,
        sourceRoomId: item.roomId,
        targetRoomId: 'atlantis',
        stationId: stationIdForPacket('archive', 'atlantis'),
        title: item.title,
        state: 'archived',
        artifactType: 'archive',
        input: item.summary || item.subtitle,
        output: 'Evidence snapshot available to every room as read-only context.',
        risk: item.blocker || 'Source DB copy only; original marketplace data is not changed.',
        nextHandoff: 'Atlantis Vault → any room evidence rail',
        ownerWorkerId: packetOwner('atlantis'),
        lockedActions: LIVE_ACTION_LOCKS,
        sourceFeedId: item.id,
      })
    }
  }

  for (const gate of approvalGates.slice(0, 16)) {
    pushPacket({
      id: `packet:${gate.id}`,
      sourceRoomId: gate.roomId,
      targetRoomId: 'treasury',
      stationId: gate.stationId,
      title: gate.label,
      state: gate.status === 'ready-for-review' ? 'approval-waiting' : 'draft-ready',
      artifactType: 'approval',
      input: gate.trigger,
      output: gate.reviewPacket,
      risk: gate.lockedUntilApproved.join(' • '),
      nextHandoff: `${gate.uiMetaphor} → DLV approval queue`,
      ownerWorkerId: packetOwner('treasury'),
      lockedActions: gate.lockedUntilApproved,
    })
  }

  const canonicalMoneyOsSlice: Array<WarRoomWorkflowPacket> = [
    {
      id: 'canonical:athena-to-hermes:opportunity',
      sourceRoomId: 'agora',
      targetRoomId: 'olympus',
      stationId: 'dispatch-beacon',
      title: 'Athena opportunity packet → Hermes routing',
      state: 'source-ready',
      artifactType: 'opportunity',
      input: 'Jewelry-only opportunity signal from Agora: candidate idea, score reason, avoid-lookalike note, and source context.',
      output: 'Hermes routing card with owner, next room, proof checklist, and read-only safety lock.',
      risk: 'Temporary scoring and product fit must be reviewed; no Etsy edit, supplier contact, purchase, or paid action.',
      nextHandoff: 'Agora / Athena → Olympus Command / Hermes Dispatch Beacon',
      ownerWorkerId: 'default',
      lockedActions: LIVE_ACTION_LOCKS,
    },
    {
      id: 'canonical:hermes-to-forge:draft-brief',
      sourceRoomId: 'olympus',
      targetRoomId: 'shotlab',
      stationId: 'prompt-anvil',
      title: 'Hermes dispatch packet → Prompt Anvil draft',
      state: 'draft-ready',
      artifactType: 'draft',
      input: 'Routed opportunity card with supplier/source notes and DLV safety constraints.',
      output: 'Prompt Anvil packet: creative brief, Base/Variant rules, image-set plan, risk notes, and locked actions.',
      risk: 'Draft-only. No paid generation, no Etsy upload, no renewal, no supplier message.',
      nextHandoff: 'Olympus Command / Hermes → Forge of Hephaestus / Prompt Anvil',
      ownerWorkerId: 'swarm11',
      lockedActions: LIVE_ACTION_LOCKS,
    },
    {
      id: 'canonical:forge-to-shrine:approval',
      sourceRoomId: 'shotlab',
      targetRoomId: 'shotlab',
      stationId: 'approval-shrine',
      title: 'Forge draft package → Approval Shrine',
      state: 'approval-waiting',
      artifactType: 'approval',
      input: 'Prompt packet, variant list, supplier proof placeholder, cost warning, and blocked-live-action list.',
      output: 'DLV review packet with approve / revise / reject / hold outcomes.',
      risk: 'The shrine can only stage a review packet. It cannot approve itself or touch live marketplaces.',
      nextHandoff: 'Prompt Anvil → Approval Shrine → DLV decision',
      ownerWorkerId: 'chatgptheavy',
      lockedActions: LIVE_ACTION_LOCKS,
    },
    {
      id: 'canonical:approval-to-atlantis:archive',
      sourceRoomId: 'shotlab',
      targetRoomId: 'atlantis',
      stationId: 'memory-loom',
      title: 'Approval outcome → Atlantis evidence archive',
      state: 'archived',
      artifactType: 'archive',
      input: 'DLV decision trail, Prompt Anvil output, supplier notes, screenshots, and risk verdict.',
      output: 'Reusable evidence relic and future skill candidate after the workflow proves itself.',
      risk: 'Archive uses Workspace DB copy only; no protected memory/skill overwrite without review.',
      nextHandoff: 'Approval Shrine → Atlantis Vault / Memory Loom',
      ownerWorkerId: 'swarm1',
      lockedActions: ['No protected skill deletion', 'No memory overwrite', 'No source data mutation'],
    },
  ]

  const unique = new Map<string, WarRoomWorkflowPacket>()
  for (const packet of canonicalMoneyOsSlice) unique.set(packet.id, packet)
  for (const packet of packets) unique.set(packet.id, packet)
  return Array.from(unique.values()).slice(0, 60)
}

export async function buildWarRoomOpsData(limit = 30) {
  const missions = listSwarmMissions(Math.max(1, Math.min(100, limit)))
  const { sessions, source, error } = await readSessions()
  const productIntelligence = readProductIntelligence()
  const feed = sortFeed([...buildFeed(missions, sessions), ...buildProductIntelligenceFeed(productIntelligence)])
  const approvalQueue = missions
    .flatMap((mission) => mission.assignments.map((assignment) => ({ mission, assignment })))
    .filter(({ assignment }) => assignmentNeedsApproval(assignment))

  const agentCounts = sessions.reduce<Record<LiveAgentState, number>>((counts, session) => {
    counts[deriveSessionState(session)] += 1
    return counts
  }, { idle: 0, running: 0, failed: 0, complete: 0, unknown: 0 })

  const agentOpsByRoom = buildAgentOps(missions)
  const approvalGates = allApprovalGates()
  const workflowPackets = buildWorkflowPackets(feed, approvalGates)
  const rooms = WAR_ROOM_ROOM_MAP.map((entry) => roomSummaryFor(entry.apiRoomId, feed, approvalQueue.length, productIntelligence, agentOpsByRoom, workflowPackets))
  const sources = { missions: 'swarm-missions', sessions: source, sessionError: error, productIntelligence: productIntelligence ? 'workspace-db-read-only' : 'unavailable' }
  const base = {
    ok: true,
    phase: 7,
    mode: 'external-read-only' as const,
    readOnlyExternal: true,
    workspaceDraftWritesAllowed: false,
    fetchedAt: Date.now(),
    pulse: {
      agents: agentCounts,
      missions: missions.length,
      approvals: approvalQueue.length,
      blocked: approvalQueue.filter(({ assignment }) => ['blocked', 'needs_input'].includes(assignment.state)).length,
    },
    sources,
    designNorthStar: WAR_ROOM_DESIGN_NORTH_STAR,
    approvalGates,
    workflowPackets,
  }

  return { base, rooms, feed, productIntelligence, missions, workflowPackets }
}

export async function buildWarRoomSummary(limit = 30): Promise<WarRoomSummaryResponse> {
  const { base, rooms } = await buildWarRoomOpsData(limit)
  return { ...base, rooms }
}

export async function buildWarRoomRoomDetail(uiRoomId: string, limit = 8): Promise<WarRoomRoomDetailResponse> {
  const { base, rooms, feed, productIntelligence, missions, workflowPackets } = await buildWarRoomOpsData(Math.max(limit, 30))
  const apiRoomId = apiRoomForUiRoom(uiRoomId)
  const mapEntry = roomMapForUiRoom(uiRoomId) ?? roomMapForApiRoom(uiRoomId)
  const room = rooms.find((candidate) => candidate.apiRoomId === apiRoomId) ?? null
  const roomFeed = feed.filter((item) => item.roomId === apiRoomId).slice(0, Math.max(1, Math.min(20, limit)))
  const roomWorkflowPackets = workflowPackets.filter((packet) => packet.sourceRoomId === apiRoomId || packet.targetRoomId === apiRoomId).slice(0, 20)
  const detailRoom = room ?? (mapEntry ? {
    id: mapEntry.apiRoomId,
    apiRoomId: mapEntry.apiRoomId,
    uiRoomId: mapEntry.uiRoomId,
    label: mapEntry.label,
    health: 'idle' as const,
    missionCount: 0,
    approvalCount: 0,
    eventCount: 0,
    workflowPacketCount: roomWorkflowPackets.length,
    primaryAgentId: mapEntry.primaryAgentId,
    source: 'local' as const,
    agentOps: buildAgentOps(missions)[apiRoomId],
  } : null)
  return {
    ...base,
    room: detailRoom,
    feed: roomFeed,
    workflowPackets: roomWorkflowPackets,
    actionsByStation: actionsForUiRoom(uiRoomId),
    approvalGates: approvalGatesForUiRoom(uiRoomId),
    designNorthStar: WAR_ROOM_DESIGN_NORTH_STAR,
    productIntelligence: productIntelligenceDetailFor(apiRoomId, productIntelligence),
    sourceLine: `${base.sources.sessions} synced • ${base.sources.productIntelligence ?? 'product-intel unavailable'} • ${detailRoom?.agentOps?.leadWorkerId ?? 'manager'} lead • ${detailRoom?.agentOps?.assignmentCount ?? 0} swarm tasks • ${base.pulse.missions} missions • ${base.pulse.approvals} approvals`,
  }
}
