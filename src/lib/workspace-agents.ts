import { workspaceRequestJson } from '@/lib/workspace-checkpoints'

export type WorkspaceAgentDirectory = {
  id: string
  name: string
  role: string
  adapter_type: string
  model: string | null
  provider: string
  status: 'online' | 'away' | 'offline'
  avatar: string
  avatar_tone: 'accent' | 'green' | 'yellow' | 'primary'
  description: string
  system_prompt: string
  prompt_updated_at: string
  limits: {
    max_tokens: number
    cost_label: string
    concurrency_limit: number
    memory_scope: string
  }
  capabilities: {
    repo_write: boolean
    shell_commands: boolean
    git_operations: boolean
    browser: boolean
    network: boolean
  }
  assigned_projects: Array<string>
  skills: Array<string>
}

export type WorkspaceAgentStats = {
  agent_id: string
  runs_today: number
  tokens_today: number
  cost_cents_today: number
  success_rate: number
  avg_response_ms: number | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function asStringArray(value: unknown): Array<string> {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function normalizeAgent(value: unknown): WorkspaceAgentDirectory | null {
  const record = asRecord(value)
  const limits = asRecord(record?.limits)
  const capabilities = asRecord(record?.capabilities)
  const status = asString(record?.status)
  const avatarTone = asString(record?.avatar_tone)

  const id = asString(record?.id)
  const name = asString(record?.name)
  const role = asString(record?.role)
  const adapterType = asString(record?.adapter_type)

  if (!id || !name || !role || !adapterType) return null

  return {
    id,
    name,
    role,
    adapter_type: adapterType,
    model: asString(record?.model),
    provider: asString(record?.provider) ?? 'Unknown',
    status:
      status === 'online' || status === 'away' || status === 'offline'
        ? status
        : 'offline',
    avatar: asString(record?.avatar) ?? '🤖',
    avatar_tone:
      avatarTone === 'accent' ||
      avatarTone === 'green' ||
      avatarTone === 'yellow' ||
      avatarTone === 'primary'
        ? avatarTone
        : 'primary',
    description: asString(record?.description) ?? '',
    system_prompt: asString(record?.system_prompt) ?? '',
    prompt_updated_at: asString(record?.prompt_updated_at) ?? new Date().toISOString(),
    limits: {
      max_tokens: asNumber(limits?.max_tokens),
      cost_label: asString(limits?.cost_label) ?? 'Unknown',
      concurrency_limit: asNumber(limits?.concurrency_limit),
      memory_scope: asString(limits?.memory_scope) ?? 'Unknown',
    },
    capabilities: {
      repo_write: asBoolean(capabilities?.repo_write),
      shell_commands: asBoolean(capabilities?.shell_commands),
      git_operations: asBoolean(capabilities?.git_operations),
      browser: asBoolean(capabilities?.browser),
      network: asBoolean(capabilities?.network),
    },
    assigned_projects: asStringArray(record?.assigned_projects),
    skills: asStringArray(record?.skills),
  }
}

export function extractWorkspaceAgents(payload: unknown): Array<WorkspaceAgentDirectory> {
  if (Array.isArray(payload)) {
    return payload.map(normalizeAgent).filter((value): value is WorkspaceAgentDirectory => Boolean(value))
  }

  const record = asRecord(payload)
  const candidates = [record?.agents, record?.data, record?.items]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map(normalizeAgent)
        .filter((value): value is WorkspaceAgentDirectory => Boolean(value))
    }
  }
  return []
}

export function normalizeWorkspaceAgentStats(payload: unknown): WorkspaceAgentStats {
  const record = asRecord(payload)
  const stats = asRecord(record?.stats) ?? record
  return {
    agent_id: asString(stats?.agent_id) ?? '',
    runs_today: asNumber(stats?.runs_today),
    tokens_today: asNumber(stats?.tokens_today),
    cost_cents_today: asNumber(stats?.cost_cents_today),
    success_rate: asNumber(stats?.success_rate),
    avg_response_ms:
      typeof stats?.avg_response_ms === 'number' && Number.isFinite(stats.avg_response_ms)
        ? stats.avg_response_ms
        : null,
  }
}

export async function listWorkspaceAgents(): Promise<Array<WorkspaceAgentDirectory>> {
  const payload = await workspaceRequestJson('/api/workspace/agents')
  return extractWorkspaceAgents(payload)
}

export async function getWorkspaceAgentStats(
  agentId: string,
): Promise<WorkspaceAgentStats> {
  const payload = await workspaceRequestJson(
    `/api/workspace/agents?stats_for=${encodeURIComponent(agentId)}`,
  )
  return normalizeWorkspaceAgentStats(payload)
}
