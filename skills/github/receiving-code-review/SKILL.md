---
name: receiving-code-review
description: Evaluate architect or reviewer feedback technically before changing code — verify, push back, implement one fix at a time.
version: 1.0.0
author: Hermes Workspace (adapted from superpowers)
metadata:
  hermes:
    tags: [swarm, developer, code-review]
    category: github
---

# Receiving Code Review (Developer)

Use when **architect** (or human) returns implementation review feedback.

## Pattern

1. **READ** full feedback without reacting
2. **UNDERSTAND** — restate each item in your own words; ask if unclear
3. **VERIFY** against codebase and the approved spec
4. **EVALUATE** — technically sound? in scope? or push back with evidence
5. **IMPLEMENT** one item at a time; run tests after each
6. **CHECKPOINT** with proof

## Forbidden

- Performative praise ("Great point!", "You're absolutely right!")
- Implementing unclear items partially
- Architecture changes to "address" review without architect approval

## Push back when

- Feedback contradicts approved spec
- Suggestion is YAGNI (unused code path)
- Review assumes wrong context

State technical reasoning; escalate to orchestrator if architect and spec conflict.

## Multi-item feedback

Clarify **all** unclear items before coding. Order: blockers → simple fixes → complex refactors.
