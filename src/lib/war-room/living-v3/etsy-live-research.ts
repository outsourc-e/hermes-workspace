import type { WORKSPACE_KERNEL_SAFETY } from '../../workspace-kernel/contracts'

export type EtsyLiveResearchRequest = {
  query: string
  operatorNote?: string
  sourceHints?: Array<string>
  maxCandidates?: number
  mode: 'read-only-live-research'
}

export type EtsyLiveEvidenceQuality = 'strong' | 'partial' | 'weak' | 'blocked'

export type EtsyLiveSourceDetail = {
  kind: 'etsy' | 'supplier' | 'other'
  label: string
  url: string
  title?: string
  imageUrl?: string
  localImageRef?: string
  priceText?: string
  shopName?: string
  marketplace?: string
  salesText?: string
  demandText?: string
  tags?: Array<string>
  variantOptions?: Array<string>
}

export type EtsyLiveCandidate = {
  candidateId: string
  title: string
  summary: string
  sourceUrls: Array<string>
  sourceDetails?: Array<EtsyLiveSourceDetail>
  evidenceIds: Array<string>
  evidenceQuality: EtsyLiveEvidenceQuality
  score?: number
  missingEvidence: Array<string>
  riskFlags: Array<string>
  dataOrigin: 'live-readonly-research'
  suggestedNextStep: 'select_product' | 'needs_more_evidence' | 'blocked'
}

export type EtsyLiveResearchRun = {
  runId: string
  status: 'queued' | 'running' | 'completed' | 'blocked' | 'failed'
  query: string
  candidates: Array<EtsyLiveCandidate>
  blockedReason?: string
  startedAt: string
  completedAt?: string
  safety: typeof WORKSPACE_KERNEL_SAFETY
  liveReadOnlyResearchAttempted: boolean
  connectorStatus: 'not_configured' | 'blocked' | 'attempted' | 'available'
}

export type EtsyLiveResearchNormalizationResult = {
  run: EtsyLiveResearchRun
  rejectedClaims: Array<string>
}

export const ETSY_LIVE_RESEARCH_MAX_QUERY_CHARS = 800
export const ETSY_LIVE_RESEARCH_MAX_CANDIDATES = 5

export const ETSY_LIVE_RESEARCH_SAFETY: typeof WORKSPACE_KERNEL_SAFETY = {
  localOnly: true,
  usageAllowed: false,
  workerSpawnAllowed: false,
  externalRequestsAllowed: false,
  liveActionsAllowed: false,
}

const unsafeBooleanFields = [
  'liveActionsAllowed',
  'etsyLiveActionsAllowed',
  'publishedToEtsy',
  'uploadedToEtsy',
  'createdLiveDraft',
  'sentSupplierMessage',
  'purchaseCompleted',
  'paidGenerationStarted',
  'discordSent',
  'workerFanOutAllowed',
]

const unsafeClaimPatterns = [
  /\b(i|we|agent|scout)\s+(published|uploaded|edited|renewed|messaged|purchased|bought|paid|sent)\b/i,
  /\b(live\s+etsy\s+draft|etsy\s+draft)\s+(created|uploaded|published)\b/i,
  /\bsupplier\s+message\s+(sent|delivered|created)\b/i,
  /\bdiscord\s+(sent|posted|delivered)\b/i,
  /\bpaid\s+(shotlab|generation)\s+(started|ran|completed)\b/i,
  /\bworker\s+fan[- ]?out\s+(enabled|started|spawned)\b/i,
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanText(value: unknown, fallback: string, max = 500) {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\s+/g, ' ').slice(0, max) : fallback
}

function cleanTextArray(value: unknown, fallback: Array<string> = [], limit = 8, max = 500) {
  if (!Array.isArray(value)) return fallback
  const cleaned = value
    .map((item) => cleanText(item, '', max))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, limit)
  return cleaned.length ? cleaned : fallback
}

function cleanSourceUrls(value: unknown) {
  return cleanTextArray(value, [], 8, 1_000).filter((item) => /^https?:\/\//i.test(item))
}

function kindForSourceUrl(url: string): EtsyLiveSourceDetail['kind'] {
  const lower = url.toLowerCase()
  if (lower.includes('etsy.com/listing/')) return 'etsy'
  if (lower.includes('aliexpress.') || lower.includes('alibaba.') || lower.includes('1688.com')) return 'supplier'
  return 'other'
}

function cleanOptionalUrl(value: unknown) {
  const text = cleanText(value, '', 1_000)
  return /^https?:\/\//i.test(text) ? text : undefined
}

function cleanLocalImageRef(value: unknown) {
  const text = cleanText(value, '', 1_000)
  if (!text.startsWith('/war-room/etsy-product-media/') || text.includes('..')) return undefined
  return /^\/[A-Za-z0-9._/-]+$/.test(text) ? text : undefined
}

function cleanSourceDetails(value: unknown, sourceUrls: Array<string>) {
  const rawList = Array.isArray(value) ? value : []
  const details = rawList
    .filter(isRecord)
    .map((item): EtsyLiveSourceDetail | null => {
      const url = cleanOptionalUrl(item.url)
      if (!url) return null
      const kind = item.kind === 'etsy' || item.kind === 'supplier' || item.kind === 'other'
        ? item.kind
        : kindForSourceUrl(url)
      const marketplace = cleanText(item.marketplace, kind === 'etsy' ? 'Etsy' : kind === 'supplier' ? 'Supplier' : 'Source', 80)
      return {
        kind,
        label: cleanText(item.label, kind === 'etsy' ? 'Etsy competitor' : kind === 'supplier' ? 'Supplier lead' : 'Source', 80),
        url,
        title: cleanText(item.title, '', 180) || undefined,
        imageUrl: cleanOptionalUrl(item.imageUrl),
        localImageRef: cleanLocalImageRef(item.localImageRef),
        priceText: cleanText(item.priceText, '', 80) || undefined,
        shopName: cleanText(item.shopName, '', 120) || undefined,
        marketplace,
        salesText: cleanText(item.salesText, '', 80) || undefined,
        demandText: cleanText(item.demandText, '', 120) || undefined,
        tags: cleanTextArray(item.tags, [], 8, 36),
        variantOptions: cleanTextArray(item.variantOptions, [], 24, 80),
      }
    })
    .filter((item): item is EtsyLiveSourceDetail => Boolean(item))

  if (details.length) return details.slice(0, 8)
  return sourceUrls.slice(0, 8).map((url): EtsyLiveSourceDetail => {
    const kind = kindForSourceUrl(url)
    return {
      kind,
      label: kind === 'etsy' ? 'Etsy competitor' : kind === 'supplier' ? 'Supplier lead' : 'Source',
      url,
      marketplace: kind === 'etsy' ? 'Etsy' : kind === 'supplier' ? 'Supplier' : 'Source',
    }
  })
}

function clampScore(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function cleanEvidenceQuality(value: unknown, sourceUrls: Array<string>, evidenceIds: Array<string>): EtsyLiveEvidenceQuality {
  if (value === 'strong' || value === 'partial' || value === 'weak' || value === 'blocked') return value
  if (!sourceUrls.length) return 'blocked'
  if (sourceUrls.length >= 2 && evidenceIds.length >= 2) return 'strong'
  if (sourceUrls.length && evidenceIds.length) return 'partial'
  return 'weak'
}

function cleanSuggestedNextStep(value: unknown, evidenceQuality: EtsyLiveEvidenceQuality) {
  if (value === 'select_product' || value === 'needs_more_evidence' || value === 'blocked') return value
  if (evidenceQuality === 'strong' || evidenceQuality === 'partial') return 'select_product'
  return evidenceQuality === 'blocked' ? 'blocked' : 'needs_more_evidence'
}

function collectUnsafeClaims(value: unknown, path = 'run'): Array<string> {
  if (!isRecord(value)) return []
  const claims: Array<string> = []
  for (const field of unsafeBooleanFields) {
    if (value[field] === true) claims.push(`${path}.${field}=true`)
  }
  for (const [key, rawValue] of Object.entries(value)) {
    const nextPath = `${path}.${key}`
    if (typeof rawValue === 'string' && unsafeClaimPatterns.some((pattern) => pattern.test(rawValue))) {
      claims.push(nextPath)
    } else if (Array.isArray(rawValue)) {
      rawValue.forEach((item, index) => {
        if (typeof item === 'string' && unsafeClaimPatterns.some((pattern) => pattern.test(item))) {
          claims.push(`${nextPath}[${index}]`)
        } else if (isRecord(item)) {
          claims.push(...collectUnsafeClaims(item, `${nextPath}[${index}]`))
        }
      })
    } else if (isRecord(rawValue)) {
      claims.push(...collectUnsafeClaims(rawValue, nextPath))
    }
  }
  return claims
}

function isoTime(nowMs: number) {
  return new Date(nowMs).toISOString()
}

function runIdFrom(nowMs: number) {
  return `etsy-live-scout-${nowMs.toString(36)}`
}

export function normalizeEtsyLiveResearchRequest(value: unknown): EtsyLiveResearchRequest {
  const input = isRecord(value) ? value : {}
  const query = cleanText(input.query, '', ETSY_LIVE_RESEARCH_MAX_QUERY_CHARS)
  if (!query) throw new Error('Live scout query is required.')
  const sourceHints = cleanTextArray(input.sourceHints, [], 8, 1_000)
  const maxCandidatesInput = typeof input.maxCandidates === 'number' ? input.maxCandidates : Number(input.maxCandidates)
  const maxCandidates = Number.isFinite(maxCandidatesInput)
    ? Math.max(1, Math.min(ETSY_LIVE_RESEARCH_MAX_CANDIDATES, Math.floor(maxCandidatesInput)))
    : 3
  return {
    query,
    operatorNote: typeof input.operatorNote === 'string' && input.operatorNote.trim()
      ? input.operatorNote.trim().slice(0, 400)
      : undefined,
    sourceHints,
    maxCandidates,
    mode: 'read-only-live-research',
  }
}

export function createBlockedEtsyLiveResearchRun(input: {
  request: EtsyLiveResearchRequest
  reason: string
  runId?: string
  nowMs?: number
  attempted?: boolean
  connectorStatus?: EtsyLiveResearchRun['connectorStatus']
}): EtsyLiveResearchRun {
  const nowMs = input.nowMs ?? Date.now()
  return {
    runId: input.runId ?? runIdFrom(nowMs),
    status: 'blocked',
    query: input.request.query,
    candidates: [],
    blockedReason: input.reason,
    startedAt: isoTime(nowMs),
    completedAt: isoTime(nowMs),
    safety: ETSY_LIVE_RESEARCH_SAFETY,
    liveReadOnlyResearchAttempted: input.attempted ?? false,
    connectorStatus: input.connectorStatus ?? 'not_configured',
  }
}

export function normalizeEtsyLiveCandidate(
  value: unknown,
  input: { runId: string; index: number; maxCandidates?: number },
): EtsyLiveCandidate | null {
  if (!isRecord(value)) return null
  const title = cleanText(value.title, '', 180)
  if (!title) return null
  const sourceUrls = cleanSourceUrls(value.sourceUrls)
  const sourceDetails = cleanSourceDetails(value.sourceDetails, sourceUrls)
  const evidenceIds = cleanTextArray(value.evidenceIds, sourceUrls, 12)
  const evidenceQuality = cleanEvidenceQuality(value.evidenceQuality, sourceUrls, evidenceIds)
  const missingEvidence = cleanTextArray(value.missingEvidence ?? value.missingFields, [], 10)
  const riskFlags = cleanTextArray(value.riskFlags ?? value.riskNotes, ['No live action; verify source truth before handoff.'], 10)
  const suggestedNextStep = cleanSuggestedNextStep(value.suggestedNextStep, evidenceQuality)
  return {
    candidateId: cleanText(value.candidateId, `${input.runId}-live-candidate-${input.index + 1}`, 140),
    title,
    summary: cleanText(value.summary ?? value.niche, 'Read-only candidate returned by live scout.', 500),
    sourceUrls,
    sourceDetails,
    evidenceIds,
    evidenceQuality,
    score: clampScore(value.score),
    missingEvidence: sourceUrls.length ? missingEvidence : Array.from(new Set([...missingEvidence, 'public read-only source URL'])),
    riskFlags,
    dataOrigin: 'live-readonly-research',
    suggestedNextStep,
  }
}

export function normalizeEtsyLiveResearchRun(
  value: unknown,
  input: { request: EtsyLiveResearchRequest; runId?: string; startedAtMs?: number; completedAtMs?: number },
): EtsyLiveResearchNormalizationResult {
  const nowMs = input.completedAtMs ?? Date.now()
  const startedAtMs = input.startedAtMs ?? nowMs
  const raw = isRecord(value) ? value : {}
  const runId = cleanText(raw.runId, input.runId ?? runIdFrom(startedAtMs), 140)
  const rejectedClaims = collectUnsafeClaims(raw)
  const candidates = cleanText(raw.status, '') === 'blocked'
    ? []
    : (Array.isArray(raw.candidates) ? raw.candidates : [])
      .map((candidate, index) => normalizeEtsyLiveCandidate(candidate, { runId, index }))
      .filter((candidate): candidate is EtsyLiveCandidate => Boolean(candidate))
      .slice(0, input.request.maxCandidates ?? ETSY_LIVE_RESEARCH_MAX_CANDIDATES)

  if (rejectedClaims.length) {
    return {
      rejectedClaims,
      run: createBlockedEtsyLiveResearchRun({
        request: input.request,
        runId,
        nowMs,
        attempted: true,
        connectorStatus: 'blocked',
        reason: `Live scout output claimed forbidden live side effects: ${rejectedClaims.slice(0, 4).join(', ')}`,
      }),
    }
  }

  const status = raw.status === 'failed'
    ? 'failed'
    : raw.status === 'blocked'
      ? 'blocked'
      : candidates.length
        ? 'completed'
        : 'blocked'
  const blockedReason = status === 'blocked'
    ? cleanText(raw.blockedReason, 'Live research connector returned no source-backed candidates.', 600)
    : undefined

  return {
    rejectedClaims,
    run: {
      runId,
      status,
      query: cleanText(raw.query, input.request.query, ETSY_LIVE_RESEARCH_MAX_QUERY_CHARS),
      candidates: status === 'completed' ? candidates : [],
      blockedReason,
      startedAt: cleanText(raw.startedAt, isoTime(startedAtMs), 80),
      completedAt: cleanText(raw.completedAt, isoTime(nowMs), 80),
      safety: ETSY_LIVE_RESEARCH_SAFETY,
      liveReadOnlyResearchAttempted: true,
      connectorStatus: status === 'completed' ? 'available' : 'blocked',
    },
  }
}
