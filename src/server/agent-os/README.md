# Agent OS

This folder contains the centralized agent operating system scaffolding for Hermes.

## Current components

- `store.ts`
  - persistent queue, workflow registry, execution logs, approval store
- `router.ts`
  - default workflow routing and queue state transitions
- API routes under `src/routes/api/agent-os/`
  - create/list tasks
  - workflow registry
  - approval decisions
  - dispatch queue
  - task status updates
  - local n8n env health summary

## Current routing defaults

- n8n:
  - morning-briefing
  - calendar-scan-meeting-prep
  - inbox-triage
  - shopify-monitoring
- Hermes:
  - job-pipeline
  - rootly-prospect-research
- OpenClaw:
  - airbnb-host-automation

## Intended execution contract

1. A task is created against a workflow key.
2. If sensitive, it pauses in `awaiting_approval`.
3. Otherwise it is auto-routed.
4. Dispatchers claim queued/routed tasks and mark them `running`.
5. Executors attach n8n execution IDs or agent run metadata.
6. Executors mark tasks `completed`, `failed`, or `retrying`.
7. Dashboard surfaces live counts and recent activity.

## Next steps

- Bind real n8n workflow IDs once API connection is fully restored.
- Add an execution poller that syncs n8n execution states back into Agent OS tasks.
- Emit failure notifications to the preferred channel.
- Add actual approval action forwarding for sensitive external operations.
