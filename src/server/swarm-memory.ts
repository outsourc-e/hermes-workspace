import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import YAML from 'yaml'
import type { ParsedSwarmCheckpoint } from './swarm-checkpoints'
import { SWARM_CANONICAL_REPO } from './swarm-environment'

export type SwarmMemoryKind = 'profile' | 'mission' | 'episodic' | 'handoff' | 'shared'

export type SwarmMemoryEventType =
  | 'mission-start'
  | 'dispatch'
  | 'checkpoint'
  | 'handoff-requested'
  | 'handoff-written'
  | 'resume'
  | 'blocked'
  | 'complete'
  | 'note'

export type SwarmMemoryEvent = {
  at: string
  type: SwarmMemoryEventType
  workerId?: string
  missionId?: string | null
  assignmentId?: string | null
  summary: string
  event?: Record<string, unknown>
}

export type SwarmMemoryFile = {
  name: string
  path: string
  content: string
}

export type SwarmMemoryReadResult = {
  ok: boolean
  workerId?: string | null
  kind: SwarmMemoryKind
  root: string
  path: string
  files: Array<SwarmMemoryFile>
  error?: string
}

export type SwarmMemorySearchResult = {
  path: string
  line: number
  score: number
  snippet: string
}

export const SWARM_SHARED_MEMORY_ROOT = '/Users/aurora/.openclaw/workspace/memory/swarm'
export const SWARM_SHARED_HANDOFF_ROOT = '/Users/aurora/.openclaw/workspace/memory/handoffs/swarm'
export const SWARM_RUNTIME_ROOT = join(SWARM_CANONICAL_REPO, '.runtime')
export const SWARM_PROJECT_CONTEXT_PATH = join(SWARM_SHARED_MEMORY_ROOT, 'PROJECT.md')

function profileRoot(workerId: string): string {
  return join(homedir(), '.claude', 'profiles', workerId)
}

function profileFile(workerId: string, name: string): string {
  return join(profileRoot(workerId), name)
}

export function swarmWorkerMemoryRoot(workerId: string): string {
  return join(profileRoot(workerId), 'memory')
}

export function swarmWorkerMissionMemoryRoot(workerId: string, missionId: string): string {
  return join(swarmWorkerMemoryRoot(workerId), 'missions', missionId)
}

export function swarmWorkerEpisodesRoot(workerId: string): string {
  return join(swarmWorkerMemoryRoot(workerId), 'episodes')
}

export function swarmWorkerHandoffsRoot(workerId: string): string {
  return join(swarmWorkerMemoryRoot(workerId), 'handoffs')
}

export function validateSwarmId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)
}

export function validateMissionId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_.:-]{0,127}$/i.test(value)
}

function assertInside(root: string, target: string): string {
  const resolvedRoot = resolve(root)
  const resolvedTarget = resolve(target)
  const rel = relative(resolvedRoot, resolvedTarget)
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) {
    throw new Error(`Path escapes memory root: ${target}`)
  }
  return resolvedTarget
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

function atomicWrite(path: string, content: string): void {
  ensureDir(dirname(path))
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, content)
  renameSync(tmp, path)
}

function appendLine(path: string, content: string): void {
  ensureDir(dirname(path))
  appendFileSync(path, content.endsWith('\n') ? content : `${content}\n`)
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function timeUtc(): string {
  return new Date().toISOString().slice(11, 16)
}

function readTextIfExists(path: string): string {
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf8')
}

function markdownHeader(title: string): string {
  return `# ${title}\n\n`
}

export function ensureWorkerMemoryScaffold(input: {
  workerId: string
  name?: string | null
  role?: string | null
  specialty?: string | null
  model?: string | null
}): void {
  const { workerId } = input
  if (!validateSwarmId(workerId)) throw new Error(`Invalid workerId: ${workerId}`)
  const root = swarmWorkerMemoryRoot(workerId)
  ensureDir(root)
  ensureDir(join(root, 'missions'))
  ensureDir(join(root, 'episodes'))
  ensureDir(join(root, 'handoffs'))

  // The PROFILE-ROOT MEMORY.md / SOUL.md / USER.md are cloned from the main
  // user profile and contain durable project + persona + user context. We do
  // NOT replicate them here. Instead, this swarm `memory/` subdirectory holds
  // *swarm-specific* layered memory: per-worker IDENTITY.md, plus mission /
  // episodic / handoff files. We add tiny pointer files so that any worker
  // exploring `memory/` learns where the real durable memory lives.

  const memoryPath = join(root, 'MEMORY.md')
  if (!existsSync(memoryPath)) {
    atomicWrite(memoryPath, [
      markdownHeader(`Memory pointer — ${workerId}`),
      'This file is a pointer, not a memory store.\n\n',
      `Durable long-term memory for ${workerId} lives at:\n`,
      `~/.\u0068\u0065\u0072\u006d\u0065\u0073/profiles/${workerId}/MEMORY.md\n\n`,
      'Swarm-specific memory under this directory:\n',
      '- IDENTITY.md — worker role/specialty\n',
      '- missions/<missionId>/SUMMARY.md + events.jsonl — per-mission memory\n',
      '- episodes/YYYY-MM-DD.md — daily episodic log\n',
      '- handoffs/<missionId>.md or latest.md — compaction/restart handoffs\n',
    ].join(''))
  }

  const identityPath = join(root, 'IDENTITY.md')
  if (!existsSync(identityPath)) {
    atomicWrite(identityPath, [
      markdownHeader(`IDENTITY.md — ${workerId}`),
      `- Name: ${input.name ?? workerId}\n`,
      `- Worker ID: ${workerId}\n`,
      `- Role: ${input.role ?? 'Unassigned'}\n`,
      `- Specialty: ${input.specialty ?? 'Unassigned'}\n`,
      `- Model: ${input.model ?? 'Unspecified'}\n`,
    ].join(''))
  }

  const soulPath = join(root, 'SOUL.md')
  if (!existsSync(soulPath)) {
    atomicWrite(soulPath, [
      markdownHeader(`SOUL pointer — ${workerId}`),
      'This file is a pointer, not a persona store.\n\n',
      `Persona/SOUL for ${workerId} lives at:\n`,
      `~/.\u0068\u0065\u0072\u006d\u0065\u0073/profiles/${workerId}/SOUL.md\n`,
    ].join(''))
  }
}

function missionSummaryPath(workerId: string, missionId: string): string {
  return join(swarmWorkerMissionMemoryRoot(workerId, missionId), 'SUMMARY.md')
}

function missionEventsPath(workerId: string, missionId: string): string {
  return join(swarmWorkerMissionMemoryRoot(workerId, missionId), 'events.jsonl')
}

function updateMissionSummary(input: {
  workerId: string
  missionId: string
  title?: string | null
  summary: string
  status?: string | null
  assignmentId?: string | null
  checkpoint?: ParsedSwarmCheckpoint | null
}): void {
  const path = missionSummaryPath(input.workerId, input.missionId)
  const current = readTextIfExists(path)
  if (!current) {
    atomicWrite(path, [
      markdownHeader(`Mission ${input.missionId} — ${input.title ?? 'Untitled mission'}`),
      '## Current state\n\n',
      `- Status: ${input.status ?? 'executing'}\n`,
      `- Current assignment: ${input.assignmentId ?? 'none'}\n`,
      `- Last updated: ${new Date().toISOString()}\n\n`,
      '## Objective\n\n',
      `${input.title ?? input.summary}\n\n`,
      '## Decisions\n\n- None recorded yet.\n\n',
      '## Files touched\n\n- None recorded yet.\n\n',
      '## Checkpoints\n\n',
      `- ${new Date().toISOString()}: ${input.summary}\n\n`,
      '## Blockers\n\n- None recorded yet.\n\n',
      '## Next action\n\n',
      `${input.checkpoint?.nextAction ?? 'Continue assigned work.'}\n`,
    ].join(''))
    return
  }

  const checkpointLines = input.checkpoint
    ? [
        `\n## Checkpoint — ${new Date().toISOString()}\n\n`,
        `- State: ${input.checkpoint.stateLabel}\n`,
        `- Result: ${input.checkpoint.result ?? input.summary}\n`,
        `- Files changed: ${input.checkpoint.filesChanged ?? 'none'}\n`,
        `- Commands run: ${input.checkpoint.commandsRun ?? 'none'}\n`,
        `- Blocker: ${input.checkpoint.blocker ?? 'none'}\n`,
        `- Next action: ${input.checkpoint.nextAction ?? 'none'}\n`,
      ].join('')
    : `\n## Update — ${new Date().toISOString()}\n\n- ${input.summary}\n`
  atomicWrite(path, `${current.trimEnd()}\n${checkpointLines}`)
}

function appendEpisode(input: SwarmMemoryEvent): void {
  if (!input.workerId || !validateSwarmId(input.workerId)) return
  const path = join(swarmWorkerEpisodesRoot(input.workerId), `${todayUtc()}.md`)
  if (!existsSync(path)) {
    atomicWrite(path, markdownHeader(`Episodes — ${input.workerId} — ${todayUtc()}`))
  }
  const lines = [
    `\n## ${timeUtc()} UTC — ${input.type}\n`,
    input.missionId ? `- Mission: ${input.missionId}\n` : '',
    input.assignmentId ? `- Assignment: ${input.assignmentId}\n` : '',
    `- Summary: ${input.summary}\n`,
  ].filter(Boolean).join('')
  appendLine(path, lines)
}

export function appendSwarmMemoryEvent(input: {
  workerId: string
  missionId?: string | null
  assignmentId?: string | null
  type: SwarmMemoryEventType
  summary: string
  event?: Record<string, unknown>
  title?: string | null
  checkpoint?: ParsedSwarmCheckpoint | null
}): void {
  const { workerId, missionId } = input
  if (!validateSwarmId(workerId)) throw new Error(`Invalid workerId: ${workerId}`)
  ensureWorkerMemoryScaffold({ workerId })
  const event: SwarmMemoryEvent = {
    at: new Date().toISOString(),
    type: input.type,
    workerId,
    missionId: missionId ?? null,
    assignmentId: input.assignmentId ?? null,
    summary: input.summary,
    event: input.event,
  }

  appendEpisode(event)

  if (missionId) {
    if (!validateMissionId(missionId)) throw new Error(`Invalid missionId: ${missionId}`)
    ensureDir(swarmWorkerMissionMemoryRoot(workerId, missionId))
    appendLine(missionEventsPath(workerId, missionId), JSON.stringify(event))
    updateMissionSummary({
      workerId,
      missionId,
      title: input.title,
      summary: input.summary,
      status: input.type === 'checkpoint' ? input.checkpoint?.runtimeState : 'executing',
      assignmentId: input.assignmentId,
      checkpoint: input.checkpoint,
    })
  }
}

export function writeSwarmHandoff(input: {
  workerId: string
  missionId: string
  content: string
  mirrorShared?: boolean
}): { localPath: string; sharedPath?: string } {
  if (!validateSwarmId(input.workerId)) throw new Error(`Invalid workerId: ${input.workerId}`)
  if (!validateMissionId(input.missionId)) throw new Error(`Invalid missionId: ${input.missionId}`)
  const localPath = join(swarmWorkerHandoffsRoot(input.workerId), `${input.missionId}.md`)
  atomicWrite(localPath, input.content.endsWith('\n') ? input.content : `${input.content}\n`)
  let sharedPath: string | undefined
  if (input.mirrorShared ?? true) {
    sharedPath = join(SWARM_SHARED_HANDOFF_ROOT, `${input.workerId}-latest.md`)
    atomicWrite(sharedPath, input.content.endsWith('\n') ? input.content : `${input.content}\n`)
  }
  return { localPath, sharedPath }
}

function memoryRootFor(input: { workerId?: string | null; kind: SwarmMemoryKind; missionId?: string | null; date?: string | null }): string {
  if (input.kind === 'shared') return SWARM_SHARED_MEMORY_ROOT
  const workerId = input.workerId?.trim()
  if (!workerId || !validateSwarmId(workerId)) throw new Error('Valid workerId required')
  if (input.kind === 'profile') return swarmWorkerMemoryRoot(workerId)
  if (input.kind === 'mission') {
    const missionId = input.missionId?.trim()
    if (!missionId || !validateMissionId(missionId)) throw new Error('Valid missionId required')
    return swarmWorkerMissionMemoryRoot(workerId, missionId)
  }
  if (input.kind === 'episodic') return swarmWorkerEpisodesRoot(workerId)
  if (input.kind === 'handoff') return swarmWorkerHandoffsRoot(workerId)
  return swarmWorkerMemoryRoot(workerId)
}

function listFiles(root: string, maxDepth = 2): Array<string> {
  if (!existsSync(root)) return []
  const out: Array<string> = []
  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      const st = statSync(path)
      if (st.isDirectory()) {
        walk(path, depth + 1)
      } else if (/\.(md|jsonl|json)$/i.test(name)) {
        out.push(path)
      }
    }
  }
  walk(root, 0)
  return out
}

export function readSwarmMemory(input: { workerId?: string | null; kind: SwarmMemoryKind; missionId?: string | null; date?: string | null }): SwarmMemoryReadResult {
  const root = memoryRootFor(input)
  ensureDir(root)
  const files = listFiles(root, input.kind === 'profile' ? 1 : 2)
    .filter((path) => !input.date || basename(path).startsWith(input.date))
    .slice(0, 50)
    .map((path) => ({ name: basename(path), path, content: readFileSync(assertInside(root, path), 'utf8') }))
  return {
    ok: true,
    workerId: input.workerId ?? null,
    kind: input.kind,
    root,
    path: root,
    files,
  }
}

function tokenScore(line: string, query: string): number {
  const lower = line.toLowerCase()
  const q = query.toLowerCase().trim()
  if (!q) return 0
  if (lower.includes(q)) return 100 + q.length
  const tokens = q.split(/\s+/).filter(Boolean)
  return tokens.reduce((score, token) => score + (lower.includes(token) ? 10 : 0), 0)
}

export function searchSwarmMemory(input: { workerId?: string | null; query: string; scope?: 'worker' | 'shared' | 'all'; limit?: number }): Array<SwarmMemorySearchResult> {
  const query = input.query.trim()
  if (!query) return []
  const roots: Array<string> = []
  const scope = input.scope ?? 'worker'
  if ((scope === 'worker' || scope === 'all') && input.workerId) {
    if (!validateSwarmId(input.workerId)) throw new Error(`Invalid workerId: ${input.workerId}`)
    roots.push(swarmWorkerMemoryRoot(input.workerId))
  }
  if (scope === 'shared' || scope === 'all') {
    roots.push(SWARM_SHARED_MEMORY_ROOT, SWARM_SHARED_HANDOFF_ROOT)
  }

  const results: Array<SwarmMemorySearchResult> = []
  for (const root of roots) {
    for (const file of listFiles(root, 4)) {
      const content = readFileSync(assertInside(root, file), 'utf8')
      const lines = content.split('\n')
      lines.forEach((line, index) => {
        const score = tokenScore(line, query)
        if (score > 0) {
          results.push({ path: file, line: index + 1, score, snippet: line.trim().slice(0, 240) })
        }
      })
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(50, input.limit ?? 10)))
}

// ---------------------------------------------------------------------------
// Startup snapshot helpers
// ---------------------------------------------------------------------------

function tail(content: string, max: number): string {
  if (!content) return ''
  if (content.length <= max) return content.trim()
  return `… ${content.slice(content.length - max).trim()}`
}

function readShared(file: string): string {
  return readTextIfExists(file)
}

function readActiveMissionId(workerId: string): string | null {
  const runtimePath = profileFile(workerId, 'runtime.json')
  if (!existsSync(runtimePath)) return null
  try {
    const json = JSON.parse(readFileSync(runtimePath, 'utf8')) as Record<string, unknown>
    const id = json.currentMissionId
    return typeof id === 'string' && validateMissionId(id) ? id : null
  } catch {
    return null
  }
}

function readEnabledToolsets(workerId: string): Array<string> {
  const configPath = profileFile(workerId, 'config.yaml')
  if (!existsSync(configPath)) return []
  try {
    const parsed = YAML.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const toolsets = parsed.toolsets
    if (!Array.isArray(toolsets)) return []
    return toolsets.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  } catch {
    return []
  }
}

function newestEpisodeContent(workerId: string): { date: string; content: string } | null {
  const root = swarmWorkerEpisodesRoot(workerId)
  if (!existsSync(root)) return null
  const entries = readdirSync(root)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort()
  if (!entries.length) return null
  const latest = entries[entries.length - 1]
  return { date: latest.replace(/\.md$/, ''), content: readTextIfExists(join(root, latest)) }
}

function newestMissionEvents(workerId: string, missionId: string, n = 4): Array<string> {
  const path = join(swarmWorkerMissionMemoryRoot(workerId, missionId), 'events.jsonl')
  if (!existsSync(path)) return []
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
  return lines.slice(-n)
}

export type SwarmStartupSnapshotInput = {
  workerId: string
  role?: string | null
  specialty?: string | null
  rosterMission?: string | null
  taskTitle?: string | null
  missionId?: string | null
  // Soft caps so the inline snapshot does not blow up dispatch envelopes.
  maxIdentityChars?: number
  maxMemoryChars?: number
  maxMissionChars?: number
  maxEpisodeChars?: number
  maxProjectChars?: number
}

export type SwarmStartupSnapshot = {
  workerId: string
  identity: string
  durableMemory: string
  persona: string
  user: string
  project: string
  enabledToolsets: Array<string>
  activeMission: { missionId: string; summary: string; recentEvents: Array<string> } | null
  latestHandoff: { path: string; content: string } | null
  latestEpisode: { date: string; content: string } | null
  rendered: string
}

export function buildSwarmStartupSnapshot(input: SwarmStartupSnapshotInput): SwarmStartupSnapshot {
  const { workerId } = input
  if (!validateSwarmId(workerId)) throw new Error(`Invalid workerId: ${workerId}`)
  const identity = readTextIfExists(join(swarmWorkerMemoryRoot(workerId), 'IDENTITY.md'))
  const durableMemory = readTextIfExists(profileFile(workerId, 'MEMORY.md'))
  const persona = readTextIfExists(profileFile(workerId, 'SOUL.md'))
  const user = readTextIfExists(profileFile(workerId, 'USER.md'))
  const project = readShared(SWARM_PROJECT_CONTEXT_PATH)
  const enabledToolsets = readEnabledToolsets(workerId)

  const activeMissionId = input.missionId ?? readActiveMissionId(workerId)
  let activeMission: SwarmStartupSnapshot['activeMission'] = null
  if (activeMissionId) {
    const summaryPath = join(swarmWorkerMissionMemoryRoot(workerId, activeMissionId), 'SUMMARY.md')
    if (existsSync(summaryPath)) {
      activeMission = {
        missionId: activeMissionId,
        summary: readTextIfExists(summaryPath),
        recentEvents: newestMissionEvents(workerId, activeMissionId, 5),
      }
    }
  }

  const sharedHandoffPath = join(SWARM_SHARED_HANDOFF_ROOT, `${workerId}-latest.md`)
  let latestHandoff: SwarmStartupSnapshot['latestHandoff'] = null
  if (existsSync(sharedHandoffPath)) {
    latestHandoff = { path: sharedHandoffPath, content: readTextIfExists(sharedHandoffPath) }
  } else if (activeMissionId) {
    const localHandoff = join(swarmWorkerHandoffsRoot(workerId), `${activeMissionId}.md`)
    if (existsSync(localHandoff)) {
      latestHandoff = { path: localHandoff, content: readTextIfExists(localHandoff) }
    }
  }

  const latestEpisode = newestEpisodeContent(workerId)

  const maxIdentity = input.maxIdentityChars ?? 600
  const maxMemory = input.maxMemoryChars ?? 1600
  const maxMission = input.maxMissionChars ?? 1600
  const maxEpisode = input.maxEpisodeChars ?? 600
  const maxProject = input.maxProjectChars ?? 1200

  const renderedSections: Array<string> = []
  renderedSections.push('## Worker Startup Memory Snapshot')
  renderedSections.push(`Worker: ${workerId}${input.role ? ` — ${input.role}` : ''}${input.specialty ? ` (${input.specialty})` : ''}`)
  if (input.rosterMission) renderedSections.push(`Mission focus: ${input.rosterMission}`)
  if (enabledToolsets.length) {
    renderedSections.push('### Enabled tools')
    renderedSections.push(enabledToolsets.join(', '))
  }
  if (project) {
    renderedSections.push('### Project context')
    renderedSections.push(tail(project, maxProject))
  }
  if (durableMemory) {
    renderedSections.push('### Durable memory (profile MEMORY.md tail)')
    renderedSections.push(tail(durableMemory, maxMemory))
  }
  if (identity) {
    renderedSections.push('### Worker identity')
    renderedSections.push(tail(identity, maxIdentity))
  }
  if (latestHandoff) {
    renderedSections.push(`### Latest handoff (${latestHandoff.path})`)
    renderedSections.push(tail(latestHandoff.content, maxMission))
  }
  if (activeMission) {
    renderedSections.push(`### Active mission ${activeMission.missionId}`)
    renderedSections.push(tail(activeMission.summary, maxMission))
    if (activeMission.recentEvents.length) {
      renderedSections.push('Recent events:')
      renderedSections.push(activeMission.recentEvents.map((line) => `- ${line}`).join('\n'))
    }
  }
  if (latestEpisode) {
    renderedSections.push(`### Latest episode (${latestEpisode.date})`)
    renderedSections.push(tail(latestEpisode.content, maxEpisode))
  }
  renderedSections.push('### Memory locations')
  renderedSections.push(
    [
      `Profile root: ~/.claude/profiles/${workerId}/  (MEMORY.md, SOUL.md, USER.md cloned from main)`,
      `Swarm memory: ~/.ocplatform/profiles/${workerId}/memory/  (IDENTITY.md, missions/, episodes/, handoffs/)`,
      `Shared handoff: ${sharedHandoffPath}`,
      `Shared swarm memory: ${SWARM_SHARED_MEMORY_ROOT}`,
      `Project context: ${SWARM_PROJECT_CONTEXT_PATH}`,
    ].join('\n'),
  )

  return {
    workerId,
    identity,
    durableMemory,
    persona,
    user,
    project,
    enabledToolsets,
    activeMission,
    latestHandoff,
    latestEpisode,
    rendered: renderedSections.join('\n\n'),
  }
}

export function readSwarmProjectContext(): string {
  return readTextIfExists(SWARM_PROJECT_CONTEXT_PATH)
}
