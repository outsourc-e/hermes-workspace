# Codex Task: Workspace Shell — Single Sidebar Entry + Internal Navigation

## Goal
Replace the 5 separate workspace nav items in the sidebar with a single "Workspace" entry. Clicking it opens a workspace layout shell with its own internal navigation (left rail or top tabs).

## Read First
- `src/screens/chat/components/chat-sidebar.tsx` — current sidebar with section labels
- `src/screens/projects/projects-screen.tsx` — current projects screen
- `src/screens/review/review-queue-screen.tsx`
- `src/screens/runs/runs-console-screen.tsx`
- `src/screens/agents/agents-screen.tsx`
- `src/screens/skills/skills-screen.tsx`
- `src/screens/plan-review/plan-review-screen.tsx`
- `src/components/workspace-shell.tsx` — existing shell (may need updates)
- `src/routes/` — check how routes are structured (TanStack Router file-based)

## Changes

### 1. Sidebar (`chat-sidebar.tsx`)
Remove from suiteItems:
- The `{ kind: 'section', label: 'Workspace' }` label
- Projects link
- Review Queue link
- Runs / Console link  
- Agents link
- Skills & Memory link (the workspace one — keep the original Skills link if it exists separately)

Add ONE new entry in suiteItems (after Agent Hub or Dashboard):
```tsx
{
  kind: 'link',
  to: '/workspace',
  icon: GridViewIcon, // or SquareIcon or LayoutLeftIcon — pick a clean grid/workspace icon from hugeicons
  label: 'Workspace',
  active: pathname.startsWith('/workspace'),
}
```

### 2. Workspace Layout Shell (`src/screens/workspace/workspace-layout.tsx` — NEW)
Create a layout component that wraps all workspace sub-screens.

Structure:
```
┌──────────────────────────────────────────────┐
│ [Workspace left rail]  │  [Content area]     │
│                        │                     │
│  📂 Projects      [3] │  (active screen)    │
│  ✅ Review Queue  [4] │                     │
│  ▶️ Runs          [2] │                     │
│  🤖 Agents        [6] │                     │
│  🧩 Skills & Memory   │                     │
│                        │                     │
│  ── Projects ──        │                     │
│  ClawSuite      72%    │                     │
│  LuxeLab        55%    │                     │
│                        │                     │
└──────────────────────────────────────────────┘
```

Left rail specs:
- Width: 200px (collapsible to icons only at 48px)
- Background: same as main sidebar (`bg-primary-950` dark / `bg-white` light)
- Border right: `border-primary-800`
- Nav items: icon + label + optional count badge
- Active item: accent highlight (same style as main sidebar)
- Below nav items: "Projects" section showing live project list (fetch from daemon)
- Each project: emoji + name + progress % badge
- Clicking a project navigates to `/workspace/projects?project=<id>`

### 3. Routes
Update routing so all workspace screens live under `/workspace/`:
- `/workspace` → redirects to `/workspace/projects`
- `/workspace/projects` → Projects screen
- `/workspace/review` → Review Queue screen
- `/workspace/runs` → Runs/Console screen
- `/workspace/agents` → Agents Directory screen
- `/workspace/skills` → Skills & Memory screen
- `/workspace/plan-review` → Plan Review screen

Keep the old `/projects`, `/review`, `/runs`, `/agents` routes as redirects to `/workspace/*` for backwards compatibility.

### 4. Update Screen Components
Each workspace screen should:
- Remove any self-contained page wrapper/padding (the layout shell provides it)
- Accept being rendered inside the workspace layout's content area
- NOT render their own sidebar/nav — the workspace layout handles that

### 5. Design System
- Left rail matches v4 mockup sidebar style
- Section label: `text-[9px] font-bold uppercase tracking-[1.2px] text-primary-600`
- Nav items: `text-sm`, `py-2 px-3`, `rounded-lg`, hover: `bg-primary-800`, active: `bg-accent-500/10 text-accent-500`
- Count badges: `text-[10px] rounded-full px-1.5 py-0.5 bg-primary-800 text-primary-400`
- Collapse toggle: small chevron button at bottom of rail

## Validation
1. Run `npx tsc --noEmit` in root — fix any errors
2. Verify `/workspace/projects` renders the projects screen inside the layout
3. Verify clicking workspace nav items switches content
4. Verify main sidebar "Workspace" highlights when on any `/workspace/*` route
5. Commit: `feat: workspace shell with internal navigation`
6. Run: `openclaw system event --text "Workspace shell done — single sidebar entry with internal nav" --mode now`
