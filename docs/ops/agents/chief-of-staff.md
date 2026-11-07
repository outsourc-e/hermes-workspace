# Runbook: chief-of-staff

> Owner: A. Nahrgang · Model: `ternary-bonsai-2-27b:q2_0` @ `:8555`, `TIMEOUT_SECS` 2700 · Profile: `chief-of-staff` · Runner: `ops/bin/run-chief-of-staff.sh` · Launchd: `com.ops.agent-chief-of-staff` 05:15 daily · Channels: `#morning-brief` + `#approvals` (P1–P3) · Battery: `ops/bin/test-chief-of-staff.sh` (CS01–CS12) · Full guide: `docs/ops/chief-of-staff.md`

## What it does

Deputy-CEO brief: `# Morning Brief — <DATE>` §§1–7 plus exactly 3 `### Proposal P1..3`. Five phases: (0) HARVEST past proposals → `cos-harvest-<DATE>.json` (+ GitHub issues for approved), (1) INPUTS (Buzz dumps, CRM list, GitHub snapshot, kanban) → `cos-inputs-<DATE>/`, (2) GENERATE, (3) VALIDATE (auto-recovers missing proposals from intel gaps), (4) PUBLISH (research md + Obsidian `Morning-Brief/` + channels + `cos-proposals/`).

## Inputs → outputs

Reads: `cos-inputs-<DATE>/buzz-*.txt`, `cos-harvest-<DATE>.json`, `cos-github-snapshot.json`, `crm-companies.txt`, `KB/comparison-matrix.md`, `kanban-board.txt`, previous brief.
Writes: `docs/ops/research/<DATE>-chief-of-staff.md`, Obsidian mirror, `#morning-brief`, `cos-proposals/<DATE>-*.md` + `proposals.jsonl` (consumed by next night's harvest).

## Flags & exit codes

`FORCE=1` · `DRYRUN=1` · `TIMEOUT_SECS` · `5` window · `8` lock · `9` timeout · `10` crash · `11` validation (sections/proposals) · `12` empty prompt.

## Debug

```bash
bash -n ops/bin/run-chief-of-staff.sh         # must print nothing (Oct 11 parse outage precedent)
cat ops/run/cos-harvest-$(date +%F).json | head -c 500   # phase 0 evidence
ls ops/run/cos-inputs-$(date +%F)/            # phase 1 evidence
bash ops/bin/test-chief-of-staff.sh           # CS01–CS12
```

## Known failures

| Symptom | Cause → fix |
|---|---|
| Script exits immediately / `syntax error` | parse break (Oct 11 precedent: unclosed quote, dup block) — `bash -n` first |
| `WARN expected ≥3 proposals — auto-appending` | model under-produced; recovery is normal, review fallback quality |
| Stale brief (same 3 proposals for days) | no owner ✅/❌ verdicts in `#approvals` — harvest has nothing new to learn |
