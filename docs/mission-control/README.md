# Hermes Mission Control

Status: installed in Hermes Workspace as an additive, local-only dashboard surface.
Last verified: 2026-07-16.

## What is working now

- Route: `/mission-control`.
- Live local system API: `GET /api/mission-control/system`.
- Existing Notion operations API: `GET /api/mission-control/summary` plus `/api/notion/*`.
- Existing Hermes dashboard aggregate API: `GET /api/dashboard/overview`.
- Existing task APIs are reused through `src/lib/tasks-api.ts`.
- Desktop navigation and mobile navigation already expose Mission Control from earlier Workspace work.
- Production build passes.

Mission Control is an aggregation and command surface. It does not replace Notion, Zoho, Apple Calendar, Apple Reminders, Obsidian, Slack, or Hermes as systems of record.

## Current-state inventory

Infrastructure:
- Mac mini host runs Hermes Gateway, Hermes Dashboard, and Hermes Workspace under launchd.
- Active services observed: `ai.hermes.gateway`, `com.hermes.dashboard`, `com.hermes.workspace`.
- Gateway default: `http://127.0.0.1:8642`.
- Dashboard default: `http://127.0.0.1:9119`.
- Workspace default: `http://127.0.0.1:3000`.

Hermes:
- Hermes Agent v0.18.2 observed during audit.
- Default profile uses OpenAI Codex models.
- Cron is active and readable from `~/.hermes/cron/jobs.json`.
- OpenRouter is configured but audit logs showed quota/credit/rate-limit failures; treat it as degraded until re-tested.

Notion:
- Manifest path: `/Users/escher/Documents/Obsidian Vault/Bethanys Second Brain/03_Projects/SEO-AEO-Service/Tools_Systems/notion_command_center_manifest.json`.
- Existing data sources include CRM / Leads, Outreach / Interactions, Human Approval Queue, Deals / Proposals, Projects, Tasks, Automation Log, Agents, SOP Library, Decision Log, Business Metrics, Inbox, and Client Onboarding.
- Notion API calls remain server-side through `src/server/notion-client.ts`; credentials are never sent to the browser.

Obsidian:
- Vault path: `/Users/escher/Documents/Obsidian Vault/Bethanys Second Brain`.
- Mission Control reads recent notes and emits verified `obsidian://open` URIs.

Apple Calendar and Reminders:
- The new system snapshot tries local AppleScript reads from the Mac host.
- If macOS TCC permissions block access, Mission Control labels Calendar/Reminders as blocked instead of showing fake data.
- Production-grade write support should move to a small EventKit helper with explicit Calendar/Reminders permissions.

Zoho Mail:
- No Zoho OAuth credential markers were found in the Workspace server environment during verification.
- Email sync remains blocked until Ryan approves and configures least-privilege Zoho OAuth.

## System-of-record map

| Data | Authoritative source | Mission Control behavior |
|---|---|---|
| Clients and structured business records | Notion | Read summaries, direct Notion links, no uncontrolled duplication |
| Leads and pipeline | Notion | Read status and counts through manifest-backed data sources |
| Projects and deliverables | Notion | Read operational counts; link to source records where available |
| Email content, folders, delivery state | Zoho Mail | Not enabled yet; blocked pending OAuth approval |
| Human reminders and completion state | Apple Reminders | Local read snapshot; writes require approval/helper |
| Calendar events and attendance state | Apple Calendar | Local read snapshot; writes require approval/helper |
| Knowledge, SOPs, agent docs | Obsidian | Read recent notes and direct `obsidian://` links |
| Agent runs, schedules, routing | Hermes | Read cron, dashboard, logs, model warnings |
| Sync state, cached summaries, health, approvals | Mission Control | Local dashboard state only |

## Data-flow and permissions

Browser:
- Calls local Workspace routes only.
- Never receives API keys, OAuth tokens, refresh tokens, or raw secret files.

Workspace server:
- Reads `~/.hermes/.env` only to detect configured providers or call server-side Notion API.
- Reads `~/.hermes/cron/jobs.json` for schedule status.
- Reads redacted tails of Hermes logs for model/fallback warnings.
- Reads Obsidian markdown metadata and builds `obsidian://` links.
- Calls local `osascript` for Apple Calendar/Reminders read counts.

External services:
- Notion: read-only dashboard queries currently used.
- Zoho: not connected yet.
- Slack: controlled through Hermes gateway, not directly by Mission Control.

## Privacy and security rules enforced

- Local-only by default; no public tunnel or firewall change was made.
- Tokens and secrets are status-only in the UI.
- `redactSensitive()` removes bearer tokens, Zoho OAuth tokens, common key/value secret lines, OpenAI-style keys, and JWT-like token strings from captured text.
- Consequential actions are listed as approval-gated instead of performed.
- External writes were not executed during this implementation pass.

## API surface

Read endpoints:
- `GET /api/mission-control/system`: local integrations, Apple counts, Obsidian recent notes, Hermes cron/model warnings, host resource summary, approval gates.
- `GET /api/mission-control/summary`: Notion-backed business counts and groups.
- `GET /api/notion/sources`: manifest-backed Notion source list.
- `GET /api/notion/query?source=<name>`: server-side Notion query.
- `GET /api/dashboard/overview`: Hermes operational dashboard aggregation.

Write/consequential actions:
- Not implemented as open endpoints in this pass. Sending email, changing routing, external writes, deleting records, exposing services, or expanding OAuth scopes remain approval-gated.

## Setup

Prerequisites:
- Node 22+ and pnpm.
- Hermes Gateway on `127.0.0.1:8642`.
- Hermes Dashboard on `127.0.0.1:9119`.
- Workspace on `127.0.0.1:3000`.
- `NOTION_API_KEY` or `NOTION_API_TOKEN` in `~/.hermes/.env` for Notion views.
- macOS Calendar/Reminders permissions for the process that runs Workspace if Apple cards should show live counts.

Start commands:
- Development: `cd /Users/escher/hermes-workspace && pnpm dev`.
- Production after build: `cd /Users/escher/hermes-workspace && pnpm build && PORT=3000 HOST=127.0.0.1 node server-entry.js`.
- Gateway: `hermes gateway run`.
- Dashboard: `hermes dashboard --port 9119 --host 127.0.0.1 --no-open`.

Launchd commands:
- List: `launchctl list | grep -E 'com\.hermes|ai\.hermes'`.
- Restart Workspace service: `launchctl kickstart -k gui/$(id -u)/com.hermes.workspace`.
- Restart Gateway service: use Hermes gateway controls or launchd only after checking active work.

## Daily-use guide

1. Open `http://127.0.0.1:3000/mission-control`.
2. Check the top strips first: task load, Notion operations, Live Systems + Security.
3. If an integration is `blocked` or `degraded`, read its detail text before acting.
4. Use Notion links for structured records and Obsidian links for knowledge notes.
5. Use approval gates as the source of truth for what still needs Ryan’s explicit decision.

## Backup and restore

Workspace source:
- Use git before risky changes: `git status --short`, then commit or stash intentionally.

Hermes state:
- Back up `~/.hermes/config.yaml`, `~/.hermes/auth.json`, `~/.hermes/cron/`, `~/.hermes/state.db`, and `~/.hermes/logs/` with secrets preserved locally only.
- Do not copy secrets into Notion, Obsidian, Slack, or chat.

Obsidian:
- Use Time Machine or file-level copy of `/Users/escher/Documents/Obsidian Vault/Bethanys Second Brain` before bulk vault changes.

Restore:
- Stop Workspace service.
- Restore source/runtime files from git or backup.
- Run `pnpm build`.
- Restart Workspace service.
- Verify `/api/mission-control/system` and `/mission-control`.

## Troubleshooting

`/api/mission-control/system` returns 401:
- The route is protected. Local browser access should work; API probes may need the configured Workspace auth context.

Calendar/Reminders show blocked:
- Grant Automation/Calendar/Reminders permissions to the process running Workspace, or replace AppleScript with an EventKit helper.

Zoho shows not configured:
- Configure Zoho OAuth server-side after Ryan approves scopes. Required docs: account discovery, folders, messages list/search. Store refresh credentials only in the secure local secret store.

Model/fallback warning appears:
- Check `~/.hermes/logs/gateway.error.log` and `~/.hermes/logs/agent.log` with redaction. Audit found historical OpenRouter 402/429 and free quota exhaustion plus historical Codex `usage_limit_reached` markers.

Notion data missing:
- Confirm the Notion integration has access to the source database and relations.
- Confirm the manifest data source IDs still match current Notion data sources.
- Respect Notion’s 3 req/s average rate limit.

## Known limitations

- Zoho email operations center is not active until OAuth is configured.
- Apple Calendar/Reminders write operations are not enabled; read counts depend on macOS permissions.
- The local system snapshot uses log heuristics for model/fallback warnings; it does not yet have a structured Hermes model-error database.
- No public remote ChatGPT cloud access endpoint was exposed. Use Tailscale or an explicitly approved secure API/MCP bridge later.
- Synthetic end-to-end workflow external writes were not run because they require approval.

## Verification report

Commands run:
- `pnpm vitest run src/server/dashboard-aggregator.test.ts --reporter=dot` → passed, 13 tests.
- `pnpm build` → passed for client and SSR builds.
- `PORT=3007 HOST=127.0.0.1 NODE_ENV=production node server-entry.js` → started a temporary local production server.
- `GET http://127.0.0.1:3007/api/mission-control/system` → returned HTTP 200 JSON with Notion live, Zoho not_configured, Obsidian live, Hermes live, Apple blocked due local permission boundary.

Not executed without Ryan approval:
- Restarting production Workspace service.
- Creating synthetic Notion/client/calendar/reminder/email records.
- Configuring Zoho OAuth.
- Changing model routing/fallbacks.
- Opening any public network exposure.

## Next approval needed

Approve one of these next steps:
1. Restart the Workspace service so the production `:3000` launchd instance serves the new Mission Control system endpoint.
2. Configure Zoho OAuth with least-privilege read scopes and build the email operations center.
3. Approve synthetic test writes for the end-to-end client onboarding demo.
4. Build the native EventKit helper for reliable Calendar/Reminders read/write support.
