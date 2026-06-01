# Agent OS

A centralized operator layer for Hermes + OpenClaw with n8n as the orchestration default.

## Goals

- queue work in one place
- route by workflow and risk
- default stable recurring work to n8n
- keep Hermes/OpenClaw for reasoning-heavy and UI-fragile steps
- log every execution
- surface failures quickly
- require approval for sensitive workflows

## Implemented now

### Core storage

Persistent JSON-backed store under `~/.hermes/agent-os/store.json` with:
- tasks
- workflow registry
- execution log
- approvals

### API routes

- `GET/POST /api/agent-os/`
  - list dashboard/task state
  - enqueue a task
- `GET/POST /api/agent-os/dispatch`
  - inspect dispatchable queue
  - claim / complete / fail tasks
- `POST /api/agent-os/tasks/:taskId`
  - route task
  - update status
  - attach n8n execution id
- `POST /api/agent-os/approvals/:approvalId`
  - approve or deny sensitive tasks
- `GET/POST /api/agent-os/workflows`
  - inspect or upsert workflow registry
- `GET /api/agent-os/n8n-health`
  - inspect local n8n MCP env state

### Dashboard

Route: `/agent-os`

Shows:
- active jobs
- queued jobs
- failed jobs
- awaiting approval
- last execution
- next execution
- recent tasks
- approval queue
- workflow registry

### Default routing

- n8n
  - Morning Briefing
  - Calendar Scan + Meeting Prep
  - Inbox Triage
  - Shopify Monitoring
- Hermes
  - Job Pipeline
  - Rootly Prospect Research
- OpenClaw
  - Airbnb Host Automation

### Failure notifications

Failed non-retry tasks emit a best-effort local push through `/api/hermes-push`.

## Immediate blocker status

The n8n API key problem was fixed in the MCP env file at:
- `~/.config/n8n-mcp/env`

The remaining issue is tool-session connectivity to the n8n MCP bridge, not n8n auth itself.
Manual MCP initialization against `~/.hermes/mcp-installs/n8n/server.py` succeeds.

## Next implementation steps

1. restore live OpenClaw n8n tool connectivity
2. inventory live workflows and bind real n8n workflow IDs into registry
3. add n8n execution polling back into task states
4. add retry scheduling policy per workflow
5. build first production workflows:
   - Morning Briefing
   - Calendar Scan + Meeting Prep
   - Inbox Triage
6. add approval action UI and audit detail
7. add queue-triggered automatic executor loop

## Definition of done gap

Current state is a working scaffold plus dashboard and queue APIs.
Still missing for full done:
- automatic execution loop
- automatic retry engine
- n8n execution sync
- completed first production workflows
- fully live reporting without manual API calls
