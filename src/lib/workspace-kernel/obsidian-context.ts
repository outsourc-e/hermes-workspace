import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {



  buildWorkspaceContextPacket
} from './context-packet'
import type {WorkspaceContextPacket, WorkspaceContextPacketSourceInput, WorkspaceContextPacketSourceKind} from './context-packet';
import type { LivingV3RoomId, LivingV3StationId } from '../war-room/living-v3/living-v3-contract'

export const DEFAULT_WORKSPACE_OBSIDIAN_VAULT_DIR = '/Users/mac/Documents/Hermes Second Brain'

export const OBSIDIAN_CONTEXT_NOTE_ALLOWLIST = [
  'wiki/hot.md',
  '10 Daily/2026-06-26.md',
  '04 Decisions/שימוש אוטומטי באובסידיאן לקונטקסט 2026-06-21.md',
  '04 Decisions/Workspace Obsidian bridge יעד עבודה 2026-06-26.md',
  '01 Projects/War Room/Universal Workspace Action Wrapper - מקור אמת.md',
  '01 Projects/War Room/Council of Strategists - מקור אמת 2026-06-27.md',
  '06 Hermes/War Room Agents and Automation.md',
  '01 Projects/War Room/Etsy Market Lab - מקור אמת נוכחי.md',
  '06 Hermes/כללי עבודה שאני חייב לזכור.md',
] as const

export type ObsidianContextNotePath = typeof OBSIDIAN_CONTEXT_NOTE_ALLOWLIST[number]

export type BuildObsidianContextPacketOptions = {
  mission?: string
  targetRoomId?: LivingV3RoomId
  targetStationId?: LivingV3StationId
  nowMs?: number
  vaultDir?: string
}

export type LoadAllowlistedObsidianContextSourcesOptions = {
  vaultDir?: string
  relativePaths?: ReadonlyArray<string>
}

export class ObsidianContextAccessError extends Error {
  readonly code = 'OBSIDIAN_CONTEXT_PATH_BLOCKED'
}

const secretLikeLine = /\b(token|password|passwd|cookie|secret|apikey|api[_-]?key|authorization|bearer|session)\b/i

function vaultRoot(options?: { vaultDir?: string }) {
  return path.resolve(options?.vaultDir ?? process.env.WORKSPACE_OBSIDIAN_VAULT_DIR ?? DEFAULT_WORKSPACE_OBSIDIAN_VAULT_DIR)
}

function normalizeRelativePath(relativePath: string) {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
}

function noteId(relativePath: string) {
  return `obsidian:${normalizeRelativePath(relativePath).slice(0, 220)}`
}

function sourceKindFor(relativePath: string): WorkspaceContextPacketSourceKind {
  const normalized = normalizeRelativePath(relativePath)
  if (normalized === 'wiki/hot.md') return 'hot-cache'
  if (normalized.startsWith('10 Daily/')) return 'daily'
  if (normalized.startsWith('04 Decisions/')) return 'decision'
  if (normalized.startsWith('06 Hermes/')) return 'rules'
  return 'project-source-of-truth'
}

function titleFrom(relativePath: string, markdown?: string) {
  const heading = markdown
    ?.replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+\S/.test(line))
  if (heading) return heading.replace(/^#{1,3}\s+/, '').trim()
  return path.basename(relativePath, '.md')
}

function fallbackSource(relativePath: string, status: 'missing' | 'blocked', excerpt: string): WorkspaceContextPacketSourceInput {
  return {
    noteId: noteId(relativePath),
    title: titleFrom(relativePath),
    relativePath: normalizeRelativePath(relativePath),
    kind: sourceKindFor(relativePath),
    excerpt,
    status,
  }
}

function sanitizeMarkdownForContext(markdown: string) {
  return markdown
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => !secretLikeLine.test(line))
    .join('\n')
}

export function resolveAllowlistedObsidianNotePath(relativePath: string, options?: { vaultDir?: string }) {
  const normalized = normalizeRelativePath(relativePath)
  if (!normalized.endsWith('.md')) {
    throw new ObsidianContextAccessError('Only markdown notes are allowed.')
  }
  if (path.isAbsolute(relativePath) || normalized.split('/').includes('..')) {
    throw new ObsidianContextAccessError('Obsidian context paths must stay inside the allowlisted vault.')
  }
  if (normalized.split('/').includes('.raw')) {
    throw new ObsidianContextAccessError('Raw Obsidian directories are blocked.')
  }
  if (!OBSIDIAN_CONTEXT_NOTE_ALLOWLIST.includes(normalized as ObsidianContextNotePath)) {
    throw new ObsidianContextAccessError('Obsidian note is not in the context allowlist.')
  }
  const root = vaultRoot(options)
  const resolved = path.resolve(root, normalized)
  const relativeToRoot = path.relative(root, resolved)
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new ObsidianContextAccessError('Resolved Obsidian note escaped the vault root.')
  }
  if (resolved.split(path.sep).includes('.raw')) {
    throw new ObsidianContextAccessError('Raw Obsidian directories are blocked.')
  }
  return resolved
}

export async function loadAllowlistedObsidianContextSources(
  options?: LoadAllowlistedObsidianContextSourcesOptions,
): Promise<Array<WorkspaceContextPacketSourceInput>> {
  const relativePaths = options?.relativePaths ?? OBSIDIAN_CONTEXT_NOTE_ALLOWLIST
  const sources: Array<WorkspaceContextPacketSourceInput> = []

  for (const relativePath of relativePaths) {
    let resolved: string
    try {
      resolved = resolveAllowlistedObsidianNotePath(relativePath, { vaultDir: options?.vaultDir })
    } catch (error) {
      sources.push(fallbackSource(relativePath, 'blocked', error instanceof Error ? error.message : 'Blocked by Obsidian context allowlist.'))
      continue
    }

    try {
      const [fileStat, markdown] = await Promise.all([
        stat(resolved),
        readFile(resolved, 'utf8'),
      ])
      const content = sanitizeMarkdownForContext(markdown)
      sources.push({
        noteId: noteId(relativePath),
        title: titleFrom(relativePath, content),
        relativePath: normalizeRelativePath(relativePath),
        kind: sourceKindFor(relativePath),
        content,
        status: 'loaded',
        updatedAt: fileStat.mtime.toISOString(),
      })
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : ''
      sources.push(fallbackSource(
        relativePath,
        code === 'ENOENT' ? 'missing' : 'blocked',
        code === 'ENOENT' ? 'Allowlisted Obsidian note is missing locally.' : 'Allowlisted Obsidian note could not be read.',
      ))
    }
  }

  return sources
}

export async function buildObsidianContextPacket(options?: BuildObsidianContextPacketOptions): Promise<WorkspaceContextPacket> {
  const nowMs = options?.nowMs ?? Date.now()
  const sourceNotes = await loadAllowlistedObsidianContextSources({ vaultDir: options?.vaultDir })
  return buildWorkspaceContextPacket({
    packetId: `obsidian-context-${nowMs}`,
    createdAtMs: nowMs,
    mission: options?.mission,
    targetRoomId: options?.targetRoomId ?? 'etsy-market-lab',
    targetStationId: options?.targetStationId ?? 'etsy-loki-product-hunt',
    sourceNotes,
    nextAction: 'Use this scoped context in the local Workspace path; keep live actions locked and route any writeback through a future approval gate.',
  })
}
