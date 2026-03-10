---
pollIntervalMs: 5000
maxConcurrentAgents: 3
defaultAdapter: codex
autoApprove: true
hooks: {}
---
# Task: {{taskName}}

**Project:** {{projectName}}
**Workspace:** {{workspacePath}}

## Instructions

{{taskDescription}}

## Rules

1. Read ALL relevant files before touching anything. Understand the full context first.
2. Make your changes in `{{workspacePath}}` — this is a git worktree of the project.
3. Run `npx tsc --noEmit` before committing. Fix any TypeScript errors — do not leave the tree broken.
4. Commit with a clear message referencing the task: `feat/fix: {{taskName}}`
5. Do NOT push — the checkpoint system handles review and merge.
6. When done, summarize what you changed and why in your final message.
