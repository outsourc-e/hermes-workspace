import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkHealth, getConfig } from './claude-api'
import { listAllActiveRuns } from './run-store'
import { listSwarmMissions } from './swarm-missions'

// ── Types ───────────────────────────────────────────────────────────

export type AgentLaneId =
  | 'nova-hermes'
  | 'claude-code'
  | 'codex'
  | 'cursor-grok'
  | 'hermes-subagents'

export type AgentLaneStatus =
  | 'active'
  | 'idle'
  | 'offline'
  | 'setup-needed'
  | 'unknown'

export type AgentLane = {
  id: AgentLaneId
  label: string
  role: 'control-tower' | 'worker'
  status: AgentLaneStatus
  detail: string
  model: string | null
  workspace: string | null
  branch: string | null
  activeTask: string | null
  lastPrompt: string | null
  lastReceipt: string | null
  heartbeatAt: string | null
  blocker: string | null
  budget: string | null
  approvalState: string
  evidence: Array<{ label: string; value: string }>
}

export type AgentLaneRegistry = {
  generatedAt: string
  lanes: Array<AgentLane>
}

export type AgentLaneRegistryInput = {
  now: string
  hermes: {
    reachable: boolean
    model: string | null
    provider: string | null
    activeRuns: number
    lastHeartbeatAt: string | null
  } | null
  claude: {
    homeExists: boolean
    newestSessionAt: string | null
    newestSessionProject: string | null
    processCount: number
  } | null
  codex: {
    homeExists: boolean
    newestSessionAt: string | null
    processCount: number
  } | null
  cursor: {
    installed: boolean
    processCount: number
  } | null
  subagents: {
    missions: number
    activeAssignments: number
    blocked: number
    newestUpdateAt: string | null
  } | null
  handoff: {
    latestDir: string | null
    latestReadmeAt: string | null
  } | null
}

const ACTIVE_WINDOW_MS = 30 * 60_000
const IDLE_WINDOW_MS = 24 * 60 * 60_000

const TOWER_APPROVAL =
  'External/risky actions gated on Taylor approval with fabric receipts'
const WORKER_APPROVAL =
  'Ships via PR/handoff review; no customer-facing sends, no spend'

function withinMs(now: string, at: string | null, windowMs: number): boolean {
  if (!at) return false
  const delta = Date.parse(now) - Date.parse(at)
  return Number.isFinite(delta) && delta >= 0 && delta <= windowMs
}

/** Evidence-based file/process status shared by the desktop worker lanes. */
function evidenceStatus(
  now: string,
  homeExists: boolean,
  newestAt: string | null,
  processCount: number,
): AgentLaneStatus {
  if (!homeExists) return 'setup-needed'
  if (withinMs(now, newestAt, ACTIVE_WINDOW_MS)) return 'active'
  if (processCount > 0) return 'idle'
  if (withinMs(now, newestAt, IDLE_WINDOW_MS)) return 'idle'
  return 'offline'
}

// ── Pure builder ─────────────────────────────────────────────────────

export function buildAgentLaneRegistry(
  input: AgentLaneRegistryInput,
): AgentLaneRegistry {
  const lanes: Array<AgentLane> = []

  // Nova/Hermes — the control tower.
  if (input.hermes) {
    const status: AgentLaneStatus = input.hermes.reachable
      ? input.hermes.activeRuns > 0
        ? 'active'
        : 'idle'
      : 'offline'
    lanes.push({
      id: 'nova-hermes',
      label: 'Nova / Hermes',
      role: 'control-tower',
      status,
      detail: input.hermes.reachable
        ? `${input.hermes.activeRuns} active run${input.hermes.activeRuns === 1 ? '' : 's'} on ${input.hermes.provider ?? 'unknown provider'}`
        : 'Gateway health probe failed',
      model: input.hermes.model,
      workspace: 'hermes gateway :8642',
      branch: null,
      activeTask:
        input.hermes.activeRuns > 0
          ? `${input.hermes.activeRuns} run${input.hermes.activeRuns === 1 ? '' : 's'} executing`
          : null,
      lastPrompt: null,
      lastReceipt: null,
      heartbeatAt: input.hermes.lastHeartbeatAt,
      blocker: input.hermes.reachable ? null : 'Hermes gateway unreachable',
      budget: null,
      approvalState: TOWER_APPROVAL,
      evidence: [
        { label: 'gateway', value: input.hermes.reachable ? 'health ok' : 'down' },
        { label: 'runs', value: String(input.hermes.activeRuns) },
      ],
    })
  } else {
    lanes.push(unknownLane('nova-hermes', 'Nova / Hermes', 'control-tower', TOWER_APPROVAL))
  }

  // Claude Code desktop app.
  if (input.claude) {
    const status = evidenceStatus(
      input.now,
      input.claude.homeExists,
      input.claude.newestSessionAt,
      input.claude.processCount,
    )
    lanes.push({
      id: 'claude-code',
      label: 'Claude Code',
      role: 'worker',
      status,
      detail: input.claude.homeExists
        ? `${input.claude.processCount} process${input.claude.processCount === 1 ? '' : 'es'}; last session ${input.claude.newestSessionAt ?? 'never observed'}`
        : 'No ~/.claude home found',
      model: null,
      workspace: input.claude.newestSessionProject,
      branch: null,
      activeTask: null,
      lastPrompt: null,
      lastReceipt: null,
      heartbeatAt: input.claude.newestSessionAt,
      blocker: null,
      budget: null,
      approvalState: WORKER_APPROVAL,
      evidence: [
        { label: 'session files', value: input.claude.newestSessionAt ?? 'none' },
        { label: 'processes', value: String(input.claude.processCount) },
      ],
    })
  } else {
    lanes.push(unknownLane('claude-code', 'Claude Code', 'worker', WORKER_APPROVAL))
  }

  // Codex desktop app — fed by its home dir plus the agent handoff bus.
  if (input.codex) {
    const status = evidenceStatus(
      input.now,
      input.codex.homeExists,
      input.codex.newestSessionAt,
      input.codex.processCount,
    )
    lanes.push({
      id: 'codex',
      label: 'Codex',
      role: 'worker',
      status,
      detail: input.codex.homeExists
        ? `last session ${input.codex.newestSessionAt ?? 'never observed'}`
        : 'No ~/.codex home found',
      model: null,
      workspace: null,
      branch: null,
      activeTask: input.handoff?.latestDir
        ? `handoff: ${input.handoff.latestDir}`
        : null,
      lastPrompt: null,
      lastReceipt: input.handoff?.latestReadmeAt ?? null,
      heartbeatAt: input.codex.newestSessionAt,
      blocker: null,
      budget: null,
      approvalState: WORKER_APPROVAL,
      evidence: [
        { label: 'session files', value: input.codex.newestSessionAt ?? 'none' },
        { label: 'handoff bus', value: input.handoff?.latestDir ?? 'none' },
      ],
    })
  } else {
    lanes.push(unknownLane('codex', 'Codex', 'worker', WORKER_APPROVAL))
  }

  // Cursor (planned Grok 4.5 lane) — detect-only, never invent a model.
  if (input.cursor) {
    const status: AgentLaneStatus = input.cursor.installed
      ? input.cursor.processCount > 0
        ? 'idle'
        : 'offline'
      : 'setup-needed'
    lanes.push({
      id: 'cursor-grok',
      label: 'Cursor (Grok lane)',
      role: 'worker',
      status,
      detail: input.cursor.installed
        ? input.cursor.processCount > 0
          ? 'Cursor running; session detail not exposed — read-only detection'
          : 'Cursor installed but not running'
        : 'Cursor not installed — planned Grok 4.5 worker lane',
      model: null,
      workspace: null,
      branch: null,
      activeTask: null,
      lastPrompt: null,
      lastReceipt: null,
      heartbeatAt: null,
      blocker: null,
      budget: null,
      approvalState: WORKER_APPROVAL,
      evidence: [
        { label: 'installed', value: input.cursor.installed ? 'yes' : 'no' },
        { label: 'processes', value: String(input.cursor.processCount) },
      ],
    })
  } else {
    lanes.push(unknownLane('cursor-grok', 'Cursor (Grok lane)', 'worker', WORKER_APPROVAL))
  }

  // Hermes subagents / background jobs from real swarm missions.
  if (input.subagents) {
    const status: AgentLaneStatus =
      input.subagents.activeAssignments > 0
        ? 'active'
        : input.subagents.missions > 0
          ? 'idle'
          : 'offline'
    lanes.push({
      id: 'hermes-subagents',
      label: 'Hermes subagents',
      role: 'worker',
      status,
      detail: `${input.subagents.missions} mission${input.subagents.missions === 1 ? '' : 's'}; ${input.subagents.activeAssignments} active assignment${input.subagents.activeAssignments === 1 ? '' : 's'}`,
      model: null,
      workspace: null,
      branch: null,
      activeTask:
        input.subagents.activeAssignments > 0
          ? `${input.subagents.activeAssignments} assignments running`
          : null,
      lastPrompt: null,
      lastReceipt: null,
      heartbeatAt: input.subagents.newestUpdateAt,
      blocker:
        input.subagents.blocked > 0
          ? `${input.subagents.blocked} blocked assignment${input.subagents.blocked === 1 ? '' : 's'}`
          : null,
      budget: null,
      approvalState: WORKER_APPROVAL,
      evidence: [
        { label: 'missions', value: String(input.subagents.missions) },
        { label: 'blocked', value: String(input.subagents.blocked) },
      ],
    })
  } else {
    lanes.push(
      unknownLane('hermes-subagents', 'Hermes subagents', 'worker', WORKER_APPROVAL),
    )
  }

  return { generatedAt: input.now, lanes }
}

function unknownLane(
  id: AgentLaneId,
  label: string,
  role: AgentLane['role'],
  approvalState: string,
): AgentLane {
  return {
    id,
    label,
    role,
    status: 'unknown',
    detail: 'No evidence source readable for this lane',
    model: null,
    workspace: null,
    branch: null,
    activeTask: null,
    lastPrompt: null,
    lastReceipt: null,
    heartbeatAt: null,
    blocker: null,
    budget: null,
    approvalState,
    evidence: [],
  }
}

// ── Evidence gathering (read-only, never throws) ─────────────────────

function tryOrNull<T>(fn: () => T): T | null {
  try {
    return fn()
  } catch {
    return null
  }
}

async function tryOrNullAsync<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

function newestEntry(dir: string): { name: string; mtimeMs: number } | null {
  if (!fs.existsSync(dir)) return null
  let newest: { name: string; mtimeMs: number } | null = null
  for (const entry of fs.readdirSync(dir)) {
    const stats = tryOrNull(() => fs.statSync(path.join(dir, entry)))
    if (!stats) continue
    if (!newest || stats.mtimeMs > newest.mtimeMs) {
      newest = { name: entry, mtimeMs: stats.mtimeMs }
    }
  }
  return newest
}

/** Newest *.jsonl under ~/.claude/projects/<project>/ — real session evidence. */
function newestClaudeSession(
  claudeHome: string,
): { project: string; mtimeMs: number } | null {
  const projectsDir = path.join(claudeHome, 'projects')
  if (!fs.existsSync(projectsDir)) return null
  let newest: { project: string; mtimeMs: number } | null = null
  for (const project of fs.readdirSync(projectsDir)) {
    const dir = path.join(projectsDir, project)
    const stats = tryOrNull(() => fs.statSync(dir))
    if (!stats?.isDirectory()) continue
    for (const file of tryOrNull(() => fs.readdirSync(dir)) ?? []) {
      if (!file.endsWith('.jsonl')) continue
      const fileStats = tryOrNull(() => fs.statSync(path.join(dir, file)))
      if (!fileStats) continue
      if (!newest || fileStats.mtimeMs > newest.mtimeMs) {
        newest = { project, mtimeMs: fileStats.mtimeMs }
      }
    }
  }
  return newest
}

function countProcesses(needle: string): number {
  if (process.platform !== 'win32') return 0
  const result = tryOrNull(() =>
    // execFileSync avoids a shell; tasklist is read-only.
    execFileSync('tasklist', ['/FO', 'CSV', '/NH'], {
      timeout: 4000,
      encoding: 'utf8',
      windowsHide: true,
    }),
  )
  if (!result) return 0
  const pattern = new RegExp(`^"${needle}[^"]*"`, 'im')
  return result
    .split('\n')
    .filter((line) => pattern.test(line.trim())).length
}

export async function gatherAgentLaneRegistry(): Promise<AgentLaneRegistry> {
  const home = os.homedir()
  const claudeHome = process.env.NOVA_CLAUDE_HOME ?? path.join(home, '.claude')
  const codexHome = process.env.NOVA_CODEX_HOME ?? path.join(home, '.codex')
  const cursorExe =
    process.env.NOVA_CURSOR_EXE ??
    path.join(
      process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'),
      'Programs',
      'cursor',
      'Cursor.exe',
    )
  const handoffRoot =
    process.env.NOVA_AGENT_BUS_HANDOFF ?? 'C:\\Agents\\handoff\\claude-to-codex'

  const [health, config, activeRuns] = await Promise.all([
    tryOrNullAsync(() => checkHealth()),
    tryOrNullAsync(() => getConfig()),
    tryOrNullAsync(() => listAllActiveRuns()),
  ])

  const claudeSession = tryOrNull(() => newestClaudeSession(claudeHome))
  const codexNewest = tryOrNull(() => newestEntry(path.join(codexHome, 'sessions')))
    ?? tryOrNull(() => newestEntry(codexHome))
  const handoffNewest = tryOrNull(() => newestEntry(handoffRoot))
  const missions = tryOrNull(() => listSwarmMissions(20)) ?? []

  const activeAssignments = missions.reduce(
    (count, mission) =>
      count +
      mission.assignments.filter((assignment) =>
        ['queued', 'dispatched', 'checkpointed', 'reviewing'].includes(
          assignment.state,
        ),
      ).length,
    0,
  )
  const blockedAssignments = missions.reduce(
    (count, mission) =>
      count +
      mission.assignments.filter((assignment) =>
        ['blocked', 'needs_input'].includes(assignment.state),
      ).length,
    0,
  )
  const newestMission = missions
    .map((mission) => mission.updatedAt)
    .sort()
    .at(-1)

  return buildAgentLaneRegistry({
    now: new Date().toISOString(),
    hermes: {
      reachable: health !== null,
      model: typeof config?.model === 'string' ? config.model : null,
      provider: typeof config?.provider === 'string' ? config.provider : null,
      activeRuns:
        activeRuns?.filter((run) =>
          ['accepted', 'active', 'handoff'].includes(run.status),
        ).length ?? 0,
      lastHeartbeatAt: health ? new Date().toISOString() : null,
    },
    claude: {
      homeExists: fs.existsSync(claudeHome),
      newestSessionAt: claudeSession
        ? new Date(claudeSession.mtimeMs).toISOString()
        : null,
      newestSessionProject: claudeSession?.project ?? null,
      processCount: countProcesses('claude'),
    },
    codex: {
      homeExists: fs.existsSync(codexHome),
      newestSessionAt: codexNewest
        ? new Date(codexNewest.mtimeMs).toISOString()
        : null,
      processCount: countProcesses('Codex'),
    },
    cursor: {
      installed: fs.existsSync(cursorExe),
      processCount: countProcesses('Cursor'),
    },
    subagents: {
      missions: missions.length,
      activeAssignments,
      blocked: blockedAssignments,
      newestUpdateAt: newestMission ?? null,
    },
    handoff: {
      latestDir: handoffNewest?.name ?? null,
      latestReadmeAt: handoffNewest
        ? new Date(handoffNewest.mtimeMs).toISOString()
        : null,
    },
  })
}
