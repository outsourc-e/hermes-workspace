# FUTURE-FEATURES.md — Post-Roadmap Development
_Added: 2026-03-09 | Source: Framework research (Anthropic Skills guide, OpenAI Agents SDK, Google ADK)_

These features are NOT part of the initial roadmap. Build them AFTER the v4 mockup is 100% complete and verified.

---

## 🔴 High Priority (unlocks "App Factory" overnight runs)

### 1. Iterative Refinement Loop
**What:** Verification doesn't stop at one tsc pass. Loop: run tsc → errors? → send back to agent → fix → re-run. Max 3 iterations before escalating to human review.
**Why:** Anthropic explicitly identifies this as the pattern that makes agents reliable. Current single-pass fails silently.
**Where:** `workspace-daemon/src/verification.ts` + `checkpoint-builder.ts`
**Pattern source:** Anthropic Skills Guide — "Iterative Refinement" design pattern

### 2. Agent Handoffs (Context Passing Between Agents)
**What:** When one agent finishes a wave, it passes structured context (git diff, error log, what it built, what it skipped) to the next agent. No more blind starts.
**Why:** Current agents start each task cold. Handoffs are first-class in OpenAI Agents SDK — explicit control transfer with context. This is what keeps overnight runs coherent.
**Where:** New `workspace-daemon/src/handoff.ts`, update adapter interfaces
**Pattern source:** OpenAI Agents SDK — "Handoffs" primitive

### 3. Specialized Agent Roles
**What:** Replace generic Codex adapter with role-specific agents:
- **Researcher** — reads codebase, produces spec/context doc
- **Planner** — takes spec, produces task breakdown with deps
- **Builder** — executes tasks (Codex)
- **Validator** — runs tsc, tests, reviews diff
- **Deployer** — git ops, PR creation, notifications
**Why:** The "App Factory" screenshot runs specialized roles. Generic agents miss domain context.
**Where:** `workspace-daemon/src/adapters/` — one file per role
**Pattern source:** Anthropic Skills — "Domain-specific intelligence" + App Factory pattern

---

## 🟡 Medium Priority

### 4. Parallel Guardrails (tsc watcher during agent run)
**What:** Run tsc in watch mode alongside Codex, not just after. Flag errors in real-time without waiting for checkpoint.
**Why:** OpenAI SDK runs guardrails in parallel with the agent — catches issues without blocking the main flow.
**Where:** New process spawned alongside agent in `agent-runner.ts`
**Pattern source:** OpenAI Agents SDK — "Guardrails" primitive

### 5. Rollback on Checkpoint Rejection
**What:** When a checkpoint is rejected, auto-revert to pre-task git state rather than leaving dirty code in tree.
**Why:** Currently a rejection leaves broken code that the next agent inherits.
**Where:** `workspace-daemon/src/git-ops.ts` — add `revertToCheckpoint()` method

### 6. Context-Aware Tool Selection
**What:** Agent routing logic that picks different tools based on file size, task type, and context. Large refactors → Codex. Small surgical fixes → Claude ACP session. Research tasks → Claude with web search.
**Pattern source:** Anthropic Skills — "Context-aware tool selection" pattern

---

## 🔵 Lower Priority (Enterprise / Scale)

### 7. Session Persistence Surfaced to Agents
**What:** Pass previous run context (what worked, what failed, git history) to agent at start of each task. Agents currently start blind even when re-running.
**Where:** Update adapter `buildPrompt()` to include run history from SQLite

### 8. Progressive Skill Loading for Agent Prompts
**What:** Agent system prompts use Anthropic's 3-level progressive disclosure — minimal header always loaded, full instructions only when triggered, reference docs on demand.
**Why:** Keeps context lean when running many agents in parallel.
**Pattern source:** Anthropic Skills Guide — core architecture

### 9. Skills Marketplace / Agent Skill Definitions
**What:** Define agent "skills" as portable SKILL.md-style files that can be shared, versioned, and swapped. A "React Builder" skill vs "Python API Builder" skill.
**Pattern source:** Anthropic agentskills.io open standard

---

## Summary Table

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| Iterative refinement loop | 🔥 High | Low | Do first |
| Agent handoffs | 🔥 High | Med | Do second |
| Specialized agent roles | 🔥 High | High | Do third |
| Parallel guardrails | Med | Med | After roles |
| Rollback on rejection | Med | Low | After roles |
| Context-aware tool selection | Med | High | Later |
| Session persistence | Low | Low | Later |
| Progressive skill loading | Low | Med | Later |
| Skills marketplace | Low | High | Much later |
