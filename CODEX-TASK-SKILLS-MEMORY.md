# Codex Task: Skills & Memory Screen

## Route
`/skills` — new nav item in workspace sidebar (after Agents)

## Reference
See `/Users/aurora/.openclaw/workspace/orchestrator-mockup/v4.html` → `#s-skills` for exact layout.

## Layout
Two-panel layout side by side (each 50% width, divider between):
- **Left panel**: Skills browser
- **Right panel**: Memory browser

## Left Panel — Skills

### Header
- "Skills" title
- "+ Install Skill" button + "Browse ClawHub" button (buttons do nothing for now — just show a toast "Coming soon")

### Category Filter Chips
All | QA | Auth | UI | DB | DevOps

### Skill Cards (static list for now)
Each card: colored emoji icon, name, description, category badge, active/disabled badge

Show these skills:
1. Code Reviewer · "Automated code review with style + security checks" · QA · active
2. Auth Patterns · "JWT, OAuth, session management templates" · Auth · active
3. DB Migration · "Schema migrations, seed data, rollback" · DB · active
4. UI Component Gen · "Generate React components from descriptions" · UI · active
5. Test Writer · "Generate unit + integration tests from code" · QA · active
6. Docker Compose · "Container orchestration + CI/CD" · DevOps · **disabled** (dimmed opacity)

Clicking a skill card shows a right drawer or inline detail (optional — just expand card with toggle/enable button is fine).

## Right Panel — Memory

### Header
- "Memory" title
- Export button (toast "Coming soon")
- Clear All button (toast "Are you sure?" confirmation, then toast "Cleared")

### Search Input
- Text input: "Search memory..."
- Filters: All | Workspace | Project | Agent

### File List Sections
Read actual files from these paths and show real sizes:

**Workspace Memory** (`~/.openclaw/workspace/`):
- MEMORY.md
- SOUL.md
- AGENTS.md
- USER.md

**Daily Logs** (`~/.openclaw/workspace/memory/`):
- Show last 3 daily log files (most recent first)

**Agent Memory** (`~/.openclaw/workspace/.learnings/`):
- LEARNINGS.md (if exists)
- ERRORS.md (if exists)

Clicking a file highlights it (active state with accent border).

### Retention Card
- Workspace memory → Permanent
- Project memory → Per-project
- Agent memory → 30 day rolling

## Data / API
- `GET /api/workspace/memory-files` — new route that reads the actual files above and returns `{ name, path, size, section }` for each
- File sizes via `fs.stat()`, formatted as KB
- Static skills list (no DB needed, hardcode in route or component for now)

## File Locations
- `src/screens/skills/skills-screen.tsx` (new)
- `src/routes/api/workspace/memory-files.ts` (new — reads real files)
- Add `/skills` route to router
- Add "Skills & Memory" nav item to workspace sidebar

## Design System
- Same card/border styles as all workspace screens
- Active file: `border-accent-500/40 bg-accent-500/5`
- Disabled skill card: `opacity-50`
- Divider between panels: `border-l border-primary-800`

## Validation
1. `npx tsc --noEmit` in root
2. Commit: `feat: skills and memory screen`
3. Run: `openclaw system event --text "Skills and Memory screen done" --mode now`
