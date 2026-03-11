export type EntityStatus =
  | 'active'
  | 'pending'
  | 'ready'
  | 'running'
  | 'online'
  | 'away'
  | 'offline'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'approved'
  | 'rejected'
  | 'revised'
  | 'stopped'
  | 'idle'

export type TaskStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'stopped'

export type TaskRunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_review'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'stopped'

export type CheckpointStatus = 'pending' | 'approved' | 'rejected' | 'revised'

export type RunEventType =
  | 'started'
  | 'output'
  | 'tool_use'
  | 'checkpoint'
  | 'completed'
  | 'error'
  | 'status'

export type AgentAdapterType = 'codex' | 'claude' | 'openclaw' | 'ollama'

export interface ProviderConcurrencyConfig {
  [adapterType: string]: number
}

export interface Project {
  id: string
  name: string
  path: string | null
  spec: string | null
  auto_approve: number
  max_concurrent: number
  required_checks: string
  allowed_tools: string
  status: EntityStatus
  created_at: string
  updated_at: string
}

export interface Phase {
  id: string
  project_id: string
  name: string
  sort_order: number
  status: EntityStatus
}

export interface Mission {
  id: string
  phase_id: string
  name: string
  status: EntityStatus
  progress: number
}

export interface MissionWithProjectContext extends Mission {
  project_id: string
  project_path: string | null
  project_spec: string | null
}

export interface MissionStatusTask {
  id: string
  name: string
  status: TaskStatus
  agent_id: string | null
  started_at: string | null
  completed_at: string | null
}

export interface MissionProgressEvent {
  mission_id: string
  progress: number
  completed_count: number
  total_count: number
}

export interface MissionStatus {
  mission: Pick<Mission, 'id' | 'name' | 'status' | 'progress'>
  task_breakdown: MissionStatusTask[]
  running_agents: string[]
  completed_count: number
  total_count: number
  estimated_completion: string | null
}

export interface Task {
  id: string
  mission_id: string
  name: string
  description: string | null
  agent_id: string | null
  suggested_agent_type?: AgentAdapterType | null
  status: TaskStatus
  sort_order: number
  depends_on: string | null
  wave?: number | null
  created_at: string
  updated_at: string
}

export interface TaskRun {
  id: string
  task_id: string
  agent_id: string | null
  status: TaskRunStatus
  attempt: number
  workspace_path: string | null
  session_id: string | null
  started_at: string | null
  completed_at: string | null
  error: string | null
  input_tokens: number
  output_tokens: number
  cost_cents: number
}

export interface RunEvent {
  id: number
  task_run_id: string
  type: RunEventType
  data: string | null
  created_at: string
}

export interface Checkpoint {
  id: string
  task_run_id: string
  summary: string | null
  diff_stat: string | null
  raw_diff?: string | null
  verification: string | null
  status: CheckpointStatus
  reviewer_notes: string | null
  commit_hash: string | null
  created_at: string
}

export interface Artifact {
  id: string
  checkpoint_id: string
  type: string
  path: string
  created_at: string
}

export interface AgentRecord {
  id: string
  name: string
  role: string
  adapter_type: AgentAdapterType
  adapter_config: string | null
  model: string | null
  status: EntityStatus
  avatar: string | null
  avatar_tone: 'accent' | 'green' | 'yellow' | 'primary' | null
  description: string | null
  system_prompt: string | null
  prompt_updated_at: string | null
  capabilities: string | null
  created_at: string
}

export interface Team {
  id: string
  name: string
  description: string | null
  permissions: string[]
  created_at: string
}

export interface AgentDirectoryCapabilities {
  repo_write: boolean
  shell_commands: boolean
  git_operations: boolean
  browser: boolean
  network: boolean
}

export interface AgentDirectoryLimits {
  max_tokens: number
  cost_label: string
  concurrency_limit: number
  memory_scope: string
}

export interface AgentDirectoryRecord {
  id: string
  name: string
  role: string
  adapter_type: AgentAdapterType
  model: string | null
  provider: string
  status: 'online' | 'away' | 'offline'
  avatar: string
  avatar_tone: 'accent' | 'green' | 'yellow' | 'primary'
  description: string
  system_prompt: string
  prompt_updated_at: string
  limits: AgentDirectoryLimits
  capabilities: AgentDirectoryCapabilities
  assigned_projects: string[]
  skills: string[]
}

export interface AgentDirectoryStats {
  agent_id: string
  runs_today: number
  tokens_today: number
  cost_cents_today: number
  success_rate: number
  avg_response_ms: number | null
}

export interface ActivityLogEntry {
  id: number
  action: string
  entity_type: string
  entity_id: string
  agent_id: string | null
  details: string | null
  created_at: string
}

export interface ActivityEvent {
  id: number | string
  type: string
  entity_type: string
  entity_id: string
  data: Record<string, unknown> | null
  timestamp: string
}

export interface AuditEventEntry {
  id: string
  type: 'audit'
  actor: string
  action: string
  entity_id: string
  entity_type: string
  meta: Record<string, unknown> | null
  created_at: string
}

export interface ProjectDetail extends Project {
  phases: Array<
    Phase & {
      missions: Array<
        Mission & {
          tasks: Task[]
        }
      >
    }
  >
}

export interface TaskWithRelations extends Task {
  mission_name: string
  mission_status?: EntityStatus
  phase_id: string
  project_id: string
  project_name: string
  project_path?: string | null
  agent_adapter_type?: AgentAdapterType | null
  resolved_adapter_type?: AgentAdapterType | null
}

export interface TaskRunWithRelations extends TaskRun {
  task_name: string
  mission_name: string
  mission_id: string
  project_id: string
  project_name: string
  agent_name: string | null
}

export interface DiffStat {
  files_changed: number
  insertions: number
  deletions: number
}

export interface WorkflowHooks {
  before_run?: string[]
  after_run?: string[]
  after_create?: string[]
}

export interface WorkspaceInfo {
  path: string
  createdNow: boolean
  hooks: WorkflowHooks
  git_worktree: boolean
}

export interface WorkflowConfig {
  pollIntervalMs: number
  maxConcurrentAgents: number
  workspaceRoot: string
  autoApprove: boolean
  defaultAdapter: AgentAdapterType
  agentCommand?: string
  agentArgs?: string[]
  env?: Record<string, string>
  hooks: WorkflowHooks
}

export interface WorkflowDefinition {
  config: Record<string, unknown>
  promptTemplate: string
}

export interface RetryEntry {
  taskId: string
  identifier: string
  attempt: number
  dueAtMs: number
  error: string | null
}

export interface LiveSession {
  sessionId: string
  threadId: string | null
  turnId: string | null
  processId: number | null
  lastEvent: string | null
  lastTimestamp: string | null
  lastMessage: string | null
  inputTokens: number
  outputTokens: number
  totalTokens: number
  turnCount: number
}

export interface RunningEntry {
  taskId: string
  runId: string
  attempt: number
  workspacePath: string
  agentId: string | null
  adapterType: AgentAdapterType | null
  startedAt: string
  session: LiveSession | null
}

export interface OrchestratorState {
  pollIntervalMs: number
  maxConcurrentAgents: number
  providerConcurrency: ProviderConcurrencyConfig
  running: Map<string, RunningEntry>
  claimed: Set<string>
  retryAttempts: Map<string, RetryEntry>
  completed: Set<string>
}

export interface AdapterStreamEvent {
  type: RunEventType | 'agent_message' | 'turn.completed'
  message?: string
  data?: Record<string, unknown>
}

export interface AgentExecutionRequest {
  task: Task
  taskRun: TaskRun
  agent: AgentRecord
  workspacePath: string
  projectName?: string
  prompt: string
}

export interface AgentExecutionResult {
  status: 'completed' | 'failed' | 'stopped'
  summary: string
  inputTokens: number
  outputTokens: number
  costCents: number
  checkpointSummary?: string
  diffStat?: DiffStat
  error?: string
}

export interface TaskRunOutcome {
  result: AgentExecutionResult
  workspacePath: string
  checkpoint: Checkpoint | null
  autoApproved: boolean
}

export interface SseEvent {
  event: string
  data: Record<string, unknown>
}

export interface CreateProjectInput {
  name: string
  path?: string | null
  spec?: string | null
  auto_approve?: number
  max_concurrent?: number
  required_checks?: string | null
  allowed_tools?: string | null
}

export interface CreatePhaseInput {
  project_id: string
  name: string
  sort_order?: number
}

export interface CreateMissionInput {
  phase_id: string
  name: string
}

export interface CreateTaskInput {
  mission_id: string
  name: string
  description?: string | null
  agent_id?: string | null
  status?: TaskStatus
  sort_order?: number
  depends_on?: string[] | null
}

export interface UpdateTaskInput {
  name?: string
  description?: string | null
  agent_id?: string | null
  status?: TaskStatus
  sort_order?: number
  depends_on?: string[] | null
}

export interface RegisterAgentInput {
  name: string
  role?: string
  adapter_type?: AgentAdapterType
  adapter_config?: Record<string, unknown>
  model?: string | null
  capabilities?: Record<string, unknown>
}

export interface UpdateAgentInput {
  status?: AgentRecord['status']
  system_prompt?: string | null
  model?: string | null
  description?: string | null
  name?: string
}

export interface CreateTeamInput {
  id?: string
  name: string
  description?: string | null
  permissions?: string[] | null
}

export interface DecomposerContext {
  project_path?: string | null
  project_spec?: string | null
  existing_files?: string[]
}

export interface DecomposedTask {
  name: string
  description: string
  estimated_minutes: number
  depends_on: string[]
  suggested_agent_type: AgentAdapterType | null
}

export interface DecomposeResult {
  tasks: DecomposedTask[]
  rawResponse: string
  parsed: boolean
}
