import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { createInitialEtsyRoomState } from '../living-v3/etsy-room-contracts'
import type { EtsyProductCandidate, EtsyRoomEvent, EtsyRoomState } from '../living-v3/etsy-room-contracts'
import type { EtsyLiveSourceDetail } from '../living-v3/etsy-live-research'

export const SHARED_ETSY_ROOM_STORE_SCHEMA_VERSION = 'war-room-etsy-shared-room-v1'
export const SHARED_ETSY_ROOM_STATE_FILE = 'shared-room-state.json'
export const SHARED_ETSY_ROOM_CANDIDATE_SOFT_SAFETY_LIMIT = 5_000
export const SHARED_ETSY_ROOM_EVENT_SOFT_SAFETY_LIMIT = 20_000
export const SHARED_ETSY_ROOM_SOURCE_DETAIL_SOFT_SAFETY_LIMIT = 40
export const SHARED_ETSY_ROOM_LINK_SOFT_SAFETY_LIMIT = 80
export const SHARED_ETSY_ROOM_TAG_SOFT_SAFETY_LIMIT = 60
export const SHARED_ETSY_ROOM_RAW_TTL_MS = 6 * 60 * 60 * 1_000

export type SharedEtsyRoomStoreOptions = {
  rootDir?: string
  nowMs?: number
}

export type SharedEtsyRoomRetentionPolicy = {
  rawTtlMs: number
  hardWorkspaceLimit: false
  filterMode: 'filter-first-soft-safety'
  candidateSoftSafetyLimit: number
  eventSoftSafetyLimit: number
  sourceDetailSoftSafetyLimit: number
  linkSoftSafetyLimit: number
  tagSoftSafetyLimit: number
  storesFiles: false
  note: string
}

export type SharedEtsyRoomStore = {
  schemaVersion: typeof SHARED_ETSY_ROOM_STORE_SCHEMA_VERSION
  updatedAtMs: number
  stateVersion: string
  source: 'empty' | 'ui' | 'scout-api' | 'test' | 'unknown'
  lastReason?: string
  empty: boolean
  retention: SharedEtsyRoomRetentionPolicy
  roomState: EtsyRoomState
}

export type SaveSharedEtsyRoomStateOptions = SharedEtsyRoomStoreOptions & {
  reason?: string
  source?: SharedEtsyRoomStore['source']
  force?: boolean
}

export type SaveSharedEtsyRoomStateResult = SharedEtsyRoomStore & {
  saved: boolean
  skippedReason?: string
}

const DEFAULT_SHARED_ETSY_ROOM_STORE_DIR = path.join(process.cwd(), 'data', 'war-room', 'etsy-room')

export const SHARED_ETSY_ROOM_RETENTION_POLICY: SharedEtsyRoomRetentionPolicy = {
  rawTtlMs: SHARED_ETSY_ROOM_RAW_TTL_MS,
  hardWorkspaceLimit: false,
  filterMode: 'filter-first-soft-safety',
  candidateSoftSafetyLimit: SHARED_ETSY_ROOM_CANDIDATE_SOFT_SAFETY_LIMIT,
  eventSoftSafetyLimit: SHARED_ETSY_ROOM_EVENT_SOFT_SAFETY_LIMIT,
  sourceDetailSoftSafetyLimit: SHARED_ETSY_ROOM_SOURCE_DETAIL_SOFT_SAFETY_LIMIT,
  linkSoftSafetyLimit: SHARED_ETSY_ROOM_LINK_SOFT_SAFETY_LIMIT,
  tagSoftSafetyLimit: SHARED_ETSY_ROOM_TAG_SOFT_SAFETY_LIMIT,
  storesFiles: false,
  note: 'Shared Etsy room uses filter-first retention: deduped/ranked compact decision state, high soft safety guards only, no low hard workspace caps, no downloaded images/files, and raw evidence remains temporary by policy.',
}

function sharedStoreDir(options?: SharedEtsyRoomStoreOptions) {
  if (options?.rootDir) return options.rootDir
  if (process.env.WAR_ROOM_ETSY_ROOM_STORE_DIR) return process.env.WAR_ROOM_ETSY_ROOM_STORE_DIR
  if (process.env.WORKSPACE_KERNEL_STORE_DIR) return path.join(process.env.WORKSPACE_KERNEL_STORE_DIR, 'etsy-room')
  return DEFAULT_SHARED_ETSY_ROOM_STORE_DIR
}

function sharedStatePath(options?: SharedEtsyRoomStoreOptions) {
  return path.join(sharedStoreDir(options), SHARED_ETSY_ROOM_STATE_FILE)
}

function stateVersion(nowMs: number) {
  return `${SHARED_ETSY_ROOM_STORE_SCHEMA_VERSION}:${nowMs}`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function compactText(value: unknown, fallback = '', max = 500) {
  return typeof value === 'string' && value.trim()
    ? value.trim().replace(/\s+/g, ' ').slice(0, max)
    : fallback
}

function compactStringList(values: Array<string | null | undefined> | undefined, limit = SHARED_ETSY_ROOM_LINK_SOFT_SAFETY_LIMIT, max = 800) {
  const seen = new Set<string>()
  const cleaned: Array<string> = []
  for (const value of values ?? []) {
    const text = compactText(value, '', max)
    if (!text || seen.has(text)) continue
    seen.add(text)
    cleaned.push(text)
    if (cleaned.length >= limit) break
  }
  return cleaned
}

function compactUrl(value: unknown) {
  const text = compactText(value, '', 1_000)
  return /^https?:\/\//i.test(text) ? text : undefined
}

function compactSourceDetails(sourceDetails?: Array<EtsyLiveSourceDetail>) {
  const seen = new Set<string>()
  const compacted: Array<EtsyLiveSourceDetail> = []
  for (const detail of sourceDetails ?? []) {
    const url = compactUrl(detail.url)
    if (!url || seen.has(url)) continue
    seen.add(url)
    compacted.push({
      kind: detail.kind === 'etsy' || detail.kind === 'supplier' || detail.kind === 'other' ? detail.kind : 'other',
      label: compactText(detail.label, 'Source', 80),
      url,
      title: detail.title ? compactText(detail.title, '', 180) : undefined,
      imageUrl: compactUrl(detail.imageUrl),
      priceText: detail.priceText ? compactText(detail.priceText, '', 80) : undefined,
      shopName: detail.shopName ? compactText(detail.shopName, '', 100) : undefined,
      marketplace: detail.marketplace ? compactText(detail.marketplace, '', 80) : undefined,
      salesText: detail.salesText ? compactText(detail.salesText, '', 80) : undefined,
      demandText: detail.demandText ? compactText(detail.demandText, '', 120) : undefined,
      tags: compactStringList(detail.tags, SHARED_ETSY_ROOM_TAG_SOFT_SAFETY_LIMIT, 80),
    })
    if (compacted.length >= SHARED_ETSY_ROOM_SOURCE_DETAIL_SOFT_SAFETY_LIMIT) break
  }
  return compacted.length ? compacted : undefined
}

function compactCandidate(candidate: EtsyProductCandidate): EtsyProductCandidate {
  return {
    ...candidate,
    title: compactText(candidate.title, 'Untitled product', 180),
    niche: compactText(candidate.niche, 'product opportunity', 240),
    sourceRecordIds: compactStringList(candidate.sourceRecordIds, SHARED_ETSY_ROOM_LINK_SOFT_SAFETY_LIMIT, 1_000),
    sourceDetails: compactSourceDetails(candidate.sourceDetails),
    evidenceIds: compactStringList(candidate.evidenceIds, SHARED_ETSY_ROOM_LINK_SOFT_SAFETY_LIMIT, 500),
    missingFields: compactStringList(candidate.missingFields, SHARED_ETSY_ROOM_TAG_SOFT_SAFETY_LIMIT, 160),
    riskNotes: compactStringList(candidate.riskNotes, SHARED_ETSY_ROOM_TAG_SOFT_SAFETY_LIMIT, 240),
    selected: Boolean(candidate.selected),
  }
}

function compactCandidates(candidates: Array<EtsyProductCandidate>, selectedCandidateId?: string) {
  const byId = new Map<string, EtsyProductCandidate>()
  const selected = selectedCandidateId ? candidates.find((candidate) => candidate.candidateId === selectedCandidateId) : undefined
  for (const candidate of [selected, ...candidates]) {
    if (!candidate?.candidateId || byId.has(candidate.candidateId)) continue
    byId.set(candidate.candidateId, compactCandidate(candidate))
    if (byId.size >= SHARED_ETSY_ROOM_CANDIDATE_SOFT_SAFETY_LIMIT) break
  }
  return [...byId.values()]
}

function compactPayload(payload?: Record<string, unknown>) {
  if (!payload) return undefined
  const clone = jsonClone(payload)
  const text = JSON.stringify(clone)
  if (text.length <= 2_000) return clone
  return { truncated: true, originalBytes: text.length }
}

function compactEvents(events: Array<EtsyRoomEvent>) {
  return events.slice(-SHARED_ETSY_ROOM_EVENT_SOFT_SAFETY_LIMIT).map((event) => ({
    ...event,
    readback: compactText(event.readback, '', 500),
    payload: compactPayload(event.payload),
  }))
}

export function compactSharedEtsyRoomState(roomState: EtsyRoomState, nowMs = Date.now()): EtsyRoomState {
  const compacted = jsonClone(roomState)
  const candidates = compactCandidates(compacted.candidates ?? [], compacted.selectedCandidateId)
  const selectedCandidateId = compacted.selectedCandidateId && candidates.some((candidate) => candidate.candidateId === compacted.selectedCandidateId)
    ? compacted.selectedCandidateId
    : undefined
  return {
    ...compacted,
    run: {
      ...compacted.run,
      updatedAtMs: Number.isFinite(compacted.run?.updatedAtMs) ? compacted.run.updatedAtMs : nowMs,
      usageAllowed: false,
      workerSpawnAllowed: false,
    },
    prompt: compactText(compacted.prompt, '', 500),
    candidates,
    selectedCandidateId,
    events: compactEvents(compacted.events ?? []),
    allowedNow: compactStringList(compacted.allowedNow, 12, 120),
    lockedActions: compactStringList(compacted.lockedActions, 20, 180),
    lastReceipt: compacted.lastReceipt ? compactText(compacted.lastReceipt, '', 500) : undefined,
    shotLabDraft: {
      preset: compacted.shotLabDraft?.preset ?? 'Boutique Premium',
      imageCount: Math.max(1, Math.min(12, Number(compacted.shotLabDraft?.imageCount) || 6)),
      sourceImageRequirements: compactText(compacted.shotLabDraft?.sourceImageRequirements, 'front, detail, scale/context, variant proof', 500),
      variantNotes: compactText(compacted.shotLabDraft?.variantNotes, 'Treat personalization, stone, and recycled material as No unless evidence proves otherwise.', 500),
    },
  }
}

function roomStateHasSharedValue(roomState: EtsyRoomState) {
  return Boolean(
    roomState.candidates.length
    || roomState.selectedCandidateId
    || roomState.selectedProductPacket
    || roomState.shotLabHandoffPacket
    || roomState.seoPacket
    || roomState.draftPayload
    || roomState.approvalPacket
    || roomState.prompt.trim(),
  )
}

export function createEmptySharedEtsyRoomStore(nowMs = Date.now()): SharedEtsyRoomStore {
  return {
    schemaVersion: SHARED_ETSY_ROOM_STORE_SCHEMA_VERSION,
    updatedAtMs: nowMs,
    stateVersion: stateVersion(nowMs),
    source: 'empty',
    empty: true,
    retention: SHARED_ETSY_ROOM_RETENTION_POLICY,
    roomState: createInitialEtsyRoomState(nowMs),
  }
}

function normalizeSharedEtsyRoomStore(raw: unknown, nowMs = Date.now()): SharedEtsyRoomStore {
  if (!isObject(raw) || !isObject(raw.roomState)) return createEmptySharedEtsyRoomStore(nowMs)
  const rawUpdatedAtMs = typeof raw.updatedAtMs === 'number' && Number.isFinite(raw.updatedAtMs)
    ? raw.updatedAtMs
    : nowMs
  const roomState = compactSharedEtsyRoomState(raw.roomState as EtsyRoomState, rawUpdatedAtMs)
  const source = raw.source === 'ui' || raw.source === 'scout-api' || raw.source === 'test' || raw.source === 'empty'
    ? raw.source
    : 'unknown'
  return {
    schemaVersion: SHARED_ETSY_ROOM_STORE_SCHEMA_VERSION,
    updatedAtMs: rawUpdatedAtMs,
    stateVersion: typeof raw.stateVersion === 'string' ? raw.stateVersion : stateVersion(rawUpdatedAtMs),
    source,
    lastReason: typeof raw.lastReason === 'string' ? compactText(raw.lastReason, '', 240) : undefined,
    empty: !roomStateHasSharedValue(roomState),
    retention: SHARED_ETSY_ROOM_RETENTION_POLICY,
    roomState,
  }
}

async function atomicWriteJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${randomUUID()}.tmp`
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tmpPath, filePath)
}

export async function loadSharedEtsyRoomStore(options?: SharedEtsyRoomStoreOptions): Promise<SharedEtsyRoomStore> {
  const nowMs = options?.nowMs ?? Date.now()
  try {
    const text = await readFile(sharedStatePath(options), 'utf8')
    return normalizeSharedEtsyRoomStore(JSON.parse(text), nowMs)
  } catch {
    return createEmptySharedEtsyRoomStore(nowMs)
  }
}

export async function saveSharedEtsyRoomState(
  roomState: EtsyRoomState,
  options?: SaveSharedEtsyRoomStateOptions,
): Promise<SaveSharedEtsyRoomStateResult> {
  const nowMs = options?.nowMs ?? Date.now()
  const previous = await loadSharedEtsyRoomStore(options)
  const compacted = compactSharedEtsyRoomState(roomState, nowMs)
  const incomingUpdatedAtMs = compacted.run.updatedAtMs
  if (!options?.force && !previous.empty && previous.roomState.run.updatedAtMs > incomingUpdatedAtMs) {
    return {
      ...previous,
      saved: false,
      skippedReason: 'existing-shared-room-state-is-newer',
    }
  }
  const next: SharedEtsyRoomStore = {
    schemaVersion: SHARED_ETSY_ROOM_STORE_SCHEMA_VERSION,
    updatedAtMs: nowMs,
    stateVersion: stateVersion(nowMs),
    source: options?.source ?? 'ui',
    lastReason: options?.reason ? compactText(options.reason, '', 240) : previous.lastReason,
    empty: !roomStateHasSharedValue(compacted),
    retention: SHARED_ETSY_ROOM_RETENTION_POLICY,
    roomState: compacted,
  }
  await atomicWriteJson(sharedStatePath(options), next)
  return { ...next, saved: true }
}

export async function resetSharedEtsyRoomStore(options?: SaveSharedEtsyRoomStateOptions): Promise<SaveSharedEtsyRoomStateResult> {
  return saveSharedEtsyRoomState(createInitialEtsyRoomState(options?.nowMs ?? Date.now()), {
    ...options,
    force: true,
    reason: options?.reason ?? 'reset shared Etsy room state',
    source: options?.source ?? 'ui',
  })
}
