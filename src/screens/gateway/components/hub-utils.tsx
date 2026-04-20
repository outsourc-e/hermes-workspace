// TODO(orphan): hub-utils.tsx exports many helper functions extracted from
// agent-hub-layout.tsx — but nothing actually imports from it. The functions here
// (parseMissionGoal, toTitleCase, createTaskId, getModelDisplayLabel, etc.) are
// duplicated as local functions inside agent-hub-layout.tsx.
// To activate: replace local function definitions in agent-hub-layout.tsx with
// imports from this file. Run `npx tsc --noEmit` after to verify no type drift.
import type { GatewayModelCatalogEntry } from '@/lib/gateway-api'
import { ROUGH_COST_PER_1K_TOKENS_USD } from '@/lib/config/costs'
import type { MissionCheckpoint } from '../lib/mission-checkpoint'
import {
  MODEL_PRESET_MAP,
  MODEL_PRESETS,
  MAX_MISSION_REPORTS,
  MISSION_REPORTS_STORAGE_KEY,
  TEMPLATE_DISPLAY_NAMES,
  TEMPLATE_MODEL_SUGGESTIONS,

  type MissionAgentSummary,
  type MissionReportPayload,
  type MissionTaskStats,
  type SavedTeamConfig,
  type StoredMissionReport,
} from './hub-constants'
import {
  type TeamMember,
  type TeamTemplateId,
  TEAM_TEMPLATES,
} from './team-panel'
import type { HubTask } from './task-board'

export function readGatewayModelId(entry: GatewayModelCatalogEntry): string {
  if (typeof entry === 'string') return entry.trim()
  const alias = typeof entry.alias === 'string' ? entry.alias.trim() : ''
  if (alias) return alias
  const id = typeof entry.id === 'string' ? entry.id.trim() : ''
  if (id) return id
  const provider = typeof entry.provider === 'string' ? entry.provider.trim() : ''
  const model = typeof entry.model === 'string' ? entry.model.trim() : ''
  if (provider && model) return `${provider}/${model}`
  if (model) return model
  const name = typeof entry.name === 'string' ? entry.name.trim() : ''
  if (name) return name
  const label = typeof entry.label === 'string' ? entry.label.trim() : ''
  if (label) return label
  const displayName = typeof entry.displayName === 'string' ? entry.displayName.trim() : ''
  return displayName
}

export function buildDetectedAgentName(
  session: Record<string, unknown>,
  fallbackIndex: number,
): string {
  const label = typeof session.label === 'string' ? session.label.trim() : ''
  if (label) return label
  const title = typeof session.title === 'string' ? session.title.trim() : ''
  if (title) return title
  const derivedTitle = typeof session.derivedTitle === 'string' ? session.derivedTitle.trim() : ''
  if (derivedTitle) return derivedTitle
  const friendlyId = typeof session.friendlyId === 'string' ? session.friendlyId.trim() : ''
  if (friendlyId) return friendlyId
  return `Detected Agent ${fallbackIndex + 1}`
}

export function resolveGatewayModelId(modelId: string): string {
  if (Object.prototype.hasOwnProperty.call(MODEL_PRESET_MAP, modelId)) {
    return MODEL_PRESET_MAP[modelId] ?? ''
  }
  return modelId
}

export function getModelDisplayLabel(modelId: string): string {
  if (!modelId) return 'Unknown'
  const preset = MODEL_PRESETS.find((entry) => entry.id === modelId)
  if (preset) return preset.label
  const parts = modelId.split('/')
  return parts[parts.length - 1] || modelId
}

export function getModelDisplayLabelFromLookup(
  modelId: string,
  gatewayModelLabelById?: Map<string, { label: string; provider: string }>,
): string {
  if (!modelId) return 'Unknown'
  const preset = MODEL_PRESETS.find((entry) => entry.id === modelId)
  if (preset) return preset.label
  const gatewayModel = gatewayModelLabelById?.get(modelId)
  if (gatewayModel?.label) return gatewayModel.label
  return getModelDisplayLabel(modelId)
}

export function toTitleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function createMemberId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createTaskId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 8)
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function capitalizeFirst(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length
}

function cleanMissionSegment(value: string): string {
  const normalized = value
    .replace(/^\s*[-*+]\s*/, '')
    .replace(/^\s*\d+\s*[.)-]\s*/, '')
    .replace(/[.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return capitalizeFirst(normalized)
}

function extractMissionItems(goal: string): string[] {
  const rawSegments = goal
    .replace(/\r/g, '\n')
    .replace(/[•●▪◦]/g, '\n')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\b\d+\.\s+/g, '\n')
    .replace(/[.?!;]+\s*/g, '\n')
    .split('\n')
    .flatMap((line) => line.split(/,\s+|\s+\band\b\s+/gi))
    .map(cleanMissionSegment)
    .filter((segment) => segment.length > 0 && wordCount(segment) >= 3)

  const uniqueSegments: string[] = []
  const seen = new Set<string>()
  rawSegments.forEach((segment) => {
    const key = segment.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    uniqueSegments.push(segment)
  })
  return uniqueSegments
}

export function parseMissionGoal(goal: string, teamMembers: TeamMember[], missionId?: string): HubTask[] {
  const trimmedGoal = goal.trim()
  if (!trimmedGoal) return []
  const now = Date.now()
  const segments = extractMissionItems(trimmedGoal)
  const normalizedGoal = cleanMissionSegment(trimmedGoal)

  let missionItems: string[]
  if (segments.length >= 2) {
    const withoutFullGoal = segments.filter((segment) => segment !== normalizedGoal)
    missionItems = withoutFullGoal.length >= 1 ? withoutFullGoal : segments
  } else {
    missionItems = normalizedGoal ? [normalizedGoal] : []
  }

  return missionItems.map((segment, index) => {
    const member = teamMembers.length > 0 ? teamMembers[index % teamMembers.length] : undefined
    const createdAt = now + index
    return {
      id: createTaskId(),
      title: segment,
      description: '',
      priority: index === 0 ? 'high' : 'normal',
      status: member ? 'assigned' : 'inbox',
      agentId: member?.id,
      missionId,
      createdAt,
      updatedAt: createdAt,
    }
  })
}

export function truncateMissionGoal(goal: string, max = 110): string {
  if (goal.length <= max) return goal
  return `${goal.slice(0, max - 1).trimEnd()}…`
}

export function buildTeamFromTemplate(templateId: TeamTemplateId): TeamMember[] {
  const template = TEAM_TEMPLATES.find((entry) => entry.id === templateId)
  if (!template) return []

  const modelSuggestions = TEMPLATE_MODEL_SUGGESTIONS[template.id]

  return template.agents.map((agentName, index) => ({
    id: `${template.id}-${agentName}`,
    name: toTitleCase(agentName),
    avatar: index % 10,
    modelId: modelSuggestions[index] ?? 'auto',
    roleDescription: `${toTitleCase(agentName)} lead for this mission`,
    goal: '',
    backstory: '',
    status: 'available',
  }))
}

export function buildTeamFromRuntime(
  agents: Array<{ id: string; name: string; role: string; status: string }>,
): TeamMember[] {
  return agents.slice(0, 5).map((agent, index) => ({
    id: agent.id,
    name: agent.name,
    avatar: index % 10,
    modelId: 'auto',
    roleDescription: agent.role,
    goal: '',
    backstory: '',
    status: agent.status || 'available',
  }))
}

export function toTeamMember(value: unknown): TeamMember | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const row = value as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const status = typeof row.status === 'string' ? row.status.trim() : 'available'
  const roleDescription = typeof row.roleDescription === 'string' ? row.roleDescription : ''
  const avatar = typeof row.avatar === 'number' ? row.avatar : undefined
  const goal = typeof row.goal === 'string' ? row.goal : ''
  const backstory = typeof row.backstory === 'string' ? row.backstory : ''
  const modelIdRaw = typeof row.modelId === 'string' ? row.modelId.trim() : 'auto'
  const modelId = modelIdRaw || 'auto'

  if (!id || !name) return null

  return {
    id,
    name,
    avatar,
    modelId,
    roleDescription,
    goal,
    backstory,
    status: status || 'available',
  }
}

export function toSavedTeamConfig(value: unknown): SavedTeamConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const createdAt = typeof row.createdAt === 'number' ? row.createdAt : Date.now()
  const updatedAt = typeof row.updatedAt === 'number' ? row.updatedAt : createdAt
  const teamRaw = Array.isArray(row.team) ? row.team : []
  const team = teamRaw
    .map((entry) => toTeamMember(entry))
    .filter((entry): entry is TeamMember => Boolean(entry))

  if (!id || !name || team.length === 0) return null

  const icon = typeof row.icon === 'string' ? row.icon : undefined

  return {
    id,
    name,
    icon,
    createdAt,
    updatedAt,
    team,
  }
}

export function suggestTemplate(goal: string): TeamTemplateId {
  const normalized = goal.toLowerCase()
  const hasAny = (keywords: string[]) => keywords.some((keyword) => normalized.includes(keyword))

  if (hasAny(['coding', 'code', 'dev', 'build', 'ship', 'fix', 'bug', 'api', 'rest', 'endpoint'])) {
    return 'coding'
  }
  if (hasAny(['research', 'analyze', 'investigate', 'report', 'competitor'])) {
    return 'research'
  }
  if (hasAny(['write', 'content', 'blog', 'copy', 'edit'])) {
    return 'content'
  }
  return 'coding'
}

export function resolveActiveTemplate(team: TeamMember[]): TeamTemplateId | undefined {
  return TEAM_TEMPLATES.find((template) => {
    if (team.length !== template.agents.length) return false
    return template.agents.every((agentName) =>
      team.some((member) => member.id === `${template.id}-${agentName}`),
    )
  })?.id
}

export function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function computeMissionTaskStats(tasks: HubTask[]): MissionTaskStats {
  const total = tasks.length
  const completed = tasks.filter((task) => task.status === 'done' || (task.status as string) === 'completed').length
  const failed = tasks.filter((task) => (task.status as string) === 'blocked').length
  return { total, completed, failed }
}

export function estimateMissionCost(tokenCount: number): number {
  return Number(((tokenCount / 1000) * ROUGH_COST_PER_1K_TOKENS_USD).toFixed(2))
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function cleanAgentOutputLines(lines: string[]): string[] {
  return lines.filter((line) => line.trim().length > 0)
}

function getAgentOutputMarkdown(lines: string[]): string {
  return cleanAgentOutputLines(lines).join('\n').trim()
}

function getLongestAgentOutput(agentSummaries: MissionAgentSummary[]): string {
  const outputs = agentSummaries
    .map((summary) => getAgentOutputMarkdown(summary.lines))
    .filter((output) => output.length > 0)

  if (outputs.length === 0) return ''
  outputs.sort((left, right) => right.length - left.length)
  return outputs[0] ?? ''
}

function extractExecutiveSummary(agentSummaries: MissionAgentSummary[]): string {
  const longestOutput = getLongestAgentOutput(agentSummaries)
  if (!longestOutput) return ''
  return longestOutput.length > 500 ? `${longestOutput.slice(0, 500).trimEnd()}…` : longestOutput
}

function extractKeyFindings(agentSummaries: MissionAgentSummary[]): string[] {
  const findings: string[] = []
  const seen = new Set<string>()

  for (const summary of agentSummaries) {
    for (const line of cleanAgentOutputLines(summary.lines)) {
      const trimmed = line.trim()
      if (!/^([-*]\s+|\d+\.\s+)/.test(trimmed)) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      findings.push(trimmed)
      if (findings.length >= 5) return findings
    }
  }

  return findings
}

function determineMissionOutcome(taskStats: MissionTaskStats, agentSummaries: MissionAgentSummary[]): string {
  const hasOutput = agentSummaries.some((summary) => cleanAgentOutputLines(summary.lines).length > 0)
  if (!hasOutput) return '**Outcome:** ❌ No output'
  if (taskStats.failed > 0) return '**Outcome:** ⚠️ Partial'
  if (taskStats.total > 0 && taskStats.completed >= taskStats.total) return '**Outcome:** ✅ Complete'
  if (taskStats.total === 0 && hasOutput) return '**Outcome:** ✅ Complete'
  return '**Outcome:** ⚠️ Partial'
}

export function generateMissionReport(payload: MissionReportPayload): string {
  const durationMs = Math.max(0, payload.completedAt - payload.startedAt)
  const taskStats = computeMissionTaskStats(payload.tasks)
  const costEstimate = estimateMissionCost(payload.tokenCount)
  const lines: string[] = []
  const rawGoal = payload.goal || 'Untitled mission'
  const cleanGoal = rawGoal.replace(/^Mission\s+/i, '').trim() || rawGoal

  lines.push('# Mission Report')
  lines.push('')
  lines.push(`**Goal:** ${cleanGoal}`)
  lines.push(`**Team:** ${payload.teamName}`)
  lines.push(`**Started:** ${new Date(payload.startedAt).toLocaleString()}`)
  lines.push(`**Completed:** ${new Date(payload.completedAt).toLocaleString()}`)
  lines.push(`**Duration:** ${formatDuration(durationMs)}`)
  lines.push(determineMissionOutcome(taskStats, payload.agentSummaries))
  lines.push('')

  const execSummary = extractExecutiveSummary(payload.agentSummaries)
  if (execSummary) {
    lines.push('## Executive Summary')
    lines.push(execSummary)
    lines.push('')
  }

  lines.push('## Team')
  if (payload.team.length === 0) {
    lines.push('- No agents')
  } else {
    payload.team.forEach((member) => {
      lines.push(`- **${member.name}** — ${member.modelId}`)
    })
  }
  lines.push('')
  lines.push('## Tasks')
  lines.push(`- Total: ${taskStats.total}`)
  lines.push(`- Completed: ${taskStats.completed}`)
  if (taskStats.failed > 0) lines.push(`- Failed: ${taskStats.failed}`)
  lines.push('')

  const keyFindings = extractKeyFindings(payload.agentSummaries)
  if (keyFindings.length > 0) {
    lines.push('## Key Findings')
    keyFindings.forEach((finding) => {
      const normalized = finding.replace(/^\d+\.\s+/, '- ')
      lines.push(normalized.startsWith('- ') || normalized.startsWith('* ') ? normalized : `- ${normalized}`)
    })
    lines.push('')
  }

  lines.push('## Per-Agent Summary')
  if (payload.agentSummaries.length === 0) {
    lines.push('*No agent output captured*')
  } else {
    payload.agentSummaries.forEach((summary) => {
      lines.push(`### ${summary.agentName} (${summary.modelId || 'unknown'})`)
      const markdownOutput = getAgentOutputMarkdown(summary.lines)
      lines.push(markdownOutput || '*No output captured*')
      lines.push('')
    })
  }

  lines.push('## Artifacts')
  if (payload.artifacts.length === 0) {
    lines.push('*None*')
  } else {
    payload.artifacts.forEach((artifact) => {
      const typeEmoji = artifact.type === 'code' ? '📄' : artifact.type === 'html' ? '🌐' : '📝'
      lines.push(`- ${typeEmoji} **${artifact.title}** [${artifact.type}] — ${artifact.agentName}`)
    })
  }
  lines.push('')
  lines.push('## Cost Estimate')
  lines.push(`- Tokens: ${payload.tokenCount.toLocaleString()}`)
  lines.push(`- Estimated Cost: $${costEstimate.toFixed(2)} (rough)`)
  lines.push('')

  return lines.join('\n')
}

export function getStoredMissionReportMissionId(report: StoredMissionReport): string {
  return report.missionId ?? report.id
}

export function buildStoredMissionReportFromCheckpoint(cp: MissionCheckpoint): StoredMissionReport | null {
  if (!cp.report) return null
  const completedTasks = cp.tasks.filter((task) => task.status === 'done' || task.status === 'completed').length
  const failedTasks = cp.tasks.filter((task) => task.status === 'blocked' || task.status === 'failed').length
  const completedAt = cp.completedAt ?? cp.updatedAt
  return {
    id: cp.id,
    missionId: cp.id,
    name: cp.label,
    goal: cp.label,
    teamName: cp.team.length > 0 ? `${cp.team.length}-agent team` : 'Archived Mission',
    agents: cp.team.map((member) => ({
      id: member.id,
      name: member.name,
      modelId: member.modelId,
    })),
    taskStats: {
      total: cp.tasks.length,
      completed: completedTasks,
      failed: failedTasks,
    },
    duration: Math.max(0, completedAt - cp.startedAt),
    tokenCount: 0,
    costEstimate: 0,
    artifacts: [],
    report: cp.report,
    completedAt,
  }
}

export function loadStoredMissionReports(): StoredMissionReport[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(MISSION_REPORTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is StoredMissionReport => Boolean(entry && typeof entry === 'object'))
      .sort((left, right) => right.completedAt - left.completedAt)
      .slice(0, MAX_MISSION_REPORTS)
  } catch {
    return []
  }
}

export function saveStoredMissionReport(entry: StoredMissionReport): StoredMissionReport[] {
  if (typeof window === 'undefined') return [entry]
  const entryMissionId = getStoredMissionReportMissionId(entry)
  const next = [entry, ...loadStoredMissionReports().filter((row) => getStoredMissionReportMissionId(row) !== entryMissionId)]
    .sort((left, right) => right.completedAt - left.completedAt)
    .slice(0, MAX_MISSION_REPORTS)
  try {
    window.localStorage.setItem(MISSION_REPORTS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore quota/write errors
  }
  return next
}

export function classifyAgentTurnEnd(text: string | undefined | null): 'completed' | 'waiting_for_input' {
  if (!text) return 'completed'
  const trimmed = text.trim()
  if (!trimmed) return 'completed'

  const completionMarkers = [
    '[TASK_COMPLETE]', '[DONE]', '[MISSION_COMPLETE]', '[COMPLETED]',
    'TASK_COMPLETE', 'MISSION_COMPLETE',
  ]
  const upper = trimmed.toUpperCase()
  for (const marker of completionMarkers) {
    if (upper.includes(marker)) return 'completed'
  }

  const waitingMarkers = [
    '[WAITING_FOR_INPUT]', '[NEEDS_INPUT]', '[QUESTION]',
    'APPROVAL_REQUIRED:',
  ]
  for (const marker of waitingMarkers) {
    if (upper.includes(marker.toUpperCase())) return 'waiting_for_input'
  }

  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean)
  const lastLine = lines[lines.length - 1] ?? ''
  if (/\?\s*$/.test(lastLine)) return 'waiting_for_input'
  if (trimmed.length < 60) return 'waiting_for_input'
  return 'completed'
}

export { TEMPLATE_DISPLAY_NAMES }
