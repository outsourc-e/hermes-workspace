export type EntityStatus =
  | "active"
  | "pending"
  | "ready"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "blocked"
  | "approved"
  | "rejected"
  | "revised"
  | "stopped"
  | "idle";

export type TaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "blocked"
  | "stopped";

export type TaskRunStatus =
  | "pending"
  | "running"
  | "awaiting_review"
  | "completed"
  | "failed"
  | "paused"
  | "stopped";

export type CheckpointStatus = "pending" | "approved" | "rejected" | "revised";

export type RunEventType =
  | "started"
  | "output"
  | "tool_use"
  | "checkpoint"
  | "completed"
  | "error"
  | "status";

export type AgentAdapterType = "codex" | "claude" | "openclaw" | "ollama";

export interface Project {
  id: string;
  name: string;
  path: string | null;
  spec: string | null;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
}

export interface Phase {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  status: EntityStatus;
}

export interface Mission {
  id: string;
  phase_id: string;
  name: string;
  status: EntityStatus;
  progress: number;
}

export interface Task {
  id: string;
  mission_id: string;
  name: string;
  description: string | null;
  agent_id: string | null;
  status: TaskStatus;
  sort_order: number;
  depends_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRun {
  id: string;
  task_id: string;
  agent_id: string | null;
  status: TaskRunStatus;
  attempt: number;
  workspace_path: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
}

export interface RunEvent {
  id: number;
  task_run_id: string;
  type: RunEventType;
  data: string | null;
  created_at: string;
}

export interface Checkpoint {
  id: string;
  task_run_id: string;
  summary: string | null;
  diff_stat: string | null;
  status: CheckpointStatus;
  reviewer_notes: string | null;
  created_at: string;
}

export interface Artifact {
  id: string;
  checkpoint_id: string;
  type: string;
  path: string;
  created_at: string;
}

export interface AgentRecord {
  id: string;
  name: string;
  role: string;
  adapter_type: AgentAdapterType;
  adapter_config: string | null;
  model: string | null;
  status: EntityStatus;
  capabilities: string | null;
  created_at: string;
}

export interface ActivityLogEntry {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string;
  agent_id: string | null;
  details: string | null;
  created_at: string;
}

export interface ProjectDetail extends Project {
  phases: Array<
    Phase & {
      missions: Array<
        Mission & {
          tasks: Task[];
        }
      >;
    }
  >;
}

export interface TaskWithRelations extends Task {
  mission_name: string;
  phase_id: string;
  project_id: string;
  project_name: string;
}

export interface TaskRunWithRelations extends TaskRun {
  task_name: string;
  mission_id: string;
  project_id: string;
  agent_name: string | null;
}

export interface DiffStat {
  files_changed: number;
  insertions: number;
  deletions: number;
}

export interface WorkflowHooks {
  before_run?: string[];
  after_run?: string[];
  after_create?: string[];
}

export interface WorkflowConfig {
  pollIntervalMs: number;
  maxConcurrentAgents: number;
  workspaceRoot: string;
  autoApprove: boolean;
  defaultAdapter: AgentAdapterType;
  agentCommand?: string;
  agentArgs?: string[];
  env?: Record<string, string>;
  hooks: WorkflowHooks;
}

export interface WorkflowDefinition {
  config: Record<string, unknown>;
  promptTemplate: string;
}

export interface RetryEntry {
  taskId: string;
  identifier: string;
  attempt: number;
  dueAtMs: number;
  error: string | null;
}

export interface LiveSession {
  sessionId: string;
  threadId: string | null;
  turnId: string | null;
  processId: number | null;
  lastEvent: string | null;
  lastTimestamp: string | null;
  lastMessage: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  turnCount: number;
}

export interface RunningEntry {
  taskId: string;
  runId: string;
  attempt: number;
  workspacePath: string;
  agentId: string | null;
  startedAt: string;
  session: LiveSession | null;
}

export interface OrchestratorState {
  pollIntervalMs: number;
  maxConcurrentAgents: number;
  running: Map<string, RunningEntry>;
  claimed: Set<string>;
  retryAttempts: Map<string, RetryEntry>;
  completed: Set<string>;
}

export interface AdapterStreamEvent {
  type: RunEventType | "agent_message" | "turn.completed";
  message?: string;
  data?: Record<string, unknown>;
}

export interface AgentExecutionRequest {
  task: Task;
  taskRun: TaskRun;
  agent: AgentRecord;
  workspacePath: string;
  prompt: string;
}

export interface AgentExecutionResult {
  status: "completed" | "failed" | "stopped";
  summary: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  checkpointSummary?: string;
  diffStat?: DiffStat;
  error?: string;
}

export interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface CreateProjectInput {
  name: string;
  path?: string | null;
  spec?: string | null;
}

export interface CreateTaskInput {
  mission_id: string;
  name: string;
  description?: string | null;
  agent_id?: string | null;
  status?: TaskStatus;
  sort_order?: number;
  depends_on?: string[] | null;
}

export interface UpdateTaskInput {
  name?: string;
  description?: string | null;
  agent_id?: string | null;
  status?: TaskStatus;
  sort_order?: number;
  depends_on?: string[] | null;
}

export interface RegisterAgentInput {
  name: string;
  role?: string;
  adapter_type?: AgentAdapterType;
  adapter_config?: Record<string, unknown>;
  model?: string | null;
  capabilities?: Record<string, unknown>;
}
