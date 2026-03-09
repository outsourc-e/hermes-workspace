export type WorkspaceStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'active'
  | 'paused'
  | 'done'
  | string

export type WorkspaceTask = {
  id: string
  mission_id?: string
  name: string
  description?: string
  status: WorkspaceStatus
  sort_order?: number
  depends_on: string[]
  agent_id?: string
}

export type WorkspaceMission = {
  id: string
  phase_id?: string
  name: string
  status: WorkspaceStatus
  progress?: number
  tasks: Array<WorkspaceTask>
}

export type WorkspacePhase = {
  id: string
  project_id?: string
  name: string
  sort_order?: number
  status?: WorkspaceStatus
  missions: Array<WorkspaceMission>
}

export type WorkspaceProject = {
  id: string
  name: string
  path?: string
  spec?: string
  auto_approve?: number
  max_concurrent?: number
  required_checks?: string
  allowed_tools?: string
  git_status?: WorkspaceProjectGitStatus
  status: WorkspaceStatus
  phases: Array<WorkspacePhase>
  phase_count: number
  mission_count: number
  task_count: number
}

export type WorkspaceProjectGitStatus = {
  branch?: string
  commit_hash?: string
  commit_message?: string
  commit_date?: string
}

export type WorkspaceAgent = {
  id: string
  name: string
  role?: string
  adapter_type?: string
  status: string
  assigned_projects?: string[]
}

export type WorkspaceTaskRun = {
  id: string
  task_id?: string
  task_name: string
  mission_id?: string
  mission_name?: string
  project_id?: string
  project_name?: string
  agent_id?: string
  agent_name?: string
  status: WorkspaceStatus
  attempt: number
  workspace_path?: string
  started_at?: string
  completed_at?: string
  error?: string
  input_tokens: number
  output_tokens: number
  cost_cents: number
}

export type WorkspaceRunEvent = {
  id: string
  task_run_id: string
  type: string
  data: Record<string, unknown> | null
  created_at: string
}

export type WorkspaceStats = {
  projects: number
  agentsOnline: number
  agentsTotal: number
  running: number
  queued: number
  paused: number
  checkpointsPending: number
  policyAlerts: number
  costToday: number
}

export type WorkspaceActivityEvent = {
  id: string
  type: string
  entity_type: string
  entity_id: string
  data: Record<string, unknown> | null
  timestamp: string
}

export type ProjectFormState = {
  name: string
  path: string
  spec: string
}

export type PhaseFormState = {
  name: string
}

export type MissionFormState = {
  name: string
}

export type TaskFormState = {
  name: string
  description: string
  dependsOn: string
}

export type DecomposedTaskDraft = {
  id: string
  name: string
  description: string
  estimated_minutes: number
  depends_on: string[]
  suggested_agent_type: string | null
}

export type DecomposeResponse = {
  tasks: DecomposedTaskDraft[]
  raw_response?: string
}

export type MissionLaunchState = {
  phase: WorkspacePhase
  goal: string
  step: 'input' | 'review'
  tasks: DecomposedTaskDraft[]
  rawResponse?: string
}

export type ReviewVerificationFilter = 'all' | 'verified' | 'missing'
export type ReviewRiskFilter = 'all' | 'high'

export type ProjectOverview = {
  project: WorkspaceProject
  phaseLabel: string
  missionLabel: string
  progress: number
  pendingCheckpointCount: number
  gates: Array<{
    label: string
    tone: 'neutral' | 'success' | 'warning' | 'accent'
  }>
  squad: Array<{
    label: string
    tone: string
  }>
  canResume: boolean
  resumeMissionId: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown
      return asRecord(parsed)
    } catch {
      return { message: value }
    }
  }

  return asRecord(value)
}

function getMissionCount(project: WorkspaceProject): number {
  return project.phases.reduce(
    (count, phase) => count + phase.missions.length,
    0,
  )
}

function getTaskCount(project: WorkspaceProject): number {
  return project.phases.reduce(
    (count, phase) =>
      count +
      phase.missions.reduce(
        (missionCount, mission) => missionCount + mission.tasks.length,
        0,
      ),
    0,
  )
}

export function normalizeStatus(value: unknown): WorkspaceStatus {
  return asString(value) ?? 'pending'
}

export function parseDependsOn(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : []
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }
  return []
}

export function normalizeTask(value: unknown): WorkspaceTask {
  const record = asRecord(value)
  return {
    id:
      asString(record?.id) ?? asString(record?.task_id) ?? crypto.randomUUID(),
    mission_id: asString(record?.mission_id),
    name: asString(record?.name) ?? asString(record?.title) ?? 'Untitled task',
    description: asString(record?.description),
    status: normalizeStatus(record?.status),
    sort_order: asNumber(record?.sort_order),
    depends_on: parseDependsOn(record?.depends_on),
    agent_id: asString(record?.agent_id),
  }
}

export function normalizeDecomposedTask(
  value: unknown,
  index: number,
): DecomposedTaskDraft {
  const record = asRecord(value)
  return {
    id: crypto.randomUUID(),
    name: asString(record?.name) ?? `Task ${index + 1}`,
    description:
      asString(record?.description) ??
      asString(record?.name) ??
      `Task ${index + 1}`,
    estimated_minutes: Math.max(1, asNumber(record?.estimated_minutes) ?? 30),
    depends_on: parseDependsOn(record?.depends_on),
    suggested_agent_type:
      typeof record?.suggested_agent_type === 'string'
        ? record.suggested_agent_type
        : null,
  }
}

export function extractDecomposeResponse(value: unknown): DecomposeResponse {
  const record = asRecord(value)
  return {
    tasks: asArray(record?.tasks).map(normalizeDecomposedTask),
    raw_response: asString(record?.raw_response),
  }
}

export function normalizeMission(value: unknown): WorkspaceMission {
  const record = asRecord(value)
  return {
    id:
      asString(record?.id) ??
      asString(record?.mission_id) ??
      crypto.randomUUID(),
    phase_id: asString(record?.phase_id),
    name: asString(record?.name) ?? 'Untitled mission',
    status: normalizeStatus(record?.status),
    progress: asNumber(record?.progress),
    tasks: asArray(record?.tasks).map(normalizeTask),
  }
}

export function normalizePhase(value: unknown): WorkspacePhase {
  const record = asRecord(value)
  return {
    id:
      asString(record?.id) ?? asString(record?.phase_id) ?? crypto.randomUUID(),
    project_id: asString(record?.project_id),
    name: asString(record?.name) ?? 'Untitled phase',
    sort_order: asNumber(record?.sort_order),
    status: normalizeStatus(record?.status),
    missions: asArray(record?.missions).map(normalizeMission),
  }
}

export function normalizeProject(value: unknown): WorkspaceProject {
  const record = asRecord(value)
  const phases = asArray(record?.phases).map(normalizePhase)
  const gitStatus = asRecord(record?.git_status)
  return {
    id:
      asString(record?.id) ??
      asString(record?.project_id) ??
      crypto.randomUUID(),
    name: asString(record?.name) ?? 'Untitled project',
    path: asString(record?.path),
    spec: asString(record?.spec),
    auto_approve: asNumber(record?.auto_approve),
    max_concurrent: asNumber(record?.max_concurrent),
    required_checks: asString(record?.required_checks),
    allowed_tools: asString(record?.allowed_tools),
    git_status: gitStatus
      ? {
          branch: asString(gitStatus.branch),
          commit_hash: asString(gitStatus.commit_hash),
          commit_message: asString(gitStatus.commit_message),
          commit_date: asString(gitStatus.commit_date),
        }
      : undefined,
    status: normalizeStatus(record?.status),
    phases,
    phase_count: asNumber(record?.phase_count) ?? phases.length,
    mission_count:
      asNumber(record?.mission_count) ??
      getMissionCount({ phases } as WorkspaceProject),
    task_count:
      asNumber(record?.task_count) ??
      getTaskCount({ phases } as WorkspaceProject),
  }
}

export function normalizeAgent(value: unknown): WorkspaceAgent {
  const record = asRecord(value)
  return {
    id: asString(record?.id) ?? crypto.randomUUID(),
    name: asString(record?.name) ?? 'Unnamed agent',
    role: asString(record?.role),
    adapter_type: asString(record?.adapter_type),
    status: asString(record?.status) ?? 'offline',
    assigned_projects: asArray(record?.assigned_projects).flatMap((item) =>
      typeof item === 'string' && item.trim().length > 0 ? [item] : [],
    ),
  }
}

export function normalizeTaskRun(value: unknown): WorkspaceTaskRun {
  const record = asRecord(value)
  return {
    id: asString(record?.id) ?? crypto.randomUUID(),
    task_id: asString(record?.task_id),
    task_name: asString(record?.task_name) ?? 'Untitled task',
    mission_id: asString(record?.mission_id),
    mission_name: asString(record?.mission_name),
    project_id: asString(record?.project_id),
    project_name: asString(record?.project_name),
    agent_id: asString(record?.agent_id),
    agent_name: asString(record?.agent_name),
    status: normalizeStatus(record?.status),
    attempt: Math.max(1, asNumber(record?.attempt) ?? 1),
    workspace_path: asString(record?.workspace_path),
    started_at: asString(record?.started_at),
    completed_at: asString(record?.completed_at),
    error: asString(record?.error),
    input_tokens: asNumber(record?.input_tokens) ?? 0,
    output_tokens: asNumber(record?.output_tokens) ?? 0,
    cost_cents: asNumber(record?.cost_cents) ?? 0,
  }
}

export function normalizeRunEvent(value: unknown): WorkspaceRunEvent {
  const record = asRecord(value)
  return {
    id: String(record?.id ?? crypto.randomUUID()),
    task_run_id: asString(record?.task_run_id) ?? '',
    type: asString(record?.type) ?? 'output',
    data: parseJsonRecord(record?.data),
    created_at: asString(record?.created_at) ?? new Date().toISOString(),
  }
}

export function normalizeStats(value: unknown): WorkspaceStats {
  const record = asRecord(value)
  return {
    projects: asNumber(record?.projects) ?? 0,
    agentsOnline: asNumber(record?.agentsOnline) ?? 0,
    agentsTotal: asNumber(record?.agentsTotal) ?? 0,
    running: asNumber(record?.running) ?? 0,
    queued: asNumber(record?.queued) ?? 0,
    paused: asNumber(record?.paused) ?? 0,
    checkpointsPending: asNumber(record?.checkpointsPending) ?? 0,
    policyAlerts: asNumber(record?.policyAlerts) ?? 0,
    costToday: asNumber(record?.costToday) ?? 0,
  }
}

export function normalizeActivityEvent(value: unknown): WorkspaceActivityEvent {
  const record = asRecord(value)
  return {
    id: String(record?.id ?? crypto.randomUUID()),
    type: asString(record?.type) ?? 'activity.unknown',
    entity_type: asString(record?.entity_type) ?? 'activity',
    entity_id: asString(record?.entity_id) ?? '',
    data: asRecord(record?.data),
    timestamp: asString(record?.timestamp) ?? new Date().toISOString(),
  }
}

export function extractProjects(payload: unknown): Array<WorkspaceProject> {
  if (Array.isArray(payload)) return payload.map(normalizeProject)

  const record = asRecord(payload)
  const candidates = [record?.projects, record?.data, record?.items]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeProject)
    }
  }

  return []
}

export function extractProject(payload: unknown): WorkspaceProject | null {
  if (Array.isArray(payload)) {
    return payload[0] ? normalizeProject(payload[0]) : null
  }

  const record = asRecord(payload)
  const projectValue = record?.project ?? record?.data ?? payload
  const projectRecord = asRecord(projectValue)
  return projectRecord ? normalizeProject(projectRecord) : null
}

export function extractTasks(payload: unknown): Array<WorkspaceTask> {
  if (Array.isArray(payload)) return payload.map(normalizeTask)

  const record = asRecord(payload)
  const candidates = [record?.tasks, record?.data, record?.items]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeTask)
    }
  }

  return []
}

export function extractAgents(payload: unknown): Array<WorkspaceAgent> {
  if (Array.isArray(payload)) return payload.map(normalizeAgent)

  const record = asRecord(payload)
  const candidates = [record?.agents, record?.data, record?.items]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeAgent)
    }
  }

  return []
}

export function extractTaskRuns(payload: unknown): Array<WorkspaceTaskRun> {
  if (Array.isArray(payload)) return payload.map(normalizeTaskRun)

  const record = asRecord(payload)
  const candidates = [
    record?.task_runs,
    record?.runs,
    record?.data,
    record?.items,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeTaskRun)
    }
  }

  return []
}

export function extractRunEvents(payload: unknown): Array<WorkspaceRunEvent> {
  if (Array.isArray(payload)) return payload.map(normalizeRunEvent)

  const record = asRecord(payload)
  const candidates = [
    record?.run_events,
    record?.events,
    record?.data,
    record?.items,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeRunEvent)
    }
  }

  return []
}

export function extractActivityEvents(
  payload: unknown,
): Array<WorkspaceActivityEvent> {
  if (Array.isArray(payload)) return payload.map(normalizeActivityEvent)

  const record = asRecord(payload)
  const candidates = [record?.events, record?.data, record?.items]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeActivityEvent)
    }
  }

  return []
}
