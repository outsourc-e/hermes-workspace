# Swarm Mode Quickstart

This quickstart gets a local Project Workspace checkout running, confirms profile auto-detection, starts a tmux-backed Project Agent, dispatches a first task, and shows where to review the result.

## 0. Prerequisites

You need:

- Node.js 22+
- pnpm
- git
- tmux for persistent TUI-backed workers
- a configured Project Agent profile under `~/.claude/profiles/`

The workspace can still render without tmux, but tmux is what makes the worker sessions feel alive instead of one-shot and disposable.

## 1. Clone the workspace

```bash
git clone https://github.com/outsourc-e/claude-workspace.git
cd claude-workspace
```

## 2. Install dependencies

```bash
pnpm install
```

## 3. Start the workspace

```bash
pnpm dev
```

Open the local URL printed by Vite/TanStack Start. In most local setups that is:

```text
http://localhost:3000
```

Some release lanes run on `:3002`; trust the terminal output if it differs.

## 4. First-run profile detection

On first run, the workspace looks for Project Agent profiles in:

```text
~/.claude/profiles/
```

Each worker profile can include:

```text
~/.claude/profiles/<workerId>/
  MEMORY.md
  SOUL.md
  USER.md
  memory/IDENTITY.md
  runtime.json
  skills/
```

The roster and runtime APIs use that profile shape to populate worker cards, runtime state, model labels, tmux session names, checkpoint status, and recent summaries.

If a worker exists in the roster but has no local profile, it can still appear as roster-only. Create or import the profile before expecting persistent memory, skill loading, or tmux launch to work.

## 5. Spawn a tmux-backed worker

There are two supported paths.

### Option A: rotate/start script

If your environment has the helper script installed, use:

```bash
/tmp/aurora-rotate-worker.sh swarm7
```

Replace `swarm7` with the worker ID you want. The convention is:

```text
tmux session: swarm-<workerId>
profile:      ~/.claude/profiles/<workerId>
```

After the script starts the session, open Swarm Mode and use Runtime view to attach to the TUI.

### Option B: Add Swarm dialog

In the workspace:

1. Open Swarm Mode.
2. Choose Add Swarm.
3. Pick a role preset.
4. Set worker ID, display name, model, specialty, mission, and skills.
5. Save.
6. Start the worker session from the card or Runtime view.

The role presets fill the important defaults: role, specialty, mission, system prompt, skills, and default model. You can edit them before saving.

## 6. Dispatch the first task

The dispatch API is:

```text
POST /api/swarm-dispatch
```

Minimal single-worker example:

```bash
curl -X POST http://localhost:3000/api/swarm-dispatch   -H 'Content-Type: application/json'   -d '{
    "workerIds": ["swarm7"],
    "prompt": "Write a short checkpoint explaining what you can see in your current workspace. Do not modify files.",
    "timeoutSeconds": 240,
    "waitForCheckpoint": true
  }'
```

Assignment-form example:

```bash
curl -X POST http://localhost:3000/api/swarm-dispatch   -H 'Content-Type: application/json'   -d '{
    "missionTitle": "Docs smoke test",
    "assignments": [
      {
        "workerId": "swarm7",
        "task": "Review docs/swarm/README.md and return a checkpoint with one improvement suggestion.",
        "rationale": "Scribe owns docs and handoff quality."
      }
    ],
    "waitForCheckpoint": true,
    "checkpointPollSeconds": 90
  }'
```

Expected response shape:

```json
{
  "missionId": "mission-...",
  "assignments": [
    { "workerId": "swarm7", "task": "..." }
  ],
  "results": [
    {
      "workerId": "swarm7",
      "ok": true,
      "delivery": "tmux",
      "checkpointStatus": "checkpointed"
    }
  ]
}
```

If `waitForCheckpoint` is true, the API waits for a fresh checkpoint from runtime state or worker chat. If it times out, the worker may still be running; inspect Runtime view before assuming failure.

## 7. View Reports + Inbox

Open Swarm Mode, then switch the view to Reports.

Reports gives you:

- mission history
- assignment state
- worker checkpoints
- blockers
- `NEEDS_REVIEW` items
- ready-for-human Inbox cards
- route-to-reviewer actions

The Inbox is where the swarm asks for judgment instead of trying to be brave in public. Good.

## 8. Use the Kanban TaskBoard

Switch to Kanban view for planning. The board is useful when you want a visual queue but still want dispatch to happen through the orchestrator.

Recommended lane meanings:

| Lane | Meaning |
| --- | --- |
| Backlog | Useful but not ready. |
| Ready | Clear enough to dispatch. |
| Running | Worker owns it now. |
| Review | Needs reviewer or Eric. |
| Blocked | Needs repair, input, auth, or scope cut. |
| Done | Verified checkpoint landed. |

## 9. Add a worker with role presets

The Add Swarm dialog includes these presets:

- Orchestrator
- Builder
- Reviewer
- Triage
- Lab
- Sage
- Scribe
- Foundation
- QA
- Mirror Integrations
- Custom

Pick the closest role first, then tune. Avoid starting from Custom unless you are intentionally creating a new lane. Presets encode the operating contract so the worker knows whether it is allowed to build, review, triage, research, or just report.

## 10. First-task checklist

Before trusting a new worker:

- It appears in the roster.
- Its profile exists under `~/.claude/profiles/<workerId>/`.
- Runtime view can attach to tmux or open a shell/log stream.
- `/api/swarm-dispatch` can deliver a task.
- The worker returns the canonical checkpoint format.
- Reports shows the checkpoint.
- The orchestrator can route the next action.

## 11. Common fixes

### Worker card exists but TUI does not attach

Check tmux:

```bash
tmux ls
```

Expected session name:

```text
swarm-<workerId>
```

Start or rotate the worker if the session is missing.

### Dispatch returns timeout

A timeout means the API did not see a fresh checkpoint in time. It does not always mean the worker failed.

Check:

- Runtime view
- worker `runtime.json`
- worker chat transcript
- Reports tab after refresh

### Worker has wrong role/model/skills

Open Add Swarm or edit the roster config, then restart the worker session. Role, model, and skills are part of the worker identity; changing them mid-task creates weird ghosts. Weird ghosts are expensive.

## 12. Safe operating boundary

The swarm can prepare commits, branches, PR bodies, review verdicts, issues, and release notes. It should not merge, force-push, publish, announce publicly, close issues, or perform destructive file operations without explicit human approval.

That boundary is the Greenlight Gate. Keep it boring.
