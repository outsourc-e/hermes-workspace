---
name: harden-gate
description: >
  Gate H — pre-ship harden checklist after architect REVIEW_OUTCOME=approved.
  Emit HARDEN_OUTCOME pass|fail with evidence before learning/publish.
  Use when review just approved, or when asked to harden / pre-ship / GO-NO-GO.
version: 1.0.0
author: Hermes Workspace
metadata:
  hermes:
    tags: [swarm, harden, gate, checklist, review]
    category: swarm
    related_skills: [architect-core, mission-memory-layout]
---

# Harden Gate (Gate H)

Run **after** `REVIEW_OUTCOME: approved`, **before** `learning` / publish greenlight.
This is not a new worker — you (architect or orchestrator) load this skill and emit a harden verdict.

## When to use

- Architect just approved developer or writer output
- User/orchestrator asks for harden, pre-ship, Reality Check, or GO/NO-GO
- Mission is about to enter learning or request publish/merge greenlight

## Rules

1. Prefer file reads, diffs, and command evidence over adjectives.
2. Never invent passing tests — if you did not run or see a log, mark the item fail or N/A with reason.
3. Harden **pass** does not approve publish/merge — that stays human greenlight (Gate D).
4. On **fail**, list concrete fixes; orchestrator re-dispatches the same `EXECUTOR` lane (bounded retries).
5. Secrets / credential leaks → `HARDEN_OUTCOME: fail` and recommend Human Gate immediately.

## Checklist

### Shared (always)

- [ ] `FILES_CHANGED` paths exist and match the claimed deliverable
- [ ] No secrets/tokens/API keys in diffs or new files
- [ ] No scope creep past architect spec "non-goals"
- [ ] No open `BLOCKER`; incomplete work must not be DONE

### Developer lane (`EXECUTOR: developer`)

- [ ] Claimed test/build commands have exit-code or log evidence
- [ ] Diff is minimal for the task (no drive-by refactors)
- [ ] Critical behavior covered by test, or explicit "why untested"

### Writer lane (`EXECUTOR: writer`)

- [ ] Technical facts match current implementation (paths, APIs, versions)
- [ ] No unverified performance/security claims
- [ ] Accessibility/brand constraints from spec addressed when required

See [references/checklist.md](references/checklist.md) for copy-paste templates.

## Required checkpoint fields

End with **both** review and harden lines when this skill runs in the same turn as approval:

```text
STATE: DONE
EXECUTOR: developer|writer
REVIEW_OUTCOME: approved
HARDEN_OUTCOME: pass|fail
HARDEN_CHECKLIST:
- [x] files_exist
- [x] no_secrets
- [ ] evidence_for_tests  # example fail item
RESULT: <one paragraph + evidence paths>
NEXT_ACTION: learning|fix:<item>|human
```

| `HARDEN_OUTCOME` | Next |
|---|---|
| `pass` | learning / ask orchestrator for publish greenlight |
| `fail` | same EXECUTOR revises (Gate H retry ≤2), or `human` if secrets/destructive |

## Prohibited

- Soft-passing to avoid Human Gate
- Approving publish/merge yourself
- Running harden before design-intent review (`REVIEW_OUTCOME`) is decided
