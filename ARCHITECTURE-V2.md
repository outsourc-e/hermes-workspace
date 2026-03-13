# ClawSuite Architecture V2

**Author:** Aurora (Lead Architect)  
**Date:** 2026-03-10  
**Status:** Implementation-Ready

---

## Executive Summary

This document upgrades ClawSuite from fire-and-forget PTY Codex spawns to first-class OpenClaw session management. The key architectural shift: **every agent run becomes an OpenClaw session**, visible in the hub, steerable mid-run, with context persistence across follow-ups.

Current state: Working E2E flow with PTY Codex, smart agent routing, SSE live updates.  
Target state: ACP sessions for Codex/Claude, subagent sessions for aurora-qa/orchestrator, auto-QA pipeline, mission creation UI.

---

## 1. OpenClaw Integration Architecture

### 1.1 Session Type Decision Tree

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         WHICH SESSION TYPE?                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Is this a file-writing coding task?                                    │
│    YES → Does it need context persistence across follow-ups?            │
│           YES → ACP Session (acpx codex -s <session>)                   │
│           NO  → PTY Codex exec (fire-and-forget, legacy mode)           │
│                                                                         │
│  Is this a review, research, or multi-tool task?                        │
│    YES → Subagent Session (sessions_spawn runtime:"subagent")           │
│          Tools: read, write, exec, browser, web_search, memory          │
│                                                                         │
│  Is this an orchestration/coordination task?                            │
│    YES → Subagent Session (aurora-orchestrator role)                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 When to Use Each Type

| Use Case | Session Type | Why |
|----------|-------------|-----|
| UI implementation (aurora-coder) | ACP Session | Context persists for revisions |
| Backend implementation (aurora-daemon) | ACP Session | Context persists for revisions |
| Code review (aurora-qa) | Subagent Session | Needs browser, tsc, diff analysis |
| Task decomposition (aurora-planner) | Subagent Session | Reads files, searches codebase |
| Follow-up fix after rejection | ACP Session (same session) | Retains original context |
| New task, fresh context | ACP Session (new session) | Clean slate |

### 1.3 ACP Session Naming Convention

```
Pattern: cs-<agent>-<project>-<task_run_id_short>

Examples:
- cs-coder-clawsuite-a1b2c3d4
- cs-daemon-clawsuite-e5f6g7h8
- cs-qa-clawsuite-i9j0k1l2

Where:
- cs = ClawSuite prefix
- agent = coder|daemon|qa|planner|electron
- project = project slug (lowercase, alphanumeric)
- task_run_id_short = first 8 chars of task_run.id
```

### 1.4 Session Lifecycle Per Project

```
Task Created (status: pending)
    │
    ▼
Task Ready (status: ready, dependencies met)
    │
    ▼
Session Started ─────────────────────────────────────────┐
│  POST http://127.0.0.1:3333/sessions/spawn             │
│  {                                                      │
│    runtime: "acp",                                      │
│    label: "cs-coder-clawsuite-a1b2c3d4",               │
│    agent: { model: "gpt-5.4" },                        │
│    prompt: "<system_prompt>\n---\n<task_prompt>",      │
│    cwd: "/path/to/worktree"                            │
│  }                                                      │
└────────────────────────────────────────────────────────┘
    │
    ▼
Session Running (SSE stream to daemon, events to UI)
    │
    ├── On agent message delta → store in run_events
    ├── On token usage → update task_run metrics
    ├── On turn/completed → trigger checkpoint creation
    │
    ▼
Checkpoint Created (status: awaiting_review)
    │
    ├── aurora-qa auto-runs (subagent session)
    │
    ▼
Review Complete
    │
    ├── Approved → session killed, worktree merged
    ├── Rejected → session persists for follow-up
    └── Revision requested → new turn in SAME session
```

### 1.5 Upgrading OpenClawAdapter

**Current:** Posts to `/sessions/spawn`, reads SSE, no session ID tracking.

**Target:** Full session lifecycle management with ID persistence.

```typescript
// workspace-daemon/src/adapters/openclaw.ts

interface OpenClawSessionResponse {
  sessionId: string;        // Store in task_run.session_id
  status: 'running' | 'completed' | 'failed';
}

interface OpenClawSpawnRequest {
  runtime: 'acp' | 'subagent';
  label: string;            // Our session naming convention
  agent: {
    id: string;
    name: string;
    model: string;
  };
  prompt: string;
  cwd?: string;
  channel?: string;         // For completion notifications
}

export class OpenClawAdapter implements AgentAdapter {
  readonly type = "openclaw";

  async execute(request: AgentExecutionRequest, context: AgentAdapterContext): Promise<AgentExecutionResult> {
    const sessionLabel = this.buildSessionLabel(request);
    
    const spawnPayload: OpenClawSpawnRequest = {
      runtime: this.resolveRuntime(request.agent),  // 'acp' for codex/claude, 'subagent' for qa
      label: sessionLabel,
      agent: {
        id: request.agent.id,
        name: request.agent.name,
        model: request.agent.model,
      },
      prompt: this.buildContextualPrompt(request),
      cwd: request.workspacePath,
    };

    const response = await fetch(`${this.baseUrl}/sessions/spawn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spawnPayload),
      signal: context.signal,
    });

    // Extract session ID from first SSE event or response header
    const sessionId = response.headers.get('X-Session-Id');
    if (sessionId) {
      context.onEvent({ type: 'session_started', sessionId, label: sessionLabel });
    }

    // ... rest of SSE handling ...
  }

  private resolveRuntime(agent: AgentRecord): 'acp' | 'subagent' {
    // QA and Planner need full tool access (browser, search, memory)
    if (agent.id === 'aurora-qa' || agent.id === 'aurora-planner') {
      return 'subagent';
    }
    // Coders use ACP for context persistence
    return 'acp';
  }

  private buildSessionLabel(request: AgentExecutionRequest): string {
    const agentSlug = request.agent.id.replace('aurora-', '');
    const projectSlug = request.projectName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const runIdShort = request.taskRunId.slice(0, 8);
    return `cs-${agentSlug}-${projectSlug}-${runIdShort}`;
  }
}
```

### 1.6 Completion Notifications

Three options, in order of preference:

1. **SSE (current)** — Daemon already streams SSE, UI already polls. Keep this.

2. **System Events (for Aurora)** — Already implemented in `checkpoint-builder.ts`:
   ```typescript
   execFile('openclaw', ['system', 'event', '--text', message, '--mode', 'now']);
   ```

3. **Webhooks (for external integrations)** — Future: daemon exposes `/webhooks/checkpoint-ready`.

**Recommendation:** Keep SSE for UI, keep system events for Aurora notifications. Add webhook endpoint only when external integrations require it.

---

## 2. Subagent Session Design

### 2.1 Agent Definitions

| Agent | Runtime | Model | Tools | Create | Reuse | Kill |
|-------|---------|-------|-------|--------|-------|------|
| aurora-coder | acp | gpt-5.4 | read, write, exec | New task | Same task revisions | On approve/reject |
| aurora-daemon | acp | gpt-5.4 | read, write, exec | New task | Same task revisions | On approve/reject |
| aurora-qa | subagent | claude-sonnet-4-6 | read, exec, browser, web_search | Per checkpoint | Never (stateless) | On result |
| aurora-planner | subagent | gpt-5.4 | read, exec, web_search | Per decompose | Never (stateless) | On result |
| aurora-orchestrator | subagent | claude-sonnet-4-6 | read, exec, sessions_list, sessions_steer | Per project | Per project | On project complete |

### 2.2 Session Naming Convention

```
Pattern: cs-<role>-<scope>-<id>

aurora-coder:       cs-coder-<project>-<task_run_id_short>
aurora-daemon:      cs-daemon-<project>-<task_run_id_short>
aurora-qa:          cs-qa-<checkpoint_id>
aurora-planner:     cs-planner-<mission_id>
aurora-orchestrator: cs-orch-<project_id>
```

### 2.3 Tool Requirements by Role

**aurora-coder / aurora-daemon (ACP sessions):**
```yaml
tools:
  - read: Full file access in worktree
  - write: Full file access in worktree
  - exec: git, npm, npx tsc, etc.
constraints:
  - cwd locked to worktree path
  - No browser, no web_search (focused on implementation)
```

**aurora-qa (Subagent session):**
```yaml
tools:
  - read: Full file access (worktree + main repo)
  - exec: git diff, npx tsc, npm test
  - browser: Screenshot diffs (optional, future)
  - web_search: Look up deprecation warnings, API docs
prompt_suffix: |
  Return JSON: { approved: boolean, issues: string[], confidence: number, riskLevel: string }
```

**aurora-planner (Subagent session):**
```yaml
tools:
  - read: Full file access (understand codebase structure)
  - exec: tree, find, grep (codebase exploration)
  - web_search: Research libraries, patterns
prompt_suffix: |
  Return JSON array of tasks with: name, description, agent, files, depends_on, estimated_minutes
```

**aurora-orchestrator (Subagent session):**
```yaml
tools:
  - read: Project spec, agent status
  - exec: git status, daemon health checks
  - sessions_list: Monitor active coding sessions
  - sessions_steer: Intervene on stuck/failing sessions
lifecycle:
  - Created when project starts
  - Runs continuously, polling for stuck tasks
  - Killed when project marked complete
```

---

## 3. Auto-QA Pipeline

### 3.1 Trigger Flow

```
Checkpoint Created
    │
    ├── checkpoint_builder.ts calls notifyCheckpointReady()
    │
    ▼
Orchestrator Receives Event
    │
    ├── orchestrator.ts onCheckpointCreated(checkpointId)
    │
    ▼
QA Session Spawned
    │
    ├── sessions_spawn runtime:"subagent"
    │   label: cs-qa-<checkpoint_id>
    │   prompt: QA_SYSTEM_PROMPT + checkpoint_diff + verification_results
    │
    ▼
QA Analysis Runs
    │
    ├── tsc --noEmit (already captured in verification)
    ├── git diff analysis
    ├── Regression risk assessment
    │
    ▼
QA Result Returned
    │
    ├── JSON: { approved, issues[], confidence, riskLevel }
    │
    ▼
Result Stored in checkpoint.qa_result
    │
    ├── If approved && confidence >= 0.9 && riskLevel === 'low':
    │   └── Auto-approve checkpoint (no human review)
    ├── Else:
    │   └── Queue for human review with QA report attached
```

### 3.2 QA Result Schema

```typescript
// workspace-daemon/src/types.ts

interface QAResult {
  approved: boolean;
  issues: QAIssue[];
  confidence: number;      // 0.0 - 1.0
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  checkedAt: string;       // ISO timestamp
  sessionId: string | null; // QA session ID for traceability
}

interface QAIssue {
  severity: 'error' | 'warning' | 'info';
  category: 'typescript' | 'react' | 'api' | 'design' | 'regression' | 'security';
  file: string | null;
  line: number | null;
  message: string;
  suggestion: string | null;
}
```

### 3.3 Files to Modify

**workspace-daemon/src/orchestrator.ts:**
```typescript
// Add after checkpoint creation in dispatchTask()
private async triggerAutoQA(checkpointId: string, taskRun: TaskRun): Promise<void> {
  const checkpoint = this.tracker.getCheckpointDetail(checkpointId);
  if (!checkpoint) return;

  // Build QA prompt with diff, verification results, and context
  const qaPrompt = this.buildQAPrompt(checkpoint);

  // Spawn QA subagent
  const qaResult = await this.spawnQASession(checkpointId, qaPrompt);

  // Store result
  this.tracker.updateCheckpointQAResult(checkpointId, qaResult);

  // Auto-approve if confidence is high
  if (qaResult.approved && qaResult.confidence >= 0.9 && qaResult.riskLevel === 'low') {
    this.tracker.approveCheckpoint(checkpointId, 'Auto-approved by QA', checkpoint.commit_hash);
  }
}
```

**workspace-daemon/src/tracker.ts:**
```typescript
// Add method
updateCheckpointQAResult(checkpointId: string, result: QAResult): void {
  const stmt = this.db.prepare(`
    UPDATE checkpoints SET qa_result = ? WHERE id = ?
  `);
  stmt.run(JSON.stringify(result), checkpointId);
  this.emitSse({ type: 'checkpoint.qa_complete', checkpointId, result });
}
```

**workspace-daemon/src/checkpoint-builder.ts:**
```typescript
// Modify buildCheckpoint to return without auto-approve notification
// Let orchestrator handle the auto-QA flow

export async function buildCheckpoint(...): Promise<Checkpoint> {
  // ... existing logic ...
  
  // Remove notifyCheckpointReady() call here
  // Orchestrator will trigger QA, which will notify if needed
  
  return checkpoint;
}
```

**workspace-daemon/src/routes/checkpoints.ts:**
```typescript
// Add QA result to detail response
router.get("/:id", async (req, res) => {
  const detail = await buildCheckpointDetail(tracker, req.params.id);
  if (!detail) {
    res.status(404).json({ error: "Checkpoint not found" });
    return;
  }

  // Parse QA result if present
  const qaResult = detail.checkpoint.qa_result
    ? JSON.parse(detail.checkpoint.qa_result)
    : null;

  res.json({
    ...detail,
    qa_result: qaResult,
  });
});
```

**workspace-daemon/src/db/index.ts:**
```typescript
// Add migration
function ensureQAResultColumn(db: Database.Database): void {
  const columns = db.pragma('table_info(checkpoints)') as { name: string }[];
  if (!columns.some(col => col.name === 'qa_result')) {
    db.exec('ALTER TABLE checkpoints ADD COLUMN qa_result TEXT');
  }
}
```

---

## 4. Mission Creation UI Architecture

### 4.1 Component Tree

```
<WorkspaceLayout>
  │
  ├── <ProjectsScreen>
  │   ├── <ProjectList />
  │   └── <NewProjectModal />         ◄── NEW
  │       ├── Name input
  │       ├── Path picker (native dialog via IPC)
  │       ├── Spec textarea
  │       └── Settings (auto_approve, max_concurrent)
  │
  ├── <ProjectDetailScreen>
  │   ├── <PhaseList />
  │   ├── <MissionList />
  │   └── <NewMissionModal />         ◄── NEW
  │       ├── Mission name input
  │       ├── Goal description textarea
  │       ├── Decompose button → calls /api/decompose
  │       ├── <DecomposedTaskList />  ◄── NEW
  │       │   ├── Reorderable task cards
  │       │   ├── Agent badge per task (editable)
  │       │   ├── Estimated time display
  │       │   └── Dependency arrows
  │       ├── Execution mode: sequential | parallel
  │       └── Start Mission button
```

### 4.2 New Project Modal

**File:** `src/screens/projects/new-project-modal.tsx`

```typescript
interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export function NewProjectModal({ isOpen, onClose, onCreated }: NewProjectModalProps) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [spec, setSpec] = useState('');
  const [autoApprove, setAutoApprove] = useState(false);
  const [maxConcurrent, setMaxConcurrent] = useState(2);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await workspaceRequestJson('/projects', {
        method: 'POST',
        body: JSON.stringify({ name, path, spec, auto_approve: autoApprove, max_concurrent: maxConcurrent }),
      });
      return res as Project;
    },
    onSuccess: (project) => {
      onCreated(project);
      onClose();
    },
  });

  const handlePickPath = async () => {
    // IPC to Electron for native folder picker
    const result = await window.electronBridge?.dialog?.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (result?.filePaths?.[0]) {
      setPath(result.filePaths[0]);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-2">
            <Input label="Path" value={path} onChange={(e) => setPath(e.target.value)} className="flex-1" />
            <Button onClick={handlePickPath}>Browse</Button>
          </div>
          <Textarea label="Spec (optional)" value={spec} onChange={(e) => setSpec(e.target.value)} rows={4} />
          <div className="flex items-center justify-between">
            <label>Auto-approve low-risk checkpoints</label>
            <Switch checked={autoApprove} onCheckedChange={setAutoApprove} />
          </div>
          <Input
            label="Max concurrent agents"
            type="number"
            min={1}
            max={8}
            value={maxConcurrent}
            onChange={(e) => setMaxConcurrent(Number(e.target.value))}
          />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>
            Create Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 4.3 New Mission Modal with Decomposition

**File:** `src/screens/missions/new-mission-modal.tsx`

```typescript
interface NewMissionModalProps {
  isOpen: boolean;
  phaseId: string;
  projectPath: string | null;
  projectSpec: string | null;
  onClose: () => void;
  onCreated: (mission: Mission) => void;
}

interface DecomposedTask {
  name: string;
  description: string;
  estimated_minutes: number;
  depends_on: string[];
  suggested_agent_type: string | null;
}

export function NewMissionModal(props: NewMissionModalProps) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [tasks, setTasks] = useState<DecomposedTask[]>([]);
  const [executionMode, setExecutionMode] = useState<'sequential' | 'parallel'>('sequential');
  const [isDecomposing, setIsDecomposing] = useState(false);

  const decomposeMutation = useMutation({
    mutationFn: async () => {
      const res = await workspaceRequestJson('/decompose', {
        method: 'POST',
        body: JSON.stringify({
          goal,
          context: {
            project_path: props.projectPath,
            project_spec: props.projectSpec,
          },
        }),
      });
      return res as { tasks: DecomposedTask[] };
    },
    onSuccess: (data) => {
      setTasks(data.tasks);
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      // 1. Create mission
      const mission = await workspaceRequestJson('/missions', {
        method: 'POST',
        body: JSON.stringify({ phase_id: props.phaseId, name }),
      }) as Mission;

      // 2. Create tasks from decomposed list
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        await workspaceRequestJson('/tasks', {
          method: 'POST',
          body: JSON.stringify({
            mission_id: mission.id,
            name: task.name,
            description: task.description,
            sort_order: i,
            suggested_agent_type: task.suggested_agent_type,
            depends_on: task.depends_on,
          }),
        });
      }

      return mission;
    },
    onSuccess: (mission) => {
      props.onCreated(mission);
      props.onClose();
    },
  });

  const handleReorderTask = (fromIndex: number, toIndex: number) => {
    const newTasks = [...tasks];
    const [removed] = newTasks.splice(fromIndex, 1);
    newTasks.splice(toIndex, 0, removed);
    setTasks(newTasks);
  };

  const handleChangeAgent = (index: number, agentType: string | null) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], suggested_agent_type: agentType };
    setTasks(newTasks);
  };

  return (
    <Dialog open={props.isOpen} onOpenChange={props.onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Mission</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input label="Mission Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea
            label="Goal"
            placeholder="Describe what you want to accomplish..."
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
          />
          <Button
            onClick={() => decomposeMutation.mutate()}
            disabled={!goal.trim() || decomposeMutation.isPending}
          >
            {decomposeMutation.isPending ? 'Decomposing...' : 'Decompose into Tasks'}
          </Button>

          {tasks.length > 0 && (
            <>
              <div className="border rounded-lg p-4 space-y-2">
                <h4 className="font-medium">Tasks ({tasks.length})</h4>
                <DecomposedTaskList
                  tasks={tasks}
                  onReorder={handleReorderTask}
                  onChangeAgent={handleChangeAgent}
                />
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm text-primary-600">Execution:</span>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={executionMode === 'sequential'}
                    onChange={() => setExecutionMode('sequential')}
                  />
                  Sequential
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={executionMode === 'parallel'}
                    onChange={() => setExecutionMode('parallel')}
                  />
                  Parallel (respect dependencies)
                </label>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={props.onClose}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || tasks.length === 0 || createMutation.isPending}
          >
            Create & Start Mission
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 4.4 Decomposed Task List Component

**File:** `src/components/decomposed-task-list.tsx`

```typescript
interface DecomposedTaskListProps {
  tasks: DecomposedTask[];
  onReorder: (from: number, to: number) => void;
  onChangeAgent: (index: number, agentType: string | null) => void;
}

const AGENT_OPTIONS = [
  { value: 'codex', label: 'Codex', avatar: '🎨', role: 'aurora-coder' },
  { value: 'codex', label: 'Codex', avatar: '⚙️', role: 'aurora-daemon' },
  { value: 'claude', label: 'Claude', avatar: '🔍', role: 'aurora-qa' },
  { value: 'claude', label: 'Claude', avatar: '📋', role: 'aurora-planner' },
];

export function DecomposedTaskList({ tasks, onReorder, onChangeAgent }: DecomposedTaskListProps) {
  return (
    <Reorder.Group values={tasks} onReorder={(newOrder) => {
      // Calculate indices and call onReorder
    }}>
      {tasks.map((task, index) => (
        <Reorder.Item key={task.name} value={task}>
          <div className="flex items-center gap-3 p-3 bg-white border rounded-lg mb-2">
            <GripVertical className="text-primary-400 cursor-grab" />
            <div className="flex-1">
              <div className="font-medium">{task.name}</div>
              <div className="text-sm text-primary-600">{task.description}</div>
              {task.depends_on.length > 0 && (
                <div className="text-xs text-primary-500 mt-1">
                  Depends on: {task.depends_on.join(', ')}
                </div>
              )}
            </div>
            <div className="text-sm text-primary-500">
              ~{task.estimated_minutes}m
            </div>
            <AgentBadgeSelector
              value={task.suggested_agent_type}
              onChange={(type) => onChangeAgent(index, type)}
            />
          </div>
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}
```

### 4.5 Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/screens/projects/new-project-modal.tsx` | CREATE | Project creation with path picker |
| `src/screens/projects/projects-screen.tsx` | MODIFY | Add "New Project" button + modal |
| `src/screens/missions/new-mission-modal.tsx` | CREATE | Mission creation with decomposition |
| `src/screens/missions/missions-screen.tsx` | MODIFY | Add "New Mission" button + modal |
| `src/components/decomposed-task-list.tsx` | CREATE | Reorderable task list with agent badges |
| `src/components/agent-badge-selector.tsx` | CREATE | Dropdown to select agent for task |
| `workspace-daemon/src/routes/projects.ts` | MODIFY | Add POST / endpoint for project creation |
| `electron/preload.ts` | MODIFY | Expose dialog.showOpenDialog to renderer |

---

## 5. Context Injection Evolution

### 5.1 Current State

```typescript
// From AGENTS.md - current injection
const systemPrompt = agent.system_prompt;
const gitLog = `git log --oneline -5`;
const prompt = `${systemPrompt}\n\n---\n\nRecent commits:\n${gitLog}\n\nTask: ${taskDescription}`;
```

### 5.2 Enhanced Context Injection

```typescript
// workspace-daemon/src/context-builder.ts (NEW FILE)

interface ContextInjectionConfig {
  agent: AgentRecord;
  project: Project;
  task: Task;
  taskRun: TaskRun;
  previousRuns?: TaskRun[];   // For context across retries
  qaResults?: QAResult[];     // From previous checkpoints in mission
}

export class ContextBuilder {
  async buildPrompt(config: ContextInjectionConfig): Promise<string> {
    const sections: string[] = [];

    // 1. Agent system prompt (always first)
    sections.push('# Agent Identity\n' + config.agent.system_prompt);

    // 2. Project context (spec, structure)
    if (config.project.spec) {
      sections.push('# Project Specification\n' + config.project.spec);
    }

    // 3. Git state (recent commits, current branch)
    const gitContext = await this.getGitContext(config.project.path);
    sections.push('# Git State\n' + gitContext);

    // 4. Relevant file contents (based on task keywords)
    const relevantFiles = await this.getRelevantFiles(config);
    if (relevantFiles) {
      sections.push('# Relevant Files\n' + relevantFiles);
    }

    // 5. Previous QA feedback (if this is a revision)
    if (config.qaResults?.length) {
      const lastQA = config.qaResults[config.qaResults.length - 1];
      if (!lastQA.approved) {
        sections.push('# Previous QA Feedback\n' + this.formatQAFeedback(lastQA));
      }
    }

    // 6. Previous run output (if retry)
    if (config.previousRuns?.length) {
      const lastRun = config.previousRuns[config.previousRuns.length - 1];
      if (lastRun.status === 'failed') {
        sections.push('# Previous Attempt Failed\n' + lastRun.error);
      }
    }

    // 7. Task description (always last)
    sections.push('# Task\n' + config.task.description);

    return sections.join('\n\n---\n\n');
  }

  private async getGitContext(projectPath: string | null): Promise<string> {
    if (!projectPath) return 'No git repository configured.';

    const [branch, log, status] = await Promise.all([
      this.exec('git branch --show-current', projectPath),
      this.exec('git log --oneline -5', projectPath),
      this.exec('git status --short', projectPath),
    ]);

    return [
      `Branch: ${branch}`,
      '',
      'Recent commits:',
      log,
      '',
      'Uncommitted changes:',
      status || '(clean)',
    ].join('\n');
  }

  private async getRelevantFiles(config: ContextInjectionConfig): Promise<string | null> {
    // Parse task description for file references
    const filePatterns = this.extractFilePatterns(config.task.description);
    if (!filePatterns.length) return null;

    // Read up to 3 relevant files, max 500 lines each
    const files: string[] = [];
    for (const pattern of filePatterns.slice(0, 3)) {
      const content = await this.readFile(config.project.path, pattern, 500);
      if (content) {
        files.push(`## ${pattern}\n\`\`\`\n${content}\n\`\`\``);
      }
    }

    return files.join('\n\n');
  }
}
```

### 5.3 Per-Agent-Type Context Rules

| Agent | Git Log | File Contents | QA History | Project Spec | Previous Errors |
|-------|---------|---------------|------------|--------------|-----------------|
| aurora-coder | ✓ 5 | ✓ 3 files | ✓ | ✓ | ✓ |
| aurora-daemon | ✓ 5 | ✓ 3 files | ✓ | ✓ | ✓ |
| aurora-qa | ✓ 1 | ✓ diff only | ✗ | ✗ | ✗ |
| aurora-planner | ✗ | ✓ tree output | ✗ | ✓ | ✗ |

### 5.4 Token Budget Management

```typescript
// workspace-daemon/src/context-builder.ts

const TOKEN_BUDGETS: Record<string, number> = {
  'aurora-coder': 150_000,    // Leave 50k for response
  'aurora-daemon': 150_000,
  'aurora-qa': 80_000,        // QA prompts are smaller
  'aurora-planner': 100_000,
};

private truncateToTokenBudget(content: string, agentId: string): string {
  const budget = TOKEN_BUDGETS[agentId] ?? 100_000;
  // Rough estimate: 4 chars = 1 token
  const charBudget = budget * 4;
  
  if (content.length <= charBudget) return content;
  
  // Truncate from the middle (keep start and end)
  const keepChars = Math.floor(charBudget / 2);
  return content.slice(0, keepChars) + 
    '\n\n... [truncated for token budget] ...\n\n' +
    content.slice(-keepChars);
}
```

### 5.5 Project-Level Memory

**Future enhancement:** Per-project memory file that persists across sessions.

```
clawsuite/.clawsuite/
├── memory.md          # Project-level learnings
├── agents/
│   ├── coder.md       # aurora-coder learnings for this project
│   └── daemon.md      # aurora-daemon learnings
└── qa-history.json    # Last 10 QA results for pattern detection
```

---

## 6. Prioritized Implementation Roadmap

### Phase 1: Mission Creation UI (High Impact, Unblocks All Work)

| # | Title | Files | What | Deps | Size | Agent |
|---|-------|-------|------|------|------|-------|
| 1.1 | Project Creation Modal | `src/screens/projects/new-project-modal.tsx`, `projects-screen.tsx`, `workspace-daemon/src/routes/projects.ts` | New Project button + modal with path picker | None | M | aurora-coder + aurora-daemon |
| 1.2 | Mission Creation Modal | `src/screens/missions/new-mission-modal.tsx`, `missions-screen.tsx` | New Mission button + modal with goal input | 1.1 | M | aurora-coder |
| 1.3 | Decompose Integration | `new-mission-modal.tsx` | Call /decompose, display task list | 1.2 | S | aurora-coder |
| 1.4 | Reorderable Task List | `src/components/decomposed-task-list.tsx`, `agent-badge-selector.tsx` | Drag-to-reorder, agent selection | 1.3 | M | aurora-coder |
| 1.5 | Create Tasks on Submit | `new-mission-modal.tsx`, `workspace-daemon/src/routes/tasks.ts` | POST tasks with sort_order and depends_on | 1.4 | S | aurora-coder + aurora-daemon |

### Phase 2: OpenClaw Session Upgrade (Core Infrastructure)

| # | Title | Files | What | Deps | Size | Agent |
|---|-------|-------|------|------|------|-------|
| 2.1 | Session ID Tracking | `workspace-daemon/src/adapters/openclaw.ts`, `tracker.ts`, `types.ts` | Store sessionId in task_run, emit on start | None | M | aurora-daemon |
| 2.2 | ACP Runtime Switch | `adapters/openclaw.ts` | Set runtime:'acp' for coder/daemon, 'subagent' for qa | 2.1 | S | aurora-daemon |
| 2.3 | Session Naming | `adapters/openclaw.ts` | Implement cs-<agent>-<project>-<runid> pattern | 2.2 | S | aurora-daemon |
| 2.4 | Context Builder | `workspace-daemon/src/context-builder.ts` | New file: build prompts with git, files, QA history | None | L | aurora-daemon |
| 2.5 | Integrate Context Builder | `agent-runner.ts`, `adapters/*.ts` | Use ContextBuilder for all agent prompts | 2.4 | M | aurora-daemon |

### Phase 3: Auto-QA Pipeline (Quality Gate)

| # | Title | Files | What | Deps | Size | Agent |
|---|-------|-------|------|------|------|-------|
| 3.1 | QA Result Schema | `types.ts`, `db/index.ts` | Add QAResult type, qa_result column to checkpoints | None | S | aurora-daemon |
| 3.2 | Spawn QA Session | `orchestrator.ts`, `adapters/openclaw.ts` | triggerAutoQA() after checkpoint creation | 3.1, 2.2 | M | aurora-daemon |
| 3.3 | Parse QA Response | `orchestrator.ts` | Extract JSON from QA session, store in DB | 3.2 | S | aurora-daemon |
| 3.4 | Auto-Approve Logic | `orchestrator.ts`, `tracker.ts` | Auto-approve if confidence >= 0.9 && riskLevel === 'low' | 3.3 | S | aurora-daemon |
| 3.5 | QA Result in UI | `src/screens/review/checkpoint-detail.tsx` | Display QA report, issues, confidence | 3.1 | M | aurora-coder |

### Phase 4: Checkpoint Diff Persistence (Fix Approve Bug)

| # | Title | Files | What | Deps | Size | Agent |
|---|-------|-------|------|------|------|-------|
| 4.1 | Store Full Diff | `checkpoint-builder.ts`, `db/index.ts` | Save git diff to checkpoint.full_diff column | None | S | aurora-daemon |
| 4.2 | Diff from DB | `routes/checkpoints.ts` | Return stored diff when worktree is gone | 4.1 | S | aurora-daemon |
| 4.3 | Approve from Stored Diff | `routes/checkpoints.ts` | Apply stored diff to main branch on approve | 4.2 | M | aurora-daemon |

### Phase 5: Daemon Connection Banner (Polish)

| # | Title | Files | What | Deps | Size | Agent |
|---|-------|-------|------|------|------|-------|
| 5.1 | Connection Status Hook | `src/hooks/use-daemon-status.ts` | Poll /health, track connected state | None | S | aurora-coder |
| 5.2 | Connection Banner | `src/components/daemon-connection-banner.tsx` | Show banner when daemon is down | 5.1 | S | aurora-coder |
| 5.3 | Integrate Banner | `workspace-shell.tsx` | Add banner at top of workspace layout | 5.2 | S | aurora-coder |

### Phase 6: Teams Approval Tiers (Future)

| # | Title | Files | What | Deps | Size | Agent |
|---|-------|-------|------|------|------|-------|
| 6.1 | Approval Tiers Schema | `types.ts`, `db/index.ts` | Add approval_tier to teams, projects | None | S | aurora-daemon |
| 6.2 | Tier-Based Auto-Approve | `orchestrator.ts` | Check team tier before auto-approving | 6.1 | M | aurora-daemon |
| 6.3 | Approval Queue Routing | `routes/checkpoints.ts` | Route checkpoints to correct approver | 6.2 | M | aurora-daemon |

---

## Summary

This architecture upgrades ClawSuite from fire-and-forget PTY spawns to a proper OpenClaw-integrated system with:

1. **ACP sessions** for coding agents (context persists across revisions)
2. **Subagent sessions** for QA/planning (full tool access)
3. **Auto-QA pipeline** (catch issues before human review)
4. **Mission creation UI** (unblock all work from the UI)
5. **Context injection** (smarter prompts with git, files, history)

Implementation order prioritizes the **Mission Creation UI** (highest user impact) followed by **OpenClaw session upgrades** (infrastructure) and **Auto-QA** (quality).

Total estimated effort: ~40 engineering hours across 6 phases.
