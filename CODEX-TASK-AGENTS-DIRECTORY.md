# Codex Task: Agents Directory Screen

## Route
`/agents` — new nav item in the workspace sidebar (between Review Queue and Runs)

## Reference
See `/Users/aurora/.openclaw/workspace/orchestrator-mockup/v4.html` → `#s-agents` for exact layout target.

## Layout
Two-panel layout (same pattern as project detail):
- **Left panel** (220px): agent list with avatar, name, model, role, online status dot
- **Right panel** (flex 1): agent detail with tabs

## Left Panel — Agent List
- Header: "Agents" label + "+ New Agent" button
- Each agent row: colored emoji avatar, name, role/model subtitle, status dot (green/yellow/gray)
- Active agent highlighted
- Default agents to show (from daemon `GET /api/workspace/agents` — create this if it doesn't exist):
  - Codex · Backend · gpt-5.4 · online
  - Claude Sonnet · Full-stack · sonnet-4.6 · online
  - QA Agent · Reviewer · sonnet-4.6 · online
  - Aurora · Orchestrator · opus-4.6 · online
  - Forge (PC1) · Heavy builds · qwen3.5-35b · offline

## Right Panel — Agent Detail
Tabs: Profile | Model & Limits | System Prompt | Skills | Runs

### Profile Tab (default)
- Agent name + status badge + role badge in header
- Stats grid (4 cards): Tokens Today, Cost Today, Success Rate, Avg Response
- Model & Provider section: model name, provider, max tokens, cost, concurrency limit, memory scope
- Capabilities toggles (on/off): Repo Write, Shell Commands, Git Operations, Browser, Network
- Assigned Projects: colored badge chips
- Actions row: Configure, Assign to Project, Test Run buttons

### System Prompt Tab
- Large textarea showing the agent's SOUL/system prompt
- Save + Reset buttons, last-edited timestamp

### Runs Tab
- Recent runs table for this specific agent (reuse workspace-checkpoints data filtered by agent)
- Shows task name, project, status, duration, tokens

## Data / API
- Create `GET /api/workspace/agents` in daemon that returns a static list for now (seeded from known agent types)
- Create `GET /api/workspace/agents/:id/stats` returning today's token/cost/run totals from task_runs table filtered by agent_adapter_type or agent_name
- Store in daemon db or derive from existing task_runs data

## File locations
- `src/screens/agents/agents-screen.tsx` (new)
- `src/routes/api/workspace/agents.ts` (new — proxy to daemon)
- `workspace-daemon/src/routes/agents.ts` (new)
- Add `/agents` route to `src/routes/index.tsx` or router
- Add "Agents" nav item to workspace sidebar in `src/screens/projects/projects-screen.tsx` or layout

## Design System
- Match existing workspace screens: `rounded-3xl`, `border-primary-800`, `bg-primary-800/35` card style
- Status dots: green = `bg-green-400`, yellow = `bg-yellow-400`, gray = `bg-primary-600`
- Use `HugeiconsIcon` for all icons
- Tabs: same tab style as checkpoint-detail-modal

## Validation
1. `npx tsc --noEmit` in root
2. `cd workspace-daemon && npx tsc --noEmit`
3. Commit: `feat: agents directory screen`
4. Run: `openclaw system event --text "Agents Directory screen done" --mode now`
