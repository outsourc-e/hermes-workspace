import {
  dashboardFetch,
  HERMES_DASHBOARD_URL,
} from './gateway-capabilities'

export type DashboardSession = {
  id: string
  source?: string | null
  user_id?: string | null
  model?: string | null
  title?: string | null
  started_at?: number
  ended_at?: number | null
  end_reason?: string | null
  message_count?: number
  tool_call_count?: number
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  reasoning_tokens?: number
  parent_session_id?: string | null
  last_active?: number | null
  is_active?: boolean
  preview?: string | null
}

export type DashboardMessage = {
  id?: number | string
  session_id?: string
  role: string
  content: string | null
  tool_call_id?: string | null
  tool_calls?: Array<unknown> | string | null
  tool_name?: string | null
  timestamp?: number
  token_count?: number | null
  finish_reason?: string | null
  reasoning?: string | null
}

export type SessionSearchResponse = {
  results: Array<{
    session_id: string
    snippet: string
    role?: string | null
    source?: string | null
    model?: string | null
    session_started?: number | null
  }>
}

export type SkillInfo = {
  name: string
  description: string
  category?: string
  enabled: boolean
}

export type EnvVarInfo = {
  has_value?: boolean
  masked_value?: string | null
  set_in_env?: boolean
  set_in_file?: boolean
  is_set?: boolean
  redacted_value?: string | null
  description?: string
  url?: string | null
  category?: string
  is_password?: boolean
  tools?: string[]
  advanced?: boolean
}

export type CronJob = {
  id: string
  name?: string
  prompt: string
  schedule: { kind: string; expr: string; display: string }
  schedule_display?: string
  enabled: boolean
  state?: string
  deliver?: string
  last_run_at?: string | null
  next_run_at?: string | null
  last_error?: string | null
}

export type ToolsetInfo = {
  name: string
  label: string
  description: string
  enabled: boolean
  configured: boolean
  tools: string[]
}

export type DashboardStatus = {
  version: string
  hermes_home: string
  gateway_running?: boolean
  gateway_state?: string | null
  gateway_pid?: number | null
  gateway_health_url?: string | null
  active_sessions?: number
  [key: string]: unknown
}

async function dashboardJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await dashboardFetch(path, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Hermes dashboard ${path}: ${res.status} ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function listSessions(limit = 50, offset = 0): Promise<{
  sessions: DashboardSession[]
  total: number
  limit: number
  offset: number
}> {
  return dashboardJson(
    `/api/sessions?limit=${limit}&offset=${offset}`,
  )
}

export async function getSession(id: string): Promise<DashboardSession> {
  return dashboardJson(`/api/sessions/${encodeURIComponent(id)}`)
}

export async function getSessionMessages(id: string): Promise<{
  messages: DashboardMessage[]
  session_started?: number
  model?: string
}> {
  return dashboardJson(`/api/sessions/${encodeURIComponent(id)}/messages`)
}

export async function searchSessions(q: string): Promise<SessionSearchResponse> {
  return dashboardJson(`/api/sessions/search?q=${encodeURIComponent(q)}`)
}

export async function deleteSession(id: string): Promise<{ ok: boolean }> {
  return dashboardJson(`/api/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function getSkills(): Promise<SkillInfo[]> {
  return dashboardJson('/api/skills')
}

export async function toggleSkill(
  name: string,
  enabled: boolean,
): Promise<{ ok: boolean }> {
  return dashboardJson('/api/skills/toggle', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, enabled }),
  })
}

export async function getConfig(): Promise<Record<string, unknown>> {
  return dashboardJson('/api/config')
}

export async function getConfigSchema(): Promise<{
  fields: Record<string, unknown>
  category_order: string[]
}> {
  return dashboardJson('/api/config/schema')
}

export async function getConfigRaw(): Promise<{ yaml: string }> {
  return dashboardJson('/api/config/raw')
}

export async function saveConfig(
  config: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  return dashboardJson('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  })
}

export async function saveConfigRaw(
  yaml_text: string,
): Promise<{ ok: boolean }> {
  return dashboardJson('/api/config/raw', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ yaml_text }),
  })
}

export async function getEnvVars(): Promise<Record<string, EnvVarInfo>> {
  return dashboardJson('/api/env')
}

export async function setEnvVar(
  key: string,
  value: string,
): Promise<{ ok: boolean }> {
  return dashboardJson('/api/env', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
}

export async function deleteEnvVar(key: string): Promise<{ ok: boolean }> {
  return dashboardJson('/api/env', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  })
}

export async function getCronJobs(): Promise<CronJob[]> {
  return dashboardJson('/api/cron/jobs')
}

export async function createCronJob(job: {
  prompt: string
  schedule: string
  name?: string
  deliver?: string
}): Promise<CronJob> {
  return dashboardJson('/api/cron/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job),
  })
}

export async function pauseCronJob(id: string): Promise<CronJob> {
  return dashboardJson(`/api/cron/jobs/${encodeURIComponent(id)}/pause`, {
    method: 'POST',
  })
}

export async function resumeCronJob(id: string): Promise<CronJob> {
  return dashboardJson(`/api/cron/jobs/${encodeURIComponent(id)}/resume`, {
    method: 'POST',
  })
}

export async function triggerCronJob(id: string): Promise<CronJob> {
  return dashboardJson(`/api/cron/jobs/${encodeURIComponent(id)}/trigger`, {
    method: 'POST',
  })
}

export async function deleteCronJob(id: string): Promise<{ ok: boolean }> {
  return dashboardJson(`/api/cron/jobs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function getAnalytics(days = 7): Promise<Record<string, unknown>> {
  return dashboardJson(`/api/analytics/usage?days=${days}`)
}

export async function getModelInfo(): Promise<Record<string, unknown>> {
  return dashboardJson('/api/model/info')
}

export async function getToolsets(): Promise<ToolsetInfo[]> {
  return dashboardJson('/api/tools/toolsets')
}

export async function getOAuthProviders(): Promise<Record<string, unknown>> {
  return dashboardJson('/api/providers/oauth')
}

export async function getLogs(params: {
  file?: string
  lines?: number
  level?: string
  component?: string
}): Promise<Record<string, unknown>> {
  const search = new URLSearchParams()
  if (params.file) search.set('file', params.file)
  if (params.lines) search.set('lines', String(params.lines))
  if (params.level) search.set('level', params.level)
  if (params.component) search.set('component', params.component)
  const suffix = search.toString()
  return dashboardJson(`/api/logs${suffix ? `?${suffix}` : ''}`)
}

export async function getStatus(): Promise<DashboardStatus> {
  return dashboardJson('/api/status')
}

export { HERMES_DASHBOARD_URL }
