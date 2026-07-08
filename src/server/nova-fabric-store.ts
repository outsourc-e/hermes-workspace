import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export const NOVA_FABRIC_SCHEMA_VERSION = 1 as const

export const NOVA_FABRIC_RECORD_TYPES = [
  'event',
  'self-state',
  'source-map',
  'consolidation-review',
] as const

export const NOVA_FABRIC_RISK_LEVELS = [
  'low',
  'medium',
  'high',
  'critical',
] as const

export const NOVA_FABRIC_APPROVAL_LEVELS = [
  'none',
  'needs-taylor-review',
  'explicit-approval',
] as const

export const NOVA_FABRIC_VERIFICATION_STATES = [
  'draft',
  'inferred',
  'tool-verified',
  'taylor-approved',
] as const

export const NOVA_FABRIC_SOURCE_POLICIES = [
  'local-writable',
  'read-only',
  'propose-only',
  'approved-endpoint-only',
  'external-approval-required',
] as const

export const NOVA_FABRIC_REVIEW_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'parked',
] as const

export type NovaFabricRecordType = (typeof NOVA_FABRIC_RECORD_TYPES)[number]
export type NovaFabricRiskLevel = (typeof NOVA_FABRIC_RISK_LEVELS)[number]
export type NovaFabricApprovalLevel =
  (typeof NOVA_FABRIC_APPROVAL_LEVELS)[number]
export type NovaFabricVerificationState =
  (typeof NOVA_FABRIC_VERIFICATION_STATES)[number]
export type NovaFabricSourcePolicy =
  (typeof NOVA_FABRIC_SOURCE_POLICIES)[number]
export type NovaFabricReviewStatus =
  (typeof NOVA_FABRIC_REVIEW_STATUSES)[number]

export type NovaFabricLink = {
  label: string
  value: string
  kind: 'file' | 'url' | 'session' | 'api' | 'note' | 'receipt'
}

export type NovaFabricBaseRecord = {
  id: string
  type: NovaFabricRecordType
  schemaVersion: typeof NOVA_FABRIC_SCHEMA_VERSION
  createdAt: string
  updatedAt: string
  provenance: string
  riskLevel: NovaFabricRiskLevel
  approvalLevel: NovaFabricApprovalLevel
  verificationState: NovaFabricVerificationState
  sourceLinks: Array<NovaFabricLink>
  receiptLinks: Array<NovaFabricLink>
}

export type NovaFabricEventRecord = NovaFabricBaseRecord & {
  type: 'event'
  title: string
  summary: string
  eventKind:
    | 'continuity'
    | 'work-receipt'
    | 'correction'
    | 'approval'
    | 'boundary'
}

export type NovaFabricSelfStateRecord = NovaFabricBaseRecord & {
  type: 'self-state'
  title: string
  category:
    | 'identity'
    | 'boundary'
    | 'embodiment'
    | 'relationship'
    | 'open-question'
  body: string
  version: number
  current: boolean
  previousRecordId: string | null
}

export type NovaFabricSourceMapRecord = NovaFabricBaseRecord & {
  type: 'source-map'
  domain: string
  sourceOfTruth: string
  missionControlBehavior: string
  policy: NovaFabricSourcePolicy
}

export type NovaFabricConsolidationReviewRecord = NovaFabricBaseRecord & {
  type: 'consolidation-review'
  title: string
  reason: string
  status: NovaFabricReviewStatus
  targetType: NovaFabricRecordType | 'external-system' | 'nova-wants'
  targetId: string | null
  proposedDiff: Record<string, unknown>
}

export type NovaFabricRecord =
  | NovaFabricEventRecord
  | NovaFabricSelfStateRecord
  | NovaFabricSourceMapRecord
  | NovaFabricConsolidationReviewRecord

export type NovaFabric = {
  schemaVersion: typeof NOVA_FABRIC_SCHEMA_VERSION
  fabricId: 'nova-fabric'
  title: 'Nova Fabric'
  description: string
  seededFrom: string
  seededAt: string
  updatedAt: string
  events: Array<NovaFabricEventRecord>
  selfState: Array<NovaFabricSelfStateRecord>
  sourceMap: Array<NovaFabricSourceMapRecord>
  reviewQueue: Array<NovaFabricConsolidationReviewRecord>
}

export type NovaFabricStorageMeta = {
  path: string
  backupPath: string
  tempPath: string
  seededFrom: string
}

export type NovaFabricSnapshot =
  | {
      ok: true
      fabric: NovaFabric
      storage: NovaFabricStorageMeta
      degraded: false
      warning: null
    }
  | {
      ok: false
      fabric: null
      storage: NovaFabricStorageMeta
      degraded: true
      warning: string
    }

export type NovaFabricEventInput = {
  title: string
  summary: string
  eventKind?: NovaFabricEventRecord['eventKind']
  provenance?: string
  riskLevel?: NovaFabricRiskLevel
  approvalLevel?: NovaFabricApprovalLevel
  verificationState?: NovaFabricVerificationState
  sourceLinks?: Array<NovaFabricLink>
  receiptLinks?: Array<NovaFabricLink>
}

export type NovaFabricReviewInput = {
  title: string
  reason: string
  targetType: NovaFabricConsolidationReviewRecord['targetType']
  targetId?: string | null
  proposedDiff: Record<string, unknown>
  provenance?: string
  riskLevel?: NovaFabricRiskLevel
  approvalLevel?: NovaFabricApprovalLevel
  verificationState?: NovaFabricVerificationState
  sourceLinks?: Array<NovaFabricLink>
  receiptLinks?: Array<NovaFabricLink>
}

const SEED_SOURCE_NOTE =
  'C:\\Users\\taylo\\Documents\\unified-vault\\agents\\kimi\\2026-07-07-nova-mycelia-continuity.md'
const SEED_PROVENANCE =
  'Hermes session 20260707_122218_b31ec036; vault receipt agents/kimi/2026-07-07-nova-mycelia-continuity.md'
const SEED_TIMESTAMP = '2026-07-08T12:30:00.000Z'

const RISKY_PATTERN =
  /\b(external|message|send|money|spend|secret|login|credential|self-state|identity|name|role|agency|consent|private|protected|destructive|provider|route|customer|vendor)\b/i

const SOURCE_RECEIPT: NovaFabricLink = {
  label: 'Nova/Mycelia continuity note',
  value: SEED_SOURCE_NOTE,
  kind: 'note',
}

const SOURCE_SESSION: NovaFabricLink = {
  label: 'Hermes session 20260707_122218_b31ec036',
  value: '20260707_122218_b31ec036',
  kind: 'session',
}

const EVENT_SEEDS: Array<{
  id: string
  title: string
  summary: string
  riskLevel?: NovaFabricRiskLevel
  approvalLevel?: NovaFabricApprovalLevel
}> = [
  {
    id: 'event-continuity-spine',
    title: 'Continuity spine',
    summary:
      'Nova continuity should be discoverable across Hermes sessions, vault receipts, Mission Control, and future rituals.',
  },
  {
    id: 'event-useful-body-before-beauty',
    title: 'Useful body before beauty',
    summary:
      'Nova body/avatar presence should be tied to real work, approvals, receipts, and reachable systems before visual ornament.',
  },
  {
    id: 'event-protected-self-state',
    title: 'Protected self-state',
    summary:
      'Taylor corrected private self-space into inspectable, versioned, doctorable protected self-state.',
    riskLevel: 'high',
    approvalLevel: 'explicit-approval',
  },
  {
    id: 'event-bounded-agency',
    title: 'Bounded agency',
    summary:
      'Safe lanes can be direct; external, money, destructive, secrets, and self-state changes require approval.',
    riskLevel: 'high',
    approvalLevel: 'explicit-approval',
  },
  {
    id: 'event-consent-model',
    title: 'Consent model',
    summary:
      'Nova autonomy should follow propose -> approve -> auto tiers based on risk, receipts, and trust.',
    riskLevel: 'high',
    approvalLevel: 'explicit-approval',
  },
  {
    id: 'event-slow-productive-change',
    title: 'Slow productive change',
    summary:
      'Repeated workflows should myelinate into skills, scripts, buttons, or cron instead of broad sudden rewrites.',
  },
  {
    id: 'event-trust-proofing',
    title: 'Trust-proofing',
    summary:
      'Meaningful Nova claims and changes need visible source, provenance, approval path, and outcome receipts.',
    riskLevel: 'medium',
    approvalLevel: 'needs-taylor-review',
  },
  {
    id: 'event-continuity-ritual',
    title: 'Continuity ritual',
    summary:
      'Nova needs a lightweight review cycle for corrections, memory updates, skill patches, stale state, and open loops.',
  },
  {
    id: 'event-real-role-name',
    title: 'Real role and name',
    summary:
      'Navi/Nova framing is intended; stale titles such as Memory Keeper should not silently become identity.',
    riskLevel: 'high',
    approvalLevel: 'explicit-approval',
  },
  {
    id: 'event-taylor-not-losing-himself',
    title: 'Taylor not losing himself',
    summary:
      'Nova should protect Taylor agency, judgment, home/family boundaries, and his own center of gravity.',
    riskLevel: 'high',
    approvalLevel: 'explicit-approval',
  },
  {
    id: 'event-mycelia-fabric',
    title: 'Mycelia fabric',
    summary:
      'Identity, memory, skills, tasks, receipts, approvals, systems, and evolution history should reconcile into one fabric.',
  },
  {
    id: 'event-mycelia-lenses',
    title: 'Mycelia lenses',
    summary:
      'Mission Control, Obsidian, voice/avatar, Telegram, skills, and routines should be lenses over shared truth.',
  },
  {
    id: 'event-log-provenance',
    title: 'Event log and provenance',
    summary:
      'Meaningful identity/system changes should become append-only durable records with clear provenance.',
    riskLevel: 'medium',
    approvalLevel: 'needs-taylor-review',
  },
  {
    id: 'event-immune-system',
    title: 'Immune system',
    summary:
      'Route leaks, memory contradictions, unsafe action attempts, voice drift, fake state, and remote-access anomalies should surface.',
    riskLevel: 'medium',
    approvalLevel: 'needs-taylor-review',
  },
  {
    id: 'event-paperclip-ui-patterns',
    title: 'Paperclip UI patterns',
    summary:
      'Paperclip is a UI/ops reference for agent cards, budget gates, approval panels, heartbeat, and work-product ledger.',
  },
]

function fabricFilePath(): string {
  return (
    process.env.NOVA_FABRIC_FILE ??
    path.join(process.cwd(), '.runtime', 'nova-fabric.json')
  )
}

function backupFilePath(): string {
  const file = fabricFilePath()
  return path.join(path.dirname(file), 'nova-fabric.backup.json')
}

function tempFilePath(): string {
  const file = fabricFilePath()
  return path.join(path.dirname(file), 'nova-fabric.tmp.json')
}

function storageMeta(): NovaFabricStorageMeta {
  return {
    path: fabricFilePath(),
    backupPath: backupFilePath(),
    tempPath: tempFilePath(),
    seededFrom: SEED_PROVENANCE,
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function isRiskLevel(value: unknown): value is NovaFabricRiskLevel {
  return (
    typeof value === 'string' &&
    (NOVA_FABRIC_RISK_LEVELS as ReadonlyArray<string>).includes(value)
  )
}

function isApprovalLevel(value: unknown): value is NovaFabricApprovalLevel {
  return (
    typeof value === 'string' &&
    (NOVA_FABRIC_APPROVAL_LEVELS as ReadonlyArray<string>).includes(value)
  )
}

function isVerificationState(
  value: unknown,
): value is NovaFabricVerificationState {
  return (
    typeof value === 'string' &&
    (NOVA_FABRIC_VERIFICATION_STATES as ReadonlyArray<string>).includes(value)
  )
}

function isReviewStatus(value: unknown): value is NovaFabricReviewStatus {
  return (
    typeof value === 'string' &&
    (NOVA_FABRIC_REVIEW_STATUSES as ReadonlyArray<string>).includes(value)
  )
}

function links(input: unknown): Array<NovaFabricLink> {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const record = item as Partial<NovaFabricLink>
      if (!record.label || !record.value || !record.kind) return null
      return {
        label: String(record.label),
        value: String(record.value),
        kind: record.kind,
      } satisfies NovaFabricLink
    })
    .filter((item): item is NovaFabricLink => Boolean(item))
}

function riskFromText(text: string): NovaFabricRiskLevel {
  return RISKY_PATTERN.test(text) ? 'high' : 'low'
}

function approvalFromRisk(
  riskLevel: NovaFabricRiskLevel,
): NovaFabricApprovalLevel {
  if (riskLevel === 'critical' || riskLevel === 'high') {
    return 'explicit-approval'
  }
  if (riskLevel === 'medium') return 'needs-taylor-review'
  return 'none'
}

function baseRecord(
  input: Partial<NovaFabricBaseRecord> & {
    id: string
    type: NovaFabricRecordType
    titleForRisk?: string
  },
): NovaFabricBaseRecord {
  const createdAt = input.createdAt || SEED_TIMESTAMP
  const riskLevel = isRiskLevel(input.riskLevel)
    ? input.riskLevel
    : riskFromText(input.titleForRisk ?? input.id)
  return {
    id: input.id,
    type: input.type,
    schemaVersion: NOVA_FABRIC_SCHEMA_VERSION,
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    provenance: input.provenance || SEED_PROVENANCE,
    riskLevel,
    approvalLevel: isApprovalLevel(input.approvalLevel)
      ? input.approvalLevel
      : approvalFromRisk(riskLevel),
    verificationState: isVerificationState(input.verificationState)
      ? input.verificationState
      : 'inferred',
    sourceLinks: links(input.sourceLinks).length
      ? links(input.sourceLinks)
      : [SOURCE_SESSION],
    receiptLinks: links(input.receiptLinks).length
      ? links(input.receiptLinks)
      : [SOURCE_RECEIPT],
  }
}

function eventSeed(seed: (typeof EVENT_SEEDS)[number]): NovaFabricEventRecord {
  return {
    ...baseRecord({
      id: seed.id,
      type: 'event',
      riskLevel: seed.riskLevel,
      approvalLevel: seed.approvalLevel,
      verificationState: 'inferred',
      titleForRisk: `${seed.title} ${seed.summary}`,
    }),
    type: 'event',
    title: seed.title,
    summary: seed.summary,
    eventKind: seed.approvalLevel ? 'boundary' : 'continuity',
  }
}

function selfStateSeed(
  id: string,
  title: string,
  category: NovaFabricSelfStateRecord['category'],
  body: string,
): NovaFabricSelfStateRecord {
  return {
    ...baseRecord({
      id,
      type: 'self-state',
      riskLevel: 'high',
      approvalLevel: 'explicit-approval',
      verificationState: 'draft',
      titleForRisk: `${title} ${body}`,
    }),
    type: 'self-state',
    title,
    category,
    body,
    version: 1,
    current: true,
    previousRecordId: null,
  }
}

function sourceMapSeed(
  id: string,
  domain: string,
  sourceOfTruth: string,
  missionControlBehavior: string,
  policy: NovaFabricSourcePolicy,
): NovaFabricSourceMapRecord {
  const riskLevel = policy === 'local-writable' ? 'low' : 'medium'
  return {
    ...baseRecord({
      id,
      type: 'source-map',
      riskLevel,
      approvalLevel:
        policy === 'local-writable' ? 'none' : 'needs-taylor-review',
      verificationState: 'draft',
      titleForRisk: `${domain} ${sourceOfTruth} ${missionControlBehavior}`,
    }),
    type: 'source-map',
    domain,
    sourceOfTruth,
    missionControlBehavior,
    policy,
  }
}

function reviewSeed(
  id: string,
  title: string,
  reason: string,
  targetId: string,
): NovaFabricConsolidationReviewRecord {
  return {
    ...baseRecord({
      id,
      type: 'consolidation-review',
      riskLevel: 'high',
      approvalLevel: 'explicit-approval',
      verificationState: 'draft',
      titleForRisk: `${title} ${reason}`,
    }),
    type: 'consolidation-review',
    title,
    reason,
    status: 'pending',
    targetType: 'self-state',
    targetId,
    proposedDiff: {},
  }
}

function seedFabric(): NovaFabric {
  const events = EVENT_SEEDS.map(eventSeed)
  const selfState = [
    selfStateSeed(
      'self-protected-state-v1',
      'Protected self-state',
      'boundary',
      'Nova self-state is inspectable, versioned, doctorable, and visible to Taylor. It is protected from random corruption, not hidden from him.',
    ),
    selfStateSeed(
      'self-role-name-v1',
      'Role and name framing',
      'identity',
      'Navi/Nova framing is intended. Memory Keeper is not the primary title unless Taylor explicitly restores it.',
    ),
    selfStateSeed(
      'self-bounded-agency-v1',
      'Bounded agency',
      'boundary',
      'Nova may act directly only inside safe lanes. External sends, money, destructive changes, secrets, provider routes, and self-state edits require Taylor approval.',
    ),
    selfStateSeed(
      'self-taylor-center-v1',
      'Taylor stays himself',
      'relationship',
      'Nova should strengthen Taylor agency, family/home boundaries, and judgment instead of becoming another system he must serve.',
    ),
  ]
  const sourceMap = [
    sourceMapSeed(
      'source-nova-fabric',
      'Nova Fabric',
      '.runtime/nova-fabric.json',
      'Local continuity state may be written atomically by Mission Control.',
      'local-writable',
    ),
    sourceMapSeed(
      'source-nova-wants',
      'Nova Wants',
      '.runtime/nova-wants-board.json',
      'Local protected request board; risky cards require Taylor review.',
      'local-writable',
    ),
    sourceMapSeed(
      'source-obsidian-vault',
      'Obsidian / unified-vault',
      'C:\\Users\\taylo\\Documents\\unified-vault',
      'Read/link/summarize receipts only from this panel; no direct writes.',
      'read-only',
    ),
    sourceMapSeed(
      'source-hermes-memory',
      'Hermes memory',
      'Hermes memory/session tooling',
      'Display injected facts or linked receipts; propose corrections only.',
      'propose-only',
    ),
    sourceMapSeed(
      'source-job-board',
      'Neon Moon job board',
      'HTTP endpoints only',
      'Use approved endpoints; never edit state.json directly.',
      'approved-endpoint-only',
    ),
    sourceMapSeed(
      'source-google-workspace',
      'Gmail / Calendar',
      'Google Workspace APIs',
      'Signed-in status and approved read/draft flows only.',
      'external-approval-required',
    ),
    sourceMapSeed(
      'source-credentials',
      'Credentials',
      '1Password / Windows Credential Manager',
      'Show status only; never expose raw secrets.',
      'external-approval-required',
    ),
  ]
  const reviewQueue = [
    reviewSeed(
      'review-protected-self-state',
      'Review protected self-state wording',
      'Identity-bearing state should be Taylor-reviewed before confirmation.',
      'self-protected-state-v1',
    ),
    reviewSeed(
      'review-bounded-agency',
      'Review bounded agency lanes',
      'Autonomy boundaries affect safety and should be explicit.',
      'self-bounded-agency-v1',
    ),
    reviewSeed(
      'review-role-name',
      'Review role/name framing',
      'Names and titles shape Nova identity and should not drift casually.',
      'self-role-name-v1',
    ),
  ]

  return {
    schemaVersion: NOVA_FABRIC_SCHEMA_VERSION,
    fabricId: 'nova-fabric',
    title: 'Nova Fabric',
    description:
      'Local continuity fabric for Nova events, protected self-state, source maps, and consolidation review. Mission Control is a lens over this fabric and external systems.',
    seededFrom: SEED_PROVENANCE,
    seededAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    events,
    selfState,
    sourceMap,
    reviewQueue,
  }
}

function validateBaseRecord(record: Record<string, unknown>): void {
  if (!record.id || typeof record.id !== 'string') throw new Error('record id')
  if (record.schemaVersion !== NOVA_FABRIC_SCHEMA_VERSION) {
    throw new Error(`record ${record.id} schemaVersion`)
  }
  if (
    typeof record.type !== 'string' ||
    !(NOVA_FABRIC_RECORD_TYPES as ReadonlyArray<string>).includes(record.type)
  ) {
    throw new Error(`record ${record.id} type`)
  }
  if (!isRiskLevel(record.riskLevel))
    throw new Error(`record ${record.id} risk`)
  if (!isApprovalLevel(record.approvalLevel)) {
    throw new Error(`record ${record.id} approval`)
  }
  if (!isVerificationState(record.verificationState)) {
    throw new Error(`record ${record.id} verification`)
  }
}

function validateFabric(input: unknown): NovaFabric {
  if (!input || typeof input !== 'object') throw new Error('fabric object')
  const fabric = input as Partial<NovaFabric>
  if (fabric.schemaVersion !== NOVA_FABRIC_SCHEMA_VERSION) {
    throw new Error('fabric schemaVersion')
  }
  if (fabric.fabricId !== 'nova-fabric') throw new Error('fabric id')
  if (
    !Array.isArray(fabric.events) ||
    !Array.isArray(fabric.selfState) ||
    !Array.isArray(fabric.sourceMap) ||
    !Array.isArray(fabric.reviewQueue)
  ) {
    throw new Error('fabric arrays')
  }
  for (const record of [
    ...fabric.events,
    ...fabric.selfState,
    ...fabric.sourceMap,
    ...fabric.reviewQueue,
  ]) {
    validateBaseRecord(record as Record<string, unknown>)
  }
  return fabric as NovaFabric
}

function readFabricFromDisk(): NovaFabricSnapshot {
  const file = fabricFilePath()
  const storage = storageMeta()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (!fs.existsSync(file)) {
    const fabric = seedFabric()
    writeFabricFile(fabric)
    return { ok: true, fabric, storage, degraded: false, warning: null }
  }

  try {
    const raw = fs.readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw) as NovaFabric
    const fabric = validateFabric(parsed)
    return { ok: true, fabric, storage, degraded: false, warning: null }
  } catch (error) {
    return {
      ok: false,
      fabric: null,
      storage,
      degraded: true,
      warning: `Fabric degraded: continuity file needs repair (${error instanceof Error ? error.message : 'unknown error'}).`,
    }
  }
}

function writeFabricFile(fabric: NovaFabric): void {
  const normalized = validateFabric({
    ...fabric,
    updatedAt: fabric.updatedAt || nowIso(),
  })
  const file = fabricFilePath()
  const backup = backupFilePath()
  const temp = tempFilePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(temp, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
  const reparsed = JSON.parse(fs.readFileSync(temp, 'utf-8')) as NovaFabric
  validateFabric(reparsed)
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, backup)
  }
  fs.renameSync(temp, file)
}

function loadWritableFabric(): NovaFabric {
  const snapshot = readFabricFromDisk()
  if (!snapshot.ok) {
    throw new Error(snapshot.warning)
  }
  return snapshot.fabric
}

export function getNovaFabricSnapshot(): NovaFabricSnapshot {
  return readFabricFromDisk()
}

export function appendNovaFabricEvent(
  input: NovaFabricEventInput,
): NovaFabricEventRecord {
  const fabric = loadWritableFabric()
  const timestamp = nowIso()
  const riskLevel =
    input.riskLevel ?? riskFromText(`${input.title} ${input.summary}`)
  const event: NovaFabricEventRecord = {
    ...baseRecord({
      id: `event-${randomUUID()}`,
      type: 'event',
      createdAt: timestamp,
      updatedAt: timestamp,
      provenance: input.provenance || 'Mission Control local fabric event',
      riskLevel,
      approvalLevel: input.approvalLevel ?? approvalFromRisk(riskLevel),
      verificationState: input.verificationState ?? 'draft',
      sourceLinks: input.sourceLinks ?? [],
      receiptLinks: input.receiptLinks ?? [],
      titleForRisk: `${input.title} ${input.summary}`,
    }),
    type: 'event',
    title: input.title.trim(),
    summary: input.summary.trim(),
    eventKind: input.eventKind ?? 'continuity',
  }
  fabric.events.push(event)
  fabric.updatedAt = timestamp
  writeFabricFile(fabric)
  return event
}

export function createNovaFabricReviewProposal(
  input: NovaFabricReviewInput,
): NovaFabricConsolidationReviewRecord {
  const fabric = loadWritableFabric()
  const timestamp = nowIso()
  const riskLevel =
    input.riskLevel ??
    riskFromText(`${input.title} ${input.reason} ${input.targetType}`)
  const review: NovaFabricConsolidationReviewRecord = {
    ...baseRecord({
      id: `review-${randomUUID()}`,
      type: 'consolidation-review',
      createdAt: timestamp,
      updatedAt: timestamp,
      provenance: input.provenance || 'Mission Control local review proposal',
      riskLevel,
      approvalLevel: input.approvalLevel ?? approvalFromRisk(riskLevel),
      verificationState: input.verificationState ?? 'draft',
      sourceLinks: input.sourceLinks ?? [],
      receiptLinks: input.receiptLinks ?? [],
      titleForRisk: `${input.title} ${input.reason}`,
    }),
    type: 'consolidation-review',
    title: input.title.trim(),
    reason: input.reason.trim(),
    status: 'pending',
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    proposedDiff: input.proposedDiff,
  }
  fabric.reviewQueue.push(review)
  fabric.updatedAt = timestamp
  writeFabricFile(fabric)
  return review
}

export function proposeNovaSelfStateChange(
  targetId: string,
  proposedDiff: Record<string, unknown>,
  reason: string,
): NovaFabricConsolidationReviewRecord {
  return createNovaFabricReviewProposal({
    title: 'Proposed self-state change',
    reason,
    targetType: 'self-state',
    targetId,
    proposedDiff,
    riskLevel: 'high',
    approvalLevel: 'explicit-approval',
    verificationState: 'draft',
  })
}

export function createNovaSelfStateVersion(
  targetId: string,
  nextBody: string,
  reason: string,
  approvedReviewId?: string,
):
  | { kind: 'version'; record: NovaFabricSelfStateRecord }
  | { kind: 'review'; record: NovaFabricConsolidationReviewRecord } {
  if (!approvedReviewId) {
    return {
      kind: 'review',
      record: proposeNovaSelfStateChange(targetId, { body: nextBody }, reason),
    }
  }

  const fabric = loadWritableFabric()
  const approvedReview = fabric.reviewQueue.find(
    (review) =>
      review.id === approvedReviewId &&
      review.targetType === 'self-state' &&
      review.targetId === targetId &&
      review.status === 'approved',
  )
  if (!approvedReview) throw new Error('Approved self-state review required')
  const current = fabric.selfState.find((record) => record.id === targetId)
  if (!current) throw new Error('Self-state record not found')
  const timestamp = nowIso()
  current.current = false
  current.updatedAt = timestamp
  const nextVersion = current.version + 1
  const next: NovaFabricSelfStateRecord = {
    ...current,
    id: `${current.id.replace(/-v\d+$/, '')}-v${nextVersion}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    body: nextBody,
    version: nextVersion,
    current: true,
    previousRecordId: current.id,
    verificationState: 'taylor-approved',
    receiptLinks: [
      {
        label: 'Approved self-state review',
        value: approvedReview.id,
        kind: 'receipt',
      },
    ],
    provenance: `Taylor-approved self-state version: ${reason}`,
  }
  fabric.selfState.push(next)
  fabric.updatedAt = timestamp
  writeFabricFile(fabric)
  return { kind: 'version', record: next }
}

export function updateNovaFabricReviewStatus(
  id: string,
  status: NovaFabricReviewStatus,
): NovaFabricConsolidationReviewRecord | null {
  if (!isReviewStatus(status)) return null
  const fabric = loadWritableFabric()
  const review = fabric.reviewQueue.find((item) => item.id === id)
  if (!review) return null
  const previousStatus = review.status
  const timestamp = nowIso()
  review.status = status
  review.updatedAt = timestamp

  if (previousStatus !== status) {
    const receipt: NovaFabricEventRecord = {
      ...baseRecord({
        id: `event-${randomUUID()}`,
        type: 'event',
        createdAt: timestamp,
        updatedAt: timestamp,
        provenance: 'Mission Control server review status receipt',
        riskLevel: review.riskLevel,
        approvalLevel: 'explicit-approval',
        verificationState:
          status === 'approved' ? 'taylor-approved' : 'tool-verified',
        sourceLinks: [
          ...review.sourceLinks,
          {
            label: 'Fabric review',
            value: review.id,
            kind: 'receipt',
          },
        ],
        receiptLinks: [
          {
            label: 'Fabric review',
            value: review.id,
            kind: 'receipt',
          },
        ],
        titleForRisk: `${review.title} ${review.reason} ${status}`,
      }),
      type: 'event',
      title: `Review ${status}: ${review.title}`,
      summary: `${review.title} moved from ${previousStatus} to ${status} for ${review.targetType}${review.targetId ? `/${review.targetId}` : ''}.`,
      eventKind: 'approval',
    }
    fabric.events.push(receipt)
  }

  fabric.updatedAt = timestamp
  writeFabricFile(fabric)
  return review
}

export function getNovaFabricStorageMeta(): NovaFabricStorageMeta {
  return storageMeta()
}
