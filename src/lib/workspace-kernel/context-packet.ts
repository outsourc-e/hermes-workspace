import type { LivingV3RoomId, LivingV3StationId } from '../war-room/living-v3/living-v3-contract'

export type WorkspaceContextPacketVersion = 'obsidian-context-packet-v1'

export type WorkspaceContextPacketSourceKind =
  | 'hot-cache'
  | 'daily'
  | 'project-source-of-truth'
  | 'decision'
  | 'rules'

export type WorkspaceContextPacketSourceStatus = 'loaded' | 'missing' | 'blocked'

export type WorkspaceContextPacketSource = {
  noteId: string
  title: string
  relativePath: string
  kind: WorkspaceContextPacketSourceKind
  excerpt: string
  status: WorkspaceContextPacketSourceStatus
  updatedAt?: string
}

export type WorkspaceContextPacket = {
  packetId: string
  version: WorkspaceContextPacketVersion
  createdAtMs: number
  targetRoomId: LivingV3RoomId
  targetStationId?: LivingV3StationId
  mission: string
  sourceNotes: Array<WorkspaceContextPacketSource>
  decisions: Array<string>
  safetyRails: Array<string>
  allowedActions: Array<string>
  forbiddenActions: Array<string>
  artifacts: Array<string>
  blocker?: string
  nextAction: string
  localOnly: true
  writebackAllowed: false
}

export type WorkspaceContextPacketSourceInput = Omit<WorkspaceContextPacketSource, 'excerpt'> & {
  excerpt?: string
  content?: string
}

export type BuildWorkspaceContextPacketInput = {
  packetId?: string
  createdAtMs?: number
  targetRoomId: LivingV3RoomId
  targetStationId?: LivingV3StationId
  mission?: string
  sourceNotes: Array<WorkspaceContextPacketSourceInput>
  decisions?: Array<string>
  safetyRails?: Array<string>
  allowedActions?: Array<string>
  forbiddenActions?: Array<string>
  artifacts?: Array<string>
  blocker?: string
  nextAction?: string
}

export const OBSIDIAN_CONTEXT_PACKET_VERSION: WorkspaceContextPacketVersion = 'obsidian-context-packet-v1'
export const WORKSPACE_CONTEXT_PACKET_MISSION_MAX_CHARS = 360
export const WORKSPACE_CONTEXT_PACKET_EXCERPT_MAX_CHARS = 520
export const WORKSPACE_CONTEXT_PACKET_ITEM_MAX_CHARS = 180
export const WORKSPACE_CONTEXT_PACKET_MAX_SOURCES = 12
export const WORKSPACE_CONTEXT_PACKET_MAX_LIST_ITEMS = 10

export const OBSIDIAN_CONTEXT_ALLOWED_ACTIONS = [
  'read allowlisted local Obsidian markdown notes',
  'create a compact local context packet',
  'record one Kernel Store V2 artifact event',
  'show compact Command Room readback',
  'open or review existing local workspace stations',
]

export const OBSIDIAN_CONTEXT_FORBIDDEN_ACTIONS = [
  'live Etsy upload/draft/publish/edit/renew/customer action',
  'supplier message or purchase',
  'paid ShotLab or generation spend',
  'Google private read/write or Sheet write',
  'browser automation on logged-in sites',
  'Discord send outside an approved delivery path',
  'printer control or physical production',
  'worker fan-out or uncontrolled runner spawn',
  'Obsidian vault writeback from Workspace app',
  'arbitrary local file reads outside the Obsidian allowlist',
]

const decisionPatterns = [
  /decision/i,
  /source[- ]of[- ]truth/i,
  /next/i,
  /status/i,
  /החלטה/,
  /מקור אמת/,
  /סטטוס/,
  /השלב הבא/,
]

const safetyPatterns = [
  /local[- ]only/i,
  /frozen/i,
  /usageAllowed:false/i,
  /workerSpawnAllowed:false/i,
  /writeback/i,
  /locked/i,
  /no live/i,
  /forbidden/i,
  /אסור/,
  /נעול/,
]

const artifactPatterns = [
  /artifact/i,
  /packet/i,
  /kernel/i,
  /workspace/i,
  /data-/i,
  /\/war-room/i,
  /פאקט/,
  /קונטקסט/,
]

function compactWhitespace(value: string) {
  return value
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(value: string, max: number) {
  const text = compactWhitespace(value)
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 3)).trim()}...`
}

function uniqueCapped(items: Array<string>, maxItems = WORKSPACE_CONTEXT_PACKET_MAX_LIST_ITEMS) {
  const seen = new Set<string>()
  const next: Array<string> = []
  for (const item of items) {
    const text = truncate(item, WORKSPACE_CONTEXT_PACKET_ITEM_MAX_CHARS)
    if (!text || seen.has(text.toLowerCase())) continue
    seen.add(text.toLowerCase())
    next.push(text)
    if (next.length >= maxItems) break
  }
  return next
}

function extractLines(sourceNotes: Array<WorkspaceContextPacketSourceInput>, patterns: Array<RegExp>, maxItems = WORKSPACE_CONTEXT_PACKET_MAX_LIST_ITEMS) {
  const lines: Array<string> = []
  for (const source of sourceNotes) {
    if (source.status !== 'loaded') continue
    const text = source.content || source.excerpt || ''
    for (const rawLine of text.replace(/\r/g, '\n').split('\n')) {
      const line = rawLine
        .replace(/^#{1,6}\s*/, '')
        .replace(/^[-*]\s*/, '')
        .replace(/^\d+[.)]\s*/, '')
        .trim()
      if (!line || line.length < 8) continue
      if (patterns.some((pattern) => pattern.test(line))) lines.push(line)
      if (lines.length >= maxItems * 2) break
    }
    if (lines.length >= maxItems * 2) break
  }
  return uniqueCapped(lines, maxItems)
}

function sourceExcerpt(source: WorkspaceContextPacketSourceInput) {
  if (source.status !== 'loaded') {
    return source.excerpt
      ? truncate(source.excerpt, WORKSPACE_CONTEXT_PACKET_EXCERPT_MAX_CHARS)
      : source.status === 'missing'
        ? 'Allowlisted note is missing locally.'
        : 'Allowlisted note was blocked by the local Obsidian reader.'
  }
  return truncate(source.excerpt || source.content || '', WORKSPACE_CONTEXT_PACKET_EXCERPT_MAX_CHARS)
}

export function buildWorkspaceContextPacket(input: BuildWorkspaceContextPacketInput): WorkspaceContextPacket {
  const createdAtMs = input.createdAtMs ?? Date.now()
  const sourceNotes = input.sourceNotes
    .slice(0, WORKSPACE_CONTEXT_PACKET_MAX_SOURCES)
    .map((source) => ({
      noteId: truncate(source.noteId, 140),
      title: truncate(source.title, 120),
      relativePath: truncate(source.relativePath, 220),
      kind: source.kind,
      excerpt: sourceExcerpt(source),
      status: source.status,
      updatedAt: source.updatedAt,
    }))
  const loadedCount = sourceNotes.filter((source) => source.status === 'loaded').length
  const missingOrBlocked = sourceNotes.filter((source) => source.status !== 'loaded')
  const decisions = uniqueCapped([
    ...(input.decisions ?? []),
    ...extractLines(input.sourceNotes, decisionPatterns, 6),
  ], 8)
  const safetyRails = uniqueCapped([
    ...(input.safetyRails ?? []),
    ...extractLines(input.sourceNotes, safetyPatterns, 8),
    'localOnly:true',
    'usageAllowed:false',
    'workerSpawnAllowed:false',
    'writebackAllowed:false',
  ], 10)
  const artifacts = uniqueCapped([
    ...(input.artifacts ?? []),
    ...extractLines(input.sourceNotes, artifactPatterns, 8),
  ], 8)
  const blocker = input.blocker
    ? truncate(input.blocker, WORKSPACE_CONTEXT_PACKET_ITEM_MAX_CHARS)
    : loadedCount === 0
      ? 'No allowlisted Obsidian notes loaded; packet kept as missing-source readback only.'
      : missingOrBlocked.length
        ? `${missingOrBlocked.length} allowlisted note(s) missing or blocked.`
        : undefined
  const nextAction = truncate(
    input.nextAction
      ?? 'Review this compact context packet in Command Room, then open Product Search if it helps the current local workspace task.',
    WORKSPACE_CONTEXT_PACKET_ITEM_MAX_CHARS,
  )

  return {
    packetId: input.packetId ?? `obsidian-context-${createdAtMs}`,
    version: OBSIDIAN_CONTEXT_PACKET_VERSION,
    createdAtMs,
    targetRoomId: input.targetRoomId,
    targetStationId: input.targetStationId,
    mission: truncate(input.mission || 'Attach scoped Obsidian context to the local Workspace run.', WORKSPACE_CONTEXT_PACKET_MISSION_MAX_CHARS),
    sourceNotes,
    decisions,
    safetyRails,
    allowedActions: uniqueCapped([...(input.allowedActions ?? []), ...OBSIDIAN_CONTEXT_ALLOWED_ACTIONS], 8),
    forbiddenActions: uniqueCapped([...(input.forbiddenActions ?? []), ...OBSIDIAN_CONTEXT_FORBIDDEN_ACTIONS], 12),
    artifacts,
    blocker,
    nextAction,
    localOnly: true,
    writebackAllowed: false,
  }
}
