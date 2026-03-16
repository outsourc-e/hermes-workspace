# Hermes Workspace — Final Demo Spec
_Generated 2026-03-15 8:44 PM from E2E audit + Hermes cross-reference_

## Critical Fixes (MUST ship for demo)

### 1. Terminal in Sidebar Nav
- Terminal route exists at `/terminal` with full PTY backend
- Just not in the sidebar navigation — add it between Files and Memory
- Icon: terminal/console icon

### 2. Session Bootstrap Fix
- `/chat/main` assumes a session called "main" exists in Hermes — it doesn't
- Fix: on first message send, if session doesn't exist, auto-create via `POST /api/sessions`
- Route should use real Hermes session IDs, not synthetic "main"
- `/chat/new` should create a fresh Hermes session immediately

### 3. "Failed to Send" Error Fix
- Root cause: `/api/send-stream` emits `done` on Hermes errors but raw exceptions emit `error`
- Client handles both but semantics are inconsistent
- Fix: always emit `error` event with clear message on failure, never `done` with error payload
- Remove all "gateway" wording from error messages — say "Hermes" or "agent"
- Add `finishedRef` guard to prevent double error toasts

### 4. Hide Stub Pages from Nav
Remove from sidebar/nav (keep routes for future):
- `/sessions` — fetches empty gateway sessions array
- `/cron` — all CRUD hits empty fake backend  
- `/activity` — permanently disconnected event stream
- `/gateway/logs` — returns 501

Keep in nav:
- Chat ✅
- Files ✅  
- Terminal ✅ (adding)
- Memory ✅
- Skills ✅
- Settings ✅

### 5. Message Ordering
- `mergeHistoryMessages()` appends instead of re-sorting
- Fix: sort merged array by timestamp after combining history + realtime messages

### 6. Tool Card Coverage
Current: only handles subset of Hermes tool events
Missing tool display names for: browser_click, browser_type, browser_press, browser_scroll, browser_back, browser_get_images, browser_vision, browser_close, execute_code, process, multi_tool_use.parallel, todo, cronjob, delegate_task, mixture_of_agents, session_search, clarify, skill_manage, vision_analyze, image_generate, send_message, text_to_speech, honcho_*, ha_*

Add unicode icons + display labels for ALL Hermes tools in `formatToolDisplayLabel()`.

## Post-Demo (P1)

### 7. Onboarding Wizard
- Detect Hermes at :8642 on first load
- If not found: show "Start Hermes Agent" instructions
- If found: show current model/provider from `/api/config`
- Map to `hermes setup` CLI flow: provider selection, API key, model pick

### 8. Status Bar
- Bottom bar or header badge showing:
  - Hermes health (green/red dot)
  - Current model (from config)
  - Active session name
  - Tool call count for current run

### 9. Todo Inspector Tab
- Hermes has `todo` tool for session task checklists
- Add as 6th inspector tab or merge into Activity

### 10. Browser Session Viewer
- 10 browser tools available
- Show accessibility snapshots inline in chat
- Could be inspector tab: "Browser"

### 11. Delegate Task Visibility  
- Show subagent spawns in Activity tab
- Progress/status updates from delegated tasks

### 12. Slash Commands in Composer
- `/skills` — open skills browser
- `/skin` — theme picker
- `/todo` — show/edit task list
- Dynamic skill commands

## Architecture Reference
```
Browser (:3002) ←→ hermes-api.ts (REST/SSE) ←→ Hermes FastAPI (:8642) ←→ AIAgent runtime
```

## Hermes Tools (28+)
File: read_file, write_file, search_files, patch
Shell: terminal, process, execute_code
Planning: todo, memory, session_search, delegate_task, mixture_of_agents
Skills: skills_list, skill_view, skill_manage
Browser: browser_navigate, browser_snapshot, browser_click, browser_type, browser_press, browser_scroll, browser_back, browser_get_images, browser_vision, browser_close
Web: web_search, web_extract, vision_analyze
Media: image_generate, text_to_speech
Interaction: clarify, cronjob, send_message
Meta: multi_tool_use.parallel

## Hermes Skills (90)
17 categories: apple, autonomous-ai-agents, creative, data-science, email, gaming, github, leisure, mcp, media, mlops, note-taking, productivity, research, smart-home, social-media, software-development
