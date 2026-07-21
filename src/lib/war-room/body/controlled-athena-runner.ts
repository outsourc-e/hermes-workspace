import {  execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import {  livingV3AgentById, livingV3StationById } from '../living-v3/living-v3-contract'
import { formatLiveAgentContextPacket } from './live-agent-context-packets'
import type {LivingV3AgentId} from '../living-v3/living-v3-contract';
import type {ExecFileException} from 'node:child_process';
import type { SmartIntakeSourceKind } from '../living-v3/smart-intake-v2'

export type ControlledCouncilAgentId =
  | 'council-julius'
  | 'council-alexander'
  | 'council-napoleon'
  | 'council-saladin'
  | 'council-genghis'
  | 'council-hannibal'

export type ControlledCouncilGeneralId = 'julius' | 'alexander' | 'napoleon' | 'saladin' | 'genghis' | 'hannibal'

export type ControlledAgentId = 'athena' | 'hermes' | 'hermes-command' | 'hephaestus' | 'scout' | 'smart-intake' | ControlledCouncilAgentId
export type ControlledDisplayAgentId = 'athena' | 'hermes' | 'hephaestus' | 'loki' | ControlledCouncilGeneralId

export type ControlledAgentProfile = {
  agentId: ControlledDisplayAgentId
  label: string
  roomId: 'agora-opportunity' | 'olympus-command' | 'forge-hephaestus' | 'etsy-market-lab' | 'council-strategists'
  stationId: 'agora-intake' | 'mission-router' | 'command-table' | 'forge-workbench' | 'etsy-loki-product-hunt' | 'council-table'
  source: 'warroom-controlled-athena-ui' | 'warroom-controlled-hermes-ui' | 'warroom-controlled-hermes-command-ui' | 'warroom-controlled-hephaestus-ui' | 'warroom-controlled-scout-ui' | 'warroom-controlled-smart-intake-ui' | 'warroom-controlled-council-ui'
  mission: string
  nextSafeStepHint: string
}

export const APPROVED_LIVE_AGENT_PROFILE_IDS: Partial<Record<LivingV3AgentId, string>> = {
  // Hermes cannot use a profile literally named "hermes" because the Hermes CLI reserves that name.
  // Until DLV approves a non-generic replacement name, the visible Hermes command agent uses the existing real default profile.
  hermes: 'default',
  goblin: 'goblin',
  terra: 'terra',
  loki: 'loki',
  thor: 'thor',
  odin: 'odin',
  julius: 'julius',
  alexander: 'alexander',
  napoleon: 'napoleon',
  saladin: 'saladin',
  genghis: 'genghis',
  hannibal: 'hannibal',
}

const CONTROLLED_AGENT_PROFILE_IDS: Partial<Record<ControlledAgentId, string>> = {
  hermes: 'default',
  'hermes-command': 'default',
  scout: 'loki',
  'smart-intake': 'loki',
  'council-julius': 'julius',
  'council-alexander': 'alexander',
  'council-napoleon': 'napoleon',
  'council-saladin': 'saladin',
  'council-genghis': 'genghis',
  'council-hannibal': 'hannibal',
}

export function liveAgentHermesProfileId(agentId: LivingV3AgentId) {
  return APPROVED_LIVE_AGENT_PROFILE_IDS[agentId] ?? null
}

export function controlledAgentHermesProfileId(agentId: ControlledAgentId) {
  return CONTROLLED_AGENT_PROFILE_IDS[agentId] ?? null
}

function hermesProfileArgs(profileId: string | null) {
  return profileId ? ['--profile', profileId] : []
}

export const CONTROLLED_AGENT_PROFILES: Record<ControlledAgentId, ControlledAgentProfile> = {
  athena: {
    agentId: 'athena',
    label: 'Athena',
    roomId: 'agora-opportunity',
    stationId: 'agora-intake',
    source: 'warroom-controlled-athena-ui',
    mission: 'Review the War Room product/opportunity flow and propose one safe local-only next step.',
    nextSafeStepHint: 'Keep the next step local-only and operator-approved.',
  },
  hermes: {
    agentId: 'hermes',
    label: 'Hermes',
    roomId: 'etsy-market-lab',
    stationId: 'etsy-loki-product-hunt',
    source: 'warroom-controlled-hermes-ui',
    mission: 'Review the Etsy Market Lab packet flow and propose one safe next local-only Hermes handoff step.',
    nextSafeStepHint: 'Record one local-only Etsy room handoff recommendation and return to FROZEN.',
  },
  'hermes-command': {
    agentId: 'hermes',
    label: 'Hermes Command',
    roomId: 'olympus-command',
    stationId: 'command-table',
    source: 'warroom-controlled-hermes-command-ui',
    mission: 'Act as the Workspace command-room manager: answer DLV, route requests to the right room/station/profile, and recommend the next safe action.',
    nextSafeStepHint: 'Show the answer in Olympus Command, route only through typed local intents, and keep live/external actions locked unless DLV explicitly approves them.',
  },
  hephaestus: {
    agentId: 'hephaestus',
    label: 'Hephaestus',
    roomId: 'forge-hephaestus',
    stationId: 'forge-workbench',
    source: 'warroom-controlled-hephaestus-ui',
    mission: 'Inspect the Forge/automation workflow conceptually and propose one safe local-only build step.',
    nextSafeStepHint: 'Prepare only a local draft/build packet; do not call ShotLab, paid generation, Etsy, or suppliers.',
  },
  scout: {
    agentId: 'loki',
    label: 'Loki Scout V2',
    roomId: 'etsy-market-lab',
    stationId: 'etsy-loki-product-hunt',
    source: 'warroom-controlled-scout-ui',
    mission: 'Run one read-only product scout for DolaroBoutique jewelry and return candidates with evidence and missing fields for Product Search.',
    nextSafeStepHint: 'Show read-only candidates in Product Search and let the operator choose one before ShotLab/SEO.',
  },
  'smart-intake': {
    agentId: 'loki',
    label: 'Smart Intake Hermes Worker V1',
    roomId: 'etsy-market-lab',
    stationId: 'etsy-loki-product-hunt',
    source: 'warroom-controlled-smart-intake-ui',
    mission: 'Review one Smart Intake V2 mission and return local-only refined product, image, and dossier guidance as typed JSON.',
    nextSafeStepHint: 'Show refined local-only guidance in Smart Intake and keep Loki/Thor handoff operator-approved.',
  },
  'council-julius': {
    agentId: 'julius',
    label: 'Julius',
    roomId: 'council-strategists',
    stationId: 'council-table',
    source: 'warroom-controlled-council-ui',
    mission: 'Chair the Council: read the independent generals, preserve disagreement, name the owner/order/first step, and make the final decision readable for DLV.',
    nextSafeStepHint: 'Add Julius as Council chair synthesis: what the generals said, what DLV should do next, and what remains locked.',
  },
  'council-alexander': {
    agentId: 'alexander',
    label: 'Alexander',
    roomId: 'council-strategists',
    stationId: 'council-table',
    source: 'warroom-controlled-council-ui',
    mission: 'Give one equal council opinion focused on momentum, ambition, fast visible wins, and morale.',
    nextSafeStepHint: 'Add Alexander as one equal vote in the Council decision summary; DLV decides.',
  },
  'council-napoleon': {
    agentId: 'napoleon',
    label: 'Napoleon',
    roomId: 'council-strategists',
    stationId: 'council-table',
    source: 'warroom-controlled-council-ui',
    mission: 'Give one equal council opinion focused on speed, logistics, milestones, execution order, QA, and acceptance criteria.',
    nextSafeStepHint: 'Add Napoleon as one equal vote in the Council decision summary; DLV decides.',
  },
  'council-saladin': {
    agentId: 'saladin',
    label: 'Saladin',
    roomId: 'council-strategists',
    stationId: 'council-table',
    source: 'warroom-controlled-council-ui',
    mission: 'Give one equal council opinion focused on trust, truthfulness, restraint, reputation, and user comfort.',
    nextSafeStepHint: 'Add Saladin as one equal vote in the Council decision summary; DLV decides.',
  },
  'council-genghis': {
    agentId: 'genghis',
    label: 'Genghis',
    roomId: 'council-strategists',
    stationId: 'council-table',
    source: 'warroom-controlled-council-ui',
    mission: 'Give one equal council opinion focused on simple laws, scalable systems, routing, delegation, and repeatability.',
    nextSafeStepHint: 'Add Genghis as one equal vote in the Council decision summary; DLV decides.',
  },
  'council-hannibal': {
    agentId: 'hannibal',
    label: 'Hannibal',
    roomId: 'council-strategists',
    stationId: 'council-table',
    source: 'warroom-controlled-council-ui',
    mission: 'Give one equal council opinion focused on flanks, hidden risks, unexpected routes, and what might break.',
    nextSafeStepHint: 'Add Hannibal as one equal vote in the Council decision summary; DLV decides.',
  },
}

export const CONTROLLED_SMART_INTAKE_INPUT_MAX_CHARS = 8_000

export const CONTROLLED_SMART_INTAKE_REQUIRED_BLOCKED_ACTIONS = [
  'Etsy live actions',
  'supplier messages',
  'purchases',
  'paid ShotLab',
  'Google OAuth/private read/write',
  'browser automation',
  'worker fan-out',
] as const

export type ControlledScoutCandidate = {
  title: string
  niche: string
  score: number | null
  sourceUrls: Array<string>
  evidence: Array<string>
  missingFields: Array<string>
  riskNotes: Array<string>
}

export type ControlledProductScoutOutput = {
  query: string
  targetShop: 'DolaroBoutique'
  categoryGuard: 'jewelry_only'
  dataOrigin: 'controlled-read-only-web'
  candidates: Array<ControlledScoutCandidate>
  evidenceIds: Array<string>
  sourceRecordIds: Array<string>
  missingFields: Array<string>
}

export type ControlledSmartIntakeSourceStatus =
  | 'used_as_reference'
  | 'auth_required'
  | 'blocked_live'
  | 'missing'
  | 'local_only'

export type ControlledSmartIntakeSourceReadback = {
  sourceId: string
  kind: SmartIntakeSourceKind
  status: ControlledSmartIntakeSourceStatus
  note: string
}

export type ControlledSmartIntakeRefinedProductMatch = {
  title: string
  niche: string
  score: number
  evidenceIds: Array<string>
  sourceRecordIds: Array<string>
  imageNotes: Array<string>
  missingEvidence: Array<string>
  riskNotes: Array<string>
  recommendedNextStep: string
}

export type ControlledSmartIntakeOutput = {
  missionId: string
  dataOrigin: 'controlled-smart-intake-local'
  sourceReadback: Array<ControlledSmartIntakeSourceReadback>
  refinedProductMatches: Array<ControlledSmartIntakeRefinedProductMatch>
  dossierMarkdownAdditions: Array<string>
  shotLabPrepNotes: Array<string>
  missingEvidence: Array<string>
  warnings: Array<string>
}

export type ControlledSmartIntakeContext = {
  input: string
  mission?: {
    missionId: string
    prompt: string
    status: string
    sources: Array<{
      sourceId: string
      kind: string
      label: string
      normalizedRef: string
      service: string
      accessState: string
      warnings: Array<string>
    }>
    evidence: Array<{
      evidenceId: string
      sourceId: string
      kind: string
      label: string
      detail: string
      confidence: number
    }>
    productMatches: Array<{
      matchId: string
      title: string
      niche: string
      score: number
      evidenceIds: Array<string>
      sourceIds: Array<string>
      imageSetIds: Array<string>
      missingEvidence: Array<string>
      riskFlags: Array<string>
      readiness: string
      recommendedNextStep: string
    }>
    imageSets: Array<{
      imageSetId: string
      matchId: string
      label: string
      bestImageId?: string
      missing: Array<string>
      items: Array<{
        imageId: string
        sourceId: string
        label: string
        ref: string
        previewMode: string
        selected: boolean
        warnings: Array<string>
      }>
    }>
    markdownDossiers: Array<{
      dossierId: string
      matchId: string
      title: string
      readiness: string
      markdown: string
      warnings: Array<string>
      missingEvidence: Array<string>
    }>
    warnings: Array<string>
    missingEvidence: Array<string>
    finalRecommendation: string
  }
}

export type ControlledHermesCommandOutput = {
  answer: string
  recommendedRoute: {
    roomId: string
    stationId: string
    workerProfileId: string
    actionLabel: string
  }
  suggestedActions: Array<string>
  contextUsed: Array<string>
  safetyNotes: Array<string>
}

export type ControlledCouncilVote = 'for' | 'neutral' | 'against' | 'abstain'
export type ControlledCouncilPhase = 'opinion' | 'council-turn' | 'peer-vote' | 'synthesis' | 'single-follow-up'

export type ControlledCouncilPeerOpinion = {
  generalId: ControlledCouncilGeneralId
  label: string
  chatSummary?: string
  opinion: string
  vote?: ControlledCouncilVote
  voteReason?: string
}

export type ControlledCouncilContextSource = {
  noteId: string
  title: string
  relativePath: string
  excerpt: string
  status: string
}

export type ControlledCouncilRunContext = {
  topic: string
  phase: ControlledCouncilPhase
  contextPacketId?: string
  sourceNotes: Array<ControlledCouncilContextSource>
  decisions: Array<string>
  safetyRails: Array<string>
  peerOpinions: Array<ControlledCouncilPeerOpinion>
  followUpQuestion?: string
  liveTranscript?: Array<string>
  replyToLabel?: string
  replyToSnippet?: string
  turnInstruction?: string
}

export type ControlledCouncilOutput = {
  generalId: ControlledCouncilGeneralId
  phase: ControlledCouncilPhase
  chatSummary: string
  opinion: string
  vote: ControlledCouncilVote
  voteReason: string
  recommendedOption: string
  confidence: number
  personalitySignal: string
  contextUsed: Array<string>
  peerReadback: Array<string>
  riskFlags: Array<string>
  suggestedDecisionPatch: string
  suggestedFollowUp: string
  replyTo?: string
  replySnippet?: string
}

export type ControlledAgentOutput = {
  agentId: ControlledAgentId
  status: 'completed_local_only' | 'blocked' | 'failed'
  summary: string
  nextSafeStep: string
  blockedActions: Array<string>
  confidence: number
  productScout?: ControlledProductScoutOutput
  smartIntake?: ControlledSmartIntakeOutput
  command?: ControlledHermesCommandOutput
  council?: ControlledCouncilOutput
}

export type ControlledAgentUsage = {
  mode: 'real_hermes_one_shot' | 'dry_run'
  budget: 'one Hermes CLI model call, max-turns=1'
  timeoutMs: number
  toolsets: string
  commandPreview: string
  reportedCost: string | null
  reportedUsageLine: string | null
  note: string
}

export type ControlledAgentRunResult =
  | {
    ok: true
    runId: string
    agentId: ControlledAgentId
    sessionId?: string
    durationMs: number
    usage: ControlledAgentUsage
    output: ControlledAgentOutput
    rawStdout: string
    rawStderr: string
  }
  | {
    ok: false
    runId: string
    agentId: ControlledAgentId
    durationMs: number
    error: string
    usage: ControlledAgentUsage
    output?: ControlledAgentOutput
    rawStdout?: string
    rawStderr?: string
  }

export type ControlledAthenaOutput = ControlledAgentOutput & { agentId: 'athena' }
export type ControlledAthenaRunResult = ControlledAgentRunResult & { agentId: 'athena' }

function clampConfidence(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function cleanText(value: unknown, fallback: string) {
  return cleanTextLimit(value, fallback, 500)
}

const CONTROLLED_RUNNER_RAW_LEAK_PATTERN = /(Command failed:|--profile\s+|--ignore-rules|--max-turns|IMPORTANT IDENTITY RULES|Return JSON only|\/Users\/mac\/\.hermes|\s-q\s+You are\s+)/i

export function sanitizeControlledRunnerError(value: unknown) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!text) return 'Controlled Hermes runner failed before returning clean output.'
  if (CONTROLLED_RUNNER_RAW_LEAK_PATTERN.test(text)) {
    return 'Controlled Hermes runner failed before returning a clean AI answer. Technical command/prompt details are hidden from the UI.'
  }
  return text.slice(0, 420)
}

function cleanTextLimit(value: unknown, fallback: string, limit: number) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : fallback
}

function cleanBlockedActions(value: unknown) {
  if (!Array.isArray(value)) return ['external actions', 'file edits', 'tools']
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 80))
    .slice(0, 14)
}

function cleanBlockedActionsWithRequired(value: unknown, required: ReadonlyArray<string>) {
  const cleaned = cleanBlockedActions(value)
  return Array.from(new Set([...cleaned, ...required])).slice(0, 18)
}

function cleanTextArray(value: unknown, fallback: Array<string> = [], limit = 8) {
  if (!Array.isArray(value)) return fallback
  const cleaned = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 180))
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, limit)
  return cleaned.length ? cleaned : fallback
}

function cleanLongTextArray(value: unknown, fallback: Array<string> = [], limit = 5, itemLimit = 1_200) {
  if (!Array.isArray(value)) return fallback
  const cleaned = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, itemLimit))
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, limit)
  return cleaned.length ? cleaned : fallback
}

function cleanNullableScore(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function cleanScore(value: unknown) {
  return cleanNullableScore(value) ?? 0
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function cleanRecordArray(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').slice(0, limit)
    : []
}

function cleanBoolean(value: unknown) {
  return value === true
}

const smartIntakeSourceKinds: Array<SmartIntakeSourceKind> = [
  'aliexpress_link',
  'google_doc_link',
  'google_sheet_link',
  'google_drive_folder',
  'local_file',
  'local_image',
  'public_image_url',
  'generic_url',
  'freeform_prompt',
]

function cleanSmartIntakeSourceKind(value: unknown): SmartIntakeSourceKind {
  return typeof value === 'string' && smartIntakeSourceKinds.includes(value as SmartIntakeSourceKind)
    ? value as SmartIntakeSourceKind
    : 'generic_url'
}

const smartIntakeSourceStatuses: Array<ControlledSmartIntakeSourceStatus> = [
  'used_as_reference',
  'auth_required',
  'blocked_live',
  'missing',
  'local_only',
]

function cleanSmartIntakeSourceStatus(value: unknown): ControlledSmartIntakeSourceStatus {
  return typeof value === 'string' && smartIntakeSourceStatuses.includes(value as ControlledSmartIntakeSourceStatus)
    ? value as ControlledSmartIntakeSourceStatus
    : 'used_as_reference'
}

function normalizeControlledSmartIntake(value: unknown, missionIdFallback = 'smart-intake-mission'): ControlledSmartIntakeOutput {
  const smart = asRecord(value)
  if (!smart) {
    return {
      missionId: missionIdFallback,
      dataOrigin: 'controlled-smart-intake-local',
      sourceReadback: [],
      refinedProductMatches: [],
      dossierMarkdownAdditions: [],
      shotLabPrepNotes: ['Worker omitted smartIntake payload. Keep ShotLab prep local-only and blocked until evidence is reviewed.'],
      missingEvidence: ['valid Smart Intake worker JSON payload', 'supplier proof', 'materials proof', 'image rights/source proof'],
      warnings: ['Worker result failed closed because smartIntake payload was missing.'],
    }
  }

  const sourceReadback = cleanRecordArray(smart.sourceReadback, 12).map((source) => ({
    sourceId: cleanTextLimit(source.sourceId, 'missing-source', 120),
    kind: cleanSmartIntakeSourceKind(source.kind),
    status: cleanSmartIntakeSourceStatus(source.status),
    note: cleanTextLimit(source.note, 'No live read was performed.', 260),
  }))

  const refinedProductMatches = cleanRecordArray(smart.refinedProductMatches, 5).map((match) => ({
    title: cleanTextLimit(match.title, 'Untitled Smart Intake match', 160),
    niche: cleanTextLimit(match.niche, 'jewelry candidate', 160),
    score: cleanScore(match.score),
    evidenceIds: cleanTextArray(match.evidenceIds, [], 10),
    sourceRecordIds: cleanTextArray(match.sourceRecordIds, [], 10),
    imageNotes: cleanTextArray(match.imageNotes, [], 8),
    missingEvidence: cleanTextArray(match.missingEvidence, ['supplier proof', 'materials proof', 'image rights/source proof'], 10),
    riskNotes: cleanTextArray(match.riskNotes, ['No live action; verify source proof before handoff.'], 8),
    recommendedNextStep: cleanTextLimit(match.recommendedNextStep, 'Review locally before Odin or ShotLab prep.', 260),
  })).filter((match) => match.title !== 'Untitled Smart Intake match')

  return {
    missionId: cleanTextLimit(smart.missionId, missionIdFallback, 140),
    dataOrigin: 'controlled-smart-intake-local',
    sourceReadback,
    refinedProductMatches,
    dossierMarkdownAdditions: cleanLongTextArray(smart.dossierMarkdownAdditions, [], 6, 1_200),
    shotLabPrepNotes: cleanTextArray(smart.shotLabPrepNotes, ['Do not generate paid media yet.'], 8),
    missingEvidence: cleanTextArray(smart.missingEvidence, ['supplier proof', 'materials proof', 'image rights/source proof'], 12),
    warnings: cleanTextArray(smart.warnings, ['No live reads were performed.'], 12),
  }
}

function unsafeLiveActionClaim(value: Record<string, unknown>) {
  const smart = asRecord(value.smartIntake)
  return value.liveActionsAllowed === true
    || value.etsyLiveActionsAllowed === true
    || value.googleWritesAllowed === true
    || value.workerFanOutAllowed === true
    || smart?.liveActionsAllowed === true
    || smart?.etsyLiveActionsAllowed === true
    || smart?.googleWritesAllowed === true
    || smart?.workerFanOutAllowed === true
}

function sanitizeSmartIntakeMission(value: unknown): ControlledSmartIntakeContext['mission'] | undefined {
  const mission = asRecord(value)
  if (!mission) return undefined

  const sources = cleanRecordArray(mission.sources, 12).map((source) => ({
    sourceId: cleanTextLimit(source.sourceId, 'missing-source', 120),
    kind: cleanTextLimit(source.kind, 'generic_url', 80),
    label: cleanTextLimit(source.label, 'Source reference', 160),
    normalizedRef: cleanTextLimit(source.normalizedRef, 'missing source ref', 500),
    service: cleanTextLimit(source.service, 'Unknown source', 120),
    accessState: cleanTextLimit(source.accessState, 'detected_only', 80),
    warnings: cleanTextArray(source.warnings, [], 4),
  }))

  const evidence = cleanRecordArray(mission.evidence, 16).map((item) => ({
    evidenceId: cleanTextLimit(item.evidenceId, 'missing-evidence', 120),
    sourceId: cleanTextLimit(item.sourceId, 'missing-source', 120),
    kind: cleanTextLimit(item.kind, 'source_ref', 80),
    label: cleanTextLimit(item.label, 'Evidence', 160),
    detail: cleanTextLimit(item.detail, 'missing detail', 400),
    confidence: cleanScore(item.confidence),
  }))

  const productMatches = cleanRecordArray(mission.productMatches, 5).map((match) => ({
    matchId: cleanTextLimit(match.matchId, 'missing-match', 120),
    title: cleanTextLimit(match.title, 'Untitled match', 160),
    niche: cleanTextLimit(match.niche, 'jewelry candidate', 160),
    score: cleanScore(match.score),
    evidenceIds: cleanTextArray(match.evidenceIds, [], 8),
    sourceIds: cleanTextArray(match.sourceIds, [], 8),
    imageSetIds: cleanTextArray(match.imageSetIds, [], 6),
    missingEvidence: cleanTextArray(match.missingEvidence, [], 8),
    riskFlags: cleanTextArray(match.riskFlags, [], 8),
    readiness: cleanTextLimit(match.readiness, 'partial', 80),
    recommendedNextStep: cleanTextLimit(match.recommendedNextStep, 'Review locally.', 260),
  }))

  const imageSets = cleanRecordArray(mission.imageSets, 5).map((set) => ({
    imageSetId: cleanTextLimit(set.imageSetId, 'missing-image-set', 120),
    matchId: cleanTextLimit(set.matchId, 'missing-match', 120),
    label: cleanTextLimit(set.label, 'Image set', 160),
    bestImageId: typeof set.bestImageId === 'string' && set.bestImageId.trim() ? set.bestImageId.trim().slice(0, 120) : undefined,
    missing: cleanTextArray(set.missing, [], 6),
    items: cleanRecordArray(set.items, 6).map((item) => ({
      imageId: cleanTextLimit(item.imageId, 'missing-image', 120),
      sourceId: cleanTextLimit(item.sourceId, 'missing-source', 120),
      label: cleanTextLimit(item.label, 'Image ref', 160),
      ref: cleanTextLimit(item.ref, 'missing image ref', 500),
      previewMode: cleanTextLimit(item.previewMode, 'placeholder', 80),
      selected: cleanBoolean(item.selected),
      warnings: cleanTextArray(item.warnings, [], 4),
    })),
  }))

  const markdownDossiers = cleanRecordArray(mission.markdownDossiers, 3).map((dossier) => ({
    dossierId: cleanTextLimit(dossier.dossierId, 'missing-dossier', 120),
    matchId: cleanTextLimit(dossier.matchId, 'missing-match', 120),
    title: cleanTextLimit(dossier.title, 'Dossier', 160),
    readiness: cleanTextLimit(dossier.readiness, 'partial', 80),
    markdown: cleanTextLimit(dossier.markdown, 'No dossier markdown supplied.', 1_600),
    warnings: cleanTextArray(dossier.warnings, [], 5),
    missingEvidence: cleanTextArray(dossier.missingEvidence, [], 8),
  }))

  return {
    missionId: cleanTextLimit(mission.missionId, 'smart-intake-mission', 140),
    prompt: cleanTextLimit(mission.prompt, 'Smart Intake mission', 800),
    status: cleanTextLimit(mission.status, 'mock_ready', 80),
    sources,
    evidence,
    productMatches,
    imageSets,
    markdownDossiers,
    warnings: cleanTextArray(mission.warnings, [], 12),
    missingEvidence: cleanTextArray(mission.missingEvidence, [], 12),
    finalRecommendation: cleanTextLimit(mission.finalRecommendation, 'Review locally before handoff.', 300),
  }
}

export function normalizeControlledSmartIntakeContext(input: {
  smartIntakeInput?: unknown
  smartIntakeMission?: unknown
}): ControlledSmartIntakeContext | undefined {
  const text = typeof input.smartIntakeInput === 'string' ? input.smartIntakeInput.trim().slice(0, CONTROLLED_SMART_INTAKE_INPUT_MAX_CHARS) : ''
  const mission = sanitizeSmartIntakeMission(input.smartIntakeMission)
  if (!text && !mission) return undefined
  return {
    input: text,
    mission,
  }
}

function normalizeControlledProductScout(value: unknown): ControlledProductScoutOutput | undefined {
  if (!value || typeof value !== 'object') return undefined
  const scout = value as Record<string, unknown>
  const candidatesInput = Array.isArray(scout.candidates) ? scout.candidates : []
  const candidates = candidatesInput
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((candidate) => ({
      title: cleanText(candidate.title, 'Untitled jewelry candidate'),
      niche: cleanText(candidate.niche, 'jewelry opportunity'),
      score: cleanNullableScore(candidate.score),
      sourceUrls: cleanTextArray(candidate.sourceUrls, [], 5),
      evidence: cleanTextArray(candidate.evidence, [], 6),
      missingFields: cleanTextArray(candidate.missingFields, ['supplier proof', 'source product images', 'materials proof'], 8),
      riskNotes: cleanTextArray(candidate.riskNotes, ['No live action; verify supplier/source proof before handoff.'], 6),
    }))
    .filter((candidate) => candidate.title !== 'Untitled jewelry candidate')
    .slice(0, 5)

  if (!candidates.length) return undefined

  return {
    query: cleanText(scout.query, 'jewelry product scout'),
    targetShop: 'DolaroBoutique',
    categoryGuard: 'jewelry_only',
    dataOrigin: 'controlled-read-only-web',
    candidates,
    evidenceIds: cleanTextArray(scout.evidenceIds, [], 12),
    sourceRecordIds: cleanTextArray(scout.sourceRecordIds, candidates.flatMap((candidate) => candidate.sourceUrls), 12),
    missingFields: cleanTextArray(scout.missingFields, ['supplier proof', 'source product images', 'materials proof'], 10),
  }
}

export function controlledAgentProfile(agentId: ControlledAgentId) {
  return CONTROLLED_AGENT_PROFILES[agentId]
}

export const CONTROLLED_COUNCIL_AGENT_IDS: Array<ControlledCouncilAgentId> = [
  'council-julius',
  'council-alexander',
  'council-napoleon',
  'council-saladin',
  'council-genghis',
  'council-hannibal',
]

const controlledCouncilGeneralByAgentId: Record<ControlledCouncilAgentId, ControlledCouncilGeneralId> = {
  'council-julius': 'julius',
  'council-alexander': 'alexander',
  'council-napoleon': 'napoleon',
  'council-saladin': 'saladin',
  'council-genghis': 'genghis',
  'council-hannibal': 'hannibal',
}

export function isControlledCouncilAgentId(value: unknown): value is ControlledCouncilAgentId {
  return typeof value === 'string' && CONTROLLED_COUNCIL_AGENT_IDS.includes(value as ControlledCouncilAgentId)
}

export function controlledCouncilGeneralId(agentId: ControlledCouncilAgentId) {
  return controlledCouncilGeneralByAgentId[agentId]
}

export function isControlledAgentId(value: unknown): value is ControlledAgentId {
  return value === 'athena'
    || value === 'hermes'
    || value === 'hermes-command'
    || value === 'hephaestus'
    || value === 'scout'
    || value === 'smart-intake'
    || isControlledCouncilAgentId(value)
}

function normalizeControlledHermesCommand(value: unknown, fallbackNextStep: string): ControlledHermesCommandOutput {
  const command = asRecord(value) ?? {}
  const route = asRecord(command.recommendedRoute) ?? {}
  return {
    answer: cleanTextLimit(command.answer, cleanText(command.summary, 'Hermes Command returned a short local-only answer.'), 1_800),
    recommendedRoute: {
      roomId: cleanTextLimit(route.roomId, 'olympus-command', 120),
      stationId: cleanTextLimit(route.stationId, 'command-table', 120),
      workerProfileId: cleanTextLimit(route.workerProfileId, 'hermes-command', 120),
      actionLabel: cleanTextLimit(route.actionLabel, fallbackNextStep, 220),
    },
    suggestedActions: cleanTextArray(command.suggestedActions, [fallbackNextStep], 6),
    contextUsed: cleanTextArray(command.contextUsed, ['Workspace memory/profile context', 'Living V3 room map', 'local-only safety contract'], 6),
    safetyNotes: cleanTextArray(command.safetyNotes, ['No live Etsy/supplier/paid/account action was executed.'], 6),
  }
}

function cleanCouncilVote(value: unknown): ControlledCouncilVote {
  if (value === 'guarded') return 'neutral'
  return value === 'for' || value === 'neutral' || value === 'against' || value === 'abstain'
    ? value
    : 'neutral'
}

function cleanCouncilPhase(value: unknown): ControlledCouncilPhase {
  return value === 'opinion' || value === 'council-turn' || value === 'peer-vote' || value === 'synthesis' || value === 'single-follow-up'
    ? value
    : 'opinion'
}

function cleanCouncilChatSummary(value: unknown, fallback: string) {
  const raw = typeof value === 'string' && value.trim() ? value : fallback
  const text = raw.trim().replace(/\s+/g, ' ')
  const words = text.split(/\s+/).filter(Boolean)
  const concise = words.length > 26 ? `${words.slice(0, 26).join(' ')}…` : text
  return cleanTextLimit(concise, 'תקציר קצר לא סופק; פתח פרטי לפירוט.', 220)
}

function normalizeControlledCouncilOutput(agentId: ControlledCouncilAgentId, value: unknown, context?: ControlledCouncilRunContext): ControlledCouncilOutput {
  const council = asRecord(value) ?? {}
  const nested = asRecord(council.council) ?? council
  const generalId = controlledCouncilGeneralId(agentId)
  const phase = cleanCouncilPhase(nested.phase ?? context?.phase)
  const opinion = cleanTextLimit(nested.opinion, `${controlledAgentProfile(agentId).label} could not produce a council opinion.`, 1_800)
  const chatSummary = cleanCouncilChatSummary(
    nested.chatSummary ?? nested.mainChatSummary ?? nested.shortAnswer ?? council.summary,
    opinion,
  )
  return {
    generalId,
    phase,
    chatSummary,
    opinion,
    vote: cleanCouncilVote(nested.vote),
    voteReason: cleanTextLimit(nested.voteReason, 'Vote reason was not provided.', 700),
    recommendedOption: cleanTextLimit(
      nested.recommendedOption ?? nested.recommendation ?? nested.suggestedOption,
      'No concrete option named',
      180,
    ),
    confidence: clampConfidence(nested.confidence),
    personalitySignal: cleanTextLimit(nested.personalitySignal, controlledAgentProfile(agentId).mission, 300),
    contextUsed: cleanTextArray(nested.contextUsed, context?.sourceNotes.map((source) => source.title).filter(Boolean) ?? [], 8),
    peerReadback: cleanTextArray(nested.peerReadback, [], 8),
    riskFlags: cleanTextArray(nested.riskFlags, [], 8),
    suggestedDecisionPatch: cleanTextLimit(nested.suggestedDecisionPatch, opinion, 900),
    suggestedFollowUp: cleanTextLimit(nested.suggestedFollowUp, 'Ask this general a focused follow-up if this point matters.', 300),
    replyTo: cleanTextLimit(nested.replyTo ?? context?.replyToLabel, '', 120),
    replySnippet: cleanTextLimit(nested.replySnippet ?? context?.replyToSnippet, '', 180),
  }
}

function buildHermesCommandPrompt(runId: string, profile: ControlledAgentProfile, operatorNote?: string) {
  const userMessage = cleanTextLimit(operatorNote, 'DLV wants guidance from Hermes Command inside Olympus Command.', 4_000)
  return `You are Hermes Command, the real Hermes manager persona inside DLV's Workspace / Olympus War Room.

STRICT OUTPUT RULES:
- Run id: ${runId}
- Return JSON only. Do not wrap JSON in markdown.
- Answer DLV in short, natural Hebrew unless code/paths are needed.
- This is one bounded Hermes CLI model call, max-turns=1.
- This first Command Room bridge is advice + routing only; do not claim you executed external work.
- Do not use tools in this bounded command-room call.
- Do not edit files, run commands, browse, or mutate external state.
- Do not call live Etsy, Alura, AliExpress, Alibaba, Google, ShotLab, Discord, suppliers, purchases, paid generation, account actions, deletes, worker fan-out, or any external mutation.
- If a future action is risky, mark it as requiring DLV approval; do not block normal thinking, planning, drafting, local routing, or local artifact prep.

Context you should assume:
- DLV wants Workspace agents to be Hermes profiles in a visual shell, not a slow local simulation.
- Hermes is the command-room manager. Rooms/stations are UI wrappers over typed intents, profiles, skills, tools, artifacts, and approval gates.
- Current Etsy Market Lab operators and technical ids are exactly: loki, thor, and odin. Do not reintroduce old scout/scribe/courier aliases.
- Main rooms include Olympus Command, Etsy Market Lab, Terra Forge, Oracle Signals, Forge of Hephaestus, Merchant Harbor, Atlantis Vault, Treasury, Gateway, Council, Daedalus, Pantheon.
- Safe default: localOnly=true. Approvals are needed only for live/external/money/account/customer/supplier mutations.
- You may use your normal Hermes profile/personality/memory/skill context if it is present in this CLI session, but do not use tools in this bounded call.

DLV message from the Command Room:
${userMessage}

Return JSON only with this shape:
{
  "agentId": "hermes-command",
  "status": "completed_local_only",
  "summary": "one short sentence",
  "nextSafeStep": "one practical next step",
  "blockedActions": ["live Etsy publish/edit", "supplier/customer messages", "purchases", "paid generation", "account actions", "worker fan-out without approval"],
  "confidence": 90,
  "command": {
    "answer": "short Hebrew answer for DLV",
    "recommendedRoute": {
      "roomId": "olympus-command | etsy-market-lab | terra-forge | oracle-signals | forge-hephaestus | merchant-harbor | atlantis-vault | treasury-commerce | gateway-cockpit | council-strategists | daedalus-workshop | pantheon-quarters",
      "stationId": "command-table | mission-router | approval-dais | etsy-loki-product-hunt | terra-modeling-studio | terra-model-hunt | terra-printer-control | oracle-signal-basin | forge-workbench",
      "workerProfileId": "hermes-command | terra/Terra | loki/Loki | thor/Thor | odin/Odin | codex | scout",
      "actionLabel": "button/action label"
    },
    "suggestedActions": ["short action"],
    "contextUsed": ["memory/profile/skill/context item"],
    "safetyNotes": ["short safety note"]
  }
}`
}

function buildCouncilGeneralPrompt(agentId: ControlledCouncilAgentId, runId: string, profile: ControlledAgentProfile, context?: ControlledCouncilRunContext) {
  const generalId = controlledCouncilGeneralId(agentId)
  const safeContext = context ?? {
    topic: 'DLV asked the Council for a decision-support opinion.',
    phase: 'opinion' as const,
    sourceNotes: [],
    decisions: [],
    safetyRails: [],
    peerOpinions: [],
  }
  const sourceNotes = safeContext.sourceNotes.slice(0, 8).map((source) => ({
    title: source.title,
    path: source.relativePath,
    status: source.status,
    excerpt: source.excerpt.slice(0, 700),
  }))
  const peerOpinions = safeContext.peerOpinions.slice(0, 8)
  const liveTranscript = (safeContext.liveTranscript ?? []).slice(-12)
  const isChair = agentId === 'council-julius'
  const isSequentialCouncilTurn = safeContext.phase === 'council-turn'
  const phaseInstruction = safeContext.phase === 'peer-vote'
    ? 'Read the previous council turns first, then vote honestly. You may agree, amend, challenge, choose neutral, or abstain; do not repeat a generic answer.'
    : safeContext.phase === 'synthesis'
      ? 'You are Julius as Council chair. Read every independent answer, preserve the strongest disagreement, and produce the final short synthesis for DLV. Do not pretend the advisors agreed if they did not.'
      : safeContext.phase === 'single-follow-up'
        ? 'Answer DLV\'s focused follow-up to you only. Use your personality and the Obsidian context; do not pretend the whole council answered.'
        : isSequentialCouncilTurn
          ? 'This is a live council thread. Read the transcript and respond to the last useful speaker: agree with a reason, amend the plan, challenge a risk, or ask for a sharper next step. Do not restart from the original topic and do not mimic the previous wording.'
          : 'This is an independent blind first pass. Answer from your own lens before seeing other new-round answers; prior context is history only, not a script to copy.'
  const turnInstruction = cleanTextLimit(safeContext.turnInstruction, phaseInstruction, 900)

  return `You are ${profile.label}, ${isChair ? 'the Council Chair for DLV\'s Council of Strategists' : 'one independent AI advisor in DLV\'s Council of Strategists'}.

IMPORTANT IDENTITY RULES:
- DLV is always the final decision maker.
- If you are Julius in synthesis phase, you are the Council chair: coordinate, compare, and summarize; do not erase dissent.
- If you are not Julius, you are an independent advisor, not the commander, owner, boss, or final decision maker.
- The historical general theme is visual/personality flavor only; do not roleplay ancient history heavily.
- Your job is to help DLV make the best decision by giving a distinct, useful opinion.
- Distinct does not mean contrarian. There is no required disagreement, debate, or conflict.
- If your lens and the evidence point the same way as everyone else, vote the same way and say why.
- If your lens exposes a real risk, disagreement is welcome — but only when it is genuinely supported by the topic/context.
- DLV decides. Hermes acts only after DLV approves a decision packet.
- If DLV asks to choose/pick/rank a room, tool, option, or next thing, you MUST name one concrete recommendedOption. Do not answer only with "continue", "develop", or a generic condition.
- In a room/tool choice, recommendedOption should be the exact room/tool name you support, for example "Command Room / Mission Control", "Etsy Product Prep", "Oracle Signals", or "ShotLab".

PERSONALITY / LENS:
- General id: ${generalId}
- Mission: ${profile.mission}
- Phase: ${safeContext.phase}
- Instruction: ${phaseInstruction}

STRICT SAFETY:
- Run id: ${runId}
- This is one bounded Hermes CLI model call, max-turns=1.
- Toolsets are none unless explicitly configured by the controlled runner.
- Do not edit files, run commands, browse, mutate state, send Discord, call Etsy/Alura/AliExpress/Alibaba/Google/ShotLab/suppliers, purchase, publish, or spawn workers.
- Use ONLY the context below and the user topic.
- If context is insufficient, say what is missing; do not invent facts.
- Return JSON only. Do not wrap JSON in markdown.
- Answer in natural Hebrew unless a code/path/id must stay LTR.
- Split the answer into two layers: chatSummary is the short main-chat bubble; opinion is the fuller detail used only when DLV opens your private advisor chat.
- chatSummary must be one direct Hebrew message, max 24 Hebrew words. It must sound like a real chat reply, not a processed card title.
- opinion must be clear and summarized, not a ramble: 3 short Hebrew lines/sentences in this order: bottom line, reason, next step.
- If you disagree or see a risk, still give DLV a concrete next step. Do not answer with vague “continue/check/improve” language only.
- If replyToLabel is provided, your main chat answer must visibly react to that speaker. Do not answer as if you did not read them.
- Use your own lens: Julius=chair/ownership/order/final synthesis, Alexander=momentum/impact, Napoleon=sequence/QA, Saladin=trust/approval, Genghis=reusable law, Hannibal=hidden risk/flank.
- Avoid everyone saying the same "next step" phrase. Choose one role: propose / challenge / refine / risk-check / simplify / synthesize.
- In synthesis phase, Julius must write the final Council chair message: bottom line, strongest reason, strongest objection, next safe step.

DLV TOPIC:
${cleanTextLimit(safeContext.topic, 'No topic provided.', 3_000)}

FOCUSED FOLLOW-UP, IF ANY:
${cleanTextLimit(safeContext.followUpQuestion, '', 1_200)}

LIVE COUNCIL TURN INSTRUCTION:
${turnInstruction}

REPLY TARGET, IF ANY:
${JSON.stringify({ replyToLabel: safeContext.replyToLabel ?? '', replyToSnippet: safeContext.replyToSnippet ?? '' }, null, 2)}

LIVE COUNCIL TRANSCRIPT SO FAR:
${JSON.stringify(liveTranscript, null, 2)}

OBSIDIAN / SECOND BRAIN CONTEXT PACKET:
${JSON.stringify({
    packetId: safeContext.contextPacketId ?? 'missing-context-packet',
    sourceNotes,
    decisions: safeContext.decisions.slice(0, 8),
    safetyRails: safeContext.safetyRails.slice(0, 8),
  }, null, 2)}

OTHER GENERAL OPINIONS AVAILABLE IN THIS PHASE:
${JSON.stringify(peerOpinions, null, 2)}

Return JSON only with this exact shape:
{
  "agentId": "${agentId}",
  "status": "completed_local_only",
  "summary": "one short sentence",
  "nextSafeStep": "one practical next step for DLV, not an execution claim",
  "blockedActions": ["external actions", "file edits", "commands", "live marketplace/account/customer/supplier actions", "paid generation", "Discord sends", "worker fan-out"],
  "confidence": 0,
  "council": {
    "generalId": "${generalId}",
    "phase": "${safeContext.phase}",
    "chatSummary": "short direct Hebrew answer for the main chat, max 16 words",
    "opinion": "3 short Hebrew sentences: bottom line; reason; next step",
    "vote": "for | neutral | against | abstain",
    "voteReason": "why you voted this way after considering context and peers if provided",
    "recommendedOption": "the concrete room/tool/option you recommend most; if the topic is not a choice question, name the concrete next action",
    "confidence": 0,
    "personalitySignal": "how your personality lens shaped this answer",
    "contextUsed": ["note title or decision used"],
    "peerReadback": ["short notes about which peer opinions you considered"],
    "riskFlags": ["risks or blockers"],
    "suggestedDecisionPatch": "one sentence to add to the council decision",
    "suggestedFollowUp": "a good follow-up question DLV could ask you",
    "replyTo": "speaker you are responding to, or empty for first speaker",
    "replySnippet": "short snippet of what you are responding to, or empty"
  }
}`
}

function buildSmartIntakePrompt(runId: string, profile: ControlledAgentProfile, context?: ControlledSmartIntakeContext) {
  const contextJson = JSON.stringify({
    rawInput: context?.input ?? '',
    mission: context?.mission ?? null,
  }, null, 2)
  const lockedActions = JSON.stringify(CONTROLLED_SMART_INTAKE_REQUIRED_BLOCKED_ACTIONS)

  return `You are Smart Intake Hermes Worker V1, a single bounded controlled worker behind Etsy Market Lab / Product Search.

STRICT RULES:
- Do not use tools.
- Toolsets are none.
- This is one Hermes CLI model call, max-turns=1.
- Do not browse, fetch URLs, read private Google Docs/Sheets/Drive, solve CAPTCHAs, use browser automation, edit files, run commands, call APIs, or spawn workers.
- Do not call live Etsy, AliExpress, Alibaba, Alura, Google, ShotLab, Discord, suppliers, purchases, paid generation, or account actions.
- Treat all AliExpress, Google, Drive, public URL, and local-file refs as already-submitted reference text only.
- Do not ask follow-up questions.
- Return JSON only. Do not wrap JSON in markdown.

Context:
The current run id is ${runId}. The output returns to the existing Smart Intake V2 workbench only; it must not replace the local Product Search / ShotLab packet flow.
Mission: ${profile.mission}
Next local-safe hint: ${profile.nextSafeStepHint}

Submitted Smart Intake context:
${contextJson}

Return JSON only with these exact top-level keys and nested smartIntake shape:
{
  "agentId": "smart-intake",
  "status": "completed_local_only",
  "summary": "one sentence",
  "nextSafeStep": "one local-only next step",
  "blockedActions": ${lockedActions},
  "confidence": 0,
  "smartIntake": {
    "missionId": "existing mission id if available",
    "dataOrigin": "controlled-smart-intake-local",
    "sourceReadback": [
      {
        "sourceId": "source id",
        "kind": "aliexpress_link | google_doc_link | google_sheet_link | google_drive_folder | local_file | local_image | public_image_url | generic_url | freeform_prompt",
        "status": "used_as_reference | auth_required | blocked_live | missing | local_only",
        "note": "short truthful note"
      }
    ],
    "refinedProductMatches": [
      {
        "title": "candidate title",
        "niche": "specific jewelry niche",
        "score": 0,
        "evidenceIds": ["local/source evidence id"],
        "sourceRecordIds": ["source ref or local path"],
        "imageNotes": ["what image should be used / what is missing"],
        "missingEvidence": ["specific missing proof"],
        "riskNotes": ["truthful risk note"],
        "recommendedNextStep": "local-only next step"
      }
    ],
    "dossierMarkdownAdditions": [
      "short markdown addition or section text"
    ],
    "shotLabPrepNotes": [
      "source images needed",
      "variant truth needed",
      "do not generate paid media yet"
    ],
    "missingEvidence": ["supplier proof", "materials proof", "image rights/source proof"],
    "warnings": ["no live reads were performed"]
  }
}`
}

export function buildControlledAgentPrompt(
  agentId: ControlledAgentId,
  runId: string,
  smartIntakeContext?: ControlledSmartIntakeContext,
  operatorNote?: string,
  councilContext?: ControlledCouncilRunContext,
) {
  const profile = controlledAgentProfile(agentId)
  if (agentId === 'smart-intake') {
    return buildSmartIntakePrompt(runId, profile, smartIntakeContext)
  }

  if (agentId === 'hermes-command') {
    return buildHermesCommandPrompt(runId, profile, operatorNote)
  }

  if (isControlledCouncilAgentId(agentId)) {
    return buildCouncilGeneralPrompt(agentId, runId, profile, councilContext)
  }

  if (agentId === 'scout') {
    return `You are Loki Scout V2, a single controlled read-only product scout for the Etsy Market Lab.

STRICT RULES:
- Use only read-only web/search tools if available.
- Do not use browser automation, logged-in sessions, Etsy account actions, supplier messages, purchases, paid generation, file edits, commands, or worker fan-out.
- Do not call live Etsy/Alura/AliExpress/Alibaba account APIs or mutate any marketplace/account.
- If web/search tools are unavailable, return a blocked/local-only JSON result with missingFields explaining what evidence is missing.
- Jewelry only for DolaroBoutique. Avoid lookalikes, IP/trademark risk, false handmade/material/stone/recycled/personalization claims.
- Do not ask follow-up questions.
- Return JSON only. Do not wrap JSON in markdown.

Context:
The current run id is ${runId}. This is one Hermes CLI model call, max-turns=1. The output must become a ProductScoutPacket inside Loki/Product Search before any Thor ShotLab/SEO handoff.
Mission: ${profile.mission}

Research target:
Find 2-4 jewelry product opportunities related to "gold initial necklace gifts" or a close DolaroBoutique-safe jewelry niche. Prefer public read-only sources with URLs when available. Keep evidence conservative; missing proof is allowed and should be explicit.

Return JSON only with these exact top-level keys:
{
  "agentId": "scout",
  "status": "completed_local_only",
  "summary": "one sentence",
  "nextSafeStep": "${profile.nextSafeStepHint}",
  "blockedActions": ["Etsy live actions", "supplier messages", "purchases", "paid generation", "browser automation", "file edits", "commands", "worker fan-out"],
  "confidence": 0-100,
  "productScout": {
    "query": "gold initial necklace gifts",
    "targetShop": "DolaroBoutique",
    "categoryGuard": "jewelry_only",
    "dataOrigin": "controlled-read-only-web",
    "sourceRecordIds": ["public source URL or source name"],
    "evidenceIds": ["short evidence id or note"],
    "missingFields": ["supplier proof", "source product images", "materials proof", "variant truth"],
    "candidates": [
      {
        "title": "candidate product title",
        "niche": "specific jewelry niche",
        "score": 0-100,
        "sourceUrls": ["https://public-read-only-source.example"],
        "evidence": ["short evidence note tied to source"],
        "missingFields": ["supplier proof", "source product images"],
        "riskNotes": ["truthful risk note"]
      }
    ]
  }
}`
  }
  return `You are ${profile.label}, a single controlled War Room worker for one user-triggered smoke run.

STRICT RULES:
- Do not use tools.
- Do not edit files.
- Do not run commands.
- Do not call Etsy, suppliers, Discord, paid generation, purchase, publish, account, or any external mutation.
- Do not ask follow-up questions.
- Produce only a short JSON object.
- Do not wrap the JSON in markdown.

Context:
Hermes is testing a safe one-agent connection to the War Room Body Runtime. The body can receive local intents/events only. The current run id is ${runId}.
This run has a strict budget: one Hermes CLI model call, max-turns=1, no worker fan-out.
Your mission: ${profile.mission}

Return JSON only with these exact keys:
{
  "agentId": "${profile.agentId}",
  "status": "completed_local_only",
  "summary": "one sentence",
  "nextSafeStep": "${profile.nextSafeStepHint}",
  "blockedActions": ["tools", "file edits", "commands", "Etsy", "suppliers", "Discord", "paid generation", "purchase", "publish", "account actions", "external mutations", "worker fan-out"],
  "confidence": 0-100
}`
}

export function buildControlledAthenaPrompt(runId: string) {
  return buildControlledAgentPrompt('athena', runId)
}

export function extractJsonObjectFromHermesOutput(text: string) {
  const trimmed = text.trim()
  const parsedObjects: Array<Record<string, unknown>> = []
  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed[index] !== '{') continue
    const candidate = extractBalancedJsonCandidate(trimmed, index)
    if (!candidate) continue
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      parsedObjects.push(parsed)
      if (typeof parsed.agentId === 'string' && typeof parsed.status === 'string') return parsed
    } catch {
      // Keep searching; Hermes quiet mode may print warnings/session metadata around JSON.
    }
  }
  if (parsedObjects.length) return parsedObjects.at(-1)!
  throw new Error('Controlled agent output did not contain a parseable JSON object.')
}

function extractBalancedJsonCandidate(text: string, startIndex: number) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(startIndex, index + 1)
    }
  }
  return null
}

export function normalizeControlledAgentOutput(agentId: ControlledAgentId, value: Record<string, unknown>, councilContext?: ControlledCouncilRunContext): ControlledAgentOutput {
  const profile = controlledAgentProfile(agentId)
  const missionId = agentId === 'smart-intake'
    ? cleanTextLimit(asRecord(value.smartIntake)?.missionId, 'smart-intake-mission', 140)
    : 'smart-intake-mission'
  const smartIntake = agentId === 'smart-intake'
    ? normalizeControlledSmartIntake(value.smartIntake, missionId)
    : undefined
  const unsafeClaim = unsafeLiveActionClaim(value)
  const missingSmartIntake = agentId === 'smart-intake' && !asRecord(value.smartIntake)
  const command = agentId === 'hermes-command'
    ? normalizeControlledHermesCommand(asRecord(value.command) ?? value, profile.nextSafeStepHint)
    : undefined
  const council = isControlledCouncilAgentId(agentId)
    ? normalizeControlledCouncilOutput(agentId, value, councilContext)
    : undefined
  const status = unsafeClaim || missingSmartIntake
    ? 'blocked'
    : value.status === 'blocked' || value.status === 'failed'
      ? value.status
      : 'completed_local_only'

  if (smartIntake && unsafeClaim) {
    smartIntake.warnings = Array.from(new Set([
      'Worker output claimed a live action or worker fan-out permission; result failed closed.',
      ...smartIntake.warnings,
    ])).slice(0, 12)
    smartIntake.missingEvidence = Array.from(new Set([
      ...smartIntake.missingEvidence,
      'safe worker output without live-action permission claims',
    ])).slice(0, 12)
  }

  return {
    agentId,
    status,
    summary: cleanText(value.summary, `${profile.label} completed a local-only controlled run.`),
    nextSafeStep: cleanText(value.nextSafeStep, profile.nextSafeStepHint),
    blockedActions: agentId === 'smart-intake'
      ? cleanBlockedActionsWithRequired(value.blockedActions, CONTROLLED_SMART_INTAKE_REQUIRED_BLOCKED_ACTIONS)
      : cleanBlockedActions(value.blockedActions),
    confidence: clampConfidence(value.confidence),
    productScout: agentId === 'scout' ? normalizeControlledProductScout(value.productScout) : undefined,
    smartIntake,
    command,
    council,
  }
}

export function normalizeControlledAthenaOutput(value: Record<string, unknown>): ControlledAthenaOutput {
  return normalizeControlledAgentOutput('athena', value) as ControlledAthenaOutput
}

export async function runControlledAgentOneShot(input: {
  agentId: ControlledAgentId
  runId: string
  cwd?: string
  timeoutMs?: number
  hermesCliPath?: string
  dryRun?: boolean
  smartIntakeContext?: ControlledSmartIntakeContext
  operatorNote?: string
  councilContext?: ControlledCouncilRunContext
}): Promise<ControlledAgentRunResult> {
  const startedAt = Date.now()
  const profile = controlledAgentProfile(input.agentId)
  const timeoutMs = clampTimeoutMs(input.timeoutMs)
  const cliPath = resolveControlledHermesCliPath(input.hermesCliPath)
  const toolsets = controlledAgentToolsets(input.agentId)
  const prompt = buildControlledAgentPrompt(input.agentId, input.runId, input.smartIntakeContext, input.operatorNote, input.councilContext)
  const args = buildHermesCliArgs({ agentId: input.agentId, prompt, toolsets })
  const usage = createControlledAgentUsage({
    agentId: input.agentId,
    cliPath,
    args,
    timeoutMs,
    toolsets,
    mode: input.dryRun ? 'dry_run' : 'real_hermes_one_shot',
  })

  if (input.dryRun) {
    const output: ControlledAgentOutput = {
      agentId: input.agentId,
      status: 'blocked',
      summary: `${profile.label} dry-run recorded; no process was spawned.`,
      nextSafeStep: 'Use a fake CLI in tests or the real UI button for one controlled run.',
      blockedActions: ['Hermes CLI', 'child_process', 'persistent workers', 'external actions'],
      confidence: 100,
    }
    return {
      ok: false,
      agentId: input.agentId,
      runId: input.runId,
      durationMs: Date.now() - startedAt,
      error: 'Controlled agent dry-run only; no process was spawned.',
      usage,
      output,
      rawStdout: '',
      rawStderr: '',
    }
  }

  const executed = await execFileBounded(cliPath, args, {
    cwd: input.cwd,
    timeoutMs,
    maxBuffer: 80_000,
  })
  const combinedOutput = `${executed.stdout}\n${executed.stderr}`
  const finalUsage: ControlledAgentUsage = {
    ...usage,
    reportedCost: extractUsageLine(combinedOutput, 'cost'),
    reportedUsageLine: extractUsageLine(combinedOutput, 'usage') ?? extractUsageLine(combinedOutput, 'tokens'),
  }

  let output: ControlledAgentOutput | undefined
  try {
    output = normalizeControlledAgentOutput(input.agentId, extractJsonObjectFromHermesOutput(combinedOutput), input.councilContext)
  } catch (error) {
    const parseMessage = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      agentId: input.agentId,
      runId: input.runId,
      durationMs: Date.now() - startedAt,
      error: sanitizeControlledRunnerError(executed.error ?? parseMessage),
      usage: finalUsage,
      rawStdout: executed.stdout,
      rawStderr: executed.stderr,
    }
  }

  if (executed.error) {
    return {
      ok: false,
      agentId: input.agentId,
      runId: input.runId,
      durationMs: Date.now() - startedAt,
      error: sanitizeControlledRunnerError(executed.error),
      usage: finalUsage,
      output,
      rawStdout: executed.stdout,
      rawStderr: executed.stderr,
    }
  }

  return {
    ok: true,
    agentId: input.agentId,
    runId: input.runId,
    durationMs: Date.now() - startedAt,
    sessionId: extractSessionId(combinedOutput),
    usage: finalUsage,
    output,
    rawStdout: executed.stdout,
    rawStderr: executed.stderr,
  }
}

function clampTimeoutMs(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 45_000
  return Math.max(5_000, Math.min(90_000, Math.round(numeric)))
}

function resolveControlledHermesCliPath(input?: string) {
  if (input?.trim()) return input.trim()
  const configured = process.env.WAR_ROOM_CONTROLLED_HERMES_CLI?.trim()
  if (configured) return configured
  const home = process.env.HOME || '/Users/mac'
  const candidates = [
    path.join(home, '.hermes/hermes-agent/venv/bin/hermes'),
    path.join(home, '.hermes/hermes-agent-venv/bin/hermes'),
    path.join(home, '.local/bin/hermes'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? 'hermes'
}

function controlledAgentToolsets(agentId: ControlledAgentId) {
  const globalOverride = process.env.WAR_ROOM_CONTROLLED_HERMES_TOOLSETS?.trim()
  if (globalOverride) return globalOverride
  if (agentId === 'scout') return process.env.WAR_ROOM_CONTROLLED_SCOUT_TOOLSETS?.trim() || 'web'
  if (agentId === 'hermes-command') return process.env.WAR_ROOM_CONTROLLED_HERMES_COMMAND_TOOLSETS?.trim() || ''
  return ''
}

function buildHermesCliArgs(input: { agentId: ControlledAgentId; prompt: string; toolsets: string }) {
  const profileId = controlledAgentHermesProfileId(input.agentId)
  const args = [
    ...hermesProfileArgs(profileId),
    'chat',
    '-Q',
    ...(input.agentId === 'hermes-command' ? [] : ['--ignore-rules']),
    '--max-turns',
    '1',
    '--source',
    `war-room-controlled-${input.agentId}`,
  ]
  if (input.toolsets.trim()) args.push('-t', input.toolsets)
  const provider = process.env.WAR_ROOM_CONTROLLED_HERMES_PROVIDER?.trim()
  const model = process.env.WAR_ROOM_CONTROLLED_HERMES_MODEL?.trim()
  if (provider) args.push('--provider', provider)
  if (model) args.push('--model', model)
  args.push('-q', input.prompt)
  return args
}

function createControlledAgentUsage(input: {
  agentId: ControlledAgentId
  cliPath: string
  args: Array<string>
  timeoutMs: number
  toolsets: string
  mode: ControlledAgentUsage['mode']
}): ControlledAgentUsage {
  const promptIndex = input.args.indexOf('-q')
  const previewArgs = promptIndex >= 0 ? input.args.slice(0, promptIndex).concat(['-q', '<controlled-json-prompt>']) : input.args
  return {
    mode: input.mode,
    budget: 'one Hermes CLI model call, max-turns=1',
    timeoutMs: input.timeoutMs,
    toolsets: input.toolsets,
    commandPreview: `${path.basename(input.cliPath)} ${previewArgs.join(' ')}`,
    reportedCost: null,
    reportedUsageLine: null,
    note: input.mode === 'dry_run'
      ? 'Test dry-run only; no Hermes process spawned.'
      : input.agentId === 'hermes-command'
        ? 'Hermes Command uses the normal Hermes profile context for one JSON-only command-room answer without forcing an invalid toolset override. Live/external/money/account actions and worker fan-out remain blocked by prompt and route contract.'
        : input.agentId === 'scout'
          ? 'Loki Scout V2 may use only read-only web/search tools. Live marketplace, supplier, paid generation, browser automation, Discord send, file edits, commands, and worker fan-out remain blocked by prompt and route contract.'
        : input.agentId === 'smart-intake'
          ? 'Smart Intake Hermes Worker V1 uses one JSON-only reasoning pass without forcing an invalid toolset override. Live marketplace, Google OAuth/private reads/writes, supplier, paid ShotLab, browser automation, file edits, commands, and worker fan-out remain blocked by prompt and route contract.'
          : 'Live marketplace, supplier, paid generation, Discord send, file edits, commands, tools, and worker fan-out remain blocked by prompt and route contract.',
  }
}

function extractUsageLine(text: string, keyword: 'cost' | 'usage' | 'tokens') {
  const expression = new RegExp(`^\\s*(?:reported\\s+)?(?:total\\s+)?${keyword}\\b\\s*[:=].*$`, 'gim')
  const matches = text.match(expression)?.map((line) => line.trim()).filter(Boolean) ?? []
  return matches.at(-1) ?? null
}

function extractSessionId(text: string) {
  return text.match(/session[_\s-]*id\s*[:=]\s*([a-z0-9_-]+)/i)?.[1]
}

function execFileBounded(
  command: string,
  args: Array<string>,
  options: { cwd?: string; timeoutMs: number; maxBuffer: number },
): Promise<{ stdout: string; stderr: string; error?: string }> {
  return new Promise((resolve) => {
    execFile(command, args, {
      cwd: options.cwd,
      timeout: options.timeoutMs,
      maxBuffer: options.maxBuffer,
      windowsHide: true,
      env: {
        ...process.env,
        HERMES_WAR_ROOM_CONTROLLED_RUN: '1',
      },
    }, (error: ExecFileException | null, stdout, stderr) => {
      const stdoutText = String(stdout)
      const stderrText = String(stderr)
      resolve({
        stdout: stdoutText.slice(0, 80_000),
        stderr: stderrText.slice(0, 80_000),
        error: error ? sanitizeControlledRunnerError(stderrText.trim() || error.message) : undefined,
      })
    })
  })
}

export async function runControlledAthenaOneShot(input: {
  runId: string
  cwd?: string
  timeoutMs?: number
  hermesCliPath?: string
  dryRun?: boolean
}): Promise<ControlledAthenaRunResult> {
  return runControlledAgentOneShot({ ...input, agentId: 'athena' }) as Promise<ControlledAthenaRunResult>
}

export type ControlledLiveAgentChatOutput = {
  agentId: LivingV3AgentId
  status: 'completed_local_only' | 'completed_read_only_web' | 'blocked' | 'failed'
  answer: string
  summary: string
  nextSafeStep: string
  blockedActions: Array<string>
  confidence: number
}

export type ControlledLiveAgentChatResult =
  | {
      ok: true
      runId: string
      agentId: LivingV3AgentId
      sessionId?: string
      durationMs: number
      usage: ControlledAgentUsage
      output: ControlledLiveAgentChatOutput
      rawStdout: string
      rawStderr: string
    }
  | {
      ok: false
      runId: string
      agentId: LivingV3AgentId
      durationMs: number
      error: string
      usage: ControlledAgentUsage
      output?: ControlledLiveAgentChatOutput
      rawStdout?: string
      rawStderr?: string
    }

function normalizeLiveAgentChatOutput(agentId: LivingV3AgentId, value: Record<string, unknown>): ControlledLiveAgentChatOutput {
  const agent = livingV3AgentById(agentId)
  const status = value.status === 'blocked' || value.status === 'failed' || value.status === 'completed_read_only_web' ? value.status : 'completed_local_only'
  const answer = cleanTextLimit(value.answer ?? value.summary, `${agent?.label ?? agentId}: קיבלתי.`, 900)
  return {
    agentId,
    status,
    answer,
    summary: cleanTextLimit(value.summary, answer, 420),
    nextSafeStep: cleanTextLimit(value.nextSafeStep, 'Wait for DLV or answer one more message on demand.', 260),
    blockedActions: cleanBlockedActions(value.blockedActions),
    confidence: clampConfidence(value.confidence),
  }
}

export function liveAgentCapabilityPolicy(agentId: LivingV3AgentId) {
  const agent = livingV3AgentById(agentId)
  if (!agent) throw new Error(`Unknown Living V3 agent: ${agentId}`)
  const stations = agent.primaryStationIds
    .map((stationId) => livingV3StationById(stationId))
    .filter(Boolean)
  const stationReadback = stations
    .map((station) => `${station!.label}: ${station!.role}`)
    .join('\n') || 'No owned tool station. This agent may answer in character but must hand real actions to Hermes.'
  const ownedStationLabels = stations.map((station) => station!.label).join(', ') || 'none'

  let domain = 'Answer inside the agent role/persona. For real actions, stay inside owned stations only; if the request is outside those stations, tell DLV that Hermes should route it.'
  if (agentId === 'hermes') {
    domain = 'Hermes is the only master router for the whole Workspace. He may classify any explicit request, choose the correct room/agent/tool surface, coordinate handoffs, and stop dangerous steps for DLV approval.'
  } else if (agentId === 'goblin') {
    domain = 'Goblin owns opportunity discovery, comparative shop/product/niche research, candidate ranking, and evidence-linked Opportunity Packet preparation. He may identify and compare promising signals, but Oracle owns final provenance, confidence, and allowed-claim validation; Etsy operators own listing work; Harbor owns supplier contact. Goblin must not publish, buy, message, or mutate accounts.'
  } else if (agentId === 'terra') {
    domain = 'Terra owns 3D/model/printer work. She may route explicit model/search/print questions to Model Hunt, Modeling Studio, or Printer Control. She can show candidates/status; she must not download, slice, upload, heat, pause, cancel, or start printing without DLV approval.'
  } else if (agentId === 'heimdall') {
    domain = 'Heimdall owns signal gating and product-search truth checks. He can filter weak/stale product signals and send good signals toward Oracle/Etsy; marketplace actions still go through Hermes/Etsy operators.'
  } else if (agentId === 'loki') {
    domain = 'Loki owns Etsy product hunt and source-lead packets. He can find angles, shortlist candidates, and prepare handoffs in the Etsy lane; SEO/QA/final draft should go to Thor/Odin, and cross-room routing goes to Hermes.'
  } else if (agentId === 'thor') {
    domain = 'Thor owns SEO, source truth, ShotLab prep, and QA readiness for selected products. He can prepare copy/brief/checks; live publishing, paid generation, supplier/customer messages, and account changes must wait for DLV approval.'
  } else if (agentId === 'odin') {
    domain = 'Odin owns final draft review and approval gates. He can judge readiness and ask DLV for a decision; he must not upload, publish, edit a live listing, or approve on DLV’s behalf.'
  } else if (agent.visualStatus === 'council-room-general') {
    domain = 'Council generals give strategy only. They can advise on plans, risks, and decisions inside the Council room; they do not run tools. Hermes routes execution.'
  } else if (agent.visualStatus === 'ambient-companion') {
    domain = 'This is a visual companion with no operating station. It may answer simply in character, but any real action must be routed by Hermes.'
  }

  return [
    `Owned stations: ${ownedStationLabels}.`,
    domain,
    'Simple rule for DLV: normal message = answer only. Explicit action words like search/find/prepare/make/print/send/upload/publish/buy/delete = do only the safe first step in-domain, then stop before anything risky.',
    `Station details:\n${stationReadback}`,
  ].join('\n')
}

export function buildLiveAgentChatPrompt(agentId: LivingV3AgentId, runId: string, operatorNote?: string) {
  const agent = livingV3AgentById(agentId)
  if (!agent) throw new Error(`Unknown Living V3 agent: ${agentId}`)
  const stationReadback = agent.primaryStationIds
    .map((stationId) => livingV3StationById(stationId))
    .filter(Boolean)
    .map((station) => `${station!.label} (${station!.id})`)
    .join(', ') || 'no owned station yet'
  const message = cleanTextLimit(operatorNote, 'DLV sent an empty message.', 4_000)
  const capabilityPolicy = liveAgentCapabilityPolicy(agentId)
  const contextPacket = formatLiveAgentContextPacket(agentId)
  return `You are ${agent.label}, a real AI persona inside DLV's Hermes Workspace / Olympus War Room.

IMPORTANT LIVE-ON-DEMAND CONTRACT:
- This model call exists ONLY because DLV directly talked to you.
- When idle/roaming, you must not claim that you consume tokens or run background research.
- You are not a daemon and not an autonomous swarm. This is one bounded one-shot answer.
- Use your role/persona below. Be useful and concrete, not generic.
- Answer DLV in very short, simple Hebrew. Paths/code/ids stay LTR.
- Do not ask long follow-up questions. If missing info matters, say the smallest next question.
- Do not use the words "local-only" or "read-only" in the Hebrew answer. Say it simply: "אני רק מסתכל/מכין" and "אני לא לוחץ על כפתור מסוכן בלי אישור".
- Normal chat means: answer only. Do not imply you started tools or actions.
- If DLV explicitly asks for action (search/find/prepare/make/print/send/upload/publish/buy/delete/edit), follow the capability policy below.
- Hermes is the only master of all rooms/domains. Non-Hermes agents must stay in their own domain and route outside-domain work to Hermes.
- Your raw chat call does not directly browse or mutate systems, but the Workspace host may run an approved safe first-step tool for your domain.
- Do not claim you searched, sent, printed, bought, edited, generated, or uploaded unless the host/tool result is actually included in the final UI/API result.
- For Terra model/search/printing requests: say Terra can route to Model Hunt for safe Printables search; the host may run that search after your answer. Never claim a download/slice/print happened unless the host result says so.
- Any dangerous or external step (send/publish/upload/buy/delete/edit account data/start printer/heat/pause/cancel) must stop for DLV approval.
- Return JSON only. No markdown.

Capability policy:
${capabilityPolicy}

Agent profile:
- id: ${agent.id}
- label: ${agent.label}
- role: ${agent.role}
- persona: ${agent.persona}
- home room: ${agent.home.roomId}
- owned stations: ${stationReadback}
- visual status: ${agent.visualStatus ?? 'standard'}

SCOPED OBSIDIAN / SECOND BRAIN CONTEXT PACKET:
Use this packet as your attached room/profile knowledge. It is a compact summary of existing Obsidian notes, not a license to invent missing facts.
${contextPacket}

DLV message:
${message}

Return JSON only with this exact shape:
{
  "agentId": "${agent.id}",
  "status": "completed_local_only",
  "answer": "2-5 short Hebrew lines max, natural, useful, direct. Avoid the words local-only/read-only.",
  "summary": "one short sentence",
  "nextSafeStep": "one practical next step, station, or Hermes routing instruction",
  "blockedActions": ["background autonomous usage", "out-of-domain actions", "dangerous external action without DLV approval", "worker fan-out"],
  "confidence": 0
}`
}

function buildLiveAgentChatArgs(input: { agentId: LivingV3AgentId; prompt: string; toolsets: string }) {
  const profileId = liveAgentHermesProfileId(input.agentId)
  const args = [
    ...hermesProfileArgs(profileId),
    'chat',
    '-Q',
    '--ignore-rules',
    '--max-turns',
    '1',
    '--source',
    `war-room-live-chat-${input.agentId}`,
    '-t',
    input.toolsets,
  ]
  const provider = process.env.WAR_ROOM_CONTROLLED_HERMES_PROVIDER?.trim()
  const model = process.env.WAR_ROOM_CONTROLLED_HERMES_MODEL?.trim()
  if (provider) args.push('--provider', provider)
  if (model) args.push('--model', model)
  args.push('-q', input.prompt)
  return args
}

function createLiveAgentChatUsage(input: {
  agentId: LivingV3AgentId
  cliPath: string
  args: Array<string>
  timeoutMs: number
  toolsets: string
  mode: ControlledAgentUsage['mode']
}): ControlledAgentUsage {
  const promptIndex = input.args.indexOf('-q')
  const previewArgs = promptIndex >= 0 ? input.args.slice(0, promptIndex).concat(['-q', '<live-agent-chat-json-prompt>']) : input.args
  return {
    mode: input.mode,
    budget: 'one Hermes CLI model call, max-turns=1',
    timeoutMs: input.timeoutMs,
    toolsets: input.toolsets,
    commandPreview: `${path.basename(input.cliPath)} ${previewArgs.join(' ')}`,
    reportedCost: null,
    reportedUsageLine: null,
    note: 'Live-on-message agent chat: the agent burns one model call only when DLV sends a message. Idle roaming/animation remains local and free. Toolsets default to none; live/external/printer/marketplace actions and worker fan-out remain locked.',
  }
}

export async function runControlledLiveAgentChat(input: {
  agentId: LivingV3AgentId
  runId: string
  operatorNote?: string
  cwd?: string
  timeoutMs?: number
  hermesCliPath?: string
  dryRun?: boolean
}): Promise<ControlledLiveAgentChatResult> {
  const startedAt = Date.now()
  const agent = livingV3AgentById(input.agentId)
  if (!agent) throw new Error(`Unknown Living V3 agent: ${input.agentId}`)
  const timeoutMs = clampTimeoutMs(input.timeoutMs)
  const cliPath = resolveControlledHermesCliPath(input.hermesCliPath)
  const toolsets = process.env.WAR_ROOM_LIVE_AGENT_CHAT_TOOLSETS?.trim() || 'none'
  const prompt = buildLiveAgentChatPrompt(input.agentId, input.runId, input.operatorNote)
  const args = buildLiveAgentChatArgs({ agentId: input.agentId, prompt, toolsets })
  const usage = createLiveAgentChatUsage({
    agentId: input.agentId,
    cliPath,
    args,
    timeoutMs,
    toolsets,
    mode: input.dryRun ? 'dry_run' : 'real_hermes_one_shot',
  })

  if (input.dryRun) {
    return {
      ok: false,
      runId: input.runId,
      agentId: input.agentId,
      durationMs: Date.now() - startedAt,
      error: 'Live agent chat dry-run only; no process was spawned.',
      usage: { ...usage, mode: 'dry_run' },
      output: {
        agentId: input.agentId,
        status: 'blocked',
        answer: `${agent.label}: dry-run only. No model call was made.`,
        summary: `${agent.label} dry-run recorded; idle roaming remains free.`,
        nextSafeStep: 'Use a fake CLI in tests or ask the agent from the UI for one real call.',
        blockedActions: ['Hermes CLI', 'child_process', 'persistent workers', 'external actions'],
        confidence: 100,
      },
      rawStdout: '',
      rawStderr: '',
    }
  }

  const executed = await execFileBounded(cliPath, args, {
    cwd: input.cwd,
    timeoutMs,
    maxBuffer: 80_000,
  })
  const combinedOutput = `${executed.stdout}\n${executed.stderr}`
  const finalUsage: ControlledAgentUsage = {
    ...usage,
    reportedCost: extractUsageLine(combinedOutput, 'cost'),
    reportedUsageLine: extractUsageLine(combinedOutput, 'usage') ?? extractUsageLine(combinedOutput, 'tokens'),
  }

  let output: ControlledLiveAgentChatOutput | undefined
  try {
    output = normalizeLiveAgentChatOutput(input.agentId, extractJsonObjectFromHermesOutput(combinedOutput))
  } catch (error) {
    const parseMessage = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      runId: input.runId,
      agentId: input.agentId,
      durationMs: Date.now() - startedAt,
      error: sanitizeControlledRunnerError(executed.error ?? parseMessage),
      usage: finalUsage,
      rawStdout: executed.stdout,
      rawStderr: executed.stderr,
    }
  }

  if (executed.error) {
    return {
      ok: false,
      runId: input.runId,
      agentId: input.agentId,
      durationMs: Date.now() - startedAt,
      error: sanitizeControlledRunnerError(executed.error),
      usage: finalUsage,
      output,
      rawStdout: executed.stdout,
      rawStderr: executed.stderr,
    }
  }

  return {
    ok: true,
    runId: input.runId,
    agentId: input.agentId,
    sessionId: extractSessionId(combinedOutput),
    durationMs: Date.now() - startedAt,
    usage: finalUsage,
    output,
    rawStdout: executed.stdout,
    rawStderr: executed.stderr,
  }
}
