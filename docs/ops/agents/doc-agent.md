# Runbook: doc-agent (on-demand)

> Owner: A. Nahrgang · Profile: `doc-agent` · Schedule: **none — as-run only** · Channel: `#approvals` (reaction-gated) · Spec: `ops/agents/doc-agent.md` (10-line stub)

## What it does

Draft-only SOC 1/2 + ISO 27001 documentation. Every draft needs TSC/Annex-A reference + owner + evidence + date and a `Drafted by doc-agent…` header. Nothing leaves draft without a `#approvals` reaction.

## Scheduling decision (2026-10-13)

Deliberately **not** on launchd: compliance drafts need per-run scoping and owner review. If volume justifies scheduling later: add a battery (`test-doc-agent.sh`) covering the draft header/evidence gates first.

## Debug

```bash
ls docs/ops/research/ | grep -i soc; ls ~/Library/Mobile\ Documents/ 2>/dev/null | head -3
```
