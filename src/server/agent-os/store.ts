import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type AgentOsTaskStatus = 'queued' | 'routed' | 'running' | 'retrying' | 'blocked' | 'failed' | 'completed' | 'awaiting_approval'
export type AgentOsPriority = 'critical' | 'high' | 'medium' | 'low'
export type AgentOsWorkflowMode = 'n8n' | 'hybrid' | 'agent'
export type AgentOsRisk = 'low' | 'medium' | 'high' | 'critical'

export interface AgentOsTask {
  id: string
  title: string
  description: string
  workflow_key: string
  workflow_name: string
  project: string | null
  payload: Record<string, unknown>
  status: AgentOsTaskStatus
  priority: AgentOsPriority
  route: 'n8n' | 'hermes' | 'openclaw' | 'manual'
  retry_count: number
  max_retries: number
  last_error: string | null
  sensitive: boolean
  approval_id: string | null
  queued_at: string
  started_at: string | null
  completed_at: string | null
  next_run_at: string | null
  n8n_workflow_id: string | null
  n8n_execution_id: string | null
  created_by: string
  updated_at: string
}

export interface WorkflowRegistryEntry {
  key: string
  name: string
  description: string
  mode: AgentOsWorkflowMode
  enabled: boolean
  route_default: 'n8n' | 'hermes' | 'openclaw' | 'manual'
  sensitive: boolean
  risk: AgentOsRisk
  n8n_workflow_id: string | null
  schedule: string | null
  tags: string[]
  owners: string[]
  created_at: string
  updated_at: string
}

export interface ExecutionLogEntry {
  id: string
  task_id: string
  workflow_key: string
  event: 'queued' | 'routed' | 'started' | 'heartbeat' | 'retrying' | 'approval_requested' | 'approval_resolved' | 'failed' | 'completed'
  status: AgentOsTaskStatus
  message: string
  meta: Record<string, unknown>
  created_at: string
}

export interface ApprovalRequest {
  id: string
  task_id: string
  workflow_key: string
  requested_action: string
  reason: string
  risk: AgentOsRisk
  status: 'pending' | 'approved' | 'denied'
  created_at: string
  decided_at: string | null
  decided_by: string | null
  note: string | null
}

interface AgentOsFile {
  tasks: AgentOsTask[]
  workflows: WorkflowRegistryEntry[]
  executions: ExecutionLogEntry[]
  approvals: ApprovalRequest[]
}

const HERMES_HOME = process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.hermes')
const DATA_DIR = path.join(HERMES_HOME, 'agent-os')
const STORE_FILE = path.join(DATA_DIR, 'store.json')

const PRIORITY_WORKFLOWS: Array<Pick<WorkflowRegistryEntry, 'key' | 'name' | 'description' | 'mode' | 'route_default' | 'sensitive' | 'risk' | 'schedule' | 'tags' | 'owners'>> = [
  {
    key: 'morning-briefing',
    name: 'Morning Briefing',
    description: 'Assemble and deliver the 8am daily briefing across active operating domains.',
    mode: 'hybrid',
    route_default: 'n8n',
    sensitive: false,
    risk: 'medium',
    schedule: '0 8 * * * America/Los_Angeles',
    tags: ['briefing', 'daily', 'priority'],
    owners: ['hermes', 'n8n'],
  },
  {
    key: 'calendar-scan-meeting-prep',
    name: 'Calendar Scan + Meeting Prep',
    description: 'Scan calendar, identify upcoming events, and create prep artifacts or blocks.',
    mode: 'hybrid',
    route_default: 'n8n',
    sensitive: false,
    risk: 'medium',
    schedule: '*/30 * * * * America/Los_Angeles',
    tags: ['calendar', 'meeting-prep'],
    owners: ['hermes', 'n8n'],
  },
  {
    key: 'inbox-triage',
    name: 'Inbox Triage',
    description: 'Fetch new messages, triage by rules, and escalate or summarize important items.',
    mode: 'hybrid',
    route_default: 'n8n',
    sensitive: false,
    risk: 'medium',
    schedule: '*/20 * * * * America/Los_Angeles',
    tags: ['gmail', 'triage'],
    owners: ['hermes', 'n8n'],
  },
  {
    key: 'job-pipeline',
    name: 'Job Pipeline',
    description: 'Aggregate jobs, enrich, score, queue, and hand off browser-heavy apply steps.',
    mode: 'hybrid',
    route_default: 'n8n',
    sensitive: false,
    risk: 'medium',
    schedule: '0 */2 * * * America/Los_Angeles',
    tags: ['jobs', 'pipeline'],
    owners: ['hermes', 'openclaw', 'n8n'],
  },
  {
    key: 'airbnb-host-automation',
    name: 'Airbnb Host Automation',
    description: 'Manage bookings, calendar handoffs, guest messages, and co-host coordination.',
    mode: 'hybrid',
    route_default: 'n8n',
    sensitive: true,
    risk: 'high',
    schedule: 'webhook-or-poll',
    tags: ['airbnb', 'hosting'],
    owners: ['hermes', 'openclaw', 'n8n'],
  },
  {
    key: 'shopify-monitoring',
    name: 'Shopify Monitoring',
    description: 'Monitor store health, checkout, anomalies, and send threshold-based alerts.',
    mode: 'hybrid',
    route_default: 'n8n',
    sensitive: false,
    risk: 'medium',
    schedule: '*/30 * * * * America/Los_Angeles',
    tags: ['shopify', 'monitoring'],
    owners: ['hermes', 'n8n'],
  },
  {
    key: 'rootly-prospect-research',
    name: 'Rootly Prospect Research',
    description: 'Gather prospect context, enrich with research, and prepare output packets.',
    mode: 'hybrid',
    route_default: 'n8n',
    sensitive: false,
    risk: 'medium',
    schedule: null,
    tags: ['rootly', 'research'],
    owners: ['hermes', 'openclaw', 'n8n'],
  },
]

function ensureStore(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(STORE_FILE)) {
    const now = new Date().toISOString()
    const workflows: WorkflowRegistryEntry[] = PRIORITY_WORKFLOWS.map((wf) => ({
      ...wf,
      enabled: true,
      n8n_workflow_id: null,
      created_at: now,
      updated_at: now,
    }))
    const initial: AgentOsFile = { tasks: [], workflows, executions: [], approvals: [] }
    fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2) + '\n', 'utf-8')
  }
}

function readStore(): AgentOsFile {
  ensureStore()
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as AgentOsFile
  } catch {
    ensureStore()
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as AgentOsFile
  }
}

function writeStore(data: AgentOsFile): void {
  ensureStore()
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function logEvent(store: AgentOsFile, entry: Omit<ExecutionLogEntry, 'id' | 'created_at'>): ExecutionLogEntry {
  const row: ExecutionLogEntry = {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    ...entry,
  }
  store.executions.push(row)
  return row
}

export function listAgentOsTasks(): AgentOsTask[] {
  return readStore().tasks.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export function listWorkflowRegistry(): WorkflowRegistryEntry[] {
  return readStore().workflows.sort((a, b) => a.name.localeCompare(b.name))
}

export function listExecutionLogs(limit = 200): ExecutionLogEntry[] {
  return readStore().executions.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
}

export function listApprovals(): ApprovalRequest[] {
  return readStore().approvals.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function getWorkflow(key: string): WorkflowRegistryEntry | null {
  return readStore().workflows.find((w) => w.key === key) ?? null
}

export function createAgentOsTask(input: {
  title: string
  description?: string
  workflow_key: string
  project?: string | null
  payload?: Record<string, unknown>
  priority?: AgentOsPriority
  created_by?: string
}): AgentOsTask {
  const store = readStore()
  const workflow = store.workflows.find((w) => w.key === input.workflow_key)
  if (!workflow) throw new Error(`Unknown workflow: ${input.workflow_key}`)
  const now = new Date().toISOString()
  const sensitive = workflow.sensitive
  const status: AgentOsTaskStatus = sensitive ? 'awaiting_approval' : 'queued'
  const route = workflow.route_default
  const approvalId = sensitive ? randomUUID() : null
  const task: AgentOsTask = {
    id: randomUUID(),
    title: input.title,
    description: input.description ?? '',
    workflow_key: workflow.key,
    workflow_name: workflow.name,
    project: input.project ?? null,
    payload: input.payload ?? {},
    status,
    priority: input.priority ?? 'medium',
    route,
    retry_count: 0,
    max_retries: 3,
    last_error: null,
    sensitive,
    approval_id: approvalId,
    queued_at: now,
    started_at: null,
    completed_at: null,
    next_run_at: null,
    n8n_workflow_id: workflow.n8n_workflow_id,
    n8n_execution_id: null,
    created_by: input.created_by ?? 'user',
    updated_at: now,
  }
  store.tasks.push(task)
  logEvent(store, {
    task_id: task.id,
    workflow_key: task.workflow_key,
    event: 'queued',
    status: task.status,
    message: sensitive ? 'Task queued and awaiting approval.' : 'Task queued.',
    meta: { route: task.route, priority: task.priority },
  })
  if (sensitive && approvalId) {
    store.approvals.push({
      id: approvalId,
      task_id: task.id,
      workflow_key: task.workflow_key,
      requested_action: task.title,
      reason: `Workflow ${workflow.name} is marked sensitive and requires approval before execution.`,
      risk: workflow.risk,
      status: 'pending',
      created_at: now,
      decided_at: null,
      decided_by: null,
      note: null,
    })
    logEvent(store, {
      task_id: task.id,
      workflow_key: task.workflow_key,
      event: 'approval_requested',
      status: 'awaiting_approval',
      message: 'Approval requested for sensitive task.',
      meta: { approval_id: approvalId },
    })
  }
  writeStore(store)
  return task
}

export function updateTaskStatus(taskId: string, status: AgentOsTaskStatus, message: string, meta: Record<string, unknown> = {}): AgentOsTask | null {
  const store = readStore()
  const task = store.tasks.find((t) => t.id === taskId)
  if (!task) return null
  task.status = status
  task.updated_at = new Date().toISOString()
  if (status === 'running' && !task.started_at) task.started_at = task.updated_at
  if (status === 'completed' || status === 'failed' || status === 'blocked') task.completed_at = task.updated_at
  logEvent(store, {
    task_id: task.id,
    workflow_key: task.workflow_key,
    event: status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : status === 'retrying' ? 'retrying' : status === 'running' ? 'started' : 'routed',
    status,
    message,
    meta,
  })
  writeStore(store)
  return task
}

export function routeTask(taskId: string, route: AgentOsTask['route'], meta: Record<string, unknown> = {}): AgentOsTask | null {
  const store = readStore()
  const task = store.tasks.find((t) => t.id === taskId)
  if (!task) return null
  task.route = route
  task.status = 'routed'
  task.updated_at = new Date().toISOString()
  logEvent(store, {
    task_id: task.id,
    workflow_key: task.workflow_key,
    event: 'routed',
    status: 'routed',
    message: `Task routed to ${route}.`,
    meta,
  })
  writeStore(store)
  return task
}

export function attachN8nExecution(taskId: string, executionId: string, workflowId?: string | null): AgentOsTask | null {
  const store = readStore()
  const task = store.tasks.find((t) => t.id === taskId)
  if (!task) return null
  task.n8n_execution_id = executionId
  if (workflowId) task.n8n_workflow_id = workflowId
  task.updated_at = new Date().toISOString()
  writeStore(store)
  return task
}

export function decideApproval(approvalId: string, decision: 'approved' | 'denied', decidedBy: string, note?: string | null): ApprovalRequest | null {
  const store = readStore()
  const approval = store.approvals.find((a) => a.id === approvalId)
  if (!approval) return null
  approval.status = decision
  approval.decided_at = new Date().toISOString()
  approval.decided_by = decidedBy
  approval.note = note ?? null
  const task = store.tasks.find((t) => t.id === approval.task_id)
  if (task) {
    task.status = decision === 'approved' ? 'queued' : 'blocked'
    task.updated_at = new Date().toISOString()
    logEvent(store, {
      task_id: task.id,
      workflow_key: task.workflow_key,
      event: 'approval_resolved',
      status: task.status,
      message: decision === 'approved' ? 'Approval granted, task returned to queue.' : 'Approval denied, task blocked.',
      meta: { approval_id: approvalId, decided_by: decidedBy, note: note ?? null },
    })
  }
  writeStore(store)
  return approval
}

export function upsertWorkflow(entry: Partial<WorkflowRegistryEntry> & Pick<WorkflowRegistryEntry, 'key' | 'name'>): WorkflowRegistryEntry {
  const store = readStore()
  const now = new Date().toISOString()
  const existing = store.workflows.find((w) => w.key === entry.key)
  if (existing) {
    Object.assign(existing, { ...entry, updated_at: now })
    writeStore(store)
    return existing
  }
  const created: WorkflowRegistryEntry = {
    key: entry.key,
    name: entry.name,
    description: entry.description ?? '',
    mode: entry.mode ?? 'n8n',
    enabled: entry.enabled ?? true,
    route_default: entry.route_default ?? 'n8n',
    sensitive: entry.sensitive ?? false,
    risk: entry.risk ?? 'medium',
    n8n_workflow_id: entry.n8n_workflow_id ?? null,
    schedule: entry.schedule ?? null,
    tags: entry.tags ?? [],
    owners: entry.owners ?? [],
    created_at: now,
    updated_at: now,
  }
  store.workflows.push(created)
  writeStore(store)
  return created
}

export function agentOsDashboard() {
  const store = readStore()
  const tasks = store.tasks
  const counts = {
    active_jobs: tasks.filter((t) => ['running', 'retrying', 'routed'].includes(t.status)).length,
    queued_jobs: tasks.filter((t) => t.status === 'queued').length,
    failed_jobs: tasks.filter((t) => t.status === 'failed').length,
    awaiting_approval: tasks.filter((t) => t.status === 'awaiting_approval').length,
  }
  const sortedLogs = [...store.executions].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const lastExecution = sortedLogs[0] ?? null
  const nextExecution = [...tasks]
    .filter((t) => t.next_run_at)
    .sort((a, b) => (a.next_run_at ?? '').localeCompare(b.next_run_at ?? ''))[0] ?? null
  return {
    counts,
    last_execution: lastExecution,
    next_execution: nextExecution,
    workflows: store.workflows,
    recent_tasks: [...tasks].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 20),
    approvals: store.approvals.filter((a) => a.status === 'pending'),
  }
}

export const AGENT_OS_PATHS = { DATA_DIR, STORE_FILE }
