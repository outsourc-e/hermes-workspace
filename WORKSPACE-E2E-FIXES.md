# Workspace E2E Critical Fixes

_Branch: `feat/ux-polish-v3-handshake` — 204 commits ahead_
_tsc: clean_

## Context from E2E test
- Project create ✅, decompose ✅, phase/mission auto-create ✅, worktree ✅
- Task run stuck as "running" for 5min then failed — claude process exited but adapter didn't settle
- Wrong agent selected — file creation task routed to aurora-qa (claude) instead of aurora-coder (codex)
- Decomposer SDK not available because ANTHROPIC_API_KEY not in env
- Notifications DO work (got ❌ failure alert)

---

## Task 1: Fix Claude Adapter Silent Hang

**Problem:** When `claude --print` exits with a non-zero code AND stdout is empty, the `close` handler in the Claude adapter checks `code === 0 && stdout.trim().length > 0` for success, then falls through to building a failure result from stderr. But if stderr is ALSO empty (or only has whitespace), `failureMessage` becomes an empty string and `settle()` may not fire properly, or the process exited before the `close` event properly captured output.

**File:** `workspace-daemon/src/adapters/claude.ts`

**Fix:**
1. In the `proc.on('close', ...)` handler, make sure `settle()` ALWAYS fires. Add a guard at the very end:
```ts
proc.on('close', (code) => {
  if (settled) return;
  
  // flush remaining output
  if (outputBuffer.length > 0) {
    context.onEvent({ type: 'agent_message', message: outputBuffer });
    context.onEvent({ type: 'output', message: outputBuffer });
    outputBuffer = '';
  }
  
  updateTokenUsage();
  
  if (code === 0 && stdout.trim().length > 0) {
    context.onEvent({ type: 'turn.completed', data: { inputTokens, outputTokens } });
    completeSuccess();
    return;
  }
  
  // ALWAYS settle — never leave the promise hanging
  const failureMessage = stderr.trim() || stdout.trim() || `Process exited with code ${code ?? -1}`;
  settle(buildFailureResult(stdout.trim(), inputTokens, outputTokens, failureMessage));
});
```

2. Also add the same guard to the Codex adapter (`workspace-daemon/src/adapters/codex.ts`). In its `proc.on('close', ...)`, ensure the final fallback ALWAYS calls `settle()`.

3. In BOTH adapters, add a safety net timeout AFTER the main timeout. If `settled` is still false 10 seconds after the process exits, force-settle with an error:
```ts
proc.on('exit', () => {
  setTimeout(() => {
    if (!settled) {
      settle(buildFailureResult('', inputTokens, outputTokens, 'Adapter failed to settle after process exit'));
    }
  }, 10000);
});
```

**Commit:** `fix(adapters): prevent silent hang on empty output exit (E2E-1)`

---

## Task 2: Fix Agent Routing — Default to Codex

**Problem:** `selectAgent()` in `orchestrator.ts` falls through to the first online agent alphabetically when no keyword match and no `suggested_agent_type`. This picks aurora-coder but it could pick aurora-qa if coder isn't available. More importantly, the decomposer sets `suggested_agent_type: null` for simple tasks.

**File:** `workspace-daemon/src/orchestrator.ts`

**Fix:**
1. In `selectAgent()`, change the final fallback to explicitly prefer codex:
```ts
// Final fallback: prefer codex agents, then any online agent
return (
  onlineAgents.find((agent) => agent.adapter_type === 'codex') ??
  onlineAgents[0] ??
  null
);
```
Wait — this is ALREADY the code. The issue is different.

2. Look at the actual task that was created. The decomposer set `suggested_agent_type: null`. Then `selectAgent` checks `task.suggested_agent_type` — it's null so it skips. Then it checks the keyword patterns. "Create a file called qa-test-output.txt" doesn't match FRONTEND_TASK_PATTERN, BACKEND_TASK_PATTERN, QA_TASK_PATTERN, or PLANNING_TASK_PATTERN. So `getPreferredAgentId` returns null. Then it falls through to the codex fallback... but the E2E showed aurora-qa was selected!

3. Check the DB: the task_run was created with `agent_id: 'aurora-qa'`. This means either:
   - The agent list returned aurora-qa before aurora-coder, OR
   - aurora-coder wasn't in the online agents list at that moment

4. Fix: In `selectAgent`, when no keyword match AND no suggested_agent_type, ALWAYS prefer an agent with `adapter_type === 'codex'` over other types. The existing fallback code should do this already. Debug by adding a console.log:
```ts
export function selectAgent(task: Task, agents: AgentRecord[]): AgentRecord | null {
  const onlineAgents = agents.filter(isOnlineAgent);
  console.log(`[orchestrator] selectAgent for "${task.name}": ${onlineAgents.length} online agents: ${onlineAgents.map(a => `${a.id}(${a.adapter_type}/${a.status})`).join(', ')}`);
  
  // ... existing logic ...
  
  const selected = onlineAgents.find((agent) => agent.adapter_type === 'codex') ?? onlineAgents[0] ?? null;
  console.log(`[orchestrator] selected: ${selected?.id ?? 'none'}`);
  return selected;
}
```

5. Also check: when a task run completes/fails, does `setAgentStatus(agent.id, 'idle')` get called? If the previous run of aurora-coder left it in 'running' status, it won't pass `isOnlineAgent()`. Look at the `dispatchTask` finally block — it calls `this.tracker.setAgentStatus(agent.id, 'idle')`. Make sure this fires even on error.

6. Verify in tracker.ts: `setAgentStatus` — does it actually UPDATE the DB? Find this method and confirm it writes to the agents table.

**Commit:** `fix(orchestrator): agent selection logging + codex preference (E2E-2)`

---

## Task 3: Fix Decomposer API Key Resolution

**Problem:** When daemon is started manually (not via Vite), `ANTHROPIC_API_KEY` isn't in the environment. The Vite fix only works when Vite spawns the daemon.

**File:** `workspace-daemon/src/decomposer.ts`

**Fix:**
1. Before checking `process.env.ANTHROPIC_API_KEY`, try to read it from OpenClaw's auth config:
```ts
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

function resolveAnthropicKey(): string | null {
  // Check env first
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  
  // Try reading from OpenClaw auth config
  try {
    const configPath = `${homedir()}/.openclaw/openclaw.json`;
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    // Look for anthropic auth profile with a token
    const profiles = config?.auth?.profiles ?? {};
    for (const [key, profile] of Object.entries(profiles)) {
      const p = profile as any;
      if ((key.startsWith('anthropic:') || key.startsWith('anthropic-oauth:')) && p.mode === 'token') {
        // The actual key is stored in the keychain/credentials, not in the JSON
        // So we can't read it here. Skip this approach.
        break;
      }
    }
  } catch {
    // ignore
  }
  
  return null;
}
```

Actually, OpenClaw stores tokens in the system keychain, not in the JSON file. We can't read them directly.

Better approach: Use the `claude` CLI for decomposition but fix the prompt to be shorter so it doesn't error:

2. In the CLI fallback, the current prompt passes the full system instructions inline with `-p`. Instead, use `--system-prompt` flag (if claude CLI supports it) or simplify the prompt:
```ts
const cliPrompt = `Return a JSON array of implementation tasks for this goal. Each task: {name, description, estimated_minutes, depends_on: [], suggested_agent_type: "codex"|"claude"|null}. NO markdown fences. ONLY the JSON array.\n\nGoal: ${goal.trim()}`;
```

3. Actually the simplest fix: the `claude` CLI is available and working (it ran the task!). The decomposer's CLI fallback works but returns badly-parsed results. Make the CLI fallback more robust:
   - Use `claude --print --output-format json -p "..."` if supported
   - Or just ensure `extractJsonArray()` handles the CLI's output format

4. The real fix is to set ANTHROPIC_API_KEY in the daemon's spawn environment. In `server.ts`, at the top, try to resolve the key:
```ts
// Try to get Anthropic key from claude CLI config
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const result = execSync('claude config get apiKey 2>/dev/null', { encoding: 'utf8', timeout: 5000 }).trim();
    if (result && !result.includes('not found')) {
      process.env.ANTHROPIC_API_KEY = result;
    }
  } catch {
    // claude CLI config not available
  }
}
```

Actually that probably won't work either. Simplest real fix:

5. In `decomposer.ts`, if SDK fails, use `claude --print` but with a much cleaner prompt that reliably returns JSON. Replace the CLI fallback:
```ts
const { stdout } = await execFileAsync('claude', [
  '--print',
  '--output-format', 'text',
  '-p', `You are a task decomposition engine. Return ONLY a valid JSON array, no explanation, no markdown fences. Each item: {"name": string, "description": string, "estimated_minutes": number, "depends_on": string[], "suggested_agent_type": "codex"|"claude"|null}.\n\nDecompose: ${goal.trim()}`
], {
  maxBuffer: 1024 * 1024,
  timeout: 120_000,
});
```

**Commit:** `fix(decomposer): cleaner CLI fallback prompt for reliable JSON (E2E-3)`

---

## Task 4: Add Orchestrator Run Watchdog

**Problem:** If an adapter hangs or the process dies without triggering the close event properly, the orchestrator thinks a slot is occupied forever. No timeout recovery.

**File:** `workspace-daemon/src/orchestrator.ts`

**Fix:**
1. Add a watchdog timer per running task. In `dispatchTask`, after setting up the running entry:
```ts
const MAX_RUN_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Watchdog: force-fail if run exceeds max duration
const watchdogHandle = setTimeout(() => {
  if (this.state.running.has(task.id)) {
    const controller = this.abortControllers.get(taskRun.id);
    if (controller) {
      controller.abort('Watchdog: run exceeded maximum duration');
    }
  }
}, MAX_RUN_DURATION_MS);
```

2. In the `finally` block of `dispatchTask`, clear the watchdog:
```ts
finally {
  clearTimeout(watchdogHandle);
  this.abortControllers.delete(taskRun.id);
  // ... rest of cleanup
}
```

3. Also add stale run recovery on daemon startup. In `reconcileRunningTasks()`, it already marks stale runs as failed. Verify this works by checking: when the daemon restarts, are previously-running task_runs properly failed?

**Commit:** `fix(orchestrator): add 5min watchdog timer per task run (E2E-4)`

---

## Execution Order
1. Task 1 (adapter fix) — most critical, prevents stuck runs
2. Task 4 (watchdog) — safety net for any future hangs
3. Task 2 (routing + logging) — debugging aid + correct agent selection
4. Task 3 (decomposer) — better decomposition quality

## Rules
- Read EVERY file before editing
- `npx tsc --noEmit` after each task
- Commit after each task
- Do NOT change UI files
- Do NOT add new npm dependencies
